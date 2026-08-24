import {
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

