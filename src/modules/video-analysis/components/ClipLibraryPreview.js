import { clipEndMs, clipStartMs, playerEntries } from "../services/clipLibraryService.js";
import { clipMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function previewTitle(clip = {}) {
  const phase = String(clip.phase || "Uncoded").trim();
  const subPhase = String(clip.subPhase || clip.sub_phase || "").trim();
  return [subPhase, phase].filter(Boolean).join(" / ") || "Uncoded clip";
}

function previewPlayerLabel(clip = {}) {
  return playerEntries(clip)[0]?.label || "Unit";
}

function previewOutcome(clip = {}) {
  return String(clip.outcome || "Neutral").trim() || "Neutral";
}

function formatSourceDate(value = "") {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

function sourceTypeLabel(value = "") {
  return String(value || "").toLowerCase() === "training" ? "Training" : "Match";
}

function sourceTitle(clip = {}, state = {}) {
  return String(
    clip.matchTitle
    || clip.match_title
    || clip.match?.title
    || clip.videoTitle
    || clip.video_title
    || state.match?.title
    || state.videoRef?.displayName
    || "Source not linked"
  ).trim();
}

function sourceLine(clip = {}, state = {}) {
  const type = sourceTypeLabel(clip.eventType || clip.event_type || state.match?.eventType || state.match?.event_type);
  const date = formatSourceDate(clip.matchDate || clip.match_date || state.match?.matchDate || state.match?.match_date);
  return [type, sourceTitle(clip, state), date].filter(Boolean).join(" · ");
}

function renderPrinciples(clip = {}) {
  const principles = clipMiniGamePrincipleLabels(clip);
  if (!principles.length) return `<span class="video-analysis-clip-library-muted">No MG principle</span>`;
  return `
    <span class="video-analysis-clip-library-principles">
      ${principles.map((principle) => `<em>${escapeHtml(principle)}</em>`).join("")}
    </span>
  `;
}

export function renderClipPreviewOverlay(state = {}, clips = []) {
  const previewClipId = String(state.clipLibrary?.previewClipId || "");
  if (!previewClipId) return "";
  const clip = clips.find((item) => item.id === previewClipId) || {};
  const queueIds = (Array.isArray(state.clipLibrary?.previewQueueIds) ? state.clipLibrary.previewQueueIds : [])
    .map((id) => String(id || ""))
    .filter(Boolean);
  const activeIndex = Math.max(0, Number(state.clipLibrary?.previewActiveIndex || 0));
  const queueLabel = queueIds.length > 1 ? `${activeIndex + 1} of ${queueIds.length}` : "";
  const startMs = clipStartMs(clip);
  const endMs = clipEndMs(clip);
  const hasPlayableVideo = Boolean(state.videoRef?.objectUrl);
  return `
    <div class="video-analysis-clip-library-preview" data-video-analysis-clip-library-preview role="dialog" aria-modal="true" aria-label="Clip preview">
      <section class="video-analysis-clip-library-preview__panel">
        <header class="video-analysis-clip-library-preview__header">
          <div>
            <p class="video-analysis-kicker">${queueLabel ? `Organizer · ${escapeHtml(queueLabel)}` : "Clip Preview"}</p>
            <h3>${escapeHtml(previewTitle(clip))}</h3>
            <span>${escapeHtml(sourceLine(clip, state))}</span>
          </div>
          <button type="button" data-video-analysis-clip-library-preview-close aria-label="Close clip preview">Close</button>
        </header>
        <div class="video-analysis-clip-library-preview__meta">
          <strong>${escapeHtml(`${formatVideoTime(startMs)} - ${formatVideoTime(endMs)}`)}</strong>
          <span>${escapeHtml(previewPlayerLabel(clip))} · ${escapeHtml(previewOutcome(clip))}</span>
          ${renderPrinciples(clip)}
        </div>
        ${
          hasPlayableVideo
            ? `<video
                class="video-analysis-clip-library-preview__video"
                data-video-analysis-clip-library-video
                src="${escapeHtml(state.videoRef.objectUrl)}"
                playsinline
                preload="metadata"
                controls
              ></video>`
            : `<div class="video-analysis-clip-library-preview__empty">
                <strong>Local file is not connected on this device.</strong>
                <button type="button" data-video-analysis-restore-local-file>Reconnect local file</button>
              </div>`
        }
      </section>
    </div>
  `;
}
