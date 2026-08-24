import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCache, pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { createLocalVideoServerConfig, isAllowedOrigin } from "./config.mjs";
import { createFfmpegEngine } from "./ffmpeg-engine.mjs";
import { createPlaybackAssetHandler } from "./playback-asset-handler.mjs";
import { createProcessingJobManager } from "./processing-job-manager.mjs";
import { receiveRequestFile } from "./request-upload.mjs";
import {
  corsHeaders,
  createAssetAccessStore,
  createBridgeSessionStore,
  requestOrigin,
  sessionTokenFromRequest,
} from "./security.mjs";
import { createTrackingEngineAdapter } from "./tracking-engine-adapter.mjs";
import { createTrackingJobHandler } from "./tracking-job-handler.mjs";

function safeFileName(value = "match-video") {
  let decoded = String(value || "match-video");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = "match-video";
  }
  return decoded
    .replace(/[\\/]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "match-video";
}

function requestedPreparationMode(request = {}) {
  const mode = String(request.headers?.["x-football-science-prepare-mode"] || "auto").toLowerCase();
  return ["auto", "remux", "transcode"].includes(mode) ? mode : "auto";
}

function sendJson(request, response, config, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, corsHeaders(request, config, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  }));
  if (request.method === "HEAD" || statusCode === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

function statusCodeForError(error) {
  if (Number.isInteger(error?.statusCode)) return error.statusCode;
  if (error?.code === "ENOENT") return 503;
  if (error?.code === "CACHE_QUOTA_EXCEEDED") return 507;
  return 500;
}

function publicErrorMessage(error) {
  if (error?.code === "ENOENT") {
    return "The bundled FFmpeg engine could not be started on this computer.";
  }
  return String(error?.message || "Could not complete local video processing.").slice(0, 1000);
}

export function createLocalVideoServer(options = {}) {
  const config = options.config || createLocalVideoServerConfig();
  const engine = options.engine || createFfmpegEngine(options.ffmpeg || {});
  const trackingEngine = options.trackingEngine || createTrackingEngineAdapter(options.tracking || {});
  const sessions = createBridgeSessionStore({ ttlMs: config.sessionTtlMs });
  const assets = createAssetAccessStore({ ttlMs: config.assetTtlMs });
  const jobs = createProcessingJobManager({
    concurrency: config.maxConcurrentJobs,
    retentionMs: config.completedJobRetentionMs,
  });
  const jobOwners = new Map();
  let server;

  function baseUrl() {
    const address = server?.address();
    const activePort = typeof address === "object" && address ? address.port : config.port;
    return `http://${config.host}:${activePort}`;
  }

  function rejectUntrustedOrigin(request, response) {
    const origin = requestOrigin(request);
    if (!origin || isAllowedOrigin(origin, config)) return false;
    sendJson(request, response, config, 403, { ok: false, error: "Origin is not allowed." });
    return true;
  }

  function authorizeSession(request, response) {
    const origin = requestOrigin(request);
    const token = sessionTokenFromRequest(request);
    if (!origin || !isAllowedOrigin(origin, config) || !sessions.validate(token, origin)) {
      sendJson(request, response, config, 401, {
        ok: false,
        error: "Open a new secure session with the Football Science local video app.",
      });
      return null;
    }
    return { origin, token };
  }

  function authorizeJob(request, response, jobId) {
    const session = authorizeSession(request, response);
    if (!session) return null;
    if (jobOwners.get(jobId) !== session.token) {
      sendJson(request, response, config, 404, { ok: false, error: "Job not found." });
      return null;
    }
    return session;
  }

  const handlePlayback = createPlaybackAssetHandler({
    assets,
    config,
    corsHeaders,
    isAllowedOrigin,
    requestOrigin,
    sendJson,
  });
  const tracking = createTrackingJobHandler({
    assets,
    authorizeSession,
    baseUrl,
    config,
    corsHeaders,
    jobOwners,
    jobs,
    publicErrorMessage,
    requestOrigin,
    sendJson,
    statusCodeForError,
    trackingEngine,
  });

  async function createPlaybackJob(request, response) {
    const session = authorizeSession(request, response);
    if (!session) return null;
    if (jobs.stats().queued >= config.maxQueuedJobs) {
      sendJson(request, response, config, 429, {
        ok: false,
        error: "The local processing queue is full. Wait for an active job or cancel one.",
      }, { "retry-after": "5" });
      return null;
    }
    const declaredBytes = Math.max(0, Number(request.headers["content-length"] || 0));
    try {
      await pruneCache(config.cacheDir, {
        maxBytes: config.maxCacheBytes,
        reserveBytes: declaredBytes,
        protectedIds: jobs.activeIds(),
      });
      const job = jobs.create("prepare-playback", {
        fileName: safeFileName(request.headers["x-football-science-file-name"]),
        requestedMode: requestedPreparationMode(request),
      });
      jobOwners.set(job.id, session.token);
      const workDir = path.join(config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const outputPath = path.join(workDir, "playback.mp4");
      await receiveRequestFile(request, inputPath, {
        maxBytes: config.maxInputBytes,
        onProgress: (progress) => jobs.updateProgress(job.id, progress),
      });
      jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "inspecting", ratio: 0.22 });
          const preparation = await engine.preparePlaybackCopy(
            inputPath,
            outputPath,
            job.metadata.requestedMode,
            {
              signal,
              onProgress: (progress) => reportProgress({ ...progress, ratio: 0.5 }),
            },
          );
          await fs.rm(inputPath, { force: true });
          const access = assets.issue(job.id, session.origin);
          return {
            playbackUrl: `${baseUrl()}/playback/${job.id}/playback.mp4?access=${encodeURIComponent(access.token)}`,
            mode: preparation.mode,
            expiresAt: new Date(access.expiresAtMs).toISOString(),
          };
        } catch (error) {
          await removeCacheEntry(config.cacheDir, job.id);
          throw error;
        }
      });
      return job.id;
    } catch (error) {
      sendJson(request, response, config, statusCodeForError(error), {
        ok: false,
        error: publicErrorMessage(error),
      });
      return null;
    }
  }

  server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", baseUrl());
    if (rejectUntrustedOrigin(request, response)) return;
    if (request.method === "OPTIONS") {
      sendJson(request, response, config, 204, {});
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(request, response, config, 200, {
        ok: true,
        service: "football-science-local-video-server",
        apiVersion: 2,
        secureSessionRequired: true,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/session") {
      const origin = requestOrigin(request);
      if (!origin || !isAllowedOrigin(origin, config)) {
        sendJson(request, response, config, 403, { ok: false, error: "Origin is not allowed." });
        return;
      }
      const session = sessions.issue(origin);
      sendJson(request, response, config, 201, {
        ok: true,
        sessionToken: session.token,
        expiresAt: new Date(session.expiresAtMs).toISOString(),
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/capabilities") {
      if (!authorizeSession(request, response)) return;
      const cache = await inspectCache(config.cacheDir);
      sendJson(request, response, config, 200, {
        ok: true,
        apiVersion: 2,
        capabilities: [
          "prepare-playback",
          "byte-range-playback",
          "progress",
          "cancel",
          ...(trackingEngine.available() ? ["track-object"] : []),
        ],
        limits: {
          maxInputBytes: config.maxInputBytes,
          maxCacheBytes: config.maxCacheBytes,
          maxConcurrentJobs: config.maxConcurrentJobs,
          maxQueuedJobs: config.maxQueuedJobs,
        },
        usage: { cacheBytes: cache.sizeBytes, ...jobs.stats() },
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/jobs/prepare-playback") {
      const jobId = await createPlaybackJob(request, response);
      if (!jobId) return;
      sendJson(request, response, config, 202, {
        ok: true,
        job: jobs.get(jobId),
        statusUrl: `${baseUrl()}/jobs/${jobId}`,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/jobs/track-object") {
      const jobId = await tracking.createJob(request, response);
      if (!jobId) return;
      sendJson(request, response, config, 202, {
        ok: true,
        job: jobs.get(jobId),
        statusUrl: `${baseUrl()}/jobs/${jobId}`,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/transcode") {
      const jobId = await createPlaybackJob(request, response);
      if (!jobId) return;
      const job = await jobs.wait(jobId);
      if (job?.status === "succeeded") {
        sendJson(request, response, config, 200, { ok: true, ...job.result, jobId });
      } else {
        sendJson(request, response, config, job?.status === "cancelled" ? 409 : 500, {
          ok: false,
          jobId,
          error: job?.error || "Could not create a playable local copy.",
        });
      }
      return;
    }
    const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/i);
    if (jobMatch && request.method === "GET") {
      if (!authorizeJob(request, response, jobMatch[1])) return;
      const job = jobs.get(jobMatch[1]);
      sendJson(request, response, config, job ? 200 : 404, job
        ? { ok: true, job }
        : { ok: false, error: "Job not found." });
      return;
    }
    if (jobMatch && request.method === "DELETE") {
      if (!authorizeJob(request, response, jobMatch[1])) return;
      const cancelled = jobs.cancel(jobMatch[1]);
      sendJson(request, response, config, cancelled ? 202 : 409, {
        ok: cancelled,
        job: jobs.get(jobMatch[1]),
      });
      return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/playback/")) {
      await handlePlayback(request, url, response);
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/tracking/")) {
      if (await tracking.handleArtifact(request, url, response)) return;
    }
    sendJson(request, response, config, 404, { ok: false, error: "Route not found." });
  });

  return {
    server,
    config,
    jobs,
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const localVideoServer = createLocalVideoServer();
  localVideoServer.listen().then(() => {
    console.log(`Football Science local video server listening on http://${localVideoServer.config.host}:${localVideoServer.config.port}`);
    console.log("Video files stay on this computer. Metadata remains central.");
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
