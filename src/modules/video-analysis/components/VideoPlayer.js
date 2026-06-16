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
  const needsReconnect = hasLinkedMetadata && ["linked-unavailable", "permission-needed"].includes(localStatus);
  const showPermissionReconnect = localStatus === "permission-needed" && hasLinkedMetadata;
  const loadLabel = hasVideo ? "Change" : needsReconnect ? "Reconnect local file" : "Link local file";
  const emptyActionAttribute = showPermissionReconnect ? "data-video-analysis-restore-local-file" : "data-video-analysis-load";
  const emptyActionLabel = needsReconnect
    ? "Reconnect local file"
    : "Load local match video";
  const playbackStatus = state.localFileMessage || ({
    none: "No video linked",
    "linked-unavailable": "Reconnect local file on this device",
    "permission-needed": "Local file permission needed",
    restored: "Local file connected on this device",
    "session-only": "Local file linked for this session",
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
  const title = ref?.displayName || state.match?.title || state.pendingScheduleLink?.title || "No match video loaded";
  const currentMs = Math.max(0, Math.round(Number(state.timeline?.playheadMs || 0)));
  const durationMs = Math.max(0, Math.round(Number(ref?.durationMs || 0)));
  const visibleClipCount = Array.isArray(state.clips) ? state.clips.length : 0;
  const totalClipCount = Array.isArray(state.allClips) && state.allClips.length ? state.allClips.length : visibleClipCount;
  const filtered = totalClipCount > visibleClipCount;
  return `
    <section class="video-analysis-player" data-video-analysis-player>
      <div class="video-analysis-player__bar">
        <div>
          <p class="video-analysis-kicker">FS Player</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="video-analysis-player__actions">
          <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
          ${showPermissionReconnect ? `<button type="button" class="video-analysis-icon-button" data-video-analysis-restore-local-file title="Reconnect local file">Reconnect local file</button>` : ""}
          ${showPermissionReconnect && !hasVideo ? "" : `<button type="button" class="video-analysis-icon-button" data-video-analysis-load title="${needsReconnect ? "Reconnect local video" : "Link local video"}">${loadLabel}</button>`}
          ${needsPrepare || showPrepared ? `<button type="button" class="video-analysis-icon-button" data-video-analysis-prepare-playback ${needsPrepare ? "" : "disabled"} title="Prepare browser-safe playback copy">${showPrepared ? "Prepared" : "Prepare"}</button>` : ""}
        </div>
      </div>
      <div class="video-analysis-video-frame">
        ${
          hasVideo
            ? `<video class="video-analysis-video" data-video-analysis-video src="${escapeHtml(ref.objectUrl)}" playsinline preload="metadata" tabindex="-1"></video>`
            : `<div class="video-analysis-empty-video">
                <button type="button" class="video-analysis-empty-video__button" ${emptyActionAttribute}>
                  ${emptyActionLabel}
                </button>
              </div>`
        }
      </div>
      <div class="video-analysis-player-transport" aria-label="FS Player playback controls">
        <div class="video-analysis-player-time">
          <strong>${escapeHtml(formatVideoTime(currentMs))}</strong>
          <span>/ ${escapeHtml(formatVideoTime(durationMs))}</span>
        </div>
        <div class="video-analysis-player-controls">
          <span>1x</span>
          <button type="button" data-video-analysis-player-nudge="-5000" ${hasVideo ? "" : "disabled"} aria-label="Back five seconds">-5</button>
          <button type="button" class="video-analysis-player-play" data-video-analysis-play ${hasVideo ? "" : "disabled"} aria-label="Play or pause">Play</button>
          <button type="button" data-video-analysis-player-nudge="5000" ${hasVideo ? "" : "disabled"} aria-label="Forward five seconds">+5</button>
        </div>
        <button type="button" class="video-analysis-player-tag-filter" data-video-analysis-tag-filter-trigger>
          <span>#</span>
          <strong>Tags</strong>
          <em>${escapeHtml(filtered ? `${visibleClipCount}/${totalClipCount}` : String(visibleClipCount))}</em>
        </button>
      </div>
      <div class="video-analysis-player__meta">
        <span>${escapeHtml(playbackStatus)}</span>
        ${codecText ? `<span>${escapeHtml(codecText)}</span>` : ""}
        <span>${formatVideoTime(ref?.durationMs || 0)}</span>
      </div>
    </section>
  `;
}
