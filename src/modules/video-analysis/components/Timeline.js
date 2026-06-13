import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function renderMarker(clip = {}, totalMs = 1) {
  const left = Math.min(98, Math.max(0, (Number(clip.startMs || clip.start_ms || 0) / totalMs) * 100));
  return `
    <button type="button" class="video-analysis-marker" style="left:${left}%"
      data-video-analysis-seek="${escapeHtml(clip.id)}" title="${escapeHtml(formatVideoTime(clip.startMs || clip.start_ms))}">
    </button>
  `;
}

export function renderTimeline(state = {}) {
  const totalMs = Math.max(1, Number(state.videoRef?.durationMs || 0));
  const clips = Array.isArray(state.clips) ? state.clips : [];
  return `
    <section class="video-analysis-timeline">
      <div class="video-analysis-panel-header">
        <p class="video-analysis-kicker">Timeline</p>
        <h3>${clips.length} tagged instances</h3>
      </div>
      <div class="video-analysis-timeline-track">
        ${clips.map((clip) => renderMarker(clip, totalMs)).join("")}
      </div>
    </section>
  `;
}
