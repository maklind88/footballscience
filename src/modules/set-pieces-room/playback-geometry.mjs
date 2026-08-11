import { interpolateSetPieceValue } from "./geometry.mjs";

const playbackRouteTypes = new Set(["run", "pass", "dribble", "press", "mark"]);

function clampProgress(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function routePoint(drawing = {}, progress = 0) {
  const t = clampProgress(progress);
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  const curve = Number(drawing.curve || 0);
  if (!curve) {
    return {
      x: interpolateSetPieceValue(startX, endX, t),
      y: interpolateSetPieceValue(startY, endY, t),
    };
  }
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const controlX = (startX + endX) / 2 - (dy / distance) * curve;
  const controlY = (startY + endY) / 2 + (dx / distance) * curve;
  const inverse = 1 - t;
  return {
    x: inverse * inverse * startX + 2 * inverse * t * controlX + t * t * endX,
    y: inverse * inverse * startY + 2 * inverse * t * controlY + t * t * endY,
  };
}

function findPlaybackRoute(phase = {}, element = {}) {
  const drawings = (phase.drawings || []).filter((drawing) => {
    if (!playbackRouteTypes.has(drawing.type)) return false;
    if (element.kind === "ball") return ["pass", "dribble"].includes(drawing.type);
    return ["run", "dribble", "press", "mark"].includes(drawing.type);
  });
  const linked = drawings.filter((drawing) => drawing.actorId === element.id);
  const candidates = linked.length
    ? linked
    : element.kind === "ball"
      ? drawings.filter((drawing) => ["pass", "dribble"].includes(drawing.type))
      : [];
  return candidates.reduce((best, drawing) => {
    const distance = Math.hypot(
      Number(drawing.startX || 0) - Number(element.x || 0),
      Number(drawing.startY || 0) - Number(element.y || 0)
    );
    if (!linked.length && distance > 5) return best;
    return !best || distance < best.distance ? { drawing, distance } : best;
  }, null)?.drawing || null;
}

export function getSetPieceElementPlaybackProgress(element = {}, transitionProgress = 0, totalDuration = 1400) {
  const durationMs = Math.max(250, Number(totalDuration || 1400));
  const elapsed = clampProgress(transitionProgress) * durationMs;
  const delay = Math.min(durationMs - 100, Math.max(0, Number(element.delayMs || 0)));
  const duration = Math.max(100, Math.min(
    durationMs - delay,
    Number(element.durationMs || durationMs)
  ));
  return clampProgress((elapsed - delay) / duration);
}

export function interpolateSetPiecePlaybackElement(fromElement = {}, toElement = {}, progress = 0, fromPhase = {}) {
  const localProgress = clampProgress(progress);
  const route = findPlaybackRoute(fromPhase, fromElement);
  if (!route) {
    return {
      x: interpolateSetPieceValue(fromElement.x, toElement.x, localProgress),
      y: interpolateSetPieceValue(fromElement.y, toElement.y, localProgress),
      rotation: interpolateSetPieceValue(fromElement.rotation, toElement.rotation, localProgress),
      routeId: "",
      localProgress,
    };
  }
  const point = routePoint(route, localProgress);
  const startOffsetX = Number(fromElement.x || 0) - Number(route.startX || 0);
  const startOffsetY = Number(fromElement.y || 0) - Number(route.startY || 0);
  const endOffsetX = Number(toElement.x || 0) - Number(route.endX || 0);
  const endOffsetY = Number(toElement.y || 0) - Number(route.endY || 0);
  return {
    x: point.x + interpolateSetPieceValue(startOffsetX, endOffsetX, localProgress),
    y: point.y + interpolateSetPieceValue(startOffsetY, endOffsetY, localProgress),
    rotation: interpolateSetPieceValue(fromElement.rotation, toElement.rotation, localProgress),
    routeId: route.id || "",
    localProgress,
  };
}
