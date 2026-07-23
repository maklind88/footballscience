export function createSessionPlannerTacticalSelectionHelpers(options = {}) {
  const clamp = options.clamp;
  const getEndpointCoordinates = options.getEndpointCoordinates;
  const isStrokeElement = options.isStrokeElement;

  function uniqueValues(values = []) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values]).filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  function getSelectionRect(selection = {}) {
    if (!selection?.startPoint || !selection?.currentPoint) {
      return null;
    }
    const left = Math.min(selection.startPoint.x, selection.currentPoint.x);
    const top = Math.min(selection.startPoint.y, selection.currentPoint.y);
    const right = Math.max(selection.startPoint.x, selection.currentPoint.x);
    const bottom = Math.max(selection.startPoint.y, selection.currentPoint.y);
    return {
      left,
      top,
      right,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  function getElementBounds(element) {
    if (!element) {
      return null;
    }
    const points = [];
    const addPoint = (x, y) => {
      const pointX = Number(x);
      const pointY = Number(y);
      if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
        points.push({
          x: clamp(pointX, 0, 100),
          y: clamp(pointY, 0, 100),
        });
      }
    };
    addPoint(element.x, element.y);
    addPoint(element.x2, element.y2);
    if (element.type === "curve") {
      const coordinates = getEndpointCoordinates(element);
      addPoint(coordinates?.controlX, coordinates?.controlY);
    }
    if (Array.isArray(element.points)) {
      element.points.forEach((point) => addPoint(point.x, point.y));
    }
    if (!points.length) {
      return null;
    }
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    const paddingByType = {
      "blue-player": 2.4,
      "red-player": 2.4,
      "neutral-player": 2.4,
      coach: 2.5,
      ball: 1.8,
      cone: 2.1,
      "mini-goal": 4.2,
      "big-goal": 5.2,
      mannequin: 2.8,
      pole: 1.6,
      gate: 3.2,
      text: 6,
    };
    const padding = isStrokeElement(element) ? 1.2 : paddingByType[element.type] ?? 2.4;
    return {
      left: clamp(left - padding, 0, 100),
      top: clamp(top - padding, 0, 100),
      right: clamp(right + padding, 0, 100),
      bottom: clamp(bottom + padding, 0, 100),
    };
  }

  function isPointInRect(point, rect) {
    return Boolean(point && rect)
      && Number(point.x) >= rect.left
      && Number(point.x) <= rect.right
      && Number(point.y) >= rect.top
      && Number(point.y) <= rect.bottom;
  }

  function getElementSelectionPoints(element) {
    if (!element) {
      return [];
    }
    const points = [];
    const addPoint = (x, y) => {
      const pointX = Number(x);
      const pointY = Number(y);
      if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
        points.push({
          x: clamp(pointX, 0, 100),
          y: clamp(pointY, 0, 100),
        });
      }
    };
    addPoint(element.x, element.y);
    if (Number.isFinite(Number(element.x2)) && Number.isFinite(Number(element.y2))) {
      addPoint(element.x2, element.y2);
      addPoint(
        (Number(element.x) + Number(element.x2)) / 2,
        (Number(element.y) + Number(element.y2)) / 2
      );
    }
    if (element.type === "curve") {
      const coordinates = getEndpointCoordinates(element);
      addPoint(coordinates?.controlX, coordinates?.controlY);
    }
    if (Array.isArray(element.points)) {
      element.points.forEach((point) => addPoint(point.x, point.y));
    }
    const bounds = getElementBounds(element);
    if (bounds) {
      addPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
    }
    return points;
  }

  function isElementInSelectionRect(element, rect) {
    return Boolean(element && rect)
      && getElementSelectionPoints(element).some((point) => isPointInRect(point, rect));
  }

  function getElementsInRect(elements = [], rect) {
    if (!rect || !Array.isArray(elements)) {
      return [];
    }
    return elements.filter((element) => isElementInSelectionRect(element, rect));
  }

  function getBoundsCollection(elements = []) {
    const items = elements
      .map((element) => {
        const bounds = getElementBounds(element);
        if (!bounds) {
          return null;
        }
        return {
          element,
          bounds,
          centerX: (bounds.left + bounds.right) / 2,
          centerY: (bounds.top + bounds.bottom) / 2,
        };
      })
      .filter(Boolean);
    if (!items.length) {
      return null;
    }
    return {
      items,
      left: Math.min(...items.map((item) => item.bounds.left)),
      right: Math.max(...items.map((item) => item.bounds.right)),
      top: Math.min(...items.map((item) => item.bounds.top)),
      bottom: Math.max(...items.map((item) => item.bounds.bottom)),
    };
  }

  return {
    getBoundsCollection,
    getElementBounds,
    getElementSelectionPoints,
    getElementsInRect,
    getSelectionRect,
    isElementInSelectionRect,
    isPointInRect,
    uniqueValues,
  };
}
