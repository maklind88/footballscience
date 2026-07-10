import { createSessionPlannerVisualRenderer } from "../session-planner/session-planner-visual-renderer.mjs";
import {
  buildIdpPlayerBoardBlock,
  getIdpPlayerBoardUiState,
  idpPlayerBoardHelpers,
  idpPlayerBoardPitchModeOptions,
} from "./idp-player-board-helpers.mjs";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function getRendererState(ui = {}) {
  const state = getIdpPlayerBoardUiState(ui);
  return {
    visualPreviewOpen: state.idpPlayerBoardPreviewOpen,
    tacticalboardOpen: state.idpPlayerBoardOpen,
    tool: state.idpPlayerBoardTool,
    color: state.idpPlayerBoardColor,
    lineWidth: state.idpPlayerBoardLineWidth,
    lineStyle: state.idpPlayerBoardLineStyle,
    pendingPoint: state.idpPlayerBoardPendingPoint,
    selectedElementId: state.idpPlayerBoardSelectedElementId,
    selectedElementIds: state.idpPlayerBoardSelectedElementIds,
    numberPickerElementId: state.idpPlayerBoardNumberPickerElementId,
    draftLineState: state.idpPlayerBoardDraftLineState,
    freehandState: state.idpPlayerBoardFreehandState,
    selectionState: state.idpPlayerBoardSelectionState,
  };
}

export function createIdpPlayerBoardVisualRenderer(block = {}, ui = {}) {
  return createSessionPlannerVisualRenderer({
    escapeHtml,
    getState: () => getRendererState(ui),
    getPitchModeOptions: () => idpPlayerBoardPitchModeOptions,
    normalizeTacticalPitchMode: idpPlayerBoardHelpers.normalizeTacticalPitchMode,
    getTacticalPitchModeOption: idpPlayerBoardHelpers.getTacticalPitchModeOption,
    isTacticalElementSelected: (elementId) => {
      const state = getIdpPlayerBoardUiState(ui);
      return state.idpPlayerBoardSelectedElementIds.includes(elementId)
        || state.idpPlayerBoardSelectedElementId === elementId;
    },
    isTacticalPlayerType: idpPlayerBoardHelpers.isTacticalPlayerType,
    normalizeTacticalColor: idpPlayerBoardHelpers.normalizeTacticalColor,
    getDefaultTacticalColor: idpPlayerBoardHelpers.getDefaultTacticalColor,
    getTacticalRenderStrokeWidth: idpPlayerBoardHelpers.getTacticalRenderStrokeWidth,
    getTacticalStrokeDasharray: idpPlayerBoardHelpers.getTacticalStrokeDasharray,
    getDefaultTacticalLineStyle: idpPlayerBoardHelpers.getDefaultTacticalLineStyle,
    getTacticalDefaultCurveControlPoint: idpPlayerBoardHelpers.getTacticalDefaultCurveControlPoint,
    getTacticalCurveControlPoint: idpPlayerBoardHelpers.getTacticalCurveControlPoint,
    isTacticalGoalType: idpPlayerBoardHelpers.isTacticalGoalType,
    normalizeTacticalRotation: idpPlayerBoardHelpers.normalizeTacticalRotation,
    normalizeTacticalPlayerBadge: idpPlayerBoardHelpers.normalizeTacticalPlayerBadge,
    getTacticalPitchDimensionsForBlock: idpPlayerBoardHelpers.getTacticalPitchDimensionsForBlock,
    cloneTacticalElement: idpPlayerBoardHelpers.cloneTacticalElement,
    createLineElement: idpPlayerBoardHelpers.createLineElement,
    ensureTacticalFrames: () => Array.isArray(block.tacticalFrames) ? block.tacticalFrames : [],
    getTacticalActiveFrameId: () => block.tacticalActiveFrameId || block.tacticalFrames?.[0]?.id || "",
    getTacticalSelectedElementIds: () => getIdpPlayerBoardUiState(ui).idpPlayerBoardSelectedElementIds,
    getTacticalNumberPickerElementId: () => getIdpPlayerBoardUiState(ui).idpPlayerBoardNumberPickerElementId,
    clearTacticalNumberPickerElementId: () => {},
  });
}

export function renderIdpPlayerBoardExerciseVisual(block = {}, ui = {}, options = {}) {
  return createIdpPlayerBoardVisualRenderer(block, ui).renderExerciseVisual(block, options);
}

function renderPlayerBoardEmpty(block = {}, canEdit = false) {
  const focusReady = Boolean(block.focusId);
  return `
    <div class="idp-player-board-empty">
      <strong>${focusReady ? "No saved Player Board yet" : "Create a current focus first"}</strong>
      <span>${focusReady
        ? "Open the board, draw the exercise and save it to this player's current IDP focus."
        : "Player Board saves against the player's active focus, so the board and development priority speak the same language."}</span>
      ${canEdit && focusReady ? `<button type="button" data-idp-board-open>Edit board</button>` : ""}
    </div>
  `;
}

export function renderIdpPlayerBoardPage(detail = {}, canEdit = false, ui = {}) {
  const block = buildIdpPlayerBoardBlock(detail);
  const renderer = createIdpPlayerBoardVisualRenderer(block, ui);
  const hasBoardContent = Array.isArray(block.tacticalElements) && block.tacticalElements.length;
  const focusTitle = normalizeText(detail.focuses?.[0]?.title, "No active focus");
  const canOpenBoard = canEdit && Boolean(block.focusId);
  const saveDisabled = !canEdit || !block.focusId ? "disabled" : "";
  return `
    <section class="idp-profile-subpage idp-profile-player-board-page">
      <article class="idp-player-board-panel">
        <header class="idp-player-board-head">
          <div>
            <span>PLAYER BOARD</span>
            <small>${escapeHtml(focusTitle)}</small>
          </div>
          <div class="idp-player-board-actions">
            <button type="button" data-idp-board-preview ${hasBoardContent ? "" : "disabled"}>Preview</button>
            <button type="button" data-idp-board-open ${canOpenBoard ? "" : "disabled"}>Edit</button>
            <button type="button" class="is-primary" data-idp-board-save ${saveDisabled}>Save board</button>
          </div>
        </header>
        <div class="idp-player-board-stage">
          ${hasBoardContent
            ? renderer.renderExerciseVisual(block, { large: true })
            : renderPlayerBoardEmpty(block, canEdit)}
        </div>
      </article>
      ${renderer.renderVisualPreviewOverlay(block)}
      ${renderer.renderTacticalboardOverlay(block)}
    </section>
  `;
}
