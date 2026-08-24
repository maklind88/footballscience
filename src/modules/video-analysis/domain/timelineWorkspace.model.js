const rowKinds = new Set(["coding", "query", "player", "unit", "graphic", "manual"]);
const timelineStatuses = new Set(["active", "archived"]);
const fallbackRowColors = ["#2f855a", "#2563eb", "#b45309", "#be123c", "#6d28d9", "#0f766e"];

function stringValue(value = "") {
  return String(value || "").trim();
}

function colorValue(value, fallback) {
  const color = stringValue(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function normalizeTimelineRow(value = {}, fallbackIndex = 0) {
  const kind = stringValue(value.kind || value.rowKind || value.row_kind).toLowerCase();
  return {
    id: stringValue(value.id || `row-${fallbackIndex + 1}`),
    label: stringValue(value.label || value.title || `Row ${fallbackIndex + 1}`),
    kind: rowKinds.has(kind) ? kind : "manual",
    color: colorValue(value.color, fallbackRowColors[fallbackIndex % fallbackRowColors.length]),
    sortOrder: Math.max(0, Math.round(Number(value.sortOrder ?? value.sort_order ?? fallbackIndex) || 0)),
    hidden: Boolean(value.hidden),
    locked: Boolean(value.locked),
    query: value.query && typeof value.query === "object" && !Array.isArray(value.query) ? value.query : {},
    clipIds: [...new Set((value.clipIds || value.clip_ids || []).map(stringValue).filter(Boolean))],
  };
}

export function normalizeAnalysisTimeline(value = {}, fallbackIndex = 0) {
  const status = stringValue(value.status).toLowerCase();
  const rows = (value.rows || []).map(normalizeTimelineRow)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((row, index) => ({ ...row, sortOrder: index }));
  return {
    id: stringValue(value.id || `timeline-${fallbackIndex + 1}`),
    title: stringValue(value.title || `Timeline ${fallbackIndex + 1}`),
    matchId: stringValue(value.matchId || value.match_id),
    videoIds: [...new Set((value.videoIds || value.video_ids || []).map(stringValue).filter(Boolean))],
    status: timelineStatuses.has(status) ? status : "active",
    rows,
    createdBy: stringValue(value.createdBy || value.created_by),
    updatedAt: stringValue(value.updatedAt || value.updated_at),
  };
}

export function normalizeTimelineWorkspace(value = {}) {
  const timelines = (value.timelines || []).map(normalizeAnalysisTimeline);
  const requestedActiveId = stringValue(value.activeTimelineId || value.active_timeline_id);
  const activeTimelineId = timelines.some((timeline) => timeline.id === requestedActiveId)
    ? requestedActiveId
    : timelines[0]?.id || "";
  return {
    timelines,
    activeTimelineId,
  };
}

