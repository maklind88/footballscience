import { individualActions } from "./action-catalog.mjs";

export const actionPositions = Object.freeze([
  { id: "LB", role: "FB", label: "LB" },
  { id: "CB", role: "CB", label: "CB" },
  { id: "RB", role: "FB", label: "RB" },
  { id: "CMF-6", role: "6", label: "CMF – 6" },
  { id: "CMF-8", role: "8", label: "CMF – 8" },
  { id: "CMF-10", role: "10", label: "CMF – 10" },
  { id: "LW", role: "W", label: "LW" },
  { id: "RW", role: "W", label: "RW" },
  { id: "9", role: "9", label: "9" },
]);

export function actionsForPosition(subPhaseId, positionId) {
  const position = actionPositions.find((item) => item.id === positionId);
  if (!position) return [];
  return individualActions.filter((item) => item.subPhaseId === subPhaseId && item.role === position.role);
}

export function resolveGameModelAction(actionId, positionId) {
  const action = individualActions.find((item) => item.id === actionId);
  const position = actionPositions.find((item) => item.id === positionId);
  if (!action || !position || action.role !== position.role) return null;
  return {
    actionId: action.id,
    positionId: position.id,
    positionLabel: position.label,
    phase: action.phase,
    subPhase: action.subPhase,
    title: action.title,
    when: action.when,
    detail: action.detail,
  };
}

export function suggestedGameModelPosition(profile = {}) {
  const position = String(profile.position || "").trim().toUpperCase();
  const role = String(profile.role || "").trim();
  const cmfRole = /^(?:CMF[- –]*)?(6|8|10)$/i.exec(role)?.[1];
  if (actionPositions.some((item) => item.id === position)) return position;
  if (position === "CMF" && cmfRole) return `CMF-${cmfRole}`;
  return "";
}
