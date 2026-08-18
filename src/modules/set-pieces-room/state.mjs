import {
  DEFAULT_ACTION_DURATION_MS,
  DEFAULT_PHASE_DURATION_MS,
  DEFAULT_PHASE_HOLD_MS,
  DEFAULT_SET_PIECE_ZONE_COLOR,
  SET_PIECES_MAX_PHASES,
  SET_PIECES_MAX_PLAYS,
  SET_PIECES_MAX_VARIANTS,
  SET_PIECES_SCHEMA_VERSION,
  setPieceDrawingTypes,
  setPieceSubPhaseOptions,
  setPieceZoneColors,
} from "./constants.mjs";
import { normalizeSetPiecePoint } from "./geometry.mjs";

const allowedElementKinds = new Set(["home-player", "opponent", "ball"]);
const allowedPitchViews = new Set(["full", "attacking-half", "defensive-half"]);
const allowedSubPhases = new Set(setPieceSubPhaseOptions.map((option) => option.value));

export function createSetPieceId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function text(value = "", maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function number(value, fallback, min, max) {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
}

function timestamp(value = "") {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : "";
}

function normalizeSubPhases(candidate) {
  const source = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
  const subPhases = [...new Set(source
    .map((value) => text(value, 40))
    .filter((value) => allowedSubPhases.has(value)))];
  return subPhases.length ? subPhases : ["first-action"];
}

export function createSetPiecePhase(options = {}) {
  return {
    id: options.id || createSetPieceId("phase"),
    title: text(options.title || "Start", 48),
    cue: text(options.cue, 240),
    durationMs: number(options.durationMs, DEFAULT_PHASE_DURATION_MS, 250, 10000),
    holdMs: number(options.holdMs, DEFAULT_PHASE_HOLD_MS, 0, 5000),
    elements: Array.isArray(options.elements) ? structuredClone(options.elements) : [],
    drawings: Array.isArray(options.drawings) ? structuredClone(options.drawings) : [],
  };
}

export function createSetPieceVariant(options = {}) {
  const phase = createSetPiecePhase();
  return {
    id: options.id || createSetPieceId("variant"),
    title: text(options.title || "Primary", 64),
    trigger: text(options.trigger, 240),
    baseVariantId: text(options.baseVariantId, 100),
    branchFromPhaseId: text(options.branchFromPhaseId, 100),
    assignmentOverrides: [],
    activePhaseId: options.activePhaseId || phase.id,
    phases: Array.isArray(options.phases) && options.phases.length ? structuredClone(options.phases) : [phase],
  };
}

export function createSetPiecePlay(options = {}) {
  const variant = createSetPieceVariant();
  const now = new Date().toISOString();
  return {
    id: options.id || createSetPieceId("set-piece"),
    title: text(options.title || "Untitled set piece", 100),
    restart: text(options.restart || "corner", 40),
    moment: text(options.moment || "attack", 40),
    subPhases: normalizeSubPhases(options.subPhases || options.subPhase),
    context: text(options.context || "match", 40),
    scheduledFor: text(options.scheduledFor, 20),
    opponent: text(options.opponent, 100),
    objective: text(options.objective, 320),
    pitchView: allowedPitchViews.has(options.pitchView) ? options.pitchView : "attacking-half",
    status: text(options.status || "draft", 24),
    assignments: [],
    activeVariantId: variant.id,
    variants: [variant],
    createdAt: timestamp(options.createdAt) || now,
    updatedAt: timestamp(options.updatedAt) || now,
    updatedBy: text(options.updatedBy, 100),
  };
}

export function createEmptySetPiecesState() {
  return {
    schemaVersion: SET_PIECES_SCHEMA_VERSION,
    activePlayId: "",
    plays: [],
    updatedAt: "",
  };
}

function normalizeElement(element = {}, options = {}) {
  const kind = allowedElementKinds.has(element.kind) ? element.kind : "home-player";
  const point = normalizeSetPiecePoint(element);
  const opponentNumber = String(Math.round(number(element.label || element.number, 1, 1, 99)));
  const defaultActionDuration = Number(options.defaultActionDuration || DEFAULT_ACTION_DURATION_MS);
  const actionDuration = options.migrateLegacyPlayback && Number(element.durationMs) === 900
    ? defaultActionDuration
    : element.durationMs;
  return {
    id: text(element.id, 100) || createSetPieceId(kind),
    kind,
    x: point.x,
    y: point.y,
    profileId: kind === "home-player" ? text(element.profileId, 100) : "",
    label: kind === "opponent" ? opponentNumber : text(element.label, 12),
    showNumber: kind === "opponent" ? element.showNumber !== false : true,
    role: text(element.role, 80),
    instruction: text(element.instruction, 240),
    rotation: number(element.rotation, 0, -180, 180),
    delayMs: number(element.delayMs, 0, 0, 10000),
    durationMs: number(actionDuration, defaultActionDuration, 100, 10000),
  };
}

function normalizeDrawing(drawing = {}) {
  const type = setPieceDrawingTypes.has(drawing.type) ? drawing.type : "run";
  const start = normalizeSetPiecePoint({ x: drawing.startX, y: drawing.startY });
  const end = normalizeSetPiecePoint({ x: drawing.endX, y: drawing.endY });
  return {
    id: text(drawing.id, 100) || createSetPieceId("drawing"),
    type,
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
    actorId: text(drawing.actorId, 100),
    label: text(drawing.label, 80),
    curve: number(drawing.curve, 0, -36, 36),
    zoneColor: type === "zone" && setPieceZoneColors.has(drawing.zoneColor)
      ? drawing.zoneColor
      : type === "zone" ? DEFAULT_SET_PIECE_ZONE_COLOR : "",
  };
}

function normalizeAssignmentList(candidate = []) {
  const source = Array.isArray(candidate)
    ? candidate
    : Object.entries(candidate || {}).map(([slotId, value]) => (
      typeof value === "string" ? { slotId, profileId: value } : { slotId, ...value }
    ));
  const assignments = new Map();
  source.forEach((assignment) => {
    const slotId = text(assignment?.slotId || assignment?.elementId, 100);
    if (!slotId) return;
    assignments.set(slotId, {
      slotId,
      role: text(assignment?.role, 80),
      profileId: text(assignment?.profileId, 100),
    });
  });
  return assignments;
}

function normalizeAssignmentOverrides(candidate = []) {
  const source = Array.isArray(candidate)
    ? candidate
    : Object.entries(candidate || {}).map(([slotId, profileId]) => ({ slotId, profileId }));
  const overrides = new Map();
  source.forEach((assignment) => {
    const slotId = text(assignment?.slotId || assignment?.elementId, 100);
    if (!slotId) return;
    overrides.set(slotId, { slotId, profileId: text(assignment?.profileId, 100) });
  });
  return [...overrides.values()];
}

function mergeLegacyPlayerSlots(variants = []) {
  const aliases = new Map();
  const canonicalSlotsByProfile = new Map();
  variants.forEach((variant) => variant.phases.forEach((phase) => {
    const reservedSlotIds = new Set(phase.elements
      .filter((element) => element.kind === "home-player")
      .map((element) => aliases.get(element.id) || element.id));
    phase.elements.forEach((element) => {
      if (element.kind !== "home-player") return;
      const originalId = element.id;
      if (aliases.has(originalId)) {
        element.id = aliases.get(originalId);
        return;
      }
      const profileId = element.profileId;
      const candidates = canonicalSlotsByProfile.get(profileId) || [];
      const reusableSlotId = profileId
        ? candidates.find((slotId) => slotId === originalId || !reservedSlotIds.has(slotId))
        : "";
      const canonicalSlotId = reusableSlotId || originalId;
      aliases.set(originalId, canonicalSlotId);
      element.id = canonicalSlotId;
      reservedSlotIds.add(canonicalSlotId);
      if (profileId && !candidates.includes(canonicalSlotId)) {
        candidates.push(canonicalSlotId);
        canonicalSlotsByProfile.set(profileId, candidates);
      }
    });
    phase.drawings.forEach((drawing) => {
      drawing.actorId = aliases.get(drawing.actorId) || drawing.actorId;
    });
  }));
}

function normalizePhase(phase = {}, index = 0, options = {}) {
  const durationMs = number(phase.durationMs, DEFAULT_PHASE_DURATION_MS, 250, 10000);
  const holdMs = options.migrateLegacyPlayback && Number(phase.holdMs) === 450
    ? DEFAULT_PHASE_HOLD_MS
    : phase.holdMs;
  return {
    id: text(phase.id, 100) || createSetPieceId("phase"),
    title: text(phase.title || `Phase ${index + 1}`, 48),
    cue: text(phase.cue, 240),
    durationMs,
    holdMs: number(holdMs, DEFAULT_PHASE_HOLD_MS, 0, 5000),
    elements: (Array.isArray(phase.elements) ? phase.elements : [])
      .map((element) => normalizeElement(element, {
        defaultActionDuration: durationMs,
        migrateLegacyPlayback: options.migrateLegacyPlayback,
      }))
      .slice(0, 80),
    drawings: (Array.isArray(phase.drawings) ? phase.drawings : []).map(normalizeDrawing).slice(0, 160),
  };
}

function normalizeVariant(variant = {}, index = 0, options = {}) {
  const phases = (Array.isArray(variant.phases) ? variant.phases : [])
    .slice(0, SET_PIECES_MAX_PHASES)
    .map((phase, phaseIndex) => normalizePhase(phase, phaseIndex, options));
  if (!phases.length) phases.push(createSetPiecePhase());
  const activePhaseId = phases.some((phase) => phase.id === variant.activePhaseId) ? variant.activePhaseId : phases[0].id;
  return {
    id: text(variant.id, 100) || createSetPieceId("variant"),
    title: text(variant.title || `Variant ${index + 1}`, 64),
    trigger: text(variant.trigger, 240),
    baseVariantId: text(variant.baseVariantId, 100),
    branchFromPhaseId: text(variant.branchFromPhaseId, 100),
    assignmentOverrides: normalizeAssignmentOverrides(variant.assignmentOverrides),
    activePhaseId,
    phases,
  };
}

function normalizePlay(play = {}, _index = 0, options = {}) {
  const variants = (Array.isArray(play.variants) ? play.variants : [])
    .slice(0, SET_PIECES_MAX_VARIANTS)
    .map((variant, variantIndex) => normalizeVariant(variant, variantIndex, options));
  if (!variants.length) variants.push(createSetPieceVariant());
  const explicitAssignments = normalizeAssignmentList(play.assignments);
  if (!explicitAssignments.size) mergeLegacyPlayerSlots(variants);
  const discoveredSlots = new Map();
  variants.forEach((variant) => variant.phases.forEach((phase) => phase.elements.forEach((element) => {
    if (element.kind !== "home-player" || discoveredSlots.has(element.id)) return;
    discoveredSlots.set(element.id, { profileId: element.profileId, role: element.role });
  })));
  const assignments = [...discoveredSlots.entries()].map(([slotId, fallback], index) => {
    const explicit = explicitAssignments.get(slotId);
    return {
      slotId,
      role: text(explicit?.role || fallback.role || `Role ${index + 1}`, 80),
      profileId: explicitAssignments.has(slotId) ? explicit.profileId : text(fallback.profileId, 100),
    };
  });
  const assignmentsBySlot = new Map(assignments.map((assignment) => [assignment.slotId, assignment]));
  variants.forEach((variant) => {
    variant.assignmentOverrides = variant.assignmentOverrides.filter((assignment) => assignmentsBySlot.has(assignment.slotId));
    const overrides = new Map(variant.assignmentOverrides.map((assignment) => [assignment.slotId, assignment]));
    variant.phases.forEach((phase) => phase.elements.forEach((element) => {
      if (element.kind !== "home-player") return;
      const assignment = assignmentsBySlot.get(element.id);
      if (!assignment) return;
      element.profileId = overrides.has(element.id) ? overrides.get(element.id).profileId : assignment.profileId;
      element.role = assignment.role;
    }));
  });
  const activeVariantId = variants.some((variant) => variant.id === play.activeVariantId) ? play.activeVariantId : variants[0].id;
  const createdAt = timestamp(play.createdAt) || new Date().toISOString();
  return {
    id: text(play.id, 100) || createSetPieceId("set-piece"),
    title: text(play.title || "Untitled set piece", 100),
    restart: text(play.restart || "corner", 40),
    moment: text(play.moment || "attack", 40),
    subPhases: normalizeSubPhases(play.subPhases || play.subPhase),
    context: text(play.context || "match", 40),
    scheduledFor: text(play.scheduledFor, 20),
    opponent: text(play.opponent, 100),
    objective: text(play.objective, 320),
    pitchView: allowedPitchViews.has(play.pitchView) ? play.pitchView : "attacking-half",
    status: text(play.status || "draft", 24),
    assignments,
    activeVariantId,
    variants,
    createdAt,
    updatedAt: timestamp(play.updatedAt) || createdAt,
    updatedBy: text(play.updatedBy, 100),
  };
}

export function normalizeSetPiecesState(candidate = {}) {
  const normalizationOptions = { migrateLegacyPlayback: Number(candidate?.schemaVersion || 0) < SET_PIECES_SCHEMA_VERSION };
  const plays = (Array.isArray(candidate?.plays) ? candidate.plays : [])
    .slice(0, SET_PIECES_MAX_PLAYS)
    .map((play, playIndex) => normalizePlay(play, playIndex, normalizationOptions));
  return {
    schemaVersion: SET_PIECES_SCHEMA_VERSION,
    activePlayId: plays.some((play) => play.id === candidate.activePlayId) ? candidate.activePlayId : plays[0]?.id || "",
    plays,
    updatedAt: timestamp(candidate.updatedAt),
  };
}

export function getActiveSetPiece(state = {}) {
  return state.plays?.find((play) => play.id === state.activePlayId) || state.plays?.[0] || null;
}

export function getActiveSetPieceVariant(play = {}) {
  return play.variants?.find((variant) => variant.id === play.activeVariantId) || play.variants?.[0] || null;
}

export function getActiveSetPiecePhase(variant = {}) {
  return variant.phases?.find((phase) => phase.id === variant.activePhaseId) || variant.phases?.[0] || null;
}

export function duplicateSetPiecePhase(phase = {}, index = 0) {
  return normalizePhase({
    ...structuredClone(phase),
    id: createSetPieceId("phase"),
    title: `Phase ${index + 1}`,
  }, index);
}

export function duplicateSetPieceVariant(variant = {}, title = "Variant") {
  const phases = (variant.phases || []).map((phase) => ({ ...structuredClone(phase), id: createSetPieceId("phase") }));
  return normalizeVariant({
    ...structuredClone(variant),
    id: createSetPieceId("variant"),
    title,
    baseVariantId: variant.id,
    branchFromPhaseId: variant.activePhaseId,
    activePhaseId: phases.find((_, index) => variant.phases?.[index]?.id === variant.activePhaseId)?.id || phases[0]?.id,
    phases,
  });
}
