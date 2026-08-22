const { hasModulePermission } = require("../../src/core/permission-matrix.cjs");

const GAMEPLAN_MODULE_ID = "gameplan";

function parseGameplanState(rawValue, { allowEmpty = false } = {}) {
  if (allowEmpty && !String(rawValue || "").trim()) return null;
  try {
    const parsed = JSON.parse(String(rawValue || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPlans(state = {}) {
  return Array.isArray(state.gameplans) ? state.gameplans : [];
}

function getPlanId(plan = {}) {
  return String(plan?.id || "").trim();
}

function protectGameplanStateWrite(actor, rawValue, options = {}) {
  if (options.removed) {
    return {
      ok: false,
      status: 400,
      reason: "Gameplan state cannot be permanently removed. Archive individual gameplans instead.",
    };
  }

  const nextState = parseGameplanState(rawValue);
  if (!nextState) {
    return { ok: false, status: 400, reason: "Gameplan data must be valid JSON state." };
  }

  const previousState = parseGameplanState(options.previousValue, { allowEmpty: true });
  const previousPlans = getPlans(previousState);
  const previousById = new Map(previousPlans.map((plan) => [getPlanId(plan), plan]).filter(([id]) => id));
  const nextPlans = getPlans(nextState).map((plan) => ({ ...plan }));
  const nextIds = new Set(nextPlans.map(getPlanId).filter(Boolean));

  if (previousPlans.some((plan) => getPlanId(plan) && !nextIds.has(getPlanId(plan)))) {
    return {
      ok: false,
      status: 400,
      reason: "Gameplans must remain in protected history with archivedAt metadata.",
    };
  }

  const canDelete = hasModulePermission(actor, GAMEPLAN_MODULE_ID, "delete");
  const canRestore = hasModulePermission(actor, GAMEPLAN_MODULE_ID, "restore");
  const archivedPlanIds = [];
  const restoredPlanIds = [];
  const archivedAt = String(options.now || new Date().toISOString());
  const actorId = String(actor?.id || "").trim();

  for (let index = 0; index < nextPlans.length; index += 1) {
    const nextPlan = nextPlans[index];
    const planId = getPlanId(nextPlan);
    if (!planId) continue;
    const previousPlan = previousById.get(planId);
    const wasArchived = Boolean(previousPlan?.archivedAt);
    const willBeArchived = Boolean(nextPlan.archivedAt);

    if (wasArchived && willBeArchived) {
      nextPlans[index] = previousPlan;
      continue;
    }

    if (wasArchived && !willBeArchived) {
      if (!canRestore) {
        return { ok: false, status: 403, reason: "You do not have permission to restore archived gameplans." };
      }
      nextPlan.archivedAt = "";
      nextPlan.archivedBy = "";
      restoredPlanIds.push(planId);
      continue;
    }

    if (willBeArchived) {
      if (!canDelete) {
        return { ok: false, status: 403, reason: "Only coaches or admins can delete gameplans." };
      }
      nextPlan.archivedAt = archivedAt;
      nextPlan.archivedBy = actorId;
      archivedPlanIds.push(planId);
    }
  }

  return {
    ok: true,
    value: JSON.stringify({ ...nextState, gameplans: nextPlans }),
    archivedPlanIds,
    restoredPlanIds,
  };
}

module.exports = { parseGameplanState, protectGameplanStateWrite };
