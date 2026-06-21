import { formatVideoTime } from "../services/videoPlaybackService.js";
import { getTimelineDurationMs } from "../timeline/timeline.service.js";
import { escapeHtml } from "./renderHelpers.js";

const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 3];

function normalizePlaybackRate(value = 1) {
  const numeric = Number(value);
  return PLAYBACK_RATES.includes(numeric) ? numeric : 1;
}

function formatPlaybackRate(rate = 1) {
  const numeric = Number(rate);
  return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)}x`;
}

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
  const durationMs = Math.max(0, Math.round(Number(ref?.durationMs || 0)), Math.round(Number(getTimelineDurationMs(state) || 0)));
  const codeModeActive = state.fsPlayer?.mode === "code";
  const playbackRate = normalizePlaybackRate(state.fsPlayer?.playbackRate || 1);
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
      <div class="video-analysis-video-frame" data-video-analysis-video-shuttle>
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
          <strong data-video-analysis-player-current-time>${escapeHtml(formatVideoTime(currentMs))}</strong>
          <span data-video-analysis-player-duration-time>/ ${escapeHtml(formatVideoTime(durationMs))}</span>
        </div>
        <div class="video-analysis-player-controls">
          <label class="video-analysis-player-rate-group" title="Playback speed">
            <span class="video-analysis-sr-only">Playback speed</span>
            <select class="video-analysis-player-rate-select" data-video-analysis-playback-rate-select ${hasVideo ? "" : "disabled"} aria-label="Playback speed">
              ${PLAYBACK_RATES.map((rate) => `
                <option value="${escapeHtml(String(rate))}" ${rate === playbackRate ? "selected" : ""}>${escapeHtml(formatPlaybackRate(rate))}</option>
              `).join("")}
            </select>
          </label>
          <button type="button" class="video-analysis-player-nudge" data-video-analysis-player-nudge="-5000" ${hasVideo ? "" : "disabled"} aria-label="Back five seconds" title="Back 5 seconds">
            <span class="video-analysis-player-nudge__glyph is-back" aria-hidden="true">
              <span class="video-analysis-player-nudge__arrow">&#8634;</span>
              <span class="video-analysis-player-nudge__amount">5</span>
            </span>
          </button>
          <button type="button" class="video-analysis-player-play" data-video-analysis-play ${hasVideo ? "" : "disabled"} aria-label="Play" title="Play">
            <span class="video-analysis-player-play__icon" data-video-analysis-play-icon aria-hidden="true">&#9654;</span>
            <span data-video-analysis-play-label>Play</span>
          </button>
          <button type="button" class="video-analysis-player-nudge" data-video-analysis-player-nudge="5000" ${hasVideo ? "" : "disabled"} aria-label="Forward five seconds" title="Forward 5 seconds">
            <span class="video-analysis-player-nudge__glyph is-forward" aria-hidden="true">
              <span class="video-analysis-player-nudge__arrow">&#8635;</span>
              <span class="video-analysis-player-nudge__amount">5</span>
            </span>
          </button>
        </div>
        <div class="video-analysis-player-view-actions" aria-label="FS Player view options">
          <button type="button" class="video-analysis-player-view-button" data-video-analysis-video-fullscreen ${hasVideo ? "" : "disabled"} aria-label="Full screen video" title="Full screen video">
            <span class="video-analysis-player-view-icon" aria-hidden="true"></span>
            <strong>Full screen</strong>
          </button>
          <button type="button" class="video-analysis-player-view-button${codeModeActive ? " is-active" : ""}" data-video-analysis-code-mode aria-pressed="${codeModeActive ? "true" : "false"}" title="${codeModeActive ? "Exit Code Mode" : "Enter Code Mode"}">
            <span class="video-analysis-player-view-icon is-code" aria-hidden="true"></span>
            <strong>Code mode</strong>
          </button>
        </div>
      </div>
      <div class="video-analysis-player__meta">
        <span>${escapeHtml(playbackStatus)}</span>
        ${codecText ? `<span>${escapeHtml(codecText)}</span>` : ""}
        <span data-video-analysis-player-meta-duration>${formatVideoTime(durationMs)}</span>
      </div>
    </section>
  `;
}
