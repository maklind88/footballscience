function createPendingPoint(tool, point) {
  return tool === "curve"
    ? {
        ...point,
        type: "curve",
        startPoint: point,
        controlPoint: null,
      }
    : { ...point, type: tool };
}

export function advanceSessionPlannerTacticalLineClick(tool, pendingPoint, point) {
  if (!pendingPoint) {
    return {
      action: "pending",
      pendingPoint: createPendingPoint(tool, point),
    };
  }
  if (tool === "curve") {
    const pendingCurve = pendingPoint.type === "curve"
      ? pendingPoint
      : { ...pendingPoint, type: "curve", startPoint: pendingPoint, controlPoint: null };
    if (!pendingCurve.controlPoint) {
      return {
        action: "pending",
        pendingPoint: {
          ...pendingCurve,
          controlPoint: point,
        },
      };
    }
    return {
      action: "complete",
      type: "curve",
      from: pendingCurve.startPoint || pendingCurve,
      to: point,
      options: { controlPoint: pendingCurve.controlPoint },
    };
  }
  return {
    action: "complete",
    type: tool,
    from: pendingPoint,
    to: point,
    options: {},
  };
}

export function finishSessionPlannerTacticalDraftLine(draftLine = {}) {
  if (draftLine.moved) {
    return {
      action: "complete",
      type: draftLine.type,
      from: draftLine.startPoint,
      to: draftLine.currentPoint,
      options: {},
    };
  }
  const pendingPoint = draftLine.pendingPointAtStart;
  if (!pendingPoint) {
    return {
      action: "pending",
      pendingPoint: createPendingPoint(draftLine.type, draftLine.startPoint),
    };
  }
  if (draftLine.type !== "curve") {
    return {
      action: "complete",
      type: draftLine.type,
      from: pendingPoint,
      to: draftLine.startPoint,
      options: {},
    };
  }
  const pendingCurve = pendingPoint.type === "curve"
    ? pendingPoint
    : { ...pendingPoint, type: "curve", startPoint: pendingPoint, controlPoint: null };
  if (!pendingCurve.controlPoint) {
    return {
      action: "pending",
      pendingPoint: {
        ...pendingCurve,
        startPoint: pendingCurve.startPoint || pendingPoint,
        controlPoint: draftLine.startPoint,
      },
    };
  }
  return {
    action: "complete",
    type: "curve",
    from: pendingCurve.startPoint || pendingCurve,
    to: draftLine.startPoint,
    options: { controlPoint: pendingCurve.controlPoint },
  };
}
