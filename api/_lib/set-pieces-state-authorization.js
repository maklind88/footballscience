const { hasModulePermission } = require("../../src/core/permission-matrix.cjs");

const SET_PIECES_MODULE_ID = "set-pieces-room";

function parseStateValue(rawValue, { allowEmpty = false } = {}) {
  if (allowEmpty && !String(rawValue || "").trim()) return null;
  try {
    const parsed = JSON.parse(String(rawValue || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectEntityPaths(state = {}) {
  const paths = new Set();
  for (const play of Array.isArray(state.plays) ? state.plays : []) {
    const playId = String(play?.id || "").trim();
    if (!playId) continue;
    const playPath = `play:${playId}`;
    paths.add(playPath);
    for (const variant of Array.isArray(play.variants) ? play.variants : []) {
      const variantId = String(variant?.id || "").trim();
      if (!variantId) continue;
      const variantPath = `${playPath}/variant:${variantId}`;
      paths.add(variantPath);
      for (const phase of Array.isArray(variant.phases) ? variant.phases : []) {
        const phaseId = String(phase?.id || "").trim();
        if (!phaseId) continue;
        const phasePath = `${variantPath}/phase:${phaseId}`;
        paths.add(phasePath);
        for (const element of Array.isArray(phase.elements) ? phase.elements : []) {
          const elementId = String(element?.id || "").trim();
          if (elementId) paths.add(`${phasePath}/element:${elementId}`);
        }
        for (const drawing of Array.isArray(phase.drawings) ? phase.drawings : []) {
          const drawingId = String(drawing?.id || "").trim();
          if (drawingId) paths.add(`${phasePath}/drawing:${drawingId}`);
        }
      }
    }
  }
  return paths;
}

function protectSetPiecesStateWrite(actor, rawValue, options = {}) {
  const canDelete = hasModulePermission(actor, SET_PIECES_MODULE_ID, "delete");
  if (options.removed) {
    return canDelete
      ? { ok: true, value: rawValue }
      : { ok: false, status: 403, reason: "You do not have permission to delete Set Pieces data." };
  }

  const nextState = parseStateValue(rawValue);
  if (!nextState) {
    return { ok: false, status: 400, reason: "Set Pieces data must be valid JSON state." };
  }
  if (canDelete) return { ok: true, value: rawValue };

  const previousState = parseStateValue(options.previousValue, { allowEmpty: true });
  if (!previousState) return { ok: true, value: rawValue };

  const nextPaths = collectEntityPaths(nextState);
  const removedPath = [...collectEntityPaths(previousState)].find((path) => !nextPaths.has(path));
  if (removedPath) {
    return {
      ok: false,
      status: 403,
      reason: "You can edit Set Pieces, but only coaches or admins can delete tactical content.",
    };
  }
  return { ok: true, value: rawValue };
}

module.exports = { collectEntityPaths, protectSetPiecesStateWrite };
