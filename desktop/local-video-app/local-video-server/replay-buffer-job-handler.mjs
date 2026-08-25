import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { serveRangeAsset } from "./range-asset-response.mjs";

function decodeSpecification(request = {}, maximumDurationMs = 2 * 60 * 1000) {
  const encoded = String(request.headers?.["x-football-science-replay-spec"] || "");
  if (!encoded || encoded.length > 16_384) {
    throw Object.assign(new Error("A bounded replay specification is required."), { statusCode: 400 });
  }
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("The replay specification is invalid."), { statusCode: 400 });
  }
  const proxyId = String(value.proxyId || "");
  const proxyAccessToken = String(value.proxyAccessToken || "");
  if (!/^proxy-[a-f0-9]{40}$/i.test(proxyId) || !proxyAccessToken) {
    throw Object.assign(new Error("A valid local proxy is required for replay."), { statusCode: 400 });
  }
  const startMs = Math.max(0, Math.round(Number(value.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(value.endMs) || startMs + 15_000));
  if (endMs - startMs > maximumDurationMs) {
    throw Object.assign(new Error("The replay buffer range is too long."), { statusCode: 400 });
  }
  const matchStartMs = Math.max(0, Math.round(Number(value.matchStartMs) || 0));
  return {
    schema: "football-science-local-replay-v1",
    proxyId,
    proxyAccessToken,
    startMs,
    endMs,
    matchStartMs,
    matchEndMs: Math.max(matchStartMs + 1, Math.round(Number(value.matchEndMs) || matchStartMs + 1)),
    angleId: String(value.angleId || "").slice(0, 120),
  };
}

async function fileSha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export function createReplayBufferJobHandler(options = {}) {
  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, { ok: false, error: "The local processing queue is full." }, { "retry-after": "5" });
      return null;
    }
    try {
      const specification = decodeSpecification(request, options.config.maxReplayDurationMs);
      if (!options.assets.validate(specification.proxyId, specification.proxyAccessToken, session.origin)) {
        throw Object.assign(new Error("The local proxy expired. Create or reconnect it before replay."), { statusCode: 401 });
      }
      const proxyPath = path.join(options.config.cacheDir, specification.proxyId, "proxy.mp4");
      const proxyStat = await fs.stat(proxyPath);
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: Math.min(proxyStat.size, 512 * 1024 * 1024),
        protectedIds: [...options.jobs.activeIds(), specification.proxyId],
      });
      const job = options.jobs.create("create-replay-buffer", {
        proxyId: specification.proxyId,
        startMs: specification.startMs,
        endMs: specification.endMs,
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const outputPath = path.join(workDir, "replay.mp4");
      const manifestPath = path.join(workDir, "manifest.json");
      await fs.mkdir(workDir, { recursive: true });
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "buffering", ratio: 0.05 });
          const replay = await options.engine.createReplayBuffer(proxyPath, outputPath, specification, {
            signal,
            onProgress: (progress) => reportProgress({ ...progress, stage: "buffering", ratio: Math.max(0.05, Number(progress.ratio) || 0.05) }),
          });
          reportProgress({ stage: "checksumming", ratio: 0.98 });
          const stat = await fs.stat(outputPath);
          const sha256 = await fileSha256(outputPath);
          const manifest = {
            schema: specification.schema,
            proxyId: specification.proxyId,
            angleId: specification.angleId,
            startMs: specification.startMs,
            endMs: specification.endMs,
            matchStartMs: specification.matchStartMs,
            matchEndMs: specification.matchEndMs,
            createdAt: new Date().toISOString(),
            output: { ...replay, sizeBytes: stat.size, sha256 },
          };
          await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
          const access = options.assets.issue(job.id, session.origin);
          const query = `access=${encodeURIComponent(access.token)}`;
          return {
            artifactId: job.id,
            replayUrl: `${options.baseUrl()}/replays/${job.id}/replay.mp4?${query}`,
            manifestUrl: `${options.baseUrl()}/replays/${job.id}/manifest.json?${query}`,
            expiresAt: new Date(access.expiresAtMs).toISOString(),
            sizeBytes: stat.size,
            sha256,
            durationMs: replay.durationMs,
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
    const match = url.pathname.match(/^\/replays\/([a-f0-9-]+)\/(replay\.mp4|manifest\.json)$/i);
    if (!match) return false;
    const [, id, assetName] = match;
    const origin = options.requestOrigin(request);
    if ((origin && !options.isAllowedOrigin(origin, options.config))
      || !options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Replay access expired." });
      return true;
    }
    try {
      const filePath = path.join(options.config.cacheDir, id, assetName);
      if (assetName === "replay.mp4") {
        await serveRangeAsset(request, response, filePath, options.corsHeaders(request, options.config));
      } else {
        const stat = await fs.stat(filePath);
        response.writeHead(200, options.corsHeaders(request, options.config, {
          "cache-control": "private, max-age=3600",
          "content-length": stat.size,
          "content-type": "application/json; charset=utf-8",
        }));
        if (request.method === "HEAD") response.end();
        else createReadStream(filePath).pipe(response);
      }
    } catch {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Replay artifact not found." });
    }
    return true;
  }

  return { createJob, handleArtifact };
}
