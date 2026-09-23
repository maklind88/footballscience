import { createSessionPlannerTacticalHelpers } from "./session-planner-tactical-helpers.mjs";

const { cloneTacticalElement, normalizeTacticalFrames, getDefaultTacticalColor, getDefaultTacticalLineStyle }
  = createSessionPlannerTacticalHelpers();
const defaults = { x2: null, y2: null, controlX: null, controlY: null, label: "", playerNumber: null,
  lineWidth: 1.1, size: 1, rotation: 0 };
const elements = (value) => Array.isArray(value) ? value.map(cloneTacticalElement) : [];

// Older readers already restore these exact defaults. Keep identities, geometry,
// explicit styles and unknown fields intact; no new storage format is required.
export function compactTacticalElement(element) {
  const next = { ...element };
  for (const [key, value] of Object.entries(defaults)) if (next[key] === value) delete next[key];
  if (next.color === getDefaultTacticalColor(next.type)) delete next.color;
  if (next.lineStyle === getDefaultTacticalLineStyle(next.type)) delete next.lineStyle;
  if (Array.isArray(next.points) && !next.points.length) delete next.points;
  return next;
}

export function compactTacticalBlock(block) {
  const next = { ...block };
  if (Array.isArray(block.tacticalFrames)) next.tacticalFrames = block.tacticalFrames.map((frame) => ({
    ...frame, elements: Array.isArray(frame.elements) ? frame.elements.map(compactTacticalElement) : frame.elements,
  }));
  if (Array.isArray(block.tacticalElements)) next.tacticalElements = block.tacticalElements.map(compactTacticalElement);
  return next;
}

export function getTacticalStorageBytes(block) {
  return new TextEncoder().encode(JSON.stringify(compactTacticalBlock(block))).byteLength;
}

function sameBoardContent(block, previous) {
  if (!previous || block.tacticalPitchMode !== previous.tacticalPitchMode ||
      block.tacticalActiveFrameId !== previous.tacticalActiveFrameId) return false;
  return JSON.stringify(normalizeTacticalFrames(block.tacticalFrames)) === JSON.stringify(normalizeTacticalFrames(previous.tacticalFrames)) &&
    JSON.stringify(elements(block.tacticalElements)) === JSON.stringify(elements(previous.tacticalElements));
}

export function sessionStateForStorage(state, previousState) {
  if (!state?.sessions) return state;
  return { ...state, sessions: Object.fromEntries(Object.entries(state.sessions).map(([date, session]) => {
    if (!Array.isArray(session?.blocks)) return [date, session];
    const previousBlocks = new Map((previousState?.sessions?.[date]?.blocks || []).map((block) => [block.id, block]));
    const blocks = session.blocks.map((block) => {
      const previous = previousBlocks.get(block.id);
      if (!sameBoardContent(block, previous)) return compactTacticalBlock(block);
      // Do not re-encode untouched boards: that would journal unrelated dates or
      // overwrite a colleague's representation while saving only coaching text.
      const next = { ...block };
      for (const field of ["tacticalFrames", "tacticalElements"]) {
        if (Object.hasOwn(previous, field)) next[field] = previous[field];
      }
      return next;
    });
    return [date, { ...session, blocks }];
  })) };
}
