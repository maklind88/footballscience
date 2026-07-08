import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

export const TIMELINE_LANE_MODES = Object.freeze([
  { id: "all", label: "All Tags" },
  { id: "phase", label: "Phase" },
  { id: "subPhase", label: "Sub-phase" },
  { id: "miniGamePrinciple", label: "MG Principle" },
  { id: "player", label: "Player" },
  { id: "unit", label: "Unit" },
]);

export const DEFAULT_TIMELINE_LANE_MODE = "all";
export const TIMELINE_MIN_ZOOM = 1;
export const TIMELINE_MAX_ZOOM = 6;
export const TIMELINE_TICK_COUNT = 9;
export const TIMELINE_LANE_ORDER = Object.freeze({
  phase: videoAnalysisPhases,
  subPhase: videoAnalysisSubPhases,
});
