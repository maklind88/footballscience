import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { serveRangeAsset } from "./range-asset-response.mjs";
import { receiveRequestFile } from "./request-upload.mjs";

const PROXY_PRESETS = new Set(["scrub-540p", "review-720p"]);

function safeFileName(value = "match-video") {
  return String(value || "match-video")
    .replace(/[\\/]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "match-video";
}

function decodeSpecification(request = {}) {
  const encoded = String(request.headers?.["x-football-science-proxy-spec"] || "");
  if (!encoded || encoded.length > 16_384) {
    throw Object.assign(new Error("A bounded proxy specification is required."), { statusCode: 400 });
  }
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("The proxy specification is invalid."), { statusCode: 400 });
  }
  return {
    schema: "football-science-local-proxy-v1",
    preset: PROXY_PRESETS.has(value.preset) ? value.preset : "scrub-540p",
    sourceIdentifier: String(value.sourceIdentifier || "").slice(0, 240),
    angleId: String(value.angleId || "").slice(0, 120),
  };
}

function proxyIdentity(sourceSha256 = "", preset = "scrub-540p") {
  const digest = createHash("sha256")
    .update(`football-science-local-proxy-v1\n${sourceSha256}\n${preset}`)
    .digest("hex");
  return `proxy-${digest.slice(0, 40)}`;
}

async function fileSha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function readProxy(cacheDir, proxyId, specification, sourceSha256) {
  try {
    const directory = path.join(cacheDir, proxyId);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
    const stat = await fs.stat(path.join(directory, "proxy.mp4"));
    if (manifest.schema !== "football-science-local-proxy-v1"
      || manifest.sourceSha256 !== sourceSha256
      || manifest.preset !== specification.preset
      || Number(manifest.output?.sizeBytes) !== stat.size
      || !/^[a-f0-9]{64}$/i.test(String(manifest.output?.sha256 || ""))
      || await fileSha256(path.join(directory, "proxy.mp4")) !== manifest.output.sha256) return null;
    await fs.utimes(directory, new Date(), new Date());
    return { directory, manifest, stat };
  } catch {
    return null;
  }
}

function proxyResult(entry, proxyId, access, baseUrl, cacheHit) {
  const query = `access=${encodeURIComponent(access.token)}`;
  return {
    artifactId: proxyId,
    artifactAccessToken: access.token,
    proxyUrl: `${baseUrl}/proxies/${proxyId}/proxy.mp4?${query}`,
    manifestUrl: `${baseUrl}/proxies/${proxyId}/manifest.json?${query}`,
    expiresAt: new Date(access.expiresAtMs).toISOString(),
    cacheHit,
    ...entry.manifest.output,
    preset: entry.manifest.preset,
  };
}

export function createProxyJobHandler(options = {}) {
  const locks = new Map();
  const activeProxyIds = new Set();

  async function withLock(id, task) {
    const predecessor = locks.get(id) || Promise.resolve();
    let release;
    const own = new Promise((resolve) => { release = resolve; });
    const chain = predecessor.then(() => own);
    locks.set(id, chain);
    await predecessor;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(id) === chain) locks.delete(id);
    }
  }

  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, { ok: false, error: "The local processing queue is full." }, { "retry-after": "5" });
      return null;
    }
    let job = null;
    try {
      const specification = decodeSpecification(request);
      const declaredBytes = Math.max(0, Number(request.headers["content-length"] || 0));
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: Math.min(options.config.maxCacheBytes, declaredBytes * 2),
        protectedIds: [...options.jobs.activeIds(), ...activeProxyIds],
      });
      job = options.jobs.create("create-proxy", {
        fileName: safeFileName(request.headers["x-football-science-file-name"]),
        preset: specification.preset,
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const upload = await receiveRequestFile(request, inputPath, {
        maxBytes: options.config.maxInputBytes,
        onProgress: (progress) => options.jobs.updateProgress(job.id, progress),
      });
      const proxyId = proxyIdentity(upload.sha256, specification.preset);
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: upload.receivedBytes,
        protectedIds: [...options.jobs.activeIds(), ...activeProxyIds, job.id, proxyId],
      });
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => withLock(proxyId, async () => {
        activeProxyIds.add(proxyId);
        try {
          let entry = await readProxy(options.config.cacheDir, proxyId, specification, upload.sha256);
          if (entry) {
            await removeCacheEntry(options.config.cacheDir, job.id);
            const access = options.assets.issue(proxyId, session.origin);
            return proxyResult(entry, proxyId, access, options.baseUrl(), true);
          }
          reportProgress({ stage: "proxying", ratio: 0.22 });
          const outputPath = path.join(workDir, "proxy.mp4");
          const proxy = await options.engine.createProxy(inputPath, outputPath, specification, {
            signal,
            onProgress: (progress) => reportProgress({ ...progress, stage: "proxying", ratio: Math.max(0.22, Number(progress.ratio) || 0.22) }),
          });
          await fs.rm(inputPath, { force: true });
          reportProgress({ stage: "checksumming", ratio: 0.98 });
          const stat = await fs.stat(outputPath);
          const outputSha256 = await fileSha256(outputPath);
          const manifest = {
            ...specification,
            sourceSha256: upload.sha256,
            createdAt: new Date().toISOString(),
            output: { ...proxy, sizeBytes: stat.size, sha256: outputSha256 },
          };
          await fs.writeFile(path.join(workDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
          const targetDir = path.join(options.config.cacheDir, proxyId);
          await fs.rm(targetDir, { recursive: true, force: true });
          await fs.rename(workDir, targetDir);
          entry = { directory: targetDir, manifest, stat };
          const access = options.assets.issue(proxyId, session.origin);
          return proxyResult(entry, proxyId, access, options.baseUrl(), false);
        } catch (error) {
          await removeCacheEntry(options.config.cacheDir, job.id);
          throw error;
        } finally {
          activeProxyIds.delete(proxyId);
        }
      }));
      return job.id;
    } catch (error) {
      if (job) {
        await removeCacheEntry(options.config.cacheDir, job.id);
        options.jobOwners.delete(job.id);
        options.jobs.discard?.(job.id);
      }
      options.sendJson(request, response, options.config, options.statusCodeForError(error), {
        ok: false,
        error: options.publicErrorMessage(error),
      });
      return null;
    }
  }

  async function handleArtifact(request, url, response) {
    const match = url.pathname.match(/^\/proxies\/(proxy-[a-f0-9]{40})\/(proxy\.mp4|manifest\.json)$/i);
    if (!match) return false;
    const [, id, assetName] = match;
    const origin = options.requestOrigin(request);
    if ((origin && !options.isAllowedOrigin(origin, options.config))
      || !options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Proxy access expired." });
      return true;
    }
    try {
      const filePath = path.join(options.config.cacheDir, id, assetName);
      if (assetName === "proxy.mp4") {
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
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Proxy artifact not found." });
    }
    return true;
  }

  return { createJob, handleArtifact };
}
