// Missing optional coordinates must not become a real point at (0, 0).
export function hasSessionPlannerTacticalPoint(x, y) {
  const isCoordinate = (value) => (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== ""
    && Number.isFinite(Number(value));
  return isCoordinate(x) && isCoordinate(y);
}
