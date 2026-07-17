import { createSessionPlannerTacticalController } from "../session-planner/session-planner-tactical-controller.mjs";
import { createSessionPlannerVisualUploadHelpers } from "../session-planner/session-planner-visual-upload.mjs";
import {
  getTacticalBoardElementEndpointCoordinates,
} from "../tactical-board/index.mjs";
import {
  blockToInterventionPatch,
  buildIdpPlayerBoardBlock,
  createBoardStateFromBlock,
  getIdpPlayerBoardUiState,
  IDP_PLAYER_BOARD_NEW_EXERCISE_ID,
  idpPlayerBoardHelpers,
  normalizePositiveInteger,
} from "./idp-player-board-helpers.mjs";
import {
  renderIdpPlayerBoardExerciseVisual,
} from "./idp-player-board-renderer.mjs";

const SESSION_TO_IDP_UI_KEYS = Object.freeze({
  sessionPlannerTacticalboardOpen: "idpPlayerBoardOpen",
  sessionPlannerTacticalTool: "idpPlayerBoardTool",
  sessionPlannerTacticalColor: "idpPlayerBoardColor",
  sessionPlannerTacticalLineWidth: "idpPlayerBoardLineWidth",
  sessionPlannerTacticalLineStyle: "idpPlayerBoardLineStyle",
  sessionPlannerTacticalPendingPoint: "idpPlayerBoardPendingPoint",
  sessionPlannerTacticalSelectedElementId: "idpPlayerBoardSelectedElementId",
  sessionPlannerTacticalSelectedElementIds: "idpPlayerBoardSelectedElementIds",
  sessionPlannerTacticalNumberPickerElementId: "idpPlayerBoardNumberPickerElementId",
  sessionPlannerTacticalDraftLineState: "idpPlayerBoardDraftLineState",
  sessionPlannerTacticalFreehandState: "idpPlayerBoardFreehandState",
  sessionPlannerTacticalSelectionState: "idpPlayerBoardSelectionState",
  sessionPlannerTacticalDragState: "idpPlayerBoardDragState",
  sessionPlannerTacticalClipboard: "idpPlayerBoardClipboard",
  sessionPlannerTacticalClipboardPasteCount: "idpPlayerBoardClipboardPasteCount",
  sessionPlannerTacticalSuppressNextClick: "idpPlayerBoardSuppressNextClick",
  sessionPlannerTacticalSuppressNextClickAt: "idpPlayerBoardSuppressNextClickAt",
  sessionPlannerTacticalSnapEnabled: "idpPlayerBoardSnapEnabled",
  sessionPlannerTacticalLastPlacementClick: "idpPlayerBoardLastPlacementClick",
  sessionPlannerTacticalLastPlacement: "idpPlayerBoardLastPlacement",
});

const STORE_BACKED_IDP_PLAYER_BOARD_KEYS = new Set([
  "idpPlayerBoardOpen",
  "idpPlayerBoardPreviewOpen",
  "idpPlayerBoardTool",
  "idpPlayerBoardColor",
  "idpPlayerBoardLineWidth",
  "idpPlayerBoardLineStyle",
  "idpPlayerBoardSnapEnabled",
  "idpPlayerBoardSelectedInterventionId",
]);

function createTransientIdpPlayerBoardUi() {
  return {
    idpPlayerBoardPendingPoint: null,
    idpPlayerBoardDraftLineState: null,
    idpPlayerBoardFreehandState: null,
    idpPlayerBoardSelectionState: null,
    idpPlayerBoardDragState: null,
    idpPlayerBoardNumberPickerElementId: "",
    idpPlayerBoardSelectedElementId: "",
    idpPlayerBoardSelectedElementIds: [],
    idpPlayerBoardClipboard: [],
    idpPlayerBoardClipboardPasteCount: 0,
    idpPlayerBoardSuppressNextClick: false,
    idpPlayerBoardSuppressNextClickAt: 0,
    idpPlayerBoardLastPlacementClick: null,
    idpPlayerBoardLastPlacement: null,
  };
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function canEdit(activeRuntime = {}) {
  try {
    return Boolean(activeRuntime.context?.canEdit?.());
  } catch {
    return false;
  }
}

function getRoot(activeRuntime = {}) {
  const configuredRoot = activeRuntime?.context?.ui?.idpWorkspace || null;
  if (configuredRoot && configuredRoot.isConnected !== false) return configuredRoot;
  return activeRuntime?.context?.win?.document?.getElementById?.("idpWorkspace")
    || globalThis.document?.getElementById?.("idpWorkspace")
    || configuredRoot;
}

function getDocument(activeRuntime = {}) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function getRuntimeLocalUi(activeRuntime = {}) {
  if (!activeRuntime.idpPlayerBoardLocalUi) {
    activeRuntime.idpPlayerBoardLocalUi = {};
  }
  return activeRuntime.idpPlayerBoardLocalUi;
}

export function getIdpPlayerBoardRuntimeUi(activeRuntime = {}) {
  return {
    ...(activeRuntime.store?.getState?.()?.ui || {}),
    ...getRuntimeLocalUi(activeRuntime),
  };
}

function getVisualUploadHelpers(activeRuntime = {}) {
  if (activeRuntime.idpPlayerBoardVisualUploadHelpers) return activeRuntime.idpPlayerBoardVisualUploadHelpers;
  const win = activeRuntime.context?.win || globalThis;
  activeRuntime.idpPlayerBoardVisualUploadHelpers = createSessionPlannerVisualUploadHelpers({
    getDocument: () => getDocument(activeRuntime),
    getFileReader: () => new win.FileReader(),
    getImage: () => new win.Image(),
  });
  return activeRuntime.idpPlayerBoardVisualUploadHelpers;
}

function createLocalState(activeRuntime = {}) {
  const uiState = getIdpPlayerBoardUiState(getIdpPlayerBoardRuntimeUi(activeRuntime));
  return Object.fromEntries(Object.entries(SESSION_TO_IDP_UI_KEYS).map(([sessionKey, idpKey]) => [
    sessionKey,
    uiState[idpKey],
  ]));
}

function setLocalState(activeRuntime = {}, patch = {}) {
  const storePatch = {};
  const localPatch = {};
  Object.entries(patch || {}).forEach(([sessionKey, value]) => {
    const idpKey = SESSION_TO_IDP_UI_KEYS[sessionKey];
    if (!idpKey) return;
    if (STORE_BACKED_IDP_PLAYER_BOARD_KEYS.has(idpKey)) {
      storePatch[idpKey] = value;
    } else {
      localPatch[idpKey] = value;
    }
  });
  if (Object.keys(localPatch).length) {
    Object.assign(getRuntimeLocalUi(activeRuntime), localPatch);
  }
  if (Object.keys(storePatch).length) {
    activeRuntime.store?.setState?.({ ui: storePatch });
  }
}

function closeTransientTacticalState(activeRuntime = {}) {
  Object.assign(getRuntimeLocalUi(activeRuntime), createTransientIdpPlayerBoardUi());
}

export function resetIdpPlayerBoardRuntimeDraft(activeRuntime = {}) {
  activeRuntime.idpPlayerBoardActiveBlock = null;
  activeRuntime.idpPlayerBoardActivePlayerId = "";
  activeRuntime.idpPlayerBoardDraftDetail = null;
  closeTransientTacticalState(activeRuntime);
}

function getDraftDetailForCurrentPlayer(activeRuntime = {}, detail = {}) {
  const draftDetail = activeRuntime.idpPlayerBoardDraftDetail;
  const playerId = detail?.profile?.playerId || "";
  if (!draftDetail?.profile?.playerId || draftDetail.profile.playerId !== playerId) {
    if (draftDetail?.profile?.playerId && draftDetail.profile.playerId !== playerId) {
      activeRuntime.idpPlayerBoardDraftDetail = null;
    }
    return null;
  }
  return draftDetail;
}

function getActiveBlockCacheKey(activeRuntime = {}, playerId = "") {
  const ui = getIdpPlayerBoardUiState(getIdpPlayerBoardRuntimeUi(activeRuntime));
  return `${playerId || ""}:${ui.idpPlayerBoardSelectedInterventionId || ""}`;
}

function persistBlockToDetail(activeRuntime = {}, block = null, options = {}) {
  const state = activeRuntime.store?.getState?.() || {};
  const storeDetail = state.playerDetail || {};
  const detail = getDraftDetailForCurrentPlayer(activeRuntime, storeDetail) || storeDetail;
  const syncStore = Boolean(options?.syncStore);
  if (!detail?.profile?.playerId) return null;
  const sourceBlock = block || activeRuntime.idpPlayerBoardActiveBlock || buildIdpPlayerBoardBlock(detail);
  const boardState = createBoardStateFromBlock(sourceBlock);
  const nextIntervention = {
    id: sourceBlock.interventionId || sourceBlock.id || "draft-idp-player-board",
    rowVersion: normalizePositiveInteger(sourceBlock.rowVersion, sourceBlock.interventionId ? 1 : 0),
    playerId: sourceBlock.playerId || detail.profile.playerId,
    focusId: sourceBlock.focusId || detail.focuses?.[0]?.id || "",
    title: sourceBlock.title || detail.focuses?.[0]?.title || "IDP Player Board",
    objective: sourceBlock.objective || "",
    coachingCue: sourceBlock.coachingCue || "",
    successCriteria: Array.isArray(sourceBlock.successCriteria) ? sourceBlock.successCriteria : [],
    pitchMode: sourceBlock.tacticalPitchMode || boardState.tacticalPitchMode,
    boardState,
    status: sourceBlock.status || "active",
    updatedAt: new Date().toISOString(),
  };
  const interventions = Array.isArray(detail.interventions) ? detail.interventions : [];
  const index = interventions.findIndex((item) => item.id && item.id === nextIntervention.id);
  const nextInterventions = index >= 0
    ? interventions.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextIntervention } : item)
    : [nextIntervention, ...interventions];
  const nextDetail = {
    ...detail,
    interventions: nextInterventions,
  };
  const nextBlock = buildIdpPlayerBoardBlock(nextDetail, { intervention: nextIntervention });
  Object.assign(sourceBlock, nextBlock);
  activeRuntime.idpPlayerBoardActiveBlock = sourceBlock;
  activeRuntime.idpPlayerBoardActivePlayerId = getActiveBlockCacheKey(
    activeRuntime,
    nextDetail.profile?.playerId || ""
  );
  activeRuntime.idpPlayerBoardDraftDetail = nextDetail;
  if (syncStore) {
    activeRuntime.store?.setState?.({ playerDetail: nextDetail });
  }
  return activeRuntime.idpPlayerBoardActiveBlock;
}

function getCurrentBlock(activeRuntime = {}) {
  const storeDetail = activeRuntime.store?.getState?.()?.playerDetail || {};
  const detail = getDraftDetailForCurrentPlayer(activeRuntime, storeDetail) || storeDetail;
  const ui = getIdpPlayerBoardUiState(getIdpPlayerBoardRuntimeUi(activeRuntime));
  const selectedInterventionId = ui.idpPlayerBoardSelectedInterventionId || "";
  const cacheKey = getActiveBlockCacheKey(activeRuntime, detail.profile?.playerId || "");
  if (!activeRuntime.idpPlayerBoardActiveBlock || activeRuntime.idpPlayerBoardActivePlayerId !== cacheKey) {
    activeRuntime.idpPlayerBoardActiveBlock = buildIdpPlayerBoardBlock(detail, { selectedInterventionId });
    activeRuntime.idpPlayerBoardActivePlayerId = cacheKey;
  }
  return activeRuntime.idpPlayerBoardActiveBlock;
}

function renderWorkspace(activeRuntime = {}) {
  const ui = getIdpPlayerBoardRuntimeUi(activeRuntime);
  if (ui.idpPlayerBoardOpen && activeRuntime.idpPlayerBoardActiveBlock?.playerId) {
    persistBlockToDetail(activeRuntime, activeRuntime.idpPlayerBoardActiveBlock, { syncStore: true });
    return;
  }
  activeRuntime.paint?.(activeRuntime);
}

function getController(activeRuntime = {}) {
  if (activeRuntime.idpPlayerBoardController) return activeRuntime.idpPlayerBoardController;
  activeRuntime.idpPlayerBoardController = createSessionPlannerTacticalController({
    canEditSessionPlanner: () => canEdit(activeRuntime),
    clamp,
    cloneSessionPlannerTacticalElement: idpPlayerBoardHelpers.cloneTacticalElement,
    createSessionPlannerLineElement: (...args) => idpPlayerBoardHelpers.createLineElement(...args),
    createSessionPlannerStableId: idpPlayerBoardHelpers.createStableId,
    getDefaultTacticalColor: idpPlayerBoardHelpers.getDefaultTacticalColor,
    getDefaultTacticalLineStyle: idpPlayerBoardHelpers.getDefaultTacticalLineStyle,
    getSessionPlannerSelectedBlock: () => getCurrentBlock(activeRuntime),
    getSessionPlannerTacticalEndpointCoordinates: (element = {}) =>
      getTacticalBoardElementEndpointCoordinates(element, {
        clamp,
        getCurveControlPoint: idpPlayerBoardHelpers.getTacticalCurveControlPoint,
      }),
    isSessionPlannerTacticalGoalType: idpPlayerBoardHelpers.isTacticalGoalType,
    isSessionPlannerTacticalPlayerType: idpPlayerBoardHelpers.isTacticalPlayerType,
    markSessionPlannerBlockFieldsUpdated: () => {},
    normalizeSessionPlannerTacticalPitchMode: idpPlayerBoardHelpers.normalizeTacticalPitchMode,
    normalizeSessionPlannerTacticalPlayerBadge: idpPlayerBoardHelpers.normalizeTacticalPlayerBadge,
    normalizeTacticalColor: idpPlayerBoardHelpers.normalizeTacticalColor,
    normalizeTacticalLineStyle: idpPlayerBoardHelpers.normalizeTacticalLineStyle,
    normalizeTacticalLineWidth: idpPlayerBoardHelpers.normalizeTacticalLineWidth,
    normalizeTacticalRotation: idpPlayerBoardHelpers.normalizeTacticalRotation,
    persistSessionPlannerTacticalElements: (block) =>
      persistBlockToDetail(activeRuntime, block, { syncStore: true }),
    renderSessionPlannerExerciseVisual: (block, options = {}) =>
      renderIdpPlayerBoardExerciseVisual(block, getIdpPlayerBoardRuntimeUi(activeRuntime), options),
    renderSessionPlannerWorkspace: () => renderWorkspace(activeRuntime),
    sessionPlannerTacticalSnapStep: 2.5,
    showSessionPlannerToast: (message = "") => {
      if (message) activeRuntime.store?.setState?.({ ui: { message } });
    },
    ui: {
      get sessionPlannerWorkspace() {
        return getRoot(activeRuntime);
      },
    },
    undoSessionPlannerBoardHistory: () => {},
    win: activeRuntime.context?.win || globalThis,
    writeSessionPlannerState: () => persistBlockToDetail(activeRuntime),
    getLocalState: () => createLocalState(activeRuntime),
    setLocalState: (patch) => setLocalState(activeRuntime, patch),
  });
  return activeRuntime.idpPlayerBoardController;
}

function syncActiveFrame(block = null) {
  if (!block) return [];
  const frames = idpPlayerBoardHelpers.normalizeTacticalFrames(block.tacticalFrames);
  const activeFrameId = idpPlayerBoardHelpers.normalizeTacticalActiveFrameId(block.tacticalActiveFrameId, frames);
  const activeFrame = frames.find((frame) => frame.id === activeFrameId);
  if (activeFrame) {
    activeFrame.elements = Array.isArray(block.tacticalElements)
      ? block.tacticalElements.map(idpPlayerBoardHelpers.cloneTacticalElement)
      : [];
  }
  block.tacticalFrames = frames;
  block.tacticalActiveFrameId = activeFrame?.id || frames[0]?.id || "";
  return frames;
}

function commitFrames(activeRuntime = {}, frames = [], activeFrameId = "") {
  const block = getCurrentBlock(activeRuntime);
  const normalizedFrames = idpPlayerBoardHelpers.normalizeTacticalFrames(frames);
  if (!block || !normalizedFrames.length) return;
  const nextActiveFrameId = idpPlayerBoardHelpers.normalizeTacticalActiveFrameId(activeFrameId, normalizedFrames);
  const activeFrame = normalizedFrames.find((frame) => frame.id === nextActiveFrameId) || normalizedFrames[0];
  block.tacticalFrames = normalizedFrames;
  block.tacticalActiveFrameId = activeFrame.id;
  block.tacticalElements = activeFrame.elements.map(idpPlayerBoardHelpers.cloneTacticalElement);
  closeTransientTacticalState(activeRuntime);
  persistBlockToDetail(activeRuntime, block);
  getController(activeRuntime).refreshSessionPlannerTacticalboardCanvas();
}

function addFrame(activeRuntime = {}) {
  if (!canEdit(activeRuntime)) return;
  const block = getCurrentBlock(activeRuntime);
  const frames = syncActiveFrame(block);
  if (frames.length >= 8) return;
  const nextFrame = idpPlayerBoardHelpers.cloneTacticalFrame({
    label: `Frame ${frames.length + 1}`,
    elements: block.tacticalElements,
  }, frames.length);
  commitFrames(activeRuntime, [...frames, nextFrame], nextFrame.id);
}

function selectFrame(activeRuntime = {}, frameId = "") {
  if (!canEdit(activeRuntime)) return;
  const block = getCurrentBlock(activeRuntime);
  const frames = syncActiveFrame(block);
  const targetFrame = frames.find((frame) => frame.id === frameId);
  if (!targetFrame || targetFrame.id === block.tacticalActiveFrameId) return;
  commitFrames(activeRuntime, frames, targetFrame.id);
}

function duplicateFrame(activeRuntime = {}) {
  if (!canEdit(activeRuntime)) return;
  const block = getCurrentBlock(activeRuntime);
  const frames = syncActiveFrame(block);
  if (frames.length >= 8) return;
  const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === block.tacticalActiveFrameId));
  const sourceFrame = frames[activeIndex] || frames[0];
  const duplicate = idpPlayerBoardHelpers.cloneTacticalFrame({
    label: `Frame ${frames.length + 1}`,
    elements: sourceFrame.elements,
  }, frames.length);
  const nextFrames = [...frames];
  nextFrames.splice(activeIndex + 1, 0, duplicate);
  commitFrames(activeRuntime, nextFrames, duplicate.id);
}

function deleteFrame(activeRuntime = {}) {
  if (!canEdit(activeRuntime)) return;
  const block = getCurrentBlock(activeRuntime);
  const frames = syncActiveFrame(block);
  if (frames.length <= 1) return;
  const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === block.tacticalActiveFrameId));
  const nextFrames = frames.filter((frame) => frame.id !== block.tacticalActiveFrameId);
  const nextFrame = nextFrames[Math.min(activeIndex, nextFrames.length - 1)] || nextFrames[0];
  commitFrames(activeRuntime, nextFrames, nextFrame.id);
}

function setBoardOpen(activeRuntime = {}, isOpen = false) {
  if (isOpen) {
    activeRuntime.idpPlayerBoardActiveBlock = getCurrentBlock(activeRuntime);
  }
  closeTransientTacticalState(activeRuntime);
  activeRuntime.store?.setState?.({
    ui: {
      idpPlayerBoardOpen: Boolean(isOpen),
      idpPlayerBoardPreviewOpen: false,
    },
  });
}

function setPreviewOpen(activeRuntime = {}, isOpen = false) {
  closeTransientTacticalState(activeRuntime);
  activeRuntime.store?.setState?.({
    ui: {
      idpPlayerBoardPreviewOpen: Boolean(isOpen),
      idpPlayerBoardOpen: false,
    },
  });
}

function selectExercise(activeRuntime = {}, interventionId = "") {
  closeTransientTacticalState(activeRuntime);
  activeRuntime.idpPlayerBoardActiveBlock = null;
  activeRuntime.idpPlayerBoardActivePlayerId = "";
  activeRuntime.store?.setState?.({
    ui: {
      idpPlayerBoardSelectedInterventionId: interventionId || "",
      idpPlayerBoardPreviewOpen: false,
      idpPlayerBoardOpen: false,
    },
  });
}

function startNewExercise(activeRuntime = {}) {
  const storeDetail = activeRuntime.store?.getState?.()?.playerDetail || {};
  closeTransientTacticalState(activeRuntime);
  activeRuntime.idpPlayerBoardActiveBlock = buildIdpPlayerBoardBlock(storeDetail, {
    selectedInterventionId: IDP_PLAYER_BOARD_NEW_EXERCISE_ID,
  });
  activeRuntime.idpPlayerBoardActivePlayerId = `${storeDetail.profile?.playerId || ""}:${IDP_PLAYER_BOARD_NEW_EXERCISE_ID}`;
  activeRuntime.store?.setState?.({
    ui: {
      idpPlayerBoardSelectedInterventionId: IDP_PLAYER_BOARD_NEW_EXERCISE_ID,
      idpPlayerBoardPreviewOpen: false,
      idpPlayerBoardOpen: true,
    },
  });
}

export function persistIdpPlayerBoardDraft(activeRuntime = {}) {
  const block = persistBlockToDetail(activeRuntime, getCurrentBlock(activeRuntime), { syncStore: true }) || getCurrentBlock(activeRuntime);
  return blockToInterventionPatch(block);
}

function updateExerciseField(activeRuntime = {}, field = "", value = "") {
  const block = getCurrentBlock(activeRuntime);
  if (!block || !["title", "objective"].includes(field)) return;
  const maxLength = field === "title" ? 180 : 1200;
  block[field] = String(value ?? "").slice(0, maxLength);
  persistBlockToDetail(activeRuntime, block);
  if (field === "title") {
    const heading = getRoot(activeRuntime)?.querySelector?.(".session-library-modal-head h2");
    if (heading) heading.textContent = block.title.trim() || "Individual exercise";
  }
}

function saveCurrentExercise(activeRuntime = {}) {
  const payload = persistIdpPlayerBoardDraft(activeRuntime);
  activeRuntime.runAction?.(async () => {
    await activeRuntime.actions.savePlayerBoard(payload);
    resetIdpPlayerBoardRuntimeDraft(activeRuntime);
  });
}

async function handleVisualUpload(activeRuntime = {}, file = null) {
  if (!file || !canEdit(activeRuntime)) return;
  const block = getCurrentBlock(activeRuntime);
  if (!block?.focusId) return;
  const previousVisualImage = block.visualImage || "";
  try {
    const visualImage = await getVisualUploadHelpers(activeRuntime).normalizeVisualUpload(file);
    const targetBlock = getCurrentBlock(activeRuntime);
    targetBlock.visualImage = visualImage;
    persistBlockToDetail(activeRuntime, targetBlock, { syncStore: true });
    renderWorkspace(activeRuntime);
    activeRuntime.store?.setState?.({ ui: { message: "Board image uploaded." } });
  } catch {
    const targetBlock = getCurrentBlock(activeRuntime);
    targetBlock.visualImage = previousVisualImage;
    persistBlockToDetail(activeRuntime, targetBlock, { syncStore: true });
    activeRuntime.store?.setState?.({ ui: { error: "The image could not be uploaded." } });
  }
}

export function handleIdpPlayerBoardInput(event, activeRuntime = {}) {
  const target = event?.target;
  const titleField = target?.closest?.("[data-idp-board-title]");
  if (titleField) {
    updateExerciseField(activeRuntime, "title", titleField.value);
    return true;
  }
  const objectiveField = target?.closest?.("[data-idp-board-objective]");
  if (objectiveField) {
    updateExerciseField(activeRuntime, "objective", objectiveField.value);
    return true;
  }
  const controller = getController(activeRuntime);
  const colorField = target?.closest?.("[data-session-tactical-color]");
  if (colorField) {
    const nextColor = idpPlayerBoardHelpers.normalizeTacticalColor(colorField.value);
    setLocalState(activeRuntime, { sessionPlannerTacticalColor: nextColor });
    if (controller.getSessionPlannerTacticalSelectedElementIds().length) {
      controller.updateSelectedSessionPlannerTacticalElement({ color: nextColor });
    }
    return true;
  }
  const widthField = target?.closest?.("[data-session-tactical-width]");
  if (widthField) {
    const nextWidth = idpPlayerBoardHelpers.normalizeTacticalLineWidth(widthField.value);
    setLocalState(activeRuntime, { sessionPlannerTacticalLineWidth: nextWidth });
    if (controller.getSelectedSessionPlannerTacticalElements().some(controller.isSessionPlannerTacticalStrokeElement)) {
      controller.updateSelectedSessionPlannerTacticalElement({ lineWidth: nextWidth });
    }
    return true;
  }
  const styleField = target?.closest?.("[data-session-tactical-style]");
  if (styleField) {
    controller.updateSessionPlannerTacticalLineStyle(styleField.value);
    return true;
  }
  return false;
}

export function handleIdpPlayerBoardChange(event, activeRuntime = {}) {
  const target = event?.target;
  const controller = getController(activeRuntime);
  const visualUploadField = target?.closest?.("[data-session-upload-visual]");
  if (visualUploadField) {
    const file = visualUploadField.files?.[0] || null;
    visualUploadField.value = "";
    if (file) {
      activeRuntime.runAction?.(() => handleVisualUpload(activeRuntime, file));
    }
    return true;
  }
  const pitchModeField = target?.closest?.("[data-session-tactical-pitch-mode]");
  if (pitchModeField) {
    controller.setSessionPlannerTacticalPitchMode(pitchModeField.value);
    return true;
  }
  const styleField = target?.closest?.("[data-session-tactical-style]");
  if (styleField) {
    controller.updateSessionPlannerTacticalLineStyle(styleField.value);
    return true;
  }
  return false;
}

export function handleIdpPlayerBoardClick(event, activeRuntime = {}) {
  const target = event?.target;
  const controller = getController(activeRuntime);
  const callIfClosest = (selector, callback) => {
    const element = target?.closest?.(selector);
    if (!element) return false;
    event?.preventDefault?.();
    callback(element);
    return true;
  };
  if (target?.matches?.("[data-session-visual-preview-overlay]")) {
    setPreviewOpen(activeRuntime, false);
    return true;
  }
  if (target?.matches?.("[data-session-tacticalboard-overlay]")) {
    setBoardOpen(activeRuntime, false);
    return true;
  }
  if (callIfClosest("[data-idp-board-preview], [data-session-preview-visual]", () => setPreviewOpen(activeRuntime, true))) return true;
  if (callIfClosest("[data-session-close-visual-preview]", () => setPreviewOpen(activeRuntime, false))) return true;
  if (callIfClosest("[data-idp-board-new]", () => startNewExercise(activeRuntime))) return true;
  if (callIfClosest("[data-idp-board-select]", (el) => selectExercise(activeRuntime, el.dataset.idpBoardSelect || ""))) return true;
  if (callIfClosest("[data-idp-board-open], [data-session-open-tacticalboard]", () => setBoardOpen(activeRuntime, true))) return true;
  if (callIfClosest("[data-session-close-tacticalboard]", () => setBoardOpen(activeRuntime, false))) return true;
  if (callIfClosest("[data-idp-board-save]", () => saveCurrentExercise(activeRuntime))) return true;
  if (callIfClosest("[data-session-tactical-number]", (el) => controller.updateSessionPlannerTacticalPlayerNumber(el.dataset.sessionTacticalNumberElement, el.dataset.sessionTacticalNumber))) return true;
  if (callIfClosest("[data-session-tactical-frame]", (el) => selectFrame(activeRuntime, el.dataset.sessionTacticalFrame))) return true;
  if (callIfClosest("[data-session-add-tactical-frame]", () => addFrame(activeRuntime))) return true;
  if (callIfClosest("[data-session-duplicate-tactical-frame]", () => duplicateFrame(activeRuntime))) return true;
  if (callIfClosest("[data-session-delete-tactical-frame]", () => deleteFrame(activeRuntime))) return true;
  if (callIfClosest("[data-session-arrange-tactical]", (el) => controller.arrangeSelectedSessionPlannerTacticalElements(el.dataset.sessionArrangeTactical))) return true;
  if (callIfClosest("[data-session-tactical-color-choice]", (el) => {
    const nextColor = idpPlayerBoardHelpers.normalizeTacticalColor(el.dataset.sessionTacticalColorChoice, createLocalState(activeRuntime).sessionPlannerTacticalColor);
    setLocalState(activeRuntime, { sessionPlannerTacticalColor: nextColor });
    if (controller.getSessionPlannerTacticalSelectedElementIds().length) {
      controller.updateSelectedSessionPlannerTacticalElement({ color: nextColor });
    }
    renderWorkspace(activeRuntime);
  })) return true;
  if (callIfClosest("[data-session-tactical-tool]", (el) => controller.setSessionPlannerTacticalTool(el.dataset.sessionTacticalTool))) return true;
  if (callIfClosest("[data-session-clear-board]", () => controller.clearSelectedSessionPlannerTacticalBoard())) return true;
  if (callIfClosest("[data-session-undo-board]", () => controller.undoSelectedSessionPlannerTacticalBoardAction())) return true;
  if (callIfClosest("[data-session-redo-board]", () => {})) return true;
  if (callIfClosest("[data-session-copy-tactical-selected]", () => controller.copySelectedSessionPlannerTacticalElements())) return true;
  if (callIfClosest("[data-session-paste-tactical-clipboard]", () => controller.pasteSessionPlannerTacticalClipboard())) return true;
  if (callIfClosest("[data-session-delete-tactical-selected]", () => controller.removeSelectedSessionPlannerTacticalElement())) return true;
  if (callIfClosest("[data-session-tactical-canvas]", (el) => controller.handleSessionPlannerTacticalCanvasClick(event, el))) return true;
  return false;
}

export function handleIdpPlayerBoardKeydown(event, activeRuntime = {}) {
  const ui = getIdpPlayerBoardRuntimeUi(activeRuntime);
  if (!ui.idpPlayerBoardOpen) return false;
  if (event?.target?.closest?.("input, textarea, select, [contenteditable='true']")) return false;
  const controller = getController(activeRuntime);
  const key = String(event?.key || "");
  const lowerKey = key.toLowerCase();
  if (key === "Escape") {
    event.preventDefault?.();
    closeTransientTacticalState(activeRuntime);
    controller.refreshSessionPlannerTacticalboardCanvas();
    return true;
  }
  if ((event.metaKey || event.ctrlKey) && lowerKey === "c" && controller.getSessionPlannerTacticalSelectedElementIds().length) {
    event.preventDefault?.();
    controller.copySelectedSessionPlannerTacticalElements();
    return true;
  }
  if ((event.metaKey || event.ctrlKey) && lowerKey === "v") {
    event.preventDefault?.();
    controller.pasteSessionPlannerTacticalClipboard();
    return true;
  }
  const badgeKey = idpPlayerBoardHelpers.getTacticalPlayerBadgeFromKeyboardEvent(event);
  if (badgeKey && controller.updateSelectedSessionPlannerTacticalPlayerBadges(badgeKey)) {
    event.preventDefault?.();
    return true;
  }
  if ((key === "Backspace" || key === "Delete") && (ui.idpPlayerBoardPendingPoint || controller.getSessionPlannerTacticalSelectedElementIds().length)) {
    event.preventDefault?.();
    if (ui.idpPlayerBoardPendingPoint) {
      setLocalState(activeRuntime, { sessionPlannerTacticalPendingPoint: null });
      controller.refreshSessionPlannerTacticalboardCanvas();
      return true;
    }
    controller.removeSelectedSessionPlannerTacticalElement();
    return true;
  }
  return false;
}

function handlePointerDown(event, activeRuntime = {}) {
  if (!activeRuntime.store?.getState?.()?.ui?.idpPlayerBoardOpen) return;
  getController(activeRuntime).startSessionPlannerTacticalDrag(event);
}

function handlePointerMove(event, activeRuntime = {}) {
  if (!activeRuntime.store?.getState?.()?.ui?.idpPlayerBoardOpen) return;
  getController(activeRuntime).updateSessionPlannerTacticalDrag(event);
}

function handlePointerUp(_event, activeRuntime = {}) {
  if (!activeRuntime.store?.getState?.()?.ui?.idpPlayerBoardOpen) return;
  const controller = getController(activeRuntime);
  const runtimeUi = getIdpPlayerBoardRuntimeUi(activeRuntime);
  const selection = runtimeUi.idpPlayerBoardSelectionState;
  if (selection?.startPoint && !selection.moved && controller.isSessionPlannerTacticalPlacementTool()) {
    setLocalState(activeRuntime, { sessionPlannerTacticalSelectionState: null });
    controller.setSessionPlannerTacticalClickSuppression(true);
    if (!controller.addSessionPlannerTacticalPlacementElement(selection.startPoint)) {
      controller.refreshSessionPlannerTacticalboardCanvas();
    }
    return;
  }
  controller.finishSessionPlannerTacticalDrag();
}

function handleDoubleClick(event, activeRuntime = {}) {
  if (!activeRuntime.store?.getState?.()?.ui?.idpPlayerBoardOpen) return;
  const canvas = event?.target?.closest?.("[data-session-tactical-canvas]");
  if (!canvas) return;
  getController(activeRuntime).handleSessionPlannerTacticalCanvasDoubleClick(event, canvas);
}

export function bindIdpPlayerBoardEvents(activeRuntime = {}) {
  const root = getRoot(activeRuntime);
  const win = activeRuntime.context?.win || globalThis;
  if (!root || root.__idpPlayerBoardEventsBound) return;
  const pointerDown = (event) => handlePointerDown(event, activeRuntime);
  const pointerMove = (event) => handlePointerMove(event, activeRuntime);
  const pointerUp = (event) => handlePointerUp(event, activeRuntime);
  const doubleClick = (event) => handleDoubleClick(event, activeRuntime);
  const keydown = (event) => handleIdpPlayerBoardKeydown(event, activeRuntime);
  root.addEventListener?.("pointerdown", pointerDown);
  root.addEventListener?.("dblclick", doubleClick);
  win.addEventListener?.("pointermove", pointerMove);
  win.addEventListener?.("pointerup", pointerUp);
  win.addEventListener?.("keydown", keydown, true);
  root.__idpPlayerBoardEventsBound = true;
  root.__idpPlayerBoardUnbind = () => {
    root.removeEventListener?.("pointerdown", pointerDown);
    root.removeEventListener?.("dblclick", doubleClick);
    win.removeEventListener?.("pointermove", pointerMove);
    win.removeEventListener?.("pointerup", pointerUp);
    win.removeEventListener?.("keydown", keydown, true);
    root.__idpPlayerBoardEventsBound = false;
  };
}
