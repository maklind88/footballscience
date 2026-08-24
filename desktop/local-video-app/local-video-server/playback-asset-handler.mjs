import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

function parseRange(rangeHeader = "", size = 0) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (!rawStart) {
    const suffix = Math.max(0, Number(rawEnd || 0));
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export function createPlaybackAssetHandler(options = {}) {
  return async function handlePlayback(request, url, response) {
    const match = url.pathname.match(/^\/playback\/([a-f0-9-]+)\/playback\.mp4$/i);
    if (!match) {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Playback file not found." });
      return;
    }
    const assetId = match[1];
    const origin = options.requestOrigin(request);
    if ((origin && !options.isAllowedOrigin(origin, options.config))
      || !options.assets.validate(assetId, url.searchParams.get("access") || "", origin)) {
      options.sendJson(request, response, options.config, 401, { ok: false, error: "Playback access expired." });
      return;
    }
    const playbackPath = path.join(options.config.cacheDir, assetId, "playback.mp4");
    try {
      const stat = await fs.stat(playbackPath);
      const baseHeaders = options.corsHeaders(request, options.config, {
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
        "content-type": "video/mp4",
      });
      const range = parseRange(request.headers.range, stat.size);
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
        else createReadStream(playbackPath, { start: range.start, end: range.end }).pipe(response);
        return;
      }
      response.writeHead(200, { ...baseHeaders, "content-length": stat.size });
      if (request.method === "HEAD") response.end();
      else createReadStream(playbackPath).pipe(response);
    } catch {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Playback file not found." });
    }
  };
}
