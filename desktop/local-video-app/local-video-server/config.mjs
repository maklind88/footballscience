import os from "node:os";
import path from "node:path";

const gibibyte = 1024 ** 3;
const productionOrigins = [
  "https://footballscience.xyz",
  "https://www.footballscience.xyz",
];

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function configuredOrigins(value = "") {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createLocalVideoServerConfig(env = process.env, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  return {
    host: "127.0.0.1",
    port: positiveInteger(env.FS_LOCAL_VIDEO_PORT, 47831),
    cacheDir: env.FS_LOCAL_VIDEO_CACHE_DIR
      ? path.resolve(env.FS_LOCAL_VIDEO_CACHE_DIR)
      : path.join(homeDir, ".football-science", "local-video-cache"),
    allowedOrigins: [...new Set([
      ...productionOrigins,
      ...configuredOrigins(env.FS_LOCAL_VIDEO_ALLOWED_ORIGINS),
    ])],
    allowLocalDevelopmentOrigins: env.FS_LOCAL_VIDEO_ALLOW_LOCAL_DEV !== "0",
    sessionTtlMs: positiveInteger(env.FS_LOCAL_VIDEO_SESSION_TTL_MS, 12 * 60 * 60 * 1000),
    assetTtlMs: positiveInteger(env.FS_LOCAL_VIDEO_ASSET_TTL_MS, 24 * 60 * 60 * 1000),
    maxInputBytes: positiveInteger(env.FS_LOCAL_VIDEO_MAX_INPUT_BYTES, 60 * gibibyte),
    maxCacheBytes: positiveInteger(env.FS_LOCAL_VIDEO_MAX_CACHE_BYTES, 200 * gibibyte),
    maxConcurrentJobs: Math.min(4, positiveInteger(env.FS_LOCAL_VIDEO_MAX_CONCURRENT_JOBS, 1)),
    maxQueuedJobs: Math.min(32, positiveInteger(env.FS_LOCAL_VIDEO_MAX_QUEUED_JOBS, 8)),
    maxTrackingDurationMs: Math.min(
      20 * 60 * 1000,
      positiveInteger(env.FS_LOCAL_VIDEO_MAX_TRACKING_DURATION_MS, 2 * 60 * 1000),
    ),
    completedJobRetentionMs: positiveInteger(
      env.FS_LOCAL_VIDEO_JOB_RETENTION_MS,
      24 * 60 * 60 * 1000,
    ),
  };
}

export function isAllowedOrigin(origin = "", config = createLocalVideoServerConfig()) {
  const normalized = String(origin || "").trim().replace(/\/$/, "");
  if (!normalized) return false;
  if (config.allowedOrigins.includes(normalized)) return true;
  if (!config.allowLocalDevelopmentOrigins) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(normalized);
}
