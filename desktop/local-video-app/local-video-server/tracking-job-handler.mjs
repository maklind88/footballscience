import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { receiveRequestFile } from "./request-upload.mjs";

function safeFileName(value = "tracking-video") {
  return String(value || "tracking-video").replace(/[^a-zA-Z0-9._ -]+/g, "").slice(0, 120) || "tracking-video";
}

function trackingPrompt(request = {}, maxDurationMs = 120_000) {
  const encoded = String(request.headers?.["x-football-science-tracking-prompt"] || "");
  if (!encoded || encoded.length > 8192) throw Object.assign(new Error("A bounded tracking prompt is required."), { statusCode: 400 });
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("The tracking prompt is invalid."), { statusCode: 400 });
  }
  const box = value.box || {};
  const coordinates = [box.left, box.top, box.width, box.height].map(Number);
  if (!coordinates.every(Number.isFinite) || coordinates.some((entry) => entry < 0 || entry > 1)
    || Number(box.width) <= 0 || Number(box.height) <= 0) {
    throw Object.assign(new Error("The tracking target must be inside the video frame."), { statusCode: 400 });
  }
  const startMs = Math.max(0, Math.round(Number(value.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(value.endMs) || startMs + 5000));
  if (endMs - startMs > maxDurationMs) {
    throw Object.assign(new Error("Track a shorter range before extending the object track."), { statusCode: 400 });
  }
  return { ...value, startMs, endMs, box: { left: coordinates[0], top: coordinates[1], width: coordinates[2], height: coordinates[3] } };
}

export function createTrackingJobHandler(options = {}) {
  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (!options.trackingEngine.available()) {
      options.sendJson(request, response, options.config, 501, { ok: false, error: "Install an approved local tracking provider first." });
      return null;
    }
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, { ok: false, error: "The local processing queue is full." }, { "retry-after": "5" });
      return null;
    }
    try {
      const prompt = trackingPrompt(request, options.config.maxTrackingDurationMs);
      const declaredBytes = Math.max(0, Number(request.headers["content-length"] || 0));
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: declaredBytes,
        protectedIds: options.jobs.activeIds(),
      });
      const job = options.jobs.create("track-object", {
        fileName: safeFileName(request.headers["x-football-science-file-name"]),
        startMs: prompt.startMs,
        endMs: prompt.endMs,
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const outputPath = path.join(workDir, "track.json");
      await receiveRequestFile(request, inputPath, {
        maxBytes: options.config.maxInputBytes,
        onProgress: (progress) => options.jobs.updateProgress(job.id, progress),
      });
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "tracking", ratio: 0.22 });
          const result = await options.trackingEngine.trackObject(inputPath, outputPath, prompt, {
            signal,
            onProgress: (progress) => reportProgress({ ...progress, ratio: Math.max(0.22, Number(progress.ratio) || 0.22) }),
          });
          await fs.rm(inputPath, { force: true });
          const access = options.assets.issue(job.id, session.origin);
          return {
            artifactId: job.id,
            trackingUrl: `${options.baseUrl()}/tracking/${job.id}/track.json?access=${encodeURIComponent(access.token)}`,
            expiresAt: new Date(access.expiresAtMs).toISOString(),
            engine: result.engine,
            engineVersion: result.engineVersion,
            pointCount: result.pointCount,
            segmentCount: result.segmentCount,
          };
        } catch (error) {
          await removeCacheEntry(options.config.cacheDir, job.id);
          throw error;
        }
      });
      return job.id;
    } catch (error) {
      options.sendJson(request, response, options.config, options.statusCodeForError(error), {
        ok: false,
        error: options.publicErrorMessage(error),
      });
      return null;
    }
  }

  async function handleArtifact(request, url, response) {
    const match = url.pathname.match(/^\/tracking\/([a-f0-9-]+)\/track\.json$/i);
    if (!match) return false;
    const id = match[1];
    const origin = options.requestOrigin(request);
    if (!options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Tracking access expired." });
      return true;
    }
    try {
      const artifactPath = path.join(options.config.cacheDir, id, "track.json");
      const stat = await fs.stat(artifactPath);
      response.writeHead(200, options.corsHeaders(request, options.config, {
        "cache-control": "private, max-age=3600",
        "content-length": stat.size,
        "content-type": "application/json; charset=utf-8",
      }));
      createReadStream(artifactPath).pipe(response);
    } catch {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Tracking artifact not found." });
    }
    return true;
  }

  return { createJob, handleArtifact };
}
