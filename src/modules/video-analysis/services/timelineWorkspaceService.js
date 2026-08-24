import {
  activeAnalysisTimeline,
  normalizeAnalysisTimeline,
  normalizeTimelineRow,
  normalizeTimelineWorkspace,
} from "../domain/timelineWorkspace.model.js";

function stringValue(value = "") {
  return String(value || "").trim();
}

function uniqueId(baseId = "item", existingIds = new Set()) {
  const base = stringValue(baseId) || "item";
  let candidate = `${base}-copy`;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-copy-${suffix}`;
    suffix += 1;
  }
  existingIds.add(candidate);
  return candidate;
}

export function addAnalysisTimeline(workspaceValue = {}, timelineValue = {}) {
  const workspace = normalizeTimelineWorkspace(workspaceValue);
  const timeline = normalizeAnalysisTimeline(timelineValue, workspace.timelines.length);
  const existingIds = new Set(workspace.timelines.map((entry) => entry.id));
  const id = existingIds.has(timeline.id) ? uniqueId(timeline.id, existingIds) : timeline.id;
  return {
    ...workspace,
    timelines: [...workspace.timelines, { ...timeline, id }],
    activeTimelineId: id,
  };
}

export function reorderTimelineRows(timelineValue = {}, orderedRowIds = []) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const requested = orderedRowIds.map(stringValue).filter(Boolean);
  const requestedSet = new Set(requested);
  const byId = new Map(timeline.rows.map((row) => [row.id, row]));
  const rows = [
    ...requested.map((id) => byId.get(id)).filter(Boolean),
    ...timeline.rows.filter((row) => !requestedSet.has(row.id)),
  ].map((row, index) => ({ ...row, sortOrder: index }));
  return { ...timeline, rows };
}

export function duplicateTimelineRows(timelineValue = {}, rowIds = []) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const selected = new Set(rowIds.map(stringValue).filter(Boolean));
  const existingIds = new Set(timeline.rows.map((row) => row.id));
  const rows = [];
  timeline.rows.forEach((row) => {
    rows.push(row);
    if (!selected.has(row.id)) return;
    rows.push(normalizeTimelineRow({
      ...row,
      id: uniqueId(row.id, existingIds),
      label: `${row.label} copy`,
      locked: false,
    }, rows.length));
  });
  return {
    ...timeline,
    rows: rows.map((row, index) => ({ ...row, sortOrder: index })),
  };
}

export function moveClipsBetweenTimelineRows(timelineValue = {}, clipIds = [], sourceRowId = "", targetRowId = "", options = {}) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const movingIds = new Set(clipIds.map(stringValue).filter(Boolean));
  const sourceId = stringValue(sourceRowId);
  const targetId = stringValue(targetRowId);
  if (!movingIds.size || !sourceId || !targetId || sourceId === targetId) return timeline;
  const source = timeline.rows.find((row) => row.id === sourceId);
  const target = timeline.rows.find((row) => row.id === targetId);
  if (!source || !target || source.locked || target.locked) return timeline;
  const duplicate = Boolean(options.duplicate);
  return {
    ...timeline,
    rows: timeline.rows.map((row) => {
      if (row.id === sourceId && !duplicate) {
        return { ...row, clipIds: row.clipIds.filter((id) => !movingIds.has(id)) };
      }
      if (row.id === targetId) {
        return { ...row, clipIds: [...new Set([...row.clipIds, ...movingIds])] };
      }
      return row;
    }),
  };
}

export function placeClipsInTimelineRow(timelineValue = {}, clipIds = [], targetRowId = "", options = {}) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const movingIds = new Set(clipIds.map(stringValue).filter(Boolean));
  const targetId = stringValue(targetRowId);
  const target = timeline.rows.find((row) => row.id === targetId);
  if (!movingIds.size || !target || target.locked) return timeline;
  const duplicate = Boolean(options.duplicate);
  return {
    ...timeline,
    rows: timeline.rows.map((row) => {
      if (row.id === targetId) {
        return { ...row, clipIds: [...new Set([...row.clipIds, ...movingIds])] };
      }
      if (duplicate || row.locked) return row;
      return { ...row, clipIds: row.clipIds.filter((id) => !movingIds.has(id)) };
    }),
  };
}

export function updateTimelineRows(timelineValue = {}, rowIds = [], values = {}) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const selected = new Set(rowIds.map(stringValue).filter(Boolean));
  return {
    ...timeline,
    rows: timeline.rows.map((row, index) => (
      selected.has(row.id) && !row.locked
        ? normalizeTimelineRow({ ...row, ...values, id: row.id, sortOrder: index }, index)
        : row
    )),
  };
}

export function addTimelineRow(timelineValue = {}, rowValue = {}) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const existingIds = new Set(timeline.rows.map((row) => row.id));
  const row = normalizeTimelineRow({
    ...rowValue,
    id: existingIds.has(stringValue(rowValue.id))
      ? uniqueId(rowValue.id, existingIds)
      : stringValue(rowValue.id) || uniqueId("row", existingIds),
    sortOrder: timeline.rows.length,
  }, timeline.rows.length);
  return { ...timeline, rows: [...timeline.rows, row] };
}

export function removeTimelineRows(timelineValue = {}, rowIds = []) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const selected = new Set(rowIds.map(stringValue).filter(Boolean));
  return {
    ...timeline,
    rows: timeline.rows
      .filter((row) => !selected.has(row.id) || row.locked)
      .map((row, index) => ({ ...row, sortOrder: index })),
  };
}

export function moveTimelineRowByStep(timelineValue = {}, rowId = "", direction = 0) {
  const timeline = normalizeAnalysisTimeline(timelineValue);
  const currentIndex = timeline.rows.findIndex((row) => row.id === stringValue(rowId));
  const targetIndex = Math.max(0, Math.min(timeline.rows.length - 1, currentIndex + Math.sign(Number(direction) || 0)));
  if (currentIndex < 0 || targetIndex === currentIndex || timeline.rows[currentIndex].locked) return timeline;
  const rows = timeline.rows.slice();
  const [row] = rows.splice(currentIndex, 1);
  rows.splice(targetIndex, 0, row);
  return { ...timeline, rows: rows.map((entry, index) => ({ ...entry, sortOrder: index })) };
}

function clipField(clip = {}, camelKey = "", snakeKey = "") {
  return clip[camelKey] ?? clip[snakeKey] ?? "";
}

function clipPlayers(clip = {}) {
  return (clip.players || []).map((player) => stringValue(player.playerId || player.player_id || player.id));
}

function clipDescriptors(clip = {}, type = "") {
  return (clip.descriptors || [])
    .filter((descriptor) => stringValue(descriptor.type || descriptor.descriptor_type) === type)
    .map((descriptor) => stringValue(descriptor.value || descriptor.descriptor_value));
}

function queryMatchesClip(query = {}, clip = {}) {
  const entries = [
    ["phase", stringValue(clipField(clip, "phase", "phase"))],
    ["subPhase", stringValue(clipField(clip, "subPhase", "sub_phase"))],
    ["outcome", stringValue(clipField(clip, "outcome", "outcome"))],
    ["teamPrincipleId", stringValue(clipField(clip, "teamPrincipleId", "team_principle_id"))],
    ["miniGamePrincipleId", stringValue(clipField(clip, "miniGamePrincipleId", "mini_game_principle_id"))],
  ];
  const filters = entries.filter(([field]) => stringValue(query[field]));
  if (filters.some(([field, value]) => stringValue(query[field]) !== value)) return false;
  if (stringValue(query.playerId) && !clipPlayers(clip).includes(stringValue(query.playerId))) return false;
  if (stringValue(query.unit) && !clipDescriptors(clip, "unit").includes(stringValue(query.unit))) return false;
  if (stringValue(query.tag) && !(clip.tags || []).map(stringValue).includes(stringValue(query.tag))) return false;
  return filters.length > 0 || ["playerId", "unit", "tag"].some((field) => stringValue(query[field]));
}

export function timelineWorkspaceLanes(workspaceValue = {}, clips = []) {
  const timeline = activeAnalysisTimeline(workspaceValue);
  if (!timeline?.rows?.length) return [];
  return timeline.rows.filter((row) => !row.hidden).map((row) => {
    const explicitIds = new Set(row.clipIds || []);
    const rowClips = clips.filter((clip) => explicitIds.has(stringValue(clip.id)) || queryMatchesClip(row.query, clip));
    const starts = rowClips.map((clip) => Number(clip.startMs ?? clip.start_ms ?? 0));
    const ends = rowClips.map((clip) => Number(clip.endMs ?? clip.end_ms ?? 0));
    return {
      id: row.id,
      key: row.id,
      label: row.label,
      color: row.color,
      locked: row.locked,
      clipCount: rowClips.length,
      firstStartMs: starts.length ? Math.min(...starts) : 0,
      lastEndMs: ends.length ? Math.max(...ends) : 0,
      clips: rowClips,
    };
  });
}
