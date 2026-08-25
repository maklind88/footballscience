import path from "node:path";
import { serveRangeAsset } from "./range-asset-response.mjs";

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
      await serveRangeAsset(request, response, playbackPath, options.corsHeaders(request, options.config));
    } catch {
      options.sendJson(request, response, options.config, 404, { ok: false, error: "Playback file not found." });
    }
  };
}
