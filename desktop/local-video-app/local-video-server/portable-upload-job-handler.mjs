import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const PORTABLE_MEDIA_BUCKET = "football-science-video-reviews";

async function readJson(request, maximumBytes = 16 * 1024) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maximumBytes) throw Object.assign(new Error("Portable upload request is too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
    throw Object.assign(new Error("Portable upload request is invalid JSON."), { statusCode: 400 });
  }
}

function allowedStorageHost(hostname = "", configured = []) {
  return configured.includes(hostname)
    || /^[a-z0-9-]+\.storage\.supabase\.co$/i.test(hostname)
    || /^[a-z0-9-]+\.supabase\.co$/i.test(hostname);
}

function normalizeReservation(value = {}, config = {}) {
  let endpoint;
  try { endpoint = new URL(String(value.endpoint || "")); } catch {
    throw Object.assign(new Error("Portable storage endpoint is invalid."), { statusCode: 400 });
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || endpoint.pathname !== "/storage/v1/upload/resumable"
    || !allowedStorageHost(endpoint.hostname, config.portableStorageHosts || [])) {
    throw Object.assign(new Error("Portable storage endpoint is not approved."), { statusCode: 400 });
  }
  const result = {
    exportArtifactId: String(value.exportArtifactId || ""),
    assetId: String(value.assetId || ""),
    endpoint: endpoint.toString(),
    token: String(value.token || ""),
    bucket: String(value.bucket || ""),
    objectPath: String(value.objectPath || ""),
    expectedBytes: Math.round(Number(value.expectedBytes) || 0),
    sha256: String(value.sha256 || "").toLowerCase(),
  };
  if (!/^[a-f0-9-]{36}$/i.test(result.exportArtifactId) || !/^[a-f0-9-]{36}$/i.test(result.assetId)
    || result.bucket !== PORTABLE_MEDIA_BUCKET
    || !/^[a-f0-9]{24}\/[a-f0-9]{24}\/[a-f0-9-]{36}\.mp4$/i.test(result.objectPath)
    || !/^[a-f0-9]{64}$/.test(result.sha256)
    || !result.expectedBytes || result.expectedBytes > 20 * 1024 * 1024 * 1024
    || !/^[a-zA-Z0-9._~-]{32,4096}$/.test(result.token)) {
    throw Object.assign(new Error("Portable upload reservation failed validation."), { statusCode: 400 });
  }
  return result;
}

function fileSha256(filePath, signal) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    const abort = () => stream.destroy(Object.assign(new Error("Portable review verification was cancelled."), { code: "ABORT_ERR" }));
    signal?.addEventListener?.("abort", abort, { once: true });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => {
      signal?.removeEventListener?.("abort", abort);
      reject(error);
    });
    stream.on("end", () => {
      signal?.removeEventListener?.("abort", abort);
      resolve(hash.digest("hex"));
    });
  });
}

async function verifiedExport(reservation, options, session) {
  const sourceJob = options.jobs.get(reservation.exportArtifactId);
  if (!sourceJob || sourceJob.type !== "render-export" || sourceJob.status !== "succeeded"
    || options.jobOwners.get(sourceJob.id) !== session.token) {
    throw Object.assign(new Error("Rendered export is unavailable in this secure session."), { statusCode: 404 });
  }
  const workDir = path.join(options.config.cacheDir, sourceJob.id);
  const videoPath = path.join(workDir, "render.mp4");
  const manifestPath = path.join(workDir, "manifest.json");
  const [stat, manifest] = await Promise.all([
    fs.stat(videoPath),
    fs.readFile(manifestPath, "utf8").then(JSON.parse),
  ]);
  if (!stat.isFile() || stat.size !== reservation.expectedBytes
    || manifest.output?.sha256 !== reservation.sha256 || Number(manifest.output?.sizeBytes) !== stat.size) {
    throw Object.assign(new Error("Rendered export failed portable integrity verification."), { statusCode: 409 });
  }
  return { videoPath, stat };
}

export function createPortableUploadJobHandler(options = {}) {
  async function createJob(request, response) {
    const session = options.authorizeSession(request, response);
    if (!session) return null;
    if (options.jobs.stats().queued >= options.config.maxQueuedJobs) {
      options.sendJson(request, response, options.config, 429, { ok: false, error: "The local processing queue is full." }, { "retry-after": "5" });
      return null;
    }
    try {
      const reservation = normalizeReservation(await readJson(request), options.config);
      const source = await verifiedExport(reservation, options, session);
      const job = options.jobs.create("publish-export", {
        assetId: reservation.assetId,
        exportArtifactId: reservation.exportArtifactId,
        sizeBytes: source.stat.size,
      });
      options.jobOwners.set(job.id, session.token);
      options.jobs.enqueue(job.id, async ({ signal, reportProgress }) => {
        reportProgress({ stage: "verifying portable review", ratio: 0.02 });
        const digest = await fileSha256(source.videoPath, signal);
        if (digest !== reservation.sha256) throw new Error("Rendered review checksum changed before upload.");
        reportProgress({ stage: "uploading portable review", ratio: 0.05 });
        const uploaded = await options.uploader.upload(source.videoPath, reservation, {
          signal,
          onProgress: (progress) => reportProgress({
            ...progress,
            ratio: 0.05 + Math.max(0, Math.min(1, Number(progress.ratio) || 0)) * 0.95,
          }),
        });
        return {
          assetId: reservation.assetId,
          sizeBytes: source.stat.size,
          sha256: digest,
          uploadedBytes: uploaded.uploadedBytes,
        };
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

  return { createJob };
}
