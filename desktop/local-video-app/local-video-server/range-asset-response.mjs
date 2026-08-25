import { createReadStream, promises as fs } from "node:fs";

export function parseByteRange(rangeHeader = "", size = 0) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (!rawStart) {
    const suffix = Math.max(0, Number(rawEnd || 0));
    return suffix ? { start: Math.max(0, size - suffix), end: size - 1 } : null;
  }
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function serveRangeAsset(request, response, filePath, headers = {}) {
  const stat = await fs.stat(filePath);
  const baseHeaders = {
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-type": "video/mp4",
    ...headers,
  };
  const range = parseByteRange(request.headers.range, stat.size);
  if (request.headers.range && !range) {
    response.writeHead(416, { ...baseHeaders, "content-range": `bytes */${stat.size}` });
    response.end();
    return;
  }
  if (range) {
    response.writeHead(206, {
      ...baseHeaders,
      "content-length": range.end - range.start + 1,
      "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...baseHeaders, "content-length": stat.size });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}
