export function createSessionPlannerTacticalTransformHelpers(options = {}) {
  const clamp = options.clamp;
  const cloneElement = options.cloneElement;

  function clampMovedPoint(point, deltaX, deltaY) {
    return {
      x: clamp(Number(point.x) + deltaX, 0, 100),
      y: clamp(Number(point.y) + deltaY, 0, 100),
    };
  }

  function moveElementFromInitial(element, initial, deltaX, deltaY) {
    if (!element || !initial) {
      return;
    }
    const moved = clampMovedPoint(initial, deltaX, deltaY);
    element.x = moved.x;
    element.y = moved.y;
    if (Number.isFinite(Number(initial.x2)) && Number.isFinite(Number(initial.y2))) {
      const movedEnd = clampMovedPoint({ x: initial.x2, y: initial.y2 }, deltaX, deltaY);
      element.x2 = movedEnd.x;
      element.y2 = movedEnd.y;
    }
    if (Number.isFinite(Number(initial.controlX)) && Number.isFinite(Number(initial.controlY))) {
      const movedControl = clampMovedPoint(
        { x: initial.controlX, y: initial.controlY },
        deltaX,
        deltaY
      );
      element.controlX = movedControl.x;
      element.controlY = movedControl.y;
    }
    if (Array.isArray(initial.points)) {
      element.points = initial.points.map((point) => clampMovedPoint(point, deltaX, deltaY));
    }
  }

  function moveElementByDelta(element, deltaX, deltaY) {
    if (!element) {
      return;
    }
    moveElementFromInitial(element, cloneElement(element), deltaX, deltaY);
  }

  function getArrangeSpacing(count, span, fallback = 5.2) {
    if (count <= 1) {
      return 0;
    }
    const availableSpan = Math.abs(Number(span));
    if (Number.isFinite(availableSpan) && availableSpan >= count * 2.6) {
      return clamp(availableSpan / (count - 1), 3.2, 9.5);
    }
    return fallback;
  }

  function moveElementCenterTo(item, targetCenterX, targetCenterY) {
    if (!item?.element) {
      return;
    }
    moveElementByDelta(
      item.element,
      Number(targetCenterX) - item.centerX,
      Number(targetCenterY) - item.centerY
    );
  }

  return {
    clampMovedPoint,
    getArrangeSpacing,
    moveElementByDelta,
    moveElementCenterTo,
    moveElementFromInitial,
  };
}
