import { createSessionPlannerVisualRenderer } from "../session-planner/session-planner-visual-renderer.mjs";
import {
  activeIdpFocus,
  buildIdpPlayerBoardBlock,
  IDP_PLAYER_BOARD_NEW_EXERCISE_ID,
  getIdpPlayerBoardUiState,
  idpPlayerBoardHelpers,
  idpPlayerBoardPitchModeOptions,
  listIdpPlayerBoardInterventions,
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

function formatShortDate(value = "") {
  const source = normalizeText(value);
  if (!source) return "No date";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
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

function renderFocusOverview(focus = {}, block = {}) {
  const hasFocus = Boolean(focus?.id || block.focusId);
  const title = hasFocus
    ? normalizeText(focus?.title || block.title, "Create current focus")
    : "Create a current focus first";
  const category = normalizeText(focus?.category, "IDP focus");
  const role = normalizeText(focus?.positionGroup || focus?.role, "Individual");
  const reviewDate = formatShortDate(focus?.reviewDate || focus?.review_date);
  return `
    <section class="idp-player-board-focus-card" aria-label="Current IDP focus">
      <span>Current focus</span>
      <strong>${escapeHtml(title)}</strong>
      <div class="idp-player-board-focus-meta">
        <small>${escapeHtml(category)}</small>
        <small>${escapeHtml(role)}</small>
        <small>${escapeHtml(reviewDate)}</small>
      </div>
      ${block.objective ? `<p>${escapeHtml(block.objective)}</p>` : ""}
    </section>
  `;
}

function renderExerciseBank(interventions = [], block = {}, canEdit = false, selectedInterventionId = "") {
  const selectedId = block.interventionId || "";
  const hasDraftSelected = selectedInterventionId === IDP_PLAYER_BOARD_NEW_EXERCISE_ID;
  return `
    <section class="idp-player-board-exercise-bank" aria-label="Individual exercise bank">
      <div class="idp-player-board-bank-head">
        <div>
          <span>Exercise bank</span>
          <strong>${escapeHtml(String(interventions.length))} saved exercises</strong>
        </div>
        <button type="button" data-idp-board-new ${canEdit ? "" : "disabled"}>New exercise</button>
      </div>
      <div class="idp-player-board-bank-list">
        ${hasDraftSelected ? `
          <button type="button" class="is-active" data-idp-board-select="${IDP_PLAYER_BOARD_NEW_EXERCISE_ID}">
            <span>Draft exercise</span>
            <small>Unsaved individual board</small>
          </button>
        ` : ""}
        ${interventions.length ? interventions.map((item, index) => {
          const itemId = escapeHtml(item.id || "");
          const title = normalizeText(item.title, `Exercise ${index + 1}`);
          const objective = normalizeText(item.objective || item.coachingCue, "Individual intervention");
          const activeClass = item.id && item.id === selectedId ? " is-active" : "";
          const frameCount = Array.isArray(item.boardState?.tacticalFrames) ? item.boardState.tacticalFrames.length : 1;
          return `
            <button type="button" class="${activeClass.trim()}" data-idp-board-select="${itemId}">
              <span>${escapeHtml(title)}</span>
              <small>${escapeHtml(objective)}</small>
              <em>${escapeHtml(String(frameCount))} frame${frameCount === 1 ? "" : "s"}</em>
            </button>
          `;
        }).join("") : hasDraftSelected ? "" : `
          <div class="idp-player-board-bank-empty">
            <span>No saved exercises yet.</span>
            <small>Create the first individual exercise from the board.</small>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderBoardStage(renderer, block = {}, hasBoardContent = false) {
  const pitchLabel = idpPlayerBoardPitchModeOptions.find((item) => item.key === block.tacticalPitchMode)?.label || "Full pitch";
  const frameCount = Array.isArray(block.tacticalFrames) ? block.tacticalFrames.length : 1;
  const linkedClipCount = Array.isArray(block.boardState?.linkedClipIds) ? block.boardState.linkedClipIds.length : 0;
  return `
    <div class="idp-player-board-stage-head">
      <div>
        <span>${escapeHtml(block.isDraft ? "Draft exercise" : "Selected exercise")}</span>
        <strong>${escapeHtml(block.title || "IDP Player Board")}</strong>
      </div>
      <div class="idp-player-board-stage-meta" aria-label="Board metadata">
        <small>${escapeHtml(pitchLabel)}</small>
        <small>${escapeHtml(String(frameCount))} frame${frameCount === 1 ? "" : "s"}</small>
        <small>${escapeHtml(String(linkedClipCount))} clips</small>
      </div>
    </div>
    <div class="idp-player-board-pitch-preview${hasBoardContent ? " has-content" : " is-empty"}">
      ${renderer.renderExerciseVisual(block, { large: true })}
      ${hasBoardContent ? "" : `
        <div class="idp-player-board-preview-hint">
          <strong>Pitch ready</strong>
          <span>Open Edit to draw the individual exercise.</span>
        </div>
      `}
    </div>
  `;
}

function renderIdpTacticalboardOverlay(renderer, block = {}, canEdit = false) {
  const overlay = renderer.renderTacticalboardOverlay(block);
  if (!overlay) return "";
  const saveDisabled = !canEdit || !block.focusId ? "disabled" : "";
  const closeButton = `<button type="button" class="session-library-close-button" data-session-close-tacticalboard aria-label="Close tacticalboard">Close</button>`;
  const actions = `
          <div class="idp-player-board-editor-actions">
            <button type="button" class="idp-player-board-editor-save" data-idp-board-save ${saveDisabled}>Save exercise</button>
            ${closeButton}
          </div>`;
  return overlay.replace(closeButton, actions);
}

export function renderIdpPlayerBoardPage(detail = {}, canEdit = false, ui = {}) {
  const uiState = getIdpPlayerBoardUiState(ui);
  const interventions = listIdpPlayerBoardInterventions(detail);
  const block = buildIdpPlayerBoardBlock(detail, {
    selectedInterventionId: uiState.idpPlayerBoardSelectedInterventionId,
  });
  const renderer = createIdpPlayerBoardVisualRenderer(block, ui);
  const hasBoardContent = Array.isArray(block.tacticalElements) && block.tacticalElements.length;
  const focus = activeIdpFocus(detail) || {};
  return `
    <section class="idp-profile-subpage idp-profile-player-board-page">
      <article class="idp-player-board-panel">
        <aside class="idp-player-board-sidebar">
          <header class="idp-player-board-head">
            <span>Player Board</span>
            <strong>${escapeHtml(detail.profile?.playerName || "Player")}</strong>
            <small>Individual exercises, focus context and saved board drawings for this player's IDP.</small>
          </header>
          ${renderFocusOverview(focus, block)}
          ${renderExerciseBank(interventions, block, canEdit, uiState.idpPlayerBoardSelectedInterventionId)}
        </aside>
        <div class="idp-player-board-visual-stack">
          <div class="idp-player-board-stage">
            ${renderBoardStage(renderer, block, hasBoardContent)}
          </div>
          <div class="idp-player-board-actions">
            <button type="button" data-idp-board-preview ${hasBoardContent ? "" : "disabled"}>Preview</button>
            <button type="button" data-idp-board-open ${canEdit ? "" : "disabled"}>Edit</button>
          </div>
        </div>
      </article>
      ${renderer.renderVisualPreviewOverlay(block)}
      ${renderIdpTacticalboardOverlay(renderer, block, canEdit)}
    </section>
  `;
}
