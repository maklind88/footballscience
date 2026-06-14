import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "../components/renderHelpers.js";
import { TIMELINE_LANE_MODES } from "./timeline.constants.js";
import {
  buildTimelineLanes,
  buildTimelineTicks,
  clipBlockStyle,
  getTimelineStats,
  getTimelineDurationMs,
  normalizeTimelineLaneMode,
  normalizeTimelineZoom,
  playheadStyle,
  timelineCanvasStyle,
} from "./timeline.service.js";
import {
  firstPlayerLabel,
  getClipEndMs,
  getClipPrimaryLabel,
  getClipSecondaryLabel,
  getClipStartMs,
  getSelectedClip,
} from "./timeline.selectors.js";

function outcomeClass(outcome = "") {
  const value = String(outcome || "neutral").trim().toLowerCase();
  if (value === "positive") return " is-positive";
  if (value === "development") return " is-development";
  return " is-neutral";
}

function renderLaneButtons(activeLaneMode = "phase") {
  return `
    <div class="video-analysis-timeline-tabs" aria-label="Timeline lanes">
      ${TIMELINE_LANE_MODES.map((mode) => `
        <button
          type="button"
          class="${activeLaneMode === mode.id ? "is-active" : ""}"
          data-video-analysis-timeline-lane="${escapeHtml(mode.id)}"
          aria-pressed="${activeLaneMode === mode.id ? "true" : "false"}"
        >${escapeHtml(mode.label)}</button>
      `).join("")}
    </div>
  `;
}

function renderTimelineRuler(ticks = [], totalMs = 1) {
  return `
    <div class="video-analysis-timeline-ruler" data-video-analysis-timeline-ruler data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}" aria-hidden="true">
      ${ticks.map((tick) => `
        <span class="video-analysis-timeline-tick" style="left:${tick.left}%">
          <i></i>
          <b>${escapeHtml(formatVideoTime(tick.ms))}</b>
        </span>
      `).join("")}
    </div>
  `;
}

function renderTimelinePlayhead(playheadMs = 0, totalMs = 1) {
  return `
    <button
      type="button"
      class="video-analysis-playhead"
      style="${playheadStyle(playheadMs, totalMs)}"
      data-video-analysis-timeline-scrub
      draggable="false"
      role="slider"
      aria-label="Drag timeline playhead"
      aria-valuemin="0"
      aria-valuemax="${escapeHtml(Math.round(totalMs / 1000))}"
      aria-valuenow="${escapeHtml(Math.round(Number(playheadMs || 0) / 1000))}"
      aria-valuetext="${escapeHtml(formatVideoTime(playheadMs))}"
      title="Drag to seek"
    ></button>
  `;
}

function renderClipBlock(clip = {}, totalMs = 1, laneMode = "phase", selectedClipId = "") {
  const startMs = getClipStartMs(clip);
  const endMs = getClipEndMs(clip);
  const outcome = clip.outcome || "Neutral";
  const selected = selectedClipId === clip.id;
  return `
    <button type="button" class="video-analysis-clip-block${outcomeClass(outcome)}${selected ? " is-selected" : ""}"
      style="${clipBlockStyle(clip, totalMs)}"
      data-video-analysis-seek="${escapeHtml(clip.id)}"
      title="${escapeHtml(`${formatVideoTime(startMs)} - ${formatVideoTime(endMs)} · ${getClipSecondaryLabel(clip)}`)}">
      <span class="video-analysis-clip-block__handle" aria-hidden="true"></span>
      <span class="video-analysis-clip-block__copy">
        <strong>${escapeHtml(getClipPrimaryLabel(clip, laneMode))}</strong>
        <small>${escapeHtml(formatVideoTime(startMs))}</small>
      </span>
      <span class="video-analysis-clip-block__handle" aria-hidden="true"></span>
    </button>
  `;
}

function renderTimelineLanes(lanes = [], totalMs = 1, laneMode = "phase", selectedClipId = "") {
  if (!lanes.length) {
    return `
      <div class="video-analysis-lane is-empty">
        <div class="video-analysis-lane__label">
          <strong>Timeline</strong>
          <span>No clips</span>
        </div>
        <div class="video-analysis-lane__track" data-video-analysis-timeline-track data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}">
        </div>
      </div>
    `;
  }
  return lanes.map((lane) => `
    <div class="video-analysis-lane">
      <div class="video-analysis-lane__label">
        <strong>${escapeHtml(lane.label)}</strong>
        <span>${escapeHtml(`${lane.clips.length} clip${lane.clips.length === 1 ? "" : "s"}`)}</span>
      </div>
      <div class="video-analysis-lane__track" data-video-analysis-timeline-track data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}">
        ${lane.clips.map((clip) => renderClipBlock(clip, totalMs, laneMode, selectedClipId)).join("")}
      </div>
    </div>
  `).join("");
}

function renderSelectedClipSummary(selectedClip = null) {
  if (!selectedClip) {
    return `
      <div class="video-analysis-timeline-selection">
        <span>Select a clip block to inspect or send it into a review list.</span>
      </div>
    `;
  }
  const startMs = getClipStartMs(selectedClip);
  const endMs = getClipEndMs(selectedClip);
  return `
    <div class="video-analysis-timeline-selection is-active">
      <div>
        <strong>${escapeHtml(selectedClip.phase || "Uncoded")}</strong>
        <span>${escapeHtml(`${formatVideoTime(startMs)} - ${formatVideoTime(endMs)}`)}</span>
        <span>${escapeHtml(firstPlayerLabel(selectedClip))}</span>
        <span>${escapeHtml(selectedClip.outcome || "Neutral")}</span>
      </div>
      <button type="button" data-video-analysis-review="${escapeHtml(selectedClip.id)}">Add to review</button>
    </div>
  `;
}

export function renderTimeline(state = {}) {
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const allClips = Array.isArray(state.allClips) ? state.allClips : clips;
  const totalMs = getTimelineDurationMs({ ...state, clips: allClips.length ? allClips : clips });
  const timeline = state.timeline || {};
  const laneMode = normalizeTimelineLaneMode(timeline.laneMode);
  const zoom = normalizeTimelineZoom(timeline.zoom);
  const lanes = buildTimelineLanes(clips, laneMode);
  const stats = getTimelineStats(clips, allClips);
  const selectedClip = getSelectedClip(clips, state.selectedClipId);
  const ticks = buildTimelineTicks(totalMs);
  return `
    <section class="video-analysis-timeline video-analysis-timeline-module" data-video-analysis-timeline-module data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}">
      <div class="video-analysis-panel-header video-analysis-timeline-header">
        <div>
          <p class="video-analysis-kicker">FS Player module</p>
          <h3>Timeline</h3>
        </div>
        <div class="video-analysis-timeline-summary" aria-label="Timeline summary">
          <span>${escapeHtml(`${stats.visibleClipCount} coded`)}</span>
          <span>${escapeHtml(formatVideoTime(stats.codedMs))}</span>
          ${stats.isFiltered ? `<span>${escapeHtml(`${stats.visibleClipCount}/${stats.totalClipCount} shown`)}</span>` : ""}
        </div>
      </div>
      <div class="video-analysis-timeline-toolbar">
        ${renderLaneButtons(laneMode)}
        <div class="video-analysis-timeline-controls">
          <button type="button" data-video-analysis-zoom="-0.25" title="Zoom out">-</button>
          <span>${escapeHtml(`${zoom.toFixed(2)}x`)}</span>
          <button type="button" data-video-analysis-zoom="0.25" title="Zoom in">+</button>
          <span>${escapeHtml(`Duration ${formatVideoTime(totalMs)}`)}</span>
        </div>
      </div>
      <div class="video-analysis-timeline-scroll">
        <div class="video-analysis-timeline-canvas" style="${timelineCanvasStyle(zoom)}">
          ${renderTimelineRuler(ticks, totalMs)}
          <div
            class="video-analysis-playhead-rail"
            data-video-analysis-timeline-scrub-surface
            data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}"
          >
            ${renderTimelinePlayhead(timeline.playheadMs, totalMs)}
          </div>
          <div class="video-analysis-lane-stack">
            ${renderTimelineLanes(lanes, totalMs, laneMode, state.selectedClipId)}
          </div>
        </div>
      </div>
      ${renderSelectedClipSummary(selectedClip)}
    </section>
  `;
}
