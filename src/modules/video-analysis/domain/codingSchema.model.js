import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { teamPrinciples } from "../constants/principles.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";

export function createDefaultCodingSchema() {
  return {
    phases: videoAnalysisPhases,
    subPhases: videoAnalysisSubPhases,
    teamPrinciples,
    miniGamePrinciples,
    outcomes: videoAnalysisOutcomes,
  };
}
