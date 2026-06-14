import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

export const TIMELINE_LANE_MODES = Object.freeze([
  { id: "phase", label: "Phase" },
  { id: "subPhase", label: "Sub-phase" },
  { id: "teamPrinciple", label: "Team Principle" },
  { id: "miniGamePrinciple", label: "Mini-game" },
  { id: "player", label: "Player" },
  { id: "unit", label: "Unit" },
  { id: "outcome", label: "Outcome" },
]);

export const DEFAULT_TIMELINE_LANE_MODE = "phase";
export const TIMELINE_MIN_ZOOM = 1;
export const TIMELINE_MAX_ZOOM = 6;
export const TIMELINE_TICK_COUNT = 9;
export const TIMELINE_LANE_ORDER = Object.freeze({
  phase: videoAnalysisPhases,
  subPhase: videoAnalysisSubPhases,
  outcome: videoAnalysisOutcomes,
});
