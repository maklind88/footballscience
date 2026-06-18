import { clipMiniGamePrincipleLabels } from "./miniGamePrincipleService.js";

function valueOf(clip = {}, camelKey = "", snakeKey = "") {
  return clip[camelKey] ?? clip[snakeKey] ?? "";
}

function playerLabel(clip = {}) {
  const player = Array.isArray(clip.players) ? clip.players[0] : null;
  return player?.player_label || player?.playerLabel || player?.player_id || player?.playerId || "Unit";
}

function descriptorValue(clip = {}, type = "") {
  return (clip.descriptors || []).find((entry) => entry.descriptor_type === type || entry.type === type)?.descriptor_value || "";
}

function matrixAxes(mode = "phase-outcome") {
  if (mode === "mg-principle-player") return ["miniGamePrincipleId", "player"];
  if (mode === "mini-game-unit") return ["miniGamePrincipleId", "unit"];
  return ["phase", "outcome"];
}

function axisValues(clip = {}, axis = "") {
  if (axis === "player") return [playerLabel(clip)];
  if (axis === "unit") return [descriptorValue(clip, "unit") || "Unit"];
  if (axis === "miniGamePrincipleId") return clipMiniGamePrincipleLabels(clip).length ? clipMiniGamePrincipleLabels(clip) : ["No MG principle"];
  return [valueOf(clip, axis, axis) || "Uncoded"];
}

export function buildClipMatrix(clips = [], mode = "phase-outcome") {
  const [rowAxis, columnAxis] = matrixAxes(mode);
  const rows = new Map();
  const columns = new Set();
  for (const clip of clips) {
    for (const row of axisValues(clip, rowAxis)) {
      for (const column of axisValues(clip, columnAxis)) {
        columns.add(column);
        if (!rows.has(row)) rows.set(row, new Map());
        rows.get(row).set(column, (rows.get(row).get(column) || 0) + 1);
      }
    }
  }
  return {
    rowAxis,
    columnAxis,
    columns: [...columns],
    rows: [...rows.entries()].map(([label, counts]) => ({ label, counts })),
  };
}

export function filterClipsForMatrix(clips = [], mode = "", row = "", column = "") {
  const [rowAxis, columnAxis] = matrixAxes(mode);
  return clips.filter((clip) => {
    const rowOk = !row || axisValues(clip, rowAxis).includes(row);
    const columnOk = !column || axisValues(clip, columnAxis).includes(column);
    return rowOk && columnOk;
  });
}

export function savedSearchTitle(filters = {}) {
  const parts = [filters.phase, filters.outcome, filters.miniGamePrincipleId, filters.playerId, filters.unit]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : "Video analysis search";
}
