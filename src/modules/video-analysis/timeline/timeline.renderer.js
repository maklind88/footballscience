import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "../components/renderHelpers.js";
import { TIMELINE_LANE_MODES } from "./timeline.constants.js";
import {
  buildTimelineLanes,
  buildTimelineTicks,
  clipBlockStyle,
  getTimelineDurationMs,
  normalizeTimelineLaneMode,
  normalizeTimelineZoom,
  playheadStyle,
  timelineCanvasStyle,
} from "./timeline.service.js";
import {
  getClipEndMs,
  getClipPrimaryLabel,
  getClipSecondaryLabel,
  getClipStartMs,
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
    <div
      class="video-analysis-playhead"
      style="${playheadStyle(playheadMs, totalMs)}"
      data-video-analysis-timeline-scrub
      aria-hidden="true"
    ></div>
    <div
      class="video-analysis-playhead-time"
      style="${playheadStyle(playheadMs, totalMs)}"
      data-video-analysis-timeline-scrub-time
      aria-hidden="true"
    >${escapeHtml(formatVideoTime(playheadMs))}</div>
  `;
}

function renderClipBlock(clip = {}, totalMs = 1, laneMode = "phase", selectedClipId = "", clipNumber = 1, categorySelected = false) {
  const startMs = getClipStartMs(clip);
  const endMs = getClipEndMs(clip);
  const outcome = clip.outcome || "Neutral";
  const selected = selectedClipId === clip.id;
  const primaryLabel = getClipPrimaryLabel(clip, laneMode);
  const secondaryLabel = getClipSecondaryLabel(clip);
  return `
    <button type="button" class="video-analysis-clip-block${outcomeClass(outcome)}${selected ? " is-selected" : ""}${categorySelected ? " is-category-selected" : ""}"
      style="${clipBlockStyle(clip, totalMs)}"
      data-video-analysis-seek="${escapeHtml(clip.id)}"
      title="${escapeHtml(`#${clipNumber} · ${primaryLabel} · ${formatVideoTime(startMs)} - ${formatVideoTime(endMs)} · ${secondaryLabel}`)}">
      <span
        class="video-analysis-clip-block__handle is-start"
        data-video-analysis-timeline-trim-edge="${escapeHtml(`${clip.id}:start`)}"
        aria-label="Trim clip start"
        title="Trim start"
      ></span>
      <span class="video-analysis-clip-block__copy">
        <strong>${escapeHtml(String(clipNumber))}</strong>
        <small>${escapeHtml(formatVideoTime(startMs))}</small>
      </span>
      <span
        class="video-analysis-clip-block__handle is-end"
        data-video-analysis-timeline-trim-edge="${escapeHtml(`${clip.id}:end`)}"
        aria-label="Trim clip end"
        title="Trim end"
      ></span>
    </button>
  `;
}

function isActiveCategory(timeline = {}, laneMode = "phase", label = "") {
  const selected = timeline.selectedCategory || {};
  return selected.laneMode === laneMode && selected.label === label;
}

function renderTimelineLanes(lanes = [], totalMs = 1, laneMode = "phase", selectedClipId = "", timeline = {}) {
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
    <div class="video-analysis-lane${isActiveCategory(timeline, laneMode, lane.label) ? " is-selected" : ""}">
      <button
        type="button"
        class="video-analysis-lane__label"
        data-video-analysis-timeline-category
        data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}"
        data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}"
        aria-pressed="${isActiveCategory(timeline, laneMode, lane.label) ? "true" : "false"}"
        title="${escapeHtml(`Select all ${lane.label} clips`)}"
      >
        <strong>${escapeHtml(lane.label)}</strong>
        <span>${escapeHtml(`${lane.clips.length} clip${lane.clips.length === 1 ? "" : "s"}`)}</span>
      </button>
      <div class="video-analysis-lane__track" data-video-analysis-timeline-track data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}">
        ${lane.clips.map((clip, index) => renderClipBlock(
          clip,
          totalMs,
          laneMode,
          selectedClipId,
          index + 1,
          isActiveCategory(timeline, laneMode, lane.label)
        )).join("")}
      </div>
    </div>
  `).join("");
}

function selectedTimelineLane(lanes = [], laneMode = "phase", timeline = {}) {
  const selected = timeline.selectedCategory || {};
  if (selected.laneMode !== laneMode || !selected.label) return null;
  return lanes.find((lane) => lane.label === selected.label) || null;
}

function renderTimelineCategoryTray(lane = null, laneMode = "phase", timeline = {}) {
  if (!lane) {
    return "";
  }
  const viewOpen = Boolean(timeline.selectedCategory?.viewOpen);
  const firstClip = lane.clips[0];
  const activeClipId = timeline.selectedCategory?.activeClipId || "";
  const activeClip = lane.clips.find((clip) => clip.id === activeClipId) || firstClip;
  return `
    <div class="video-analysis-timeline-category-tray">
      <div>
        <strong>${escapeHtml(lane.label)}</strong>
        <span>${escapeHtml(`${lane.clips.length} clip${lane.clips.length === 1 ? "" : "s"} selected`)}</span>
        ${activeClip ? `<span>${escapeHtml(`Active: ${formatVideoTime(getClipStartMs(activeClip))}`)}</span>` : ""}
      </div>
      <div class="video-analysis-timeline-category-tray__actions">
        <button type="button" data-video-analysis-timeline-category-step="-1" data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Previous</button>
        <button type="button" data-video-analysis-timeline-category-play data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Play active</button>
        <button type="button" data-video-analysis-timeline-category-step="1" data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Next</button>
        <button type="button" data-video-analysis-timeline-category-open data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">${viewOpen ? "Close view" : "Open view"}</button>
        <button type="button" data-video-analysis-timeline-category-add-selected data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Add selected</button>
        <button type="button" data-video-analysis-timeline-category-add-presentation data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Add all</button>
      </div>
      ${viewOpen ? `
        <ol class="video-analysis-timeline-category-view" aria-label="${escapeHtml(`${lane.label} clips`)}">
          ${lane.clips.map((clip, index) => `
            <li class="${clip.id === activeClip?.id ? "is-active" : ""}">
              <button type="button" data-video-analysis-seek="${escapeHtml(clip.id)}">
                <strong>${escapeHtml(String(index + 1))}</strong>
                <span>${escapeHtml(formatVideoTime(getClipStartMs(clip)))}</span>
                <em>${escapeHtml(getClipSecondaryLabel(clip))}</em>
              </button>
            </li>
          `).join("")}
        </ol>
      ` : ""}
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
  const ticks = buildTimelineTicks(totalMs);
  const selectedLane = selectedTimelineLane(lanes, laneMode, timeline);
  return `
    <section class="video-analysis-timeline video-analysis-timeline-module" data-video-analysis-timeline-module data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}">
      <div class="video-analysis-timeline-toolbar">
        ${renderLaneButtons(laneMode)}
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
            ${renderTimelineLanes(lanes, totalMs, laneMode, state.selectedClipId, timeline)}
          </div>
        </div>
      </div>
      ${renderTimelineCategoryTray(selectedLane, laneMode, timeline)}
    </section>
  `;
}
