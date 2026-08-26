const rowKinds = new Set([
  "phase",
  "sub_phase",
  "player",
  "unit",
  "outcome",
  "descriptor",
  "custom",
  "coding",
  "query",
  "graphic",
  "manual",
]);
const timelineStatuses = new Set(["active", "archived"]);
const requestStatuses = new Set(["idle", "loading", "saving", "ready", "error", "conflict"]);
const collaborationStatuses = new Set(["disconnected", "connecting", "connected", "error"]);
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
    revision: Math.max(1, Math.round(Number(value.revision) || 1)),
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
    description: stringValue(value.description),
    matchId: stringValue(value.matchId || value.match_id),
    videoIds: [...new Set((value.videoIds || value.video_ids || []).map(stringValue).filter(Boolean))],
    isDefault: Boolean(value.isDefault ?? value.is_default),
    revision: Math.max(1, Math.round(Number(value.revision) || 1)),
    status: timelineStatuses.has(status) ? status : "active",
    settings: value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)
      ? value.settings
      : {},
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
  const loadStatus = stringValue(value.loadStatus || value.load_status).toLowerCase();
  const saveStatus = stringValue(value.saveStatus || value.save_status).toLowerCase();
  const collaboration = value.collaboration && typeof value.collaboration === "object"
    ? value.collaboration
    : {};
  const collaborationStatus = stringValue(collaboration.status).toLowerCase();
  return {
    timelines,
    activeTimelineId,
    editorOpen: Boolean(value.editorOpen ?? value.editor_open),
    selectedRowIds: [...new Set((value.selectedRowIds || value.selected_row_ids || []).map(stringValue).filter(Boolean))],
    history: Array.isArray(value.history) ? value.history.slice(-20) : [],
    dirtyTimelineIds: [...new Set((value.dirtyTimelineIds || value.dirty_timeline_ids || []).map(stringValue).filter(Boolean))],
    loadedMatchId: stringValue(value.loadedMatchId || value.loaded_match_id),
    loadStatus: requestStatuses.has(loadStatus) ? loadStatus : "idle",
    saveStatus: requestStatuses.has(saveStatus) ? saveStatus : "idle",
    error: stringValue(value.error),
    collaboration: {
      status: collaborationStatuses.has(collaborationStatus) ? collaborationStatus : "disconnected",
      sessionId: stringValue(collaboration.sessionId || collaboration.session_id),
      participants: Array.isArray(collaboration.participants) ? collaboration.participants : [],
      pendingRemoteChanges: Math.max(0, Math.round(Number(collaboration.pendingRemoteChanges) || 0)),
      resolvingRemoteChanges: Boolean(collaboration.resolvingRemoteChanges),
      error: stringValue(collaboration.error),
    },
  };
}

export function createDefaultTimelineWorkspace(matchId = "") {
  return normalizeTimelineWorkspace({
    activeTimelineId: "match-timeline",
    timelines: [{
      id: "match-timeline",
      title: "Match timeline",
      matchId,
      rows: [],
    }],
  });
}

export function activeAnalysisTimeline(workspaceValue = {}) {
  const workspace = normalizeTimelineWorkspace(workspaceValue);
  return workspace.timelines.find((timeline) => timeline.id === workspace.activeTimelineId)
    || workspace.timelines[0]
    || null;
}
