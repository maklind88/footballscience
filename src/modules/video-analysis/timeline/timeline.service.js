import {
  DEFAULT_TIMELINE_LANE_MODE,
  TIMELINE_LANE_MODES,
  TIMELINE_LANE_ORDER,
  TIMELINE_MAX_ZOOM,
  TIMELINE_MIN_ZOOM,
  TIMELINE_TICK_COUNT,
} from "./timeline.constants.js";
import {
  getClipDurationMs,
  getClipEndMs,
  getClipStartMs,
  getTimelineLaneValue,
} from "./timeline.selectors.js";

function clampPercent(value = 0) {
  return Math.min(100, Math.max(0, Number(value || 0)));
}

const allowedLaneModes = new Set(TIMELINE_LANE_MODES.map((mode) => mode.id));
const TIMELINE_NICE_STEPS_MS = Object.freeze([
  1000,
  2000,
  5000,
  10000,
  15000,
  30000,
  60000,
  120000,
  300000,
  600000,
  900000,
  1800000,
  3600000,
  7200000,
]);

function laneSortIndex(laneMode = DEFAULT_TIMELINE_LANE_MODE, label = "") {
  const order = TIMELINE_LANE_ORDER[laneMode] || [];
  const index = order.indexOf(label);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function normalizeTimelineZoom(value = 1) {
  return Math.min(TIMELINE_MAX_ZOOM, Math.max(TIMELINE_MIN_ZOOM, Number(value || 1)));
}

export function normalizeTimelineLaneMode(value = "") {
  const nextValue = String(value || DEFAULT_TIMELINE_LANE_MODE);
  return allowedLaneModes.has(nextValue) ? nextValue : DEFAULT_TIMELINE_LANE_MODE;
}

export function buildTimelineLanes(clips = [], laneMode = DEFAULT_TIMELINE_LANE_MODE) {
  const map = new Map();
  for (const clip of clips) {
    const label = getTimelineLaneValue(clip, laneMode);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(clip);
  }
  return [...map.entries()]
    .map(([label, laneClips]) => ({
      id: label,
      label,
      clips: laneClips.slice().sort((a, b) => getClipStartMs(a) - getClipStartMs(b)),
    }))
    .sort((a, b) => (
      laneSortIndex(laneMode, a.label) - laneSortIndex(laneMode, b.label)
      || a.label.localeCompare(b.label)
    ));
}

export function clipBlockStyle(clip = {}, durationMs = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const startMs = getClipStartMs(clip);
  const widthMs = getClipDurationMs(clip);
  const left = clampPercent((startMs / safeDuration) * 100);
  const width = Math.max(0.5, (widthMs / safeDuration) * 100);
  return `left:${Math.min(99.5, left)}%;width:${Math.min(100 - Math.min(99.5, left), width)}%;`;
}

export function playheadStyle(playheadMs = 0, durationMs = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  return `left:${Math.min(100, Math.max(0, (Number(playheadMs || 0) / safeDuration) * 100))}%;`;
}

export function timelineCanvasStyle(zoom = 1) {
  const scale = normalizeTimelineZoom(zoom);
  return `width:${Math.round(scale * 100)}%;`;
}

function chooseTimelineTickStepMs(durationMs = 1, tickCount = TIMELINE_TICK_COUNT) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const targetIntervals = Math.max(1, Number(tickCount || TIMELINE_TICK_COUNT) - 1);
  const rawStep = Math.max(1000, safeDuration / targetIntervals);
  return TIMELINE_NICE_STEPS_MS.reduce((bestStep, step) => (
    Math.abs(step - rawStep) < Math.abs(bestStep - rawStep) ? step : bestStep
  ), TIMELINE_NICE_STEPS_MS[0]);
}

function tickLabelKey(ms = 0) {
  return Math.floor(Math.max(0, Number(ms || 0)) / 1000);
}

export function buildTimelineTicks(durationMs = 1, tickCount = TIMELINE_TICK_COUNT) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const stepMs = chooseTimelineTickStepMs(safeDuration, tickCount);
  const ticks = [];
  const seenMs = new Set();
  const seenLabels = new Set();
  for (let ms = 0; ms < safeDuration; ms += stepMs) {
    const roundedMs = Math.round(ms);
    const labelKey = tickLabelKey(roundedMs);
    if (seenMs.has(roundedMs) || seenLabels.has(labelKey)) continue;
    seenMs.add(roundedMs);
    seenLabels.add(labelKey);
    ticks.push({
      id: `tick-${roundedMs}`,
      ms: roundedMs,
      left: clampPercent((roundedMs / safeDuration) * 100),
    });
  }
  const endMs = Math.round(safeDuration);
  const endLabelKey = tickLabelKey(endMs);
  if (!seenMs.has(endMs) && !seenLabels.has(endLabelKey)) {
    ticks.push({
      id: `tick-${endMs}`,
      ms: endMs,
      left: 100,
    });
  } else if (ticks.length > 1 && tickLabelKey(ticks.at(-1)?.ms) === endLabelKey) {
    ticks[ticks.length - 1] = { ...ticks.at(-1), left: 100 };
  }
  return ticks;
}

export function getTimelineDurationMs(state = {}) {
  const clips = Array.isArray(state.allClips) && state.allClips.length
    ? state.allClips
    : Array.isArray(state.clips)
      ? state.clips
      : [];
  const inferredClipEndMs = clips.reduce((maxEndMs, clip) => Math.max(maxEndMs, getClipEndMs(clip)), 0);
  return Math.max(1, Number(state.videoRef?.durationMs || 0), inferredClipEndMs);
}

export function timelineMsFromClientX(clientX = 0, rect = {}, durationMs = 1) {
  const width = Math.max(1, Number(rect.width || 0));
  const left = Number(rect.left || 0);
  const ratio = Math.min(1, Math.max(0, (Number(clientX || 0) - left) / width));
  return Math.round(Math.max(1, Number(durationMs || 1)) * ratio);
}

export function getTimelineStats(clips = [], allClips = []) {
  const source = Array.isArray(allClips) && allClips.length ? allClips : clips;
  const codedMs = clips.reduce((total, clip) => total + Math.max(0, getClipEndMs(clip) - getClipStartMs(clip)), 0);
  return {
    visibleClipCount: clips.length,
    totalClipCount: source.length,
    codedMs,
    isFiltered: source.length > clips.length,
  };
}

export function trimClipDraft(draft = {}, edge = "end", deltaMs = 100) {
  const startMs = Math.max(0, Math.round(Number(draft.startMs || 0)));
  const endMs = Math.max(startMs + 100, Math.round(Number(draft.endMs || startMs + 5000)));
  if (edge === "start") return { ...draft, startMs: Math.max(0, Math.min(endMs - 100, startMs + deltaMs)) };
  return { ...draft, endMs: Math.max(startMs + 100, endMs + deltaMs) };
}
