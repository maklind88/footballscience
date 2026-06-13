import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

export function renderVideoPlayer(state = {}) {
  const ref = state.videoRef;
  const hasVideo = Boolean(ref?.objectUrl);
  return `
    <section class="video-analysis-player" data-video-analysis-player>
      <div class="video-analysis-player__bar">
        <div>
          <p class="video-analysis-kicker">Local video</p>
          <h2>${escapeHtml(ref?.displayName || "No video loaded")}</h2>
        </div>
        <div class="video-analysis-player__actions">
          <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
          <button type="button" class="video-analysis-icon-button" data-video-analysis-load title="Load local video">Load</button>
          <button type="button" class="video-analysis-icon-button" data-video-analysis-play ${hasVideo ? "" : "disabled"} title="Play or pause">Play</button>
        </div>
      </div>
      <div class="video-analysis-video-frame">
        ${
          hasVideo
            ? `<video class="video-analysis-video" data-video-analysis-video src="${escapeHtml(ref.objectUrl)}" controls playsinline></video>`
            : `<div class="video-analysis-empty-video">Load a local match video to start coding.</div>`
        }
      </div>
      <div class="video-analysis-player__meta">
        <span>${hasVideo ? "Ready on this device" : "No local file selected"}</span>
        <span>${formatVideoTime(ref?.durationMs || 0)}</span>
      </div>
    </section>
  `;
}
