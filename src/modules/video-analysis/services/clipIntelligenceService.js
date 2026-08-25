export { buildClipMatrix, filterClipsForMatrix } from "./clipAnalyticsService.js";

export function savedSearchTitle(filters = {}) {
  const parts = [filters.phase, filters.subPhase, filters.outcome, filters.miniGamePrincipleId, filters.playerId, filters.unit]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : "Video analysis search";
}
