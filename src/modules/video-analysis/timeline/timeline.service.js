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
const DENSE_TIMELINE_CLIP_THRESHOLD = 250;
const DENSE_TIMELINE_LANE_THRESHOLD = 40;
const DENSE_TIMELINE_CLIPS_PER_MINUTE_THRESHOLD = 8;
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

function clipId(clip = {}, fallback = "") {
  return String(clip.id || clip.clipId || clip.clip_instance_id || fallback);
}

export function normalizeTimelineZoom(value = 1) {
  return Math.min(TIMELINE_MAX_ZOOM, Math.max(TIMELINE_MIN_ZOOM, Number(value || 1)));
}

export function normalizeTimelineLaneMode(value = "") {
  const nextValue = String(value || DEFAULT_TIMELINE_LANE_MODE);
  return allowedLaneModes.has(nextValue) ? nextValue : DEFAULT_TIMELINE_LANE_MODE;
}

export function buildTimelineIndex(clips = [], laneMode = DEFAULT_TIMELINE_LANE_MODE) {
  const normalizedLaneMode = normalizeTimelineLaneMode(laneMode);
  const sourceClips = Array.isArray(clips) ? clips : [];
  const laneMap = new Map();
  const clipsById = new Map();
  const clipIdsByLane = new Map();
  const clipTimeRanges = new Map();
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = 0;
  let codedMs = 0;

  sourceClips.forEach((clip, index) => {
    const id = clipId(clip, `timeline-clip-${index}`);
    const startMs = getClipStartMs(clip);
    const endMs = getClipEndMs(clip);
    const laneLabel = getTimelineLaneValue(clip, normalizedLaneMode);
    if (!laneMap.has(laneLabel)) laneMap.set(laneLabel, []);
    laneMap.get(laneLabel).push(clip);
    clipsById.set(id, clip);
    clipTimeRanges.set(id, { startMs, endMs });
    minStartMs = Math.min(minStartMs, startMs);
    maxEndMs = Math.max(maxEndMs, endMs);
    codedMs += Math.max(0, endMs - startMs);
  });

  const lanes = [...laneMap.entries()]
    .map(([label, laneClips]) => {
      const sortedClips = laneClips.slice().sort((a, b) => (
        getClipStartMs(a) - getClipStartMs(b)
        || getClipEndMs(a) - getClipEndMs(b)
        || clipId(a).localeCompare(clipId(b))
      ));
      const clipIds = sortedClips.map((clip, index) => clipId(clip, `${label}-${index}`));
      const laneStartMs = sortedClips.reduce((minMs, clip) => Math.min(minMs, getClipStartMs(clip)), Number.POSITIVE_INFINITY);
      const laneEndMs = sortedClips.reduce((maxMs, clip) => Math.max(maxMs, getClipEndMs(clip)), 0);
      clipIdsByLane.set(label, clipIds);
      return {
        id: label,
        label,
        clips: sortedClips,
        clipIds,
        clipCount: sortedClips.length,
        firstStartMs: Number.isFinite(laneStartMs) ? laneStartMs : 0,
        lastEndMs: laneEndMs,
      };
    })
    .sort((a, b) => (
      laneSortIndex(normalizedLaneMode, a.label) - laneSortIndex(normalizedLaneMode, b.label)
      || a.label.localeCompare(b.label)
    ));

  const maxClipsInLane = lanes.reduce((maxCount, lane) => Math.max(maxCount, lane.clipCount), 0);
  return {
    laneMode: normalizedLaneMode,
    clipsById,
    clipIdsByLane,
    clipTimeRanges,
    lanes,
    clipCount: sourceClips.length,
    laneCount: lanes.length,
    maxClipsInLane,
    minStartMs: Number.isFinite(minStartMs) ? minStartMs : 0,
    maxEndMs,
    codedMs,
  };
}

export function buildTimelineLanes(clips = [], laneMode = DEFAULT_TIMELINE_LANE_MODE) {
  return buildTimelineIndex(clips, laneMode).lanes;
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

function chooseTimelineTickStepMs(durationMs = 1, tickCount = TIMELINE_TICK_COUNT, zoom = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const safeZoom = normalizeTimelineZoom(zoom);
  if (safeDuration >= 20 * 60000) {
    if (safeZoom >= 4.2) return 60000;
    if (safeZoom >= 2.1) return 300000;
  }
  const targetIntervals = Math.max(1, Number(tickCount || TIMELINE_TICK_COUNT) - 1);
  const rawStep = Math.max(1000, safeDuration / targetIntervals);
  return TIMELINE_NICE_STEPS_MS.reduce((bestStep, step) => (
    Math.abs(step - rawStep) < Math.abs(bestStep - rawStep) ? step : bestStep
  ), TIMELINE_NICE_STEPS_MS[0]);
}

function timelineTickOptions(tickCountOrOptions = TIMELINE_TICK_COUNT, zoom = 1) {
  if (tickCountOrOptions && typeof tickCountOrOptions === "object") {
    return {
      tickCount: Number(tickCountOrOptions.tickCount || TIMELINE_TICK_COUNT),
      zoom: Number(tickCountOrOptions.zoom || zoom || 1),
    };
  }
  return {
    tickCount: Number(tickCountOrOptions || TIMELINE_TICK_COUNT),
    zoom: Number(zoom || 1),
  };
}

function tickLabelKey(ms = 0) {
  return Math.floor(Math.max(0, Number(ms || 0)) / 1000);
}

export function buildTimelineTicks(durationMs = 1, tickCountOrOptions = TIMELINE_TICK_COUNT, zoom = 1) {
  const safeDuration = Math.max(1, Number(durationMs || 1));
  const options = timelineTickOptions(tickCountOrOptions, zoom);
  const stepMs = chooseTimelineTickStepMs(safeDuration, options.tickCount, options.zoom);
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

export function getTimelineDensity(timelineIndex = {}, durationMs = 1) {
  const clipCount = Math.max(0, Number(timelineIndex.clipCount || 0));
  const laneCount = Math.max(0, Number(timelineIndex.laneCount || 0));
  const maxClipsInLane = Math.max(0, Number(timelineIndex.maxClipsInLane || 0));
  const minutes = Math.max(1 / 60, Number(durationMs || 1) / 60000);
  const clipsPerMinute = clipCount / minutes;
  const isDense = Boolean(
    clipCount >= DENSE_TIMELINE_CLIP_THRESHOLD
    || maxClipsInLane >= DENSE_TIMELINE_LANE_THRESHOLD
    || clipsPerMinute >= DENSE_TIMELINE_CLIPS_PER_MINUTE_THRESHOLD
  );
  return {
    isDense,
    clipCount,
    laneCount,
    maxClipsInLane,
    clipsPerMinute: Math.round(clipsPerMinute * 10) / 10,
  };
}

export function trimClipDraft(draft = {}, edge = "end", deltaMs = 100) {
  const startMs = Math.max(0, Math.round(Number(draft.startMs || 0)));
  const endMs = Math.max(startMs + 100, Math.round(Number(draft.endMs || startMs + 5000)));
  if (edge === "start") return { ...draft, startMs: Math.max(0, Math.min(endMs - 100, startMs + deltaMs)) };
  return { ...draft, endMs: Math.max(startMs + 100, endMs + deltaMs) };
}
