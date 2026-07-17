import {
  createSessionPlannerTacticalHelpers,
} from "../session-planner/session-planner-tactical-helpers.mjs";

export const idpPlayerBoardPitchModeOptions = Object.freeze([
  { key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false },
  { key: "full-wide", label: "Full pitch wide", dimensions: { x: 105, y: 65 }, landscape: true },
  { key: "attacking-half", label: "Attacking half", dimensions: { x: 65, y: 52.5 }, landscape: false },
  { key: "defending-half", label: "Defending half", dimensions: { x: 65, y: 52.5 }, landscape: false },
  { key: "goalkeeper", label: "Goalkeeper box", dimensions: { x: 65, y: 33 }, landscape: false },
]);

export const IDP_PLAYER_BOARD_NEW_EXERCISE_ID = "new-idp-player-board-exercise";

const idpPlayerBoardPitchModeKeys = new Set(idpPlayerBoardPitchModeOptions.map((option) => option.key));

export const idpPlayerBoardHelpers = createSessionPlannerTacticalHelpers({
  tacticalPitchModeOptions: idpPlayerBoardPitchModeOptions,
  tacticalPitchModeKeys: idpPlayerBoardPitchModeKeys,
  tacticalMaxFrames: 8,
});

export const idpPlayerBoardUiDefaults = Object.freeze({
  idpPlayerBoardOpen: false,
  idpPlayerBoardPreviewOpen: false,
  idpPlayerBoardTool: "blue-player",
  idpPlayerBoardColor: "#1d8bff",
  idpPlayerBoardLineWidth: 1.1,
  idpPlayerBoardLineStyle: "solid",
  idpPlayerBoardPendingPoint: null,
  idpPlayerBoardSelectedElementId: "",
  idpPlayerBoardSelectedElementIds: [],
  idpPlayerBoardNumberPickerElementId: "",
  idpPlayerBoardDraftLineState: null,
  idpPlayerBoardFreehandState: null,
  idpPlayerBoardSelectionState: null,
  idpPlayerBoardDragState: null,
  idpPlayerBoardClipboard: [],
  idpPlayerBoardClipboardPasteCount: 0,
  idpPlayerBoardSuppressNextClick: false,
  idpPlayerBoardSuppressNextClickAt: 0,
  idpPlayerBoardSnapEnabled: true,
  idpPlayerBoardLastPlacementClick: null,
  idpPlayerBoardLastPlacement: null,
  idpPlayerBoardSelectedInterventionId: "",
});

export function normalizePositiveInteger(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function isPersistedId(value = "") {
  const id = normalizeText(value);
  return Boolean(id && !id.startsWith("draft-") && !id.startsWith("legacy-"));
}

export function getIdpPlayerBoardUiState(ui = {}) {
  return {
    ...idpPlayerBoardUiDefaults,
    ...(ui || {}),
    idpPlayerBoardSelectedElementIds: Array.isArray(ui?.idpPlayerBoardSelectedElementIds)
      ? ui.idpPlayerBoardSelectedElementIds
      : [],
    idpPlayerBoardClipboard: Array.isArray(ui?.idpPlayerBoardClipboard)
      ? ui.idpPlayerBoardClipboard
      : [],
  };
}

export function activeIdpFocus(detail = {}) {
  return (Array.isArray(detail.focuses) ? detail.focuses : []).find((focus) =>
    ["Active", "Needs Evidence", "Ready For Review", "Reviewed"].includes(focus.status)
  ) || detail.focuses?.[0] || null;
}

export function listIdpPlayerBoardInterventions(detail = {}) {
  return normalizeBoardArray(detail.interventions)
    .filter((item) => item && !["archived", "deleted"].includes(String(item.status || "").toLowerCase()))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export function normalizeIdpPlayerBoardPitchMode(value = "full") {
  const aliases = {
    half: "attacking-half",
    "final-third": "attacking-half",
    box: "goalkeeper",
  };
  const normalized = normalizeText(value, "full");
  const resolved = aliases[normalized] || normalized;
  return idpPlayerBoardPitchModeKeys.has(resolved) ? resolved : "full";
}

function normalizeBoardArray(value = []) {
  return Array.isArray(value) ? value : [];
}

function oldBoardStateToTacticalElements(boardState = {}, profile = {}) {
  const elements = [];
  const push = (element = {}) => {
    const cloned = idpPlayerBoardHelpers.cloneTacticalElement({
      id: element.id || idpPlayerBoardHelpers.createStableId("idp-board"),
      ...element,
    });
    elements.push(cloned);
  };
  const initials = normalizeText(profile.playerName || profile.name, "Player")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (boardState.player) {
    push({
      type: "blue-player",
      x: boardState.player.x,
      y: boardState.player.y,
      playerNumber: initials || profile.squadNumber || "",
      color: "#1d8bff",
    });
  }
  normalizeBoardArray(boardState.referencePlayers).forEach((item) => push({
    type: "neutral-player",
    id: item.id,
    x: item.x,
    y: item.y,
    playerNumber: item.label || "R",
    color: "#fbbf24",
  }));
  normalizeBoardArray(boardState.cones).forEach((item) => push({
    type: "cone",
    id: item.id,
    x: item.x,
    y: item.y,
    color: "#f97316",
  }));
  normalizeBoardArray(boardState.zones).forEach((item) => push({
    type: "dashed-zone",
    id: item.id,
    label: item.label,
    x: item.x,
    y: item.y,
    x2: Number(item.x || 50) + Number(item.width || 18),
    y2: Number(item.y || 50) + Number(item.height || 12),
    color: "#111827",
    lineStyle: "dashed",
  }));
  normalizeBoardArray(boardState.arrows).forEach((item) => push({
    type: item.type || "run",
    id: item.id,
    label: item.label,
    x: item.from?.x,
    y: item.from?.y,
    x2: item.to?.x,
    y2: item.to?.y,
    color: item.color || "#111827",
    lineWidth: item.lineWidth,
    lineStyle: item.lineStyle,
  }));
  normalizeBoardArray(boardState.notes).forEach((item) => push({
    type: "text",
    id: item.id,
    label: item.text,
    x: item.x,
    y: item.y,
    color: "#111827",
  }));
  return elements;
}

function normalizeTacticalFramesFromState(boardState = {}, profile = {}) {
  const tacticalFrames = normalizeBoardArray(boardState.tacticalFrames || boardState.tactical_frames);
  if (tacticalFrames.length) {
    return idpPlayerBoardHelpers.normalizeTacticalFrames(tacticalFrames);
  }
  const frames = normalizeBoardArray(boardState.frames);
  const framesWithElements = frames.filter((frame) => Array.isArray(frame?.elements) && frame.elements.length);
  if (framesWithElements.length) {
    return idpPlayerBoardHelpers.normalizeTacticalFrames(framesWithElements);
  }
  const tacticalElements = normalizeBoardArray(boardState.tacticalElements || boardState.tactical_elements);
  const elements = tacticalElements.length
    ? tacticalElements.map(idpPlayerBoardHelpers.cloneTacticalElement)
    : oldBoardStateToTacticalElements(boardState, profile);
  return idpPlayerBoardHelpers.normalizeTacticalFrames([{
    id: "idp-board-frame-1",
    label: "Frame 1",
    elements,
  }]);
}

export function normalizeIdpPlayerBoardState(boardState = {}, profile = {}) {
  const source = boardState && typeof boardState === "object" && !Array.isArray(boardState) ? boardState : {};
  const tacticalFrames = normalizeTacticalFramesFromState(source, profile);
  const activeFrameId = idpPlayerBoardHelpers.normalizeTacticalActiveFrameId(
    source.tacticalActiveFrameId || source.tactical_active_frame_id,
    tacticalFrames
  );
  const activeFrame = tacticalFrames.find((frame) => frame.id === activeFrameId) || tacticalFrames[0] || {
    id: "idp-board-frame-1",
    label: "Frame 1",
    elements: [],
  };
  return {
    ...source,
    schema: "idp-player-board-tactical-v1",
    tacticalPitchMode: normalizeIdpPlayerBoardPitchMode(
      source.tacticalPitchMode || source.tactical_pitch_mode || source.pitchMode || source.pitch_mode || "full"
    ),
    tacticalFrames,
    tacticalActiveFrameId: activeFrame.id,
    tacticalElements: activeFrame.elements.map(idpPlayerBoardHelpers.cloneTacticalElement),
    visualImage: normalizeText(source.visualImage || source.visual_image, ""),
  };
}

export function findIdpPlayerBoardIntervention(detail = {}, options = {}) {
  const focus = activeIdpFocus(detail);
  const focusId = normalizeText(focus?.id);
  const selectedInterventionId = normalizeText(options.selectedInterventionId);
  const candidates = listIdpPlayerBoardInterventions(detail);
  if (selectedInterventionId && selectedInterventionId !== IDP_PLAYER_BOARD_NEW_EXERCISE_ID) {
    const selected = candidates.find((item) => item.id === selectedInterventionId);
    if (selected) return selected;
  }
  return candidates.find((item) => focusId && item.focusId === focusId) || candidates[0] || null;
}

export function buildIdpPlayerBoardBlock(detail = {}, options = {}) {
  const profile = detail.profile || {};
  const focus = activeIdpFocus(detail);
  const selectedInterventionId = normalizeText(options.selectedInterventionId);
  const forceDraft = Boolean(options.forceDraft) || selectedInterventionId === IDP_PLAYER_BOARD_NEW_EXERCISE_ID;
  const intervention = forceDraft ? null : options.intervention || findIdpPlayerBoardIntervention(detail, { selectedInterventionId });
  const boardState = normalizeIdpPlayerBoardState(intervention?.boardState || {}, profile);
  const fallbackTitle = normalizeText(focus?.title, "") || `${normalizeText(profile.playerName, "Player")} Player Board`;
  return {
    id: intervention?.id || "draft-idp-player-board",
    interventionId: intervention?.id || "",
    rowVersion: normalizePositiveInteger(intervention?.rowVersion, intervention ? 1 : 0),
    isDraft: !isPersistedId(intervention?.id),
    playerId: profile.playerId || "",
    focusId: intervention?.focusId || focus?.id || "",
    title: normalizeText(intervention?.title, fallbackTitle),
    objective: normalizeText(intervention?.objective, focus?.description || ""),
    coachingCue: normalizeText(intervention?.coachingCue, ""),
    successCriteria: Array.isArray(intervention?.successCriteria) ? intervention.successCriteria : [],
    status: intervention?.status || "active",
    tacticalPitchMode: boardState.tacticalPitchMode,
    tacticalFrames: boardState.tacticalFrames,
    tacticalActiveFrameId: boardState.tacticalActiveFrameId,
    tacticalElements: boardState.tacticalElements,
    visualImage: boardState.visualImage,
    boardState,
  };
}

export function createBoardStateFromBlock(block = {}) {
  const frames = idpPlayerBoardHelpers.normalizeTacticalFrames(block.tacticalFrames);
  const activeFrameId = idpPlayerBoardHelpers.normalizeTacticalActiveFrameId(block.tacticalActiveFrameId, frames);
  const activeFrame = frames.find((frame) => frame.id === activeFrameId) || frames[0] || {
    id: "idp-board-frame-1",
    label: "Frame 1",
    elements: [],
  };
  const tacticalElements = Array.isArray(block.tacticalElements)
    ? block.tacticalElements.map(idpPlayerBoardHelpers.cloneTacticalElement)
    : activeFrame.elements.map(idpPlayerBoardHelpers.cloneTacticalElement);
  const normalizedFrames = frames.length ? frames : [{
    id: activeFrame.id,
    label: activeFrame.label || "Frame 1",
    elements: tacticalElements,
  }];
  return {
    schema: "idp-player-board-tactical-v1",
    tacticalPitchMode: normalizeIdpPlayerBoardPitchMode(block.tacticalPitchMode),
    tacticalActiveFrameId: activeFrame.id,
    tacticalFrames: normalizedFrames.map((frame) => ({
      ...frame,
      elements: frame.id === activeFrame.id
        ? tacticalElements.map(idpPlayerBoardHelpers.cloneTacticalElement)
        : normalizeBoardArray(frame.elements).map(idpPlayerBoardHelpers.cloneTacticalElement),
    })),
    tacticalElements,
    visualImage: normalizeText(block.visualImage, ""),
    linkedClipIds: Array.isArray(block.boardState?.linkedClipIds) ? block.boardState.linkedClipIds : [],
  };
}

export function blockToInterventionPatch(block = {}) {
  return {
    id: block.interventionId || "",
    rowVersion: normalizePositiveInteger(block.rowVersion, block.interventionId ? 1 : 0),
    playerId: block.playerId || "",
    focusId: block.focusId || "",
    title: normalizeText(block.title, "Individual exercise"),
    objective: normalizeText(block.objective, ""),
    coachingCue: normalizeText(block.coachingCue, ""),
    successCriteria: Array.isArray(block.successCriteria) ? block.successCriteria : [],
    pitchMode: normalizeIdpPlayerBoardPitchMode(block.tacticalPitchMode),
    boardState: createBoardStateFromBlock(block),
    status: block.status || "active",
  };
}
