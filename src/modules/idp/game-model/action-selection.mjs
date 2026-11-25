import { actionSubPhases, individualActions } from "./action-catalog.mjs";

export const actionPositions = Object.freeze([
  { id: "LB", role: "FB", label: "LB" }, { id: "CB", role: "CB", label: "CB" },
  { id: "RB", role: "FB", label: "RB" }, { id: "CMF-6", role: "6", label: "CMF – 6" },
  { id: "CMF-8", role: "8", label: "CMF – 8" }, { id: "CMF-10", role: "10", label: "CMF – 10" },
  { id: "LW", role: "W", label: "LW" }, { id: "RW", role: "W", label: "RW" },
  { id: "9", role: "9", label: "9" },
]);

export function actionsForPosition(subPhaseId, positionId) {
  const position = actionPositions.find((item) => item.id === positionId);
  return position ? individualActions.filter((item) => item.subPhaseId === subPhaseId && item.role === position.role) : [];
}

export function selectedIndividualAction(selection = {}) {
  return actionsForPosition(selection.subPhaseId, selection.positionId).find((item) => item.id === selection.actionId) || null;
}

export function initialActionSelection(profile = {}) {
  const position = String(profile.position || "").toUpperCase().trim();
  const role = String(profile.role || "").trim();
  const cmfRole = /^(?:CMF[- –]*)?(6|8|10)$/i.exec(role)?.[1];
  const positionId = actionPositions.some((item) => item.id === position) ? position
    : position === "CMF" && cmfRole ? `CMF-${cmfRole}` : "";
  return { subPhaseId: "", positionId, actionId: "", draft: null, saving: false, error: "" };
}

export function actionFocusDraft(selection = {}) {
  const action = selectedIndividualAction(selection);
  const position = actionPositions.find((item) => item.id === selection.positionId);
  if (!action || !position) return null;
  return {
    title: action.title,
    description: `${action.subPhase} · ${position.label}\nWhen: ${action.when}\nAction: ${action.title}.\nDetail: ${action.detail}`,
    linkedPhase: action.phase,
    linkedSubPhase: action.subPhase,
    category: "Tactical",
    status: "Active",
  };
}

export function changeActionSelection(selection, field, value) {
  if (field === "subPhaseId" && actionSubPhases.some((item) => item.id === value)) {
    return { ...selection, subPhaseId: value, actionId: "", draft: null, error: "" };
  }
  if (field === "positionId" && actionPositions.some((item) => item.id === value)) {
    return { ...selection, positionId: value, actionId: "", draft: null, error: "" };
  }
  if (field === "actionId" && actionsForPosition(selection.subPhaseId, selection.positionId).some((item) => item.id === value)) {
    const next = { ...selection, actionId: value, error: "" };
    return { ...next, draft: actionFocusDraft(next) };
  }
  return selection;
}
