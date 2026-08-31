import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { pruneCache, removeCacheEntry } from "./cache-manager.mjs";
import { receiveRequestFile } from "./request-upload.mjs";
import { sealTrackingSourceFile } from "./tracking-file-integrity.mjs";
import {
  requestedTrackingSourceId,
  reusableTrackingSource,
  safeTrackingFileName,
} from "./tracking-source-store.mjs";

const MAXIMUM_REQUEST_BYTES = 64 * 1024 * 1024;
const MAXIMUM_HEADER_BYTES = 12 * 1024;

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) {
    throw Object.assign(new Error(`Invalid ${label}.`), { statusCode: 400 });
  }
  return text;
}

function providerIdentity(request = {}) {
  return {
    providerId: identifier(
      request.headers?.["x-football-science-tracking-provider-id"],
      "tracking provider id",
    ),
    providerVersion: identifier(
      request.headers?.["x-football-science-tracking-provider-version"],
      "tracking provider version",
    ),
  };
}

function requestFromHeader(request = {}) {
  const encoded = String(request.headers?.["x-football-science-tracking-stage-request"] || "");
  if (!encoded || encoded.length > MAXIMUM_HEADER_BYTES) {
    throw Object.assign(new Error("A bounded tracking stage request is required."), { statusCode: 400 });
  }
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("The tracking stage request is invalid."), { statusCode: 400 });
  }
}

async function receiveJson(request, maximumBytes = MAXIMUM_REQUEST_BYTES) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.byteLength;
    if (received > maximumBytes) {
      throw Object.assign(new Error("The tracking stage request is too large."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("The tracking stage request is invalid."), { statusCode: 400 });
  }
}

function isJsonRequest(request = {}) {
  return /^application\/json(?:;|$)/i.test(String(request.headers?.["content-type"] || ""));
}

function sourceFingerprint(value = {}) {
  const fingerprint = String(value.sourceFingerprint || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw Object.assign(new Error("The tracking source fingerprint is invalid."), { statusCode: 400 });
  }
  return fingerprint;
}

export function createTrackingStageJobHandler(options = {}) {
  const jobType = options.jobType === "run-tracking-candidate-stage"
    ? "run-tracking-candidate-stage"
    : "run-tracking-stage";
  const artifactBasePath = jobType === "run-tracking-candidate-stage"
    ? "tracking-candidate-stage"
    : "tracking-stage";
  const benchmarkOnly = jobType === "run-tracking-candidate-stage";

  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, {
        ok: false,
        error: "The local processing queue is full.",
      }, { "retry-after": "5" });
      return null;
    }
    let job = null;
    try {
      const provider = providerIdentity(request);
      const sourceId = requestedTrackingSourceId(request);
      const jsonTransport = isJsonRequest(request);
      if (sourceId && !jsonTransport) {
        throw Object.assign(new Error("A reused tracking source requires a JSON stage request."), { statusCode: 400 });
      }
      const stageRequest = jsonTransport
        ? await receiveJson(request, Math.min(
          MAXIMUM_REQUEST_BYTES,
          Number(options.config.maxTrackingStageRequestBytes) || MAXIMUM_REQUEST_BYTES,
        ))
        : requestFromHeader(request);
      const requestedFingerprint = sourceFingerprint(stageRequest);
      const source = await reusableTrackingSource(options, sourceId, session.token);
      const declaredBytes = source || jsonTransport ? 0 : Math.max(0, Number(request.headers["content-length"] || 0));
      await pruneCache(options.config.cacheDir, {
        maxBytes: options.config.maxCacheBytes,
        reserveBytes: declaredBytes,
        protectedIds: [...options.jobs.activeIds(), ...(source ? [source.id] : [])],
      });
      job = options.jobs.create(jobType, {
        ...provider,
        fileName: source?.fileName || safeTrackingFileName(
          request.headers["x-football-science-file-name"],
        ),
        sourceArtifactId: source?.id || "",
      });
      options.jobOwners.set(job.id, session.token);
      const workDir = path.join(options.config.cacheDir, job.id);
      const inputPath = path.join(workDir, `input-${job.metadata.fileName}`);
      const outputPath = path.join(workDir, "result.json");
      const evidencePath = path.join(workDir, "evidence.json");
      await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
      let sourceSha256 = source?.sourceSha256 || "";
      let sourceSeal = null;
      let localSourcePath = "";
      if (source) {
        await fs.link(source.filePath, inputPath);
        sourceSeal = await sealTrackingSourceFile(inputPath, {
          expectedSha256: sourceSha256,
        });
        localSourcePath = inputPath;
        options.jobs.updateProgress(job.id, { stage: "reusing local source", ratio: 0.2 });
      } else if (!jsonTransport) {
        const upload = await receiveRequestFile(request, inputPath, {
          maxBytes: options.config.maxInputBytes,
          onProgress: (progress) => options.jobs.updateProgress(job.id, progress),
        });
        sourceSha256 = upload.sha256;
        sourceSeal = await sealTrackingSourceFile(inputPath, {
          expectedSha256: upload.sha256,
          expectedBytes: upload.receivedBytes,
        });
        localSourcePath = inputPath;
      }
      if (localSourcePath && sourceSha256 !== requestedFingerprint) {
        throw Object.assign(new Error("The selected video does not match the stage request fingerprint."), {
          statusCode: 409,
        });
      }
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        try {
          reportProgress({ stage: "validating provider", ratio: 0.22 });
          const result = await options.stageRunner.run({
            ...provider,
            request: stageRequest,
            source: localSourcePath ? {
              filePath: localSourcePath,
              sha256: sourceSha256,
              seal: sourceSeal,
            } : null,
          }, {
            signal,
            onProgress: (progress) => reportProgress({
              ...progress,
              ratio: Math.max(0.22, Number(progress.ratio) || 0.22),
            }),
          });
          if ((result.benchmarkOnly === true) !== benchmarkOnly) {
            throw Object.assign(new Error("The tracking stage crossed its activation boundary."), {
              code: "TRACKING_STAGE_ACTIVATION_BOUNDARY",
            });
          }
          if (benchmarkOnly !== Boolean(result.evidence)) {
            throw Object.assign(new Error("The tracking candidate evidence boundary is incomplete."), {
              code: "TRACKING_CANDIDATE_EVIDENCE_BOUNDARY",
            });
          }
          const artifactBytes = Buffer.from(`${JSON.stringify(result.artifact)}\n`);
          const evidenceBytes = benchmarkOnly ? Buffer.from(`${JSON.stringify(result.evidence)}\n`) : null;
          await fs.writeFile(outputPath, artifactBytes, { mode: 0o600 });
          if (evidenceBytes) await fs.writeFile(evidencePath, evidenceBytes, { mode: 0o600 });
          if (source) await fs.rm(inputPath, { force: true });
          const access = options.assets.issue(job.id, session.origin);
          return {
            artifactId: job.id,
            sourceArtifactId: source?.id || (localSourcePath ? job.id : ""),
            sourceSha256: sourceSha256 || requestedFingerprint,
            providerId: result.artifact.provider.id,
            providerVersion: result.artifact.provider.version,
            stage: result.artifact.stage,
            capabilities: result.artifact.capabilities,
            requestFingerprint: result.artifact.requestFingerprint,
            benchmarkOnly,
            resultUrl: `${options.baseUrl()}/${artifactBasePath}/${job.id}/result.json?access=${encodeURIComponent(access.token)}`,
            ...(evidenceBytes ? {
              evidenceUrl: `${options.baseUrl()}/${artifactBasePath}/${job.id}/evidence.json?access=${encodeURIComponent(access.token)}`,
              evidenceSha256: createHash("sha256").update(evidenceBytes).digest("hex"),
              artifactSha256: result.evidence.result.artifactSha256,
            } : {}),
            expiresAt: new Date(access.expiresAtMs).toISOString(),
            execution: result.telemetry,
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
    const match = url.pathname.match(new RegExp(`^/${artifactBasePath}/([a-f0-9-]+)/(result|evidence)\\.json$`, "i"));
    if (!match) return false;
    const id = match[1];
    const origin = options.requestOrigin(request);
    if (!options.assets.validate(id, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, {
        ok: false,
        error: "Tracking stage access expired.",
      });
      return true;
    }
    try {
      const artifactPath = path.join(options.config.cacheDir, id, `${match[2].toLowerCase()}.json`);
      const stat = await fs.stat(artifactPath);
      response.writeHead(200, options.corsHeaders(request, options.config, {
        "cache-control": "private, max-age=3600",
        "content-length": stat.size,
        "content-type": "application/json; charset=utf-8",
      }));
      createReadStream(artifactPath).pipe(response);
    } catch {
      options.sendJson(request, response, options.config, 404, {
        ok: false,
        error: "Tracking stage artifact not found.",
      });
    }
    return true;
  }

  return { createJob, handleArtifact };
}
