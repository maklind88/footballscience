import {
  periodizationMiniGamePrinciplesBySubPhase,
  periodizationTeamPrinciplesBySubPhase,
} from "../periodization/periodization-state.mjs";
import { actionSubPhases, individualActions } from "./default-actions.mjs";

export const gameModelSubPhases = actionSubPhases;
export const gameModelPositions = Object.freeze([
  Object.freeze({ id: "LB", label: "LB" }),
  Object.freeze({ id: "CB", label: "CB" }),
  Object.freeze({ id: "RB", label: "RB" }),
  Object.freeze({ id: "CMF-6", label: "CMF – 6" }),
  Object.freeze({ id: "CMF-8", label: "CMF – 8" }),
  Object.freeze({ id: "CMF-10", label: "CMF – 10" }),
  Object.freeze({ id: "LW", label: "LW" }),
  Object.freeze({ id: "RW", label: "RW" }),
  Object.freeze({ id: "9", label: "9" }),
]);

const rolesToPositions = {
  FB: ["LB", "RB"], CB: ["CB"], 6: ["CMF-6"], 8: ["CMF-8"],
  10: ["CMF-10"], W: ["LW", "RW"], 9: ["9"],
};

const sharedGroups = new Map([
  ["High Press vs GK", "High Press vs GK & High Press"],
  ["High Press", "High Press vs GK & High Press"],
  ["Throw Ins (Off)", "Throw Ins (Off & Def)"],
  ["Throw Ins (Def)", "Throw Ins (Off & Def)"],
]);

function defaultItem({ id, kind, subPhaseId, title, when = "", detail = "", positionIds = [] }) {
  return Object.freeze({ id, kind, subPhaseId, title, when, detail, positionIds: Object.freeze([...positionIds]), archived: false, revision: 0 });
}

function principleDefaults(kind, source) {
  return gameModelSubPhases.flatMap((subPhase) => {
    const direct = source[subPhase.label] || [];
    const shared = source[sharedGroups.get(subPhase.label)] || [];
    const names = new Set([...direct, ...shared]);
    // These keys identify the seed slots. Keep the original order in the seed
    // lists so team overrides continue to target the same item across releases.
    return [...names].map((title, index) => defaultItem({
      id: `${kind}-${subPhase.id}-${index + 1}`,
      kind,
      subPhaseId: subPhase.id,
      title,
    }));
  });
}

export const defaultGameModelItems = Object.freeze([
  ...principleDefaults("team-principle", periodizationTeamPrinciplesBySubPhase),
  ...principleDefaults("mini-game-principle", periodizationMiniGamePrinciplesBySubPhase),
  ...individualActions.map((action) => defaultItem({
    ...action,
    kind: "individual-action",
    positionIds: rolesToPositions[action.role],
  })),
]);

export function gameModelActionForFocus(items, actionId, positionId) {
  const action = items.find((item) => item.id === actionId && item.kind === "individual-action" && !item.archived);
  const position = gameModelPositions.find((item) => item.id === positionId);
  if (!position || !action?.positionIds.includes(position.id)) return null;
  const subPhase = gameModelSubPhases.find((item) => item.id === action.subPhaseId);
  if (!subPhase) return null;
  return {
    actionId: action.id,
    positionId: position.id,
    positionLabel: position.label,
    phase: subPhase.phase,
    subPhase: subPhase.label,
    title: action.title,
    when: action.when,
    detail: action.detail,
  };
}
