import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "../components/renderHelpers.js";
import { TIMELINE_LANE_MODES } from "./timeline.constants.js";
import { renderSelectedClipFocus } from "./timeline.focus.renderer.js";
import {
  buildTimelineIndex,
  buildTimelineWindowTicks,
  clipBlockStyle,
  clipIntersectsTimelineWindow,
  getTimelineDensity,
  getTimelineDurationMs,
  getTimelineWindow,
  normalizeTimelineLaneMode,
  normalizeTimelineZoom,
  packTimelineLaneClips,
  playheadStyle,
  timelineCanvasStyle,
} from "./timeline.service.js";
import {
  clipValue,
  getClipEndMs,
  getClipPrimaryLabel,
  getClipSecondaryLabel,
  getClipStartMs,
} from "./timeline.selectors.js";
import { clipMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";
import { timelineSelectedClipIds } from "../services/clipEditingService.js";
import { activeAnalysisTimeline, normalizeTimelineWorkspace } from "../domain/timelineWorkspace.model.js";
import { timelineWorkspaceLanes } from "../services/timelineWorkspaceService.js";
import { renderTimelineWorkspaceControls } from "./timeline.workspace.renderer.js";

function outcomeClass(outcome = "") {
  const value = String(outcome || "neutral").trim().toLowerCase();
  if (value === "positive") return " is-positive";
  if (value === "development") return " is-development";
  return " is-neutral";
}

function safeHexColor(value = "") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function clipTargetValue(clip = {}, targetField = "") {
  if (targetField === "subPhase") return clipValue(clip, "subPhase", "sub_phase");
  if (targetField === "teamPrincipleId") return clipValue(clip, "teamPrincipleId", "team_principle_id");
  if (targetField === "miniGamePrincipleId") return clipValue(clip, "miniGamePrincipleId", "mini_game_principle_id");
  return clipValue(clip, targetField, targetField);
}

function buildTemplateButtonLookup(template = {}) {
  const byId = new Map();
  const byFieldValue = new Map();
  for (const button of template.buttons || []) {
    for (const key of [button.id, button.databaseId].filter(Boolean)) byId.set(String(key), button);
    const targetField = button.targetField || button.type || "";
    if (targetField && button.value) byFieldValue.set(`${targetField}:${button.value}`, button);
  }
  return { byId, byFieldValue };
}

function findClipButton(clip = {}, lookup = {}) {
  const clipButtonId = String(clipValue(clip, "codingButtonId", "coding_button_id") || "");
  if (clipButtonId && lookup.byId?.has(clipButtonId)) return lookup.byId.get(clipButtonId);
  for (const tag of Array.isArray(clip.tags) ? clip.tags : []) {
    const tagButton = lookup.byFieldValue?.get(`tags:${tag}`);
    if (tagButton) return tagButton;
  }
  for (const field of ["phase", "subPhase", "miniGamePrincipleId", "outcome"]) {
    const value = clipTargetValue(clip, field);
    const button = lookup.byFieldValue?.get(`${field}:${value}`);
    if (button) return button;
  }
  return null;
}

function timelineModeCount(mode = {}, modeCounts = {}, activeLaneMode = "phase", clipCount = 0) {
  const count = Number(modeCounts[mode.id]);
  if (Number.isFinite(count)) return count;
  return mode.id === activeLaneMode ? Number(clipCount || 0) : 0;
}

function formatTimelineModeLabel(mode = {}, modeCounts = {}, activeLaneMode = "phase", clipCount = 0) {
  return `${mode.label} (${timelineModeCount(mode, modeCounts, activeLaneMode, clipCount)})`;
}

function buildTimelineLaneModeCounts(clips = []) {
  return TIMELINE_LANE_MODES.reduce((counts, mode) => ({
    ...counts,
    [mode.id]: buildTimelineIndex(clips, mode.id).clipCount,
  }), {});
}

function renderLaneSelector(activeLaneMode = "phase", clipCount = 0, modeCounts = {}) {
  return `
    <label class="video-analysis-timeline-view-select">
      <span>Timeline</span>
      <select data-video-analysis-timeline-lane-select aria-label="Timeline view">
        ${activeLaneMode === "workspace" ? `<option value="workspace" selected>Custom (${escapeHtml(clipCount)})</option>` : ""}
        ${TIMELINE_LANE_MODES.map((mode) => `
          <option value="${escapeHtml(mode.id)}"${activeLaneMode === mode.id ? " selected" : ""}>${escapeHtml(formatTimelineModeLabel(mode, modeCounts, activeLaneMode, clipCount))}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderTimelineRuler(ticks = [], window = {}) {
  const durationMs = Math.max(1, Number(window.durationMs || 1));
  const startMs = Math.max(0, Number(window.startMs || 0));
  return `
    <div
      class="video-analysis-timeline-ruler"
      data-video-analysis-timeline-ruler
      data-video-analysis-timeline-duration-ms="${escapeHtml(durationMs)}"
      data-video-analysis-timeline-window-start-ms="${escapeHtml(startMs)}"
      aria-hidden="true"
    >
      ${ticks.map((tick) => `
        <span class="video-analysis-timeline-tick" style="left:${tick.left}%">
          <i></i>
          <b>${escapeHtml(formatVideoTime(tick.ms))}</b>
        </span>
      `).join("")}
    </div>
  `;
}

function renderTimelinePlayhead(playheadMs = 0, window = {}) {
  const durationMs = Math.max(1, Number(window.durationMs || 1));
  const startMs = Math.max(0, Number(window.startMs || 0));
  return `
    <div
      class="video-analysis-playhead"
      style="${playheadStyle(playheadMs, durationMs, startMs)}"
      data-video-analysis-timeline-scrub
      aria-hidden="true"
    ></div>
    <div
      class="video-analysis-playhead-time"
      style="${playheadStyle(playheadMs, durationMs, startMs)}"
      data-video-analysis-timeline-scrub-time
      aria-hidden="true"
    >${escapeHtml(formatVideoTime(playheadMs))}</div>
  `;
}

function renderTimelineWindowControls(window = {}, timeline = {}, selectedCount = 0, canEdit = false) {
  const focusAvailable = selectedCount > 0;
  const historyCount = Array.isArray(timeline.history) ? timeline.history.length : 0;
  return `
    <div class="video-analysis-timeline-window-controls">
      <div class="video-analysis-timeline-tabs" role="group" aria-label="Timeline scale">
        <button
          type="button"
          class="${window.mode === "overview" ? "is-active" : ""}"
          data-video-analysis-timeline-view="overview"
          aria-pressed="${window.mode === "overview" ? "true" : "false"}"
        >Overview</button>
        <button
          type="button"
          class="${window.mode === "focus" ? "is-active" : ""}"
          data-video-analysis-timeline-view="focus"
          aria-pressed="${window.mode === "focus" ? "true" : "false"}"
          ${focusAvailable ? "" : "disabled"}
        >Focus</button>
      </div>
      <div class="video-analysis-timeline-window-range">
        <span>${escapeHtml(`${formatVideoTime(window.startMs)} - ${formatVideoTime(window.endMs)}`)}</span>
        <button type="button" data-video-analysis-timeline-zoom="-1" aria-label="Zoom out">-</button>
        <strong>${escapeHtml(`${Math.round(Number(timeline.zoom || 1) * 10) / 10}x`)}</strong>
        <button type="button" data-video-analysis-timeline-zoom="1" aria-label="Zoom in">+</button>
      </div>
      <div class="video-analysis-timeline-window-actions">
        ${selectedCount > 1 ? `<button type="button" data-video-analysis-timeline-clear-selection>Clear selection</button>` : ""}
        <button
          type="button"
          data-video-analysis-timeline-undo
          ${canEdit && historyCount ? "" : "disabled"}
        >Undo${historyCount ? ` (${historyCount})` : ""}</button>
      </div>
    </div>
  `;
}

function selectedTimelineClip(clips = [], timeline = {}, selectedClipId = "") {
  const selectedId = String(selectedClipId || timeline.selectedCategory?.activeClipId || "").trim();
  if (!selectedId) return null;
  return clips.find((clip) => String(clip.id || "") === selectedId) || null;
}

function renderClipBlock(clip = {}, window = {}, laneMode = "phase", selectedClipIds = new Set(), clipNumber = 1, categorySelected = false, button = null, density = {}, row = 0, rowColor = "") {
  const startMs = getClipStartMs(clip);
  const endMs = getClipEndMs(clip);
  const outcome = clip.outcome || "Neutral";
  const selected = selectedClipIds.has(String(clip.id || ""));
  const primaryLabel = getClipPrimaryLabel(clip, laneMode);
  const secondaryLabel = getClipSecondaryLabel(clip);
  const buttonColor = safeHexColor(button?.color) || safeHexColor(rowColor);
  const buttonLabel = button?.label || "";
  const miniGameLabels = clipMiniGamePrincipleLabels(clip);
  const miniGameText = miniGameLabels.length
    ? `${miniGameLabels.slice(0, 3).join(" + ")}${miniGameLabels.length > 3 ? ` +${miniGameLabels.length - 3}` : ""}`
    : "";
  return `
    <button type="button" class="video-analysis-clip-block${outcomeClass(outcome)}${selected ? " is-selected" : ""}${categorySelected ? " is-category-selected" : ""}"
      style="${clipBlockStyle(clip, window.durationMs, { windowStartMs: window.startMs, windowDurationMs: window.durationMs })}--video-analysis-clip-row:${escapeHtml(String(row))};${buttonColor ? `--video-analysis-clip-color:${escapeHtml(buttonColor)};` : ""}"
      data-video-analysis-seek="${escapeHtml(clip.id)}"
      aria-pressed="${selected ? "true" : "false"}"
      title="${escapeHtml(`#${clipNumber} · ${buttonLabel || primaryLabel} · ${formatVideoTime(startMs)} - ${formatVideoTime(endMs)} · ${secondaryLabel}`)}">
      <span class="video-analysis-clip-block__copy">
        <strong>${escapeHtml(String(clipNumber))}</strong>
        ${miniGameText && !density.isDense ? `<em>${escapeHtml(miniGameText)}</em>` : ""}
        ${density.isDense ? "" : `<small>${escapeHtml(formatVideoTime(startMs))}</small>`}
      </span>
    </button>
  `;
}

function isActiveCategory(timeline = {}, laneMode = "phase", label = "") {
  const selected = timeline.selectedCategory || {};
  return selected.laneMode === laneMode && selected.label === label;
}

function renderTimelineLanes(lanes = [], window = {}, laneMode = "phase", selectedClipIds = new Set(), timeline = {}, buttonLookup = {}, density = {}) {
  const visibleLanes = lanes
    .map((lane) => ({
      lane,
      visibleClips: lane.clips.filter((clip) => clipIntersectsTimelineWindow(clip, window)),
    }))
    .filter(({ visibleClips }) => window.mode !== "focus" || visibleClips.length);
  if (!visibleLanes.length) {
    return `
      <div class="video-analysis-lane is-empty">
        <div class="video-analysis-lane__label">
          <strong>Timeline <span class="video-analysis-lane__count">(0)</span></strong>
        </div>
        <div
          class="video-analysis-lane__track"
          data-video-analysis-timeline-track
          data-video-analysis-timeline-duration-ms="${escapeHtml(window.durationMs)}"
          data-video-analysis-timeline-window-start-ms="${escapeHtml(window.startMs)}"
        >
        </div>
      </div>
    `;
  }
  return visibleLanes.map(({ lane, visibleClips }) => {
    const packed = packTimelineLaneClips(visibleClips);
    const countLabel = window.mode === "focus" && visibleClips.length !== lane.clips.length
      ? `${visibleClips.length}/${lane.clips.length}`
      : String(lane.clips.length);
    return `
      <div class="video-analysis-lane${isActiveCategory(timeline, laneMode, lane.label) ? " is-selected" : ""}"${safeHexColor(lane.color) ? ` style="--video-analysis-lane-color:${escapeHtml(safeHexColor(lane.color))};"` : ""}>
        <button
          type="button"
          class="video-analysis-lane__label"
          data-video-analysis-timeline-category
          data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}"
          data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}"
          aria-pressed="${isActiveCategory(timeline, laneMode, lane.label) ? "true" : "false"}"
          title="${escapeHtml(`Select all ${lane.label} clips`)}"
        >
          <strong>${escapeHtml(lane.label)} <span class="video-analysis-lane__count">(${escapeHtml(countLabel)})</span></strong>
          ${density.isDense && lane.clipCount ? `<span>${escapeHtml(`${formatVideoTime(lane.firstStartMs)} - ${formatVideoTime(lane.lastEndMs)}`)}</span>` : ""}
        </button>
        <div
          class="video-analysis-lane__track"
          style="--video-analysis-lane-rows:${escapeHtml(String(packed.rowCount))};"
          data-video-analysis-timeline-track
          data-video-analysis-timeline-duration-ms="${escapeHtml(window.durationMs)}"
          data-video-analysis-timeline-window-start-ms="${escapeHtml(window.startMs)}"
        >
          ${packed.items.map(({ clip, row }) => renderClipBlock(
            clip,
            window,
            laneMode,
            selectedClipIds,
            lane.clips.indexOf(clip) + 1,
            isActiveCategory(timeline, laneMode, lane.label),
            findClipButton(clip, buttonLookup),
            density,
            row,
            lane.color
          )).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function selectedTimelineLane(lanes = [], laneMode = "phase", timeline = {}) {
  const selected = timeline.selectedCategory || {};
  if (selected.laneMode !== laneMode || !selected.label) return null;
  return lanes.find((lane) => lane.label === selected.label) || null;
}

function renderTimelineCategoryTray(lane = null, laneMode = "phase", timeline = {}) {
  const selectedCategory = timeline.selectedCategory || {};
  if (!lane || !selectedCategory.menuOpen) {
    return "";
  }
  const viewOpen = Boolean(selectedCategory.viewOpen);
  const firstClip = lane.clips[0];
  const activeClipId = selectedCategory.activeClipId || "";
  const activeClip = lane.clips.find((clip) => clip.id === activeClipId) || firstClip;
  const menuX = Math.max(12, Math.round(Number(selectedCategory.menuX || 12)));
  const menuY = Math.max(12, Math.round(Number(selectedCategory.menuY || 12)));
  const rangeStartMs = lane.clips.reduce((minMs, clip) => Math.min(minMs, getClipStartMs(clip)), Number.POSITIVE_INFINITY);
  const rangeEndMs = lane.clips.reduce((maxMs, clip) => Math.max(maxMs, getClipEndMs(clip)), 0);
  const rangeLabel = Number.isFinite(rangeStartMs)
    ? `${formatVideoTime(rangeStartMs)} - ${formatVideoTime(rangeEndMs)}`
    : "";
  return `
    <div
      class="video-analysis-timeline-category-tray video-analysis-timeline-category-menu"
      style="--video-analysis-category-menu-x:${escapeHtml(String(menuX))}px;--video-analysis-category-menu-y:${escapeHtml(String(menuY))}px;"
      role="menu"
      aria-label="${escapeHtml(`${lane.label} clip actions`)}"
    >
      <div class="video-analysis-timeline-category-tray__summary">
        <div>
          <strong>${escapeHtml(lane.label)} clips</strong>
          <span>${escapeHtml(`${lane.clips.length} clip${lane.clips.length === 1 ? "" : "s"} selected`)}</span>
          ${rangeLabel ? `<span>${escapeHtml(rangeLabel)}</span>` : ""}
          ${activeClip ? `<span>${escapeHtml(`Active: ${formatVideoTime(getClipStartMs(activeClip))}`)}</span>` : ""}
        </div>
        <button type="button" class="video-analysis-timeline-category-tray__close" data-video-analysis-timeline-category-close aria-label="Close clip actions">x</button>
      </div>
      <div class="video-analysis-timeline-category-tray__actions">
        <button type="button" role="menuitem" data-video-analysis-timeline-category-step="-1" data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Previous</button>
        <button type="button" role="menuitem" data-video-analysis-timeline-category-play data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Play active</button>
        <button type="button" role="menuitem" data-video-analysis-timeline-category-step="1" data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Next</button>
        <button type="button" role="menuitem" data-video-analysis-timeline-category-open data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">${viewOpen ? "Close clips" : "Open clips"}</button>
        <button type="button" role="menuitem" data-video-analysis-timeline-category-add-selected data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Add active</button>
        <button type="button" role="menuitem" data-video-analysis-timeline-category-add-presentation data-video-analysis-timeline-category-mode="${escapeHtml(laneMode)}" data-video-analysis-timeline-category-label="${escapeHtml(lane.label)}">Add all to presentation</button>
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
  const configuredLaneMode = normalizeTimelineLaneMode(timeline.laneMode);
  const timelineWorkspace = normalizeTimelineWorkspace(state.timelineWorkspace);
  const activeWorkspaceTimeline = activeAnalysisTimeline(timelineWorkspace);
  const useWorkspaceRows = Boolean(activeWorkspaceTimeline?.rows?.length);
  const laneMode = useWorkspaceRows ? "workspace" : configuredLaneMode;
  const zoom = normalizeTimelineZoom(timeline.zoom);
  const generatedTimelineIndex = buildTimelineIndex(clips, configuredLaneMode);
  const workspaceLanes = useWorkspaceRows ? timelineWorkspaceLanes(timelineWorkspace, clips) : [];
  const timelineIndex = useWorkspaceRows ? {
    lanes: workspaceLanes,
    clipCount: new Set(workspaceLanes.flatMap((lane) => lane.clips.map((clip) => clip.id))).size,
    laneCount: workspaceLanes.length,
    maxClipsInLane: workspaceLanes.reduce((maximum, lane) => Math.max(maximum, lane.clips.length), 0),
  } : generatedTimelineIndex;
  const lanes = timelineIndex.lanes;
  const laneModeCounts = useWorkspaceRows ? {} : buildTimelineLaneModeCounts(clips);
  const density = getTimelineDensity(timelineIndex, totalMs);
  const selectedLane = selectedTimelineLane(lanes, laneMode, timeline);
  const buttonLookup = buildTemplateButtonLookup(state.template || {});
  const selectedClip = selectedTimelineClip(clips, timeline, state.selectedClipId);
  const selectedClipIds = new Set(timelineSelectedClipIds(state));
  const selectedClips = clips.filter((clip) => selectedClipIds.has(String(clip.id || "")));
  const timelineWindow = getTimelineWindow(totalMs, timeline, selectedClip);
  const ticks = buildTimelineWindowTicks(timelineWindow, { zoom });
  const canvasZoom = timelineWindow.mode === "focus" ? 1 : zoom;
  return `
    <section
      class="video-analysis-timeline video-analysis-timeline-module${density.isDense ? " is-dense" : ""}"
      data-video-analysis-timeline-module
      data-video-analysis-timeline-duration-ms="${escapeHtml(totalMs)}"
      data-video-analysis-timeline-window-start-ms="${escapeHtml(timelineWindow.startMs)}"
      data-video-analysis-timeline-window-duration-ms="${escapeHtml(timelineWindow.durationMs)}"
      data-video-analysis-timeline-density="${density.isDense ? "dense" : "normal"}"
      data-video-analysis-timeline-clip-count="${escapeHtml(density.clipCount)}"
    >
      ${renderTimelineWorkspaceControls(timelineWorkspace, Boolean(state.canEdit), selectedClips.length)}
      ${renderTimelineWindowControls(timelineWindow, timeline, selectedClips.length, Boolean(state.canEdit))}
      <div class="video-analysis-timeline-scroll" data-video-analysis-timeline-pan>
        <div class="video-analysis-timeline-canvas" style="${timelineCanvasStyle(canvasZoom)}">
          <div class="video-analysis-timeline-toolbar">
            ${renderLaneSelector(laneMode, density.clipCount, laneModeCounts)}
            ${renderTimelineRuler(ticks, timelineWindow)}
          </div>
          <div
            class="video-analysis-playhead-rail"
            data-video-analysis-timeline-scrub-surface
            data-video-analysis-timeline-duration-ms="${escapeHtml(timelineWindow.durationMs)}"
            data-video-analysis-timeline-window-start-ms="${escapeHtml(timelineWindow.startMs)}"
          >
            ${renderTimelinePlayhead(timeline.playheadMs, timelineWindow)}
          </div>
          <div class="video-analysis-lane-stack">
            ${renderTimelineLanes(lanes, timelineWindow, laneMode, selectedClipIds, timeline, buttonLookup, density)}
          </div>
        </div>
      </div>
      ${renderSelectedClipFocus(
        selectedClip,
        selectedClips,
        totalMs,
        laneMode,
        timeline,
        selectedClip ? findClipButton(selectedClip, buttonLookup) : null,
        Boolean(state.canEdit)
      )}
      ${renderTimelineCategoryTray(selectedLane, laneMode, timeline)}
    </section>
  `;
}
