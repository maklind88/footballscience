import { promises as fs } from "node:fs";
import path from "node:path";

const reusableJobTypes = new Set([
  "track-object",
  "track-objects",
  "run-tracking-stage",
]);

export function safeTrackingFileName(value = "tracking-video") {
  return String(value || "tracking-video")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .slice(0, 120) || "tracking-video";
}

export function requestedTrackingSourceId(request = {}) {
  const value = String(request.headers?.["x-football-science-tracking-source-id"] || "").trim();
  if (!value) return "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) {
    throw Object.assign(new Error("The local tracking source reference is invalid."), { statusCode: 400 });
  }
  return value;
}

export async function reusableTrackingSource(options = {}, sourceId = "", sessionToken = "") {
  if (!sourceId) return null;
  const job = options.jobs?.get(sourceId);
  if (!job || !reusableJobTypes.has(job.type) || job.status !== "succeeded"
    || options.jobOwners?.get(sourceId) !== sessionToken) {
    throw Object.assign(new Error("The local tracking source is no longer available in this secure session."), {
      statusCode: 404,
    });
  }
  const fileName = safeTrackingFileName(job.metadata?.fileName);
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
  if (stat.mode & 0o222) {
    throw Object.assign(new Error("The local tracking source integrity could not be verified."), { statusCode: 409 });
  }
  const sourceSha256 = String(job.result?.sourceSha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw Object.assign(new Error("The local tracking source fingerprint is unavailable."), { statusCode: 409 });
  }
  return { id: sourceId, fileName, filePath, sourceSha256 };
}
