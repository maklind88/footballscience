import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

export function renderVideoPlayer(state = {}) {
  const ref = state.videoRef;
  const hasVideo = Boolean(ref?.objectUrl);
  const localStatus = String(state.localFileStatus || (hasVideo ? "restored" : "none"));
  const hasLinkedMetadata = Boolean(
    state.video?.id
    || state.source?.local_video_identifier
    || state.source?.localVideoIdentifier
    || ref?.localVideoIdentifier
  );
  const preparedPlayback = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/playback\//.test(String(ref?.objectUrl || ""));
  const compatibility = ref?.playbackCompatibility || {};
  const needsPrepare = Boolean(
    hasVideo
    && !preparedPlayback
    && (
      state.bridgeFallbackRecommended
      || localStatus === "browser-unplayable"
      || localStatus === "bridge-not-running"
      || state.status === "preparing-playback"
      || compatibility.warning
      || compatibility.status === "unsupported"
    )
  );
  const showPrepared = Boolean(hasVideo && preparedPlayback);
  const showReconnect = localStatus === "permission-needed" && hasLinkedMetadata;
  const loadLabel = hasVideo ? "Change" : "Link local file";
  const playbackStatus = state.localFileMessage || ({
    none: "No video linked",
    "linked-unavailable": "Local file linked but not available on this device",
    "permission-needed": "Local file permission needed",
    restored: "Local file connected on this device",
    "native-ready": "Native playback ready",
    "browser-unplayable": "Browser cannot play this file",
    preparing: "Preparing browser-safe copy",
    prepared: "Prepared copy ready",
    "bridge-not-running": "Bridge not running",
  }[localStatus] || (hasVideo ? "Local file connected on this device" : "No video linked"));
  const codecText = compatibility.codecLabel
    ? `${compatibility.codecLabel}${compatibility.container ? ` / ${compatibility.container.toUpperCase()}` : ""}`
    : compatibility.container
      ? compatibility.container.toUpperCase()
      : "";
  return `
    <section class="video-analysis-player" data-video-analysis-player>
      <div class="video-analysis-player__bar">
        <div>
          <p class="video-analysis-kicker">Local video</p>
          <h2>${escapeHtml(ref?.displayName || "No video loaded")}</h2>
        </div>
        <div class="video-analysis-player__actions">
          <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
          ${showReconnect ? `<button type="button" class="video-analysis-icon-button" data-video-analysis-restore-local-file title="Reconnect local file">Reconnect local file</button>` : ""}
          <button type="button" class="video-analysis-icon-button" data-video-analysis-load title="Link local video">${loadLabel}</button>
          ${needsPrepare || showPrepared ? `<button type="button" class="video-analysis-icon-button" data-video-analysis-prepare-playback ${needsPrepare ? "" : "disabled"} title="Prepare browser-safe playback copy">${showPrepared ? "Prepared" : "Prepare"}</button>` : ""}
          <button type="button" class="video-analysis-icon-button" data-video-analysis-play ${hasVideo ? "" : "disabled"} title="Play or pause">Play</button>
        </div>
      </div>
      <div class="video-analysis-video-frame">
        ${
          hasVideo
            ? `<video class="video-analysis-video" data-video-analysis-video src="${escapeHtml(ref.objectUrl)}" controls playsinline></video>`
            : `<div class="video-analysis-empty-video">
                <button type="button" class="video-analysis-empty-video__button" data-video-analysis-load>
                  ${localStatus === "linked-unavailable" ? "Link local file" : "Load local match video"}
                </button>
              </div>`
        }
      </div>
      <div class="video-analysis-player__meta">
        <span>${escapeHtml(playbackStatus)}</span>
        ${codecText ? `<span>${escapeHtml(codecText)}</span>` : ""}
        <span>${formatVideoTime(ref?.durationMs || 0)}</span>
      </div>
    </section>
  `;
}
