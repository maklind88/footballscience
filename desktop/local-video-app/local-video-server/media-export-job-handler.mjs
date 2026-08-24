import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { receiveRequestFile } from "./request-upload.mjs";

const OUTPUT_PRESETS = new Set(["review-720p", "analysis-1080p", "master-2160p"]);

function safeFileName(value = "football-science-export") {
  return String(value || "football-science-export")
    .replace(/[\\/]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "football-science-export";
}

function decodeSpecification(request = {}, maximumDurationMs = 2 * 60 * 60 * 1000) {
  const encoded = String(request.headers?.["x-football-science-export-spec"] || "");
  if (!encoded || encoded.length > 32_768) {
    throw Object.assign(new Error("A bounded export specification is required."), { statusCode: 400 });
  }
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("The export specification is invalid."), { statusCode: 400 });
  }
  const startMs = Math.max(0, Math.round(Number(value.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(value.endMs) || startMs + 5000));
  if (endMs - startMs > maximumDurationMs) {
    throw Object.assign(new Error("Export a shorter range or split the presentation into sections."), { statusCode: 400 });
  }
  const preset = OUTPUT_PRESETS.has(value.preset) ? value.preset : "analysis-1080p";
  const height = preset === "review-720p" ? 720 : preset === "master-2160p" ? 2160 : 1080;
  const analysis = value.analysis && typeof value.analysis === "object" && !Array.isArray(value.analysis)
    ? value.analysis
    : {};
  return {
    schema: "football-science-local-export-v1",
    exportId: String(value.exportId || "").slice(0, 120),
    title: safeFileName(value.title || "Football Science export"),
    startMs,
    endMs,
    preset,
    height,
    crf: Math.max(14, Math.min(28, Math.round(Number(value.crf) || 18))),
    sourceIdentifier: String(value.sourceIdentifier || "").slice(0, 240),
    angleId: String(value.angleId || "").slice(0, 120),
    overlayAssetId: /^[a-f0-9-]{36}$/i.test(String(value.overlayAssetId || ""))
      ? String(value.overlayAssetId)
      : "",
    overlaySha256: /^[a-f0-9]{64}$/i.test(String(value.overlaySha256 || ""))
      ? String(value.overlaySha256).toLowerCase()
      : "",
    analysis: {
      matchId: String(analysis.matchId || "").slice(0, 120),
      videoId: String(analysis.videoId || "").slice(0, 120),
      sourceId: String(analysis.sourceId || "").slice(0, 120),
      presentationId: String(analysis.presentationId || "").slice(0, 120),
      presentationItemId: String(analysis.presentationItemId || "").slice(0, 120),
      clipId: String(analysis.clipId || "").slice(0, 120),
      angleLabel: String(analysis.angleLabel || "").slice(0, 180),
      angleRole: String(analysis.angleRole || "").slice(0, 40),
      drawingLayerCount: Math.max(0, Math.min(10000, Math.round(Number(analysis.drawingLayerCount) || 0))),
      dynamicGraphicCount: Math.max(0, Math.min(10000, Math.round(Number(analysis.dynamicGraphicCount) || 0))),
      objectTrackCount: Math.max(0, Math.min(10000, Math.round(Number(analysis.objectTrackCount) || 0))),
      calibrationId: String(analysis.calibrationId || "").slice(0, 120),
      compositePrimitiveCount: Math.max(0, Math.min(10000, Math.round(Number(analysis.compositePrimitiveCount) || 0))),
      compositeMode: analysis.compositeMode === "burn-in" ? "burn-in" : "source-only",
      overlaySha256: /^[a-f0-9]{64}$/i.test(String(analysis.overlaySha256 || ""))
        ? String(analysis.overlaySha256).toLowerCase()
        : "",
    },
    manifestSha256: /^[a-f0-9]{64}$/i.test(String(value.manifestSha256 || ""))
      ? String(value.manifestSha256).toLowerCase()
      : "",
  };
}

function streamSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function artifactHeaders(request, options, extra = {}) {
  return options.corsHeaders(request, options.config, {
    "cache-control": "private, max-age=3600",
    ...extra,
  });
}

export function createMediaExportJobHandler(options = {}) {
  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, { ok: false, error: "The local processing queue is full." }, { "retry-after": "5" });
      return null;
    }
    try {
      const specification = decodeSpecification(request, options.config.maxExportDurationMs);
      const overlay = specification.overlayAssetId
        ? options.overlays?.take(specification.overlayAssetId, session.token, specification.overlaySha256)
        : null;
      if (specification.overlayAssetId && !overlay) {
        throw Object.assign(new Error("The render overlay expired or failed its checksum."), { statusCode: 400 });
      }
      const declaredBytes = Math.max(0, Number(request.headers["content-length"] || 0));
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: Math.min(options.config.maxCacheBytes, declaredBytes * 2),
        protectedIds: options.jobs.activeIds(),
      });
      const job = options.jobs.create("render-export", {
        fileName: safeFileName(request.headers["x-football-science-file-name"]),
        title: specification.title,
        preset: specification.preset,
        startMs: specification.startMs,
        endMs: specification.endMs,
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const outputPath = path.join(workDir, "render.mp4");
      const manifestPath = path.join(workDir, "manifest.json");
      const overlayPath = overlay ? path.join(workDir, "overlay.ass") : "";
      await receiveRequestFile(request, inputPath, {
        maxBytes: options.config.maxInputBytes,
        onProgress: (progress) => options.jobs.updateProgress(job.id, progress),
      });
      if (overlayPath) await fs.writeFile(overlayPath, overlay.ass, { encoding: "utf8", mode: 0o600 });
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "rendering", ratio: 0.2 });
          const render = await options.engine.renderExport(inputPath, outputPath, {
            ...specification,
            overlayPath,
          }, {
            signal,
            onProgress: (progress) => reportProgress({ ...progress, stage: "rendering", ratio: Math.max(0.2, Number(progress.ratio) || 0.2) }),
          });
          await fs.rm(inputPath, { force: true });
          if (overlayPath) await fs.rm(overlayPath, { force: true });
          reportProgress({ stage: "checksumming", ratio: 0.98 });
          const stat = await fs.stat(outputPath);
          const sha256 = await streamSha256(outputPath);
          const manifest = {
            ...specification,
            composite: {
              mode: overlay ? "burn-in" : "source-only",
              primitiveCount: overlay?.specification?.primitives?.length || 0,
              overlaySha256: overlay?.sha256 || "",
            },
            renderedAt: new Date().toISOString(),
            output: { ...render, fileName: `${specification.title}.mp4`, sizeBytes: stat.size, sha256 },
          };
          await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
          const access = options.assets.issue(job.id, session.origin);
          const query = `access=${encodeURIComponent(access.token)}`;
          return {
            artifactId: job.id,
            downloadUrl: `${options.baseUrl()}/exports/${job.id}/render.mp4?${query}`,
            manifestUrl: `${options.baseUrl()}/exports/${job.id}/manifest.json?${query}`,
            fileName: `${specification.title}.mp4`,
            sizeBytes: stat.size,
            sha256,
            expiresAt: new Date(access.expiresAtMs).toISOString(),
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
    const match = url.pathname.match(/^\/exports\/([a-f0-9-]+)\/(render\.mp4|manifest\.json)$/i);
    if (!match) return false;
    const [, id, assetName] = match;
    const origin = options.requestOrigin(request);
    if ((origin && !options.isAllowedOrigin(origin, options.config))
      || !options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Export access expired." });
      return true;
    }
    try {
      const filePath = path.join(options.config.cacheDir, id, assetName);
      const stat = await fs.stat(filePath);
      const isVideo = assetName === "render.mp4";
      const headers = artifactHeaders(request, options, {
        "content-length": stat.size,
        "content-type": isVideo ? "video/mp4" : "application/json; charset=utf-8",
        "content-disposition": isVideo
          ? `attachment; filename="football-science-${id}.mp4"`
          : `attachment; filename="football-science-${id}-manifest.json"`,
      });
      response.writeHead(200, headers);
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Export artifact not found." });
    }
    return true;
  }

  return { createJob, handleArtifact };
}
