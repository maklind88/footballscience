import { getNearestSetPieceElement } from "./geometry.mjs";

const actorKindsByDrawingType = Object.freeze({
  run: new Set(["home-player"]),
  pass: new Set(["ball"]),
  dribble: new Set(["home-player"]),
  press: new Set(["home-player", "opponent"]),
  mark: new Set(["home-player", "opponent"]),
});

export function getSetPieceDrawingActors(phase = {}, drawingType = "") {
  const kinds = actorKindsByDrawingType[drawingType];
  if (!kinds) return [];
  return (phase.elements || []).filter((element) => kinds.has(element.kind));
}

export function chooseSetPieceDrawingActor(phase = {}, drawingType = "", point = {}, selectedIds = new Set(), constraints = {}) {
  const candidates = getSetPieceDrawingActors(phase, drawingType);
  const selected = candidates.find((element) => selectedIds.has(element.id));
  if (selected) return selected;
  const nearest = getNearestSetPieceElement(candidates, point);
  if (!nearest) return null;
  const maxDistance = Number(constraints.maxDistance ?? Number.POSITIVE_INFINITY);
  const distance = Math.hypot(Number(nearest.x || 0) - Number(point.x || 0), Number(nearest.y || 0) - Number(point.y || 0));
  return distance <= maxDistance ? nearest : null;
}

export function getSetPieceDrawingActorLabel(element = {}) {
  if (element.kind === "ball") return "Ball";
  if (element.kind === "opponent") return `Opponent ${element.showNumber === false ? "" : element.label || ""}`.trim();
  return [element.label || "P", element.role].filter(Boolean).join(" · ");
}
