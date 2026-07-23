export const SESSION_PLANNER_TACTICAL_LINE_TOOLS = new Set([
  "arrow",
  "pass",
  "run",
  "line",
  "dashed-line",
  "curve",
  "zone",
  "dashed-zone",
  "ellipse",
]);

export const SESSION_PLANNER_TACTICAL_TOOLS = new Set([
  "blue-player",
  "red-player",
  "neutral-player",
  "coach",
  "ball",
  "cone",
  "mini-goal",
  "big-goal",
  "mannequin",
  "pole",
  "gate",
  ...SESSION_PLANNER_TACTICAL_LINE_TOOLS,
  "freehand",
  "text",
  "remove",
]);

export function isSessionPlannerTacticalLineTool(tool = "") {
  return SESSION_PLANNER_TACTICAL_LINE_TOOLS.has(tool);
}

export function isSessionPlannerTacticalPlacementTool(tool = "") {
  return Boolean(tool)
    && tool !== "remove"
    && tool !== "freehand"
    && !isSessionPlannerTacticalLineTool(tool);
}

export function isSessionPlannerTacticalCoarsePointer(event = {}) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

export function shouldPlaceSessionPlannerTacticalDoubleClick({
  point,
  previousClick,
  tool,
  now = Date.now(),
} = {}) {
  const nextClick = point
    ? { tool, x: point.x, y: point.y, time: now }
    : null;
  if (!point || !isSessionPlannerTacticalPlacementTool(tool)) {
    return { shouldPlace: false, nextClick: null };
  }
  if (!previousClick || previousClick.tool !== tool) {
    return { shouldPlace: false, nextClick };
  }
  const distance = Math.hypot(point.x - previousClick.x, point.y - previousClick.y);
  return {
    shouldPlace: now - previousClick.time <= 520 && distance <= 4.5,
    nextClick,
  };
}

export function shouldSkipRepeatedSessionPlannerTacticalPlacement({
  point,
  previousPlacement,
  tool,
  now = Date.now(),
} = {}) {
  const nextPlacement = point
    ? { tool, x: point.x, y: point.y, time: now }
    : null;
  if (!previousPlacement || previousPlacement.tool !== tool || !point) {
    return { shouldSkip: false, nextPlacement };
  }
  const distance = Math.hypot(point.x - previousPlacement.x, point.y - previousPlacement.y);
  return {
    shouldSkip: now - previousPlacement.time < 350 && distance < 0.8,
    nextPlacement,
  };
}

export function getSessionPlannerTacticalKeyboardStep(event = {}) {
  return event.shiftKey ? 2 : 0.5;
}
