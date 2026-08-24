import { promises as fs } from "node:fs";
import path from "node:path";

async function pathSize(targetPath) {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => pathSize(path.join(targetPath, entry.name))));
  return sizes.reduce((total, size) => total + size, 0);
}

export async function inspectCache(cacheDir) {
  await fs.mkdir(cacheDir, { recursive: true });
  const entries = await fs.readdir(cacheDir, { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const targetPath = path.join(cacheDir, entry.name);
    const stat = await fs.stat(targetPath);
    directories.push({
      id: entry.name,
      path: targetPath,
      sizeBytes: await pathSize(targetPath),
      modifiedAtMs: stat.mtimeMs,
    });
  }
  return {
    sizeBytes: directories.reduce((total, entry) => total + entry.sizeBytes, 0),
    entries: directories.sort((first, second) => first.modifiedAtMs - second.modifiedAtMs),
  };
}

export async function pruneCache(cacheDir, options = {}) {
  const maxBytes = Math.max(0, Number(options.maxBytes) || 0);
  const reserveBytes = Math.max(0, Number(options.reserveBytes) || 0);
  const protectedIds = new Set(options.protectedIds || []);
  const cache = await inspectCache(cacheDir);
  let sizeBytes = cache.sizeBytes;
  const removed = [];
  for (const entry of cache.entries) {
    if (sizeBytes + reserveBytes <= maxBytes) break;
    if (protectedIds.has(entry.id)) continue;
    await fs.rm(entry.path, { recursive: true, force: true });
    sizeBytes -= entry.sizeBytes;
    removed.push(entry.id);
  }
  if (sizeBytes + reserveBytes > maxBytes) {
    const error = new Error("The local video cache does not have enough configured space for this job.");
    error.code = "CACHE_QUOTA_EXCEEDED";
    error.statusCode = 507;
    throw error;
  }
  return { sizeBytes, removed };
}

export async function removeCacheEntry(cacheDir, id) {
  await fs.rm(path.join(cacheDir, String(id || "")), { recursive: true, force: true });
}

