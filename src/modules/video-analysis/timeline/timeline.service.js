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
  return `left:${Math.min(99.5, Math.max(0, (Number(playheadMs || 0) / safeDuration) * 100))}%;`;
}

export function timelineCanvasStyle(zoom = 1) {
  const scale = normalizeTimelineZoom(zoom);
  return `width:${Math.round(scale * 100)}%;`;
}

export function buildTimelineTicks(durationMs = 1, tickCount = TIMELINE_TICK_COUNT) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const count = Math.max(2, Number(tickCount || TIMELINE_TICK_COUNT));
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return {
      id: `tick-${index}`,
      ms: Math.round(safeDuration * ratio),
      left: clampPercent(ratio * 100),
    };
  });
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
