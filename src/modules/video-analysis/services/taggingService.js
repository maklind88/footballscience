import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { teamPrinciples } from "../constants/principles.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";

export function splitTags(value = "") {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function isValidCodingSelection(draft = {}) {
  return (
    videoAnalysisPhases.includes(draft.phase) &&
    videoAnalysisSubPhases.includes(draft.subPhase) &&
    videoAnalysisOutcomes.includes(draft.outcome) &&
    teamPrinciples.some((principle) => principle.id === draft.teamPrincipleId) &&
    miniGamePrinciples.some((principle) => principle.id === draft.miniGamePrincipleId)
  );
}
