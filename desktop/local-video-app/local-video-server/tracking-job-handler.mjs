import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { receiveRequestFile } from "./request-upload.mjs";

function safeFileName(value = "tracking-video") {
  return String(value || "tracking-video").replace(/[^a-zA-Z0-9._ -]+/g, "").slice(0, 120) || "tracking-video";
}

function requestedSourceId(request = {}) {
  const value = String(request.headers?.["x-football-science-tracking-source-id"] || "").trim();
  if (!value) return "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) {
    throw Object.assign(new Error("The local tracking source reference is invalid."), { statusCode: 400 });
  }
  return value;
}

async function reusableSource(options = {}, sourceId = "", sessionToken = "") {
  if (!sourceId) return null;
  const job = options.jobs.get(sourceId);
  if (!job || !["track-object", "track-objects"].includes(job.type) || job.status !== "succeeded"
    || options.jobOwners.get(sourceId) !== sessionToken) {
    throw Object.assign(new Error("The local tracking source is no longer available in this secure session."), { statusCode: 404 });
  }
  const fileName = safeFileName(job.metadata?.fileName);
  const filePath = path.join(options.config.cacheDir, sourceId, `input-${fileName}`);
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch {
    throw Object.assign(new Error("The local tracking source must be reconnected."), { statusCode: 404 });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw Object.assign(new Error("The local tracking source must be reconnected."), { statusCode: 404 });
  }
  return {
    id: sourceId,
    fileName,
    filePath,
    sourceSha256: String(job.result?.sourceSha256 || ""),
  };
}

function trackingHeader(request = {}, name = "", errorMessage = "A bounded tracking prompt is required.") {
  const encoded = String(request.headers?.[name] || "");
  if (!encoded || encoded.length > 8192) throw Object.assign(new Error(errorMessage), { statusCode: 400 });
  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("The tracking prompt is invalid."), { statusCode: 400 });
  }
  return value;
}

function normalizedTrackingPrompt(value = {}, maxDurationMs = 120_000) {
  const box = value.box || {};
  const coordinates = [box.left, box.top, box.width, box.height].map(Number);
  if (!coordinates.every(Number.isFinite) || coordinates.some((entry) => entry < 0 || entry > 1)
    || Number(box.width) <= 0 || Number(box.height) <= 0
    || coordinates[0] + coordinates[2] > 1 || coordinates[1] + coordinates[3] > 1) {
    throw Object.assign(new Error("The tracking target must be inside the video frame."), { statusCode: 400 });
  }
  const startMs = Math.max(0, Math.round(Number(value.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(value.endMs) || startMs + 5000));
  if (endMs - startMs > maxDurationMs) {
    throw Object.assign(new Error("Track a shorter range before extending the object track."), { statusCode: 400 });
  }
  const requestedPromptAtMs = Number(value.promptAtMs ?? value.prompt_at_ms ?? value.atMs);
  const promptAtMs = Math.min(
    endMs,
    Math.max(startMs, Math.round(Number.isFinite(requestedPromptAtMs) ? requestedPromptAtMs : startMs)),
  );
  const sourceStartMs = Math.max(0, Math.round(Number(value.sourceStartMs ?? value.source_start_ms ?? startMs) || 0));
  const sourceEndMs = Math.max(
    sourceStartMs + 1,
    Math.round(Number(value.sourceEndMs ?? value.source_end_ms ?? endMs) || sourceStartMs + (endMs - startMs)),
  );
  const requestedSourcePromptAtMs = Number(
    value.sourcePromptAtMs ?? value.source_prompt_at_ms ?? sourceStartMs + (promptAtMs - startMs),
  );
  const sourcePromptAtMs = Math.min(
    sourceEndMs,
    Math.max(sourceStartMs, Math.round(Number.isFinite(requestedSourcePromptAtMs) ? requestedSourcePromptAtMs : sourceStartMs)),
  );
  if (sourceEndMs - sourceStartMs > maxDurationMs) {
    throw Object.assign(new Error("The synchronized source range is too long for one tracking job."), { statusCode: 400 });
  }
  return {
    ...value,
    startMs,
    endMs,
    promptAtMs,
    sourceStartMs,
    sourceEndMs,
    sourcePromptAtMs,
    box: { left: coordinates[0], top: coordinates[1], width: coordinates[2], height: coordinates[3] },
  };
}

function trackingPrompt(request = {}, maxDurationMs = 120_000) {
  return normalizedTrackingPrompt(trackingHeader(
    request,
    "x-football-science-tracking-prompt",
  ), maxDurationMs);
}

function trackingPrompts(request = {}, maxDurationMs = 120_000) {
  const values = trackingHeader(
    request,
    "x-football-science-tracking-prompts",
    "A bounded tracking target batch is required.",
  );
  if (!Array.isArray(values) || values.length < 2 || values.length > 8) {
    throw Object.assign(new Error("A tracking batch must contain 2-8 targets."), { statusCode: 400 });
  }
  const prompts = values.map((value) => normalizedTrackingPrompt(value, maxDurationMs));
  const ids = prompts.map((prompt) => String(prompt.id || "").trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw Object.assign(new Error("Every batched tracking target needs a unique id."), { statusCode: 400 });
  }
  const sharedFields = [
    "clipId", "videoId", "angleId", "startMs", "endMs", "promptAtMs",
    "sourceStartMs", "sourceEndMs", "sourcePromptAtMs",
  ];
  const anchor = prompts[0];
  if (prompts.slice(1).some((prompt) => sharedFields.some((field) => prompt[field] !== anchor[field]))) {
    throw Object.assign(new Error("Batched targets must share one clip, angle, range, and prompt frame."), { statusCode: 400 });
  }
  return prompts;
}

export function createTrackingJobHandler(options = {}) {
  async function createJob(request, response, batch = false) {
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
    let job = null;
    try {
      const prompts = batch ? trackingPrompts(request, options.config.maxTrackingDurationMs) : null;
      const prompt = prompts?.[0] || trackingPrompt(request, options.config.maxTrackingDurationMs);
      const sourceId = requestedSourceId(request);
      const source = await reusableSource(options, sourceId, session.token);
      let sourceSha256 = source?.sourceSha256 || "";
      const declaredBytes = source ? 0 : Math.max(0, Number(request.headers["content-length"] || 0));
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: declaredBytes,
        protectedIds: [...options.jobs.activeIds(), ...(source ? [source.id] : [])],
      });
      job = options.jobs.create(batch ? "track-objects" : "track-object", {
        fileName: source?.fileName || safeFileName(request.headers["x-football-science-file-name"]),
        objectCount: prompts?.length || 1,
        sourceArtifactId: source?.id || "",
        startMs: prompt.startMs,
        endMs: prompt.endMs,
        promptAtMs: prompt.promptAtMs,
        sourceStartMs: prompt.sourceStartMs,
        sourceEndMs: prompt.sourceEndMs,
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const outputName = batch ? "tracks.json" : "track.json";
      const outputPath = path.join(workDir, outputName);
      if (source) {
        await fs.mkdir(workDir, { recursive: true });
        await fs.link(source.filePath, inputPath);
        options.jobs.updateProgress(job.id, { stage: "reusing local source", ratio: 0.2 });
      } else {
        const upload = await receiveRequestFile(request, inputPath, {
          maxBytes: options.config.maxInputBytes,
          onProgress: (progress) => options.jobs.updateProgress(job.id, progress),
        });
        sourceSha256 = upload.sha256;
      }
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "tracking", ratio: 0.22 });
          const result = await (batch ? options.trackingEngine.trackObjects(
            inputPath,
            outputPath,
            prompts,
            {
              signal,
              onProgress: (progress) => reportProgress({ ...progress, ratio: Math.max(0.22, Number(progress.ratio) || 0.22) }),
            },
          ) : options.trackingEngine.trackObject(inputPath, outputPath, prompt, {
            signal,
            onProgress: (progress) => reportProgress({ ...progress, ratio: Math.max(0.22, Number(progress.ratio) || 0.22) }),
          }));
          if (source) await fs.rm(inputPath, { force: true });
          const access = options.assets.issue(job.id, session.origin);
          return {
            artifactId: job.id,
            sourceArtifactId: source?.id || job.id,
            sourceSha256,
            trackingUrl: `${options.baseUrl()}/tracking/${job.id}/${outputName}?access=${encodeURIComponent(access.token)}`,
            expiresAt: new Date(access.expiresAtMs).toISOString(),
            engine: result.engine,
            engineVersion: result.engineVersion,
            pointCount: result.pointCount,
            segmentCount: result.segmentCount,
            trackCount: result.trackCount || 1,
          };
        } catch (error) {
          await removeCacheEntry(options.config.cacheDir, job.id);
          throw error;
        }
      });
      return job.id;
    } catch (error) {
      if (job?.id) {
        options.jobs.discard(job.id);
        options.jobOwners.delete(job.id);
        await removeCacheEntry(options.config.cacheDir, job.id);
      }
      options.sendJson(request, response, options.config, options.statusCodeForError(error), {
        ok: false,
        error: options.publicErrorMessage(error),
      });
      return null;
    }
  }

  async function handleArtifact(request, url, response) {
    const match = url.pathname.match(/^\/tracking\/([a-f0-9-]+)\/(track|tracks)\.json$/i);
    if (!match) return false;
    const id = match[1];
    const origin = options.requestOrigin(request);
    if (!options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Tracking access expired." });
      return true;
    }
    try {
      const artifactPath = path.join(options.config.cacheDir, id, `${match[2]}.json`);
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

  return {
    createJob: (request, response) => createJob(request, response, false),
    createBatchJob: (request, response) => createJob(request, response, true),
    handleArtifact,
  };
}
