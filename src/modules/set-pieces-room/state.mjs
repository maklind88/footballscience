import {
  DEFAULT_ACTION_DURATION_MS,
  DEFAULT_PHASE_DURATION_MS,
  DEFAULT_PHASE_HOLD_MS,
  SET_PIECES_MAX_PHASES,
  SET_PIECES_MAX_PLAYS,
  SET_PIECES_MAX_VARIANTS,
  SET_PIECES_SCHEMA_VERSION,
  setPieceDrawingTypes,
} from "./constants.mjs";
import { normalizeSetPiecePoint } from "./geometry.mjs";

const allowedElementKinds = new Set(["home-player", "opponent", "ball"]);
const allowedPitchViews = new Set(["full", "attacking-half", "defensive-half"]);

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
    context: text(options.context || "match", 40),
    scheduledFor: text(options.scheduledFor, 20),
    opponent: text(options.opponent, 100),
    objective: text(options.objective, 320),
    pitchView: allowedPitchViews.has(options.pitchView) ? options.pitchView : "attacking-half",
    status: text(options.status || "draft", 24),
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

function normalizeElement(element = {}) {
  const kind = allowedElementKinds.has(element.kind) ? element.kind : "home-player";
  const point = normalizeSetPiecePoint(element);
  return {
    id: text(element.id, 100) || createSetPieceId(kind),
    kind,
    x: point.x,
    y: point.y,
    profileId: kind === "home-player" ? text(element.profileId, 100) : "",
    label: text(element.label || (kind === "opponent" ? element.number : ""), 12),
    role: text(element.role, 80),
    instruction: text(element.instruction, 240),
    rotation: number(element.rotation, 0, -180, 180),
    delayMs: number(element.delayMs, 0, 0, 10000),
    durationMs: number(element.durationMs, DEFAULT_ACTION_DURATION_MS, 100, 10000),
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
  };
}

function normalizePhase(phase = {}, index = 0) {
  return {
    id: text(phase.id, 100) || createSetPieceId("phase"),
    title: text(phase.title || `Phase ${index + 1}`, 48),
    cue: text(phase.cue, 240),
    durationMs: number(phase.durationMs, DEFAULT_PHASE_DURATION_MS, 250, 10000),
    holdMs: number(phase.holdMs, DEFAULT_PHASE_HOLD_MS, 0, 5000),
    elements: (Array.isArray(phase.elements) ? phase.elements : []).map(normalizeElement).slice(0, 80),
    drawings: (Array.isArray(phase.drawings) ? phase.drawings : []).map(normalizeDrawing).slice(0, 160),
  };
}

function normalizeVariant(variant = {}, index = 0) {
  const phases = (Array.isArray(variant.phases) ? variant.phases : []).slice(0, SET_PIECES_MAX_PHASES).map(normalizePhase);
  if (!phases.length) phases.push(createSetPiecePhase());
  const activePhaseId = phases.some((phase) => phase.id === variant.activePhaseId) ? variant.activePhaseId : phases[0].id;
  return {
    id: text(variant.id, 100) || createSetPieceId("variant"),
    title: text(variant.title || `Variant ${index + 1}`, 64),
    trigger: text(variant.trigger, 240),
    baseVariantId: text(variant.baseVariantId, 100),
    branchFromPhaseId: text(variant.branchFromPhaseId, 100),
    activePhaseId,
    phases,
  };
}

function normalizePlay(play = {}) {
  const variants = (Array.isArray(play.variants) ? play.variants : []).slice(0, SET_PIECES_MAX_VARIANTS).map(normalizeVariant);
  if (!variants.length) variants.push(createSetPieceVariant());
  const activeVariantId = variants.some((variant) => variant.id === play.activeVariantId) ? play.activeVariantId : variants[0].id;
  const createdAt = timestamp(play.createdAt) || new Date().toISOString();
  return {
    id: text(play.id, 100) || createSetPieceId("set-piece"),
    title: text(play.title || "Untitled set piece", 100),
    restart: text(play.restart || "corner", 40),
    moment: text(play.moment || "attack", 40),
    context: text(play.context || "match", 40),
    scheduledFor: text(play.scheduledFor, 20),
    opponent: text(play.opponent, 100),
    objective: text(play.objective, 320),
    pitchView: allowedPitchViews.has(play.pitchView) ? play.pitchView : "attacking-half",
    status: text(play.status || "draft", 24),
    activeVariantId,
    variants,
    createdAt,
    updatedAt: timestamp(play.updatedAt) || createdAt,
    updatedBy: text(play.updatedBy, 100),
  };
}

export function normalizeSetPiecesState(candidate = {}) {
  const plays = (Array.isArray(candidate?.plays) ? candidate.plays : []).slice(0, SET_PIECES_MAX_PLAYS).map(normalizePlay);
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
