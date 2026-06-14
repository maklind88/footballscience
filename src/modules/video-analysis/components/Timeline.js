import { formatVideoTime } from "../services/videoPlaybackService.js";
import { buildTimelineLanes, clipBlockStyle, playheadStyle } from "../services/timelineService.js";
import { escapeHtml } from "./renderHelpers.js";

function renderClipBlock(clip = {}, totalMs = 1, zoom = 1, selectedClipId = "") {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  const endMs = clip.endMs ?? clip.end_ms ?? startMs + 1000;
  const selected = selectedClipId === clip.id;
  return `
    <button type="button" class="video-analysis-clip-block${selected ? " is-selected" : ""}"
      style="${clipBlockStyle(clip, totalMs, zoom)}"
      data-video-analysis-seek="${escapeHtml(clip.id)}"
      title="${escapeHtml(`${formatVideoTime(startMs)} - ${formatVideoTime(endMs)}`)}">
      <span>${escapeHtml(clip.outcome || "Neutral")}</span>
    </button>
  `;
}

export function renderTimeline(state = {}) {
  const totalMs = Math.max(1, Number(state.videoRef?.durationMs || 0));
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const timeline = state.timeline || {};
  const lanes = buildTimelineLanes(clips, timeline.laneMode);
  return `
    <section class="video-analysis-timeline">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Timeline</p>
          <h3>${clips.length} coded clips</h3>
        </div>
        <div class="video-analysis-timeline-controls">
          <select data-video-analysis-timeline="laneMode">
            ${["phase", "player", "unit", "outcome"].map((mode) => `<option value="${mode}" ${timeline.laneMode === mode ? "selected" : ""}>${mode}</option>`).join("")}
          </select>
          <button type="button" data-video-analysis-zoom="-0.25">-</button>
          <span>${escapeHtml(`${Number(timeline.zoom || 1).toFixed(2)}x`)}</span>
          <button type="button" data-video-analysis-zoom="0.25">+</button>
        </div>
      </div>
      <div class="video-analysis-lane-stack">
        <i class="video-analysis-playhead" style="${playheadStyle(timeline.playheadMs, totalMs, timeline.zoom)}"></i>
        ${
          lanes.length
            ? lanes.map((lane) => `
              <div class="video-analysis-lane">
                <div class="video-analysis-lane__label">${escapeHtml(lane.label)}</div>
                <div class="video-analysis-lane__track">
                  ${lane.clips.map((clip) => renderClipBlock(clip, totalMs, timeline.zoom, state.selectedClipId)).join("")}
                </div>
              </div>
            `).join("")
            : `<p class="video-analysis-muted">No timeline clips.</p>`
        }
      </div>
    </section>
  `;
}
