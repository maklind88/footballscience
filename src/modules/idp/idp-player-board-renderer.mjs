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

const exerciseBankPageSize = 3;

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
  const html = createIdpPlayerBoardVisualRenderer(block, ui).renderExerciseVisual(block, options);
  const objectCount = Array.isArray(block.tacticalElements) ? block.tacticalElements.length : 0;
  return html.replace(
    'class="session-visual-board',
    `data-idp-board-rendered-object-count="${objectCount}" class="session-visual-board`
  );
}

function renderFocusOverview(focus = {}, block = {}) {
  const hasFocus = Boolean(focus?.id || block.focusId);
  const title = hasFocus
    ? normalizeText(focus?.title || block.title, "Create current focus")
    : "Create a current focus first";
  const category = normalizeText(focus?.category, "IDP focus");
  const role = normalizeText(focus?.positionGroup || focus?.role, "Individual");
  const reviewDate = formatShortDate(focus?.reviewDate || focus?.review_date);
  const description = normalizeText(focus?.description, "");
  return `
    <section class="idp-player-board-focus-card" aria-label="Current IDP focus">
      <span>Current focus</span>
      <strong>${escapeHtml(title)}</strong>
      <div class="idp-player-board-focus-meta">
        <small>${escapeHtml(category)}</small>
        <small>${escapeHtml(role)}</small>
        <small>${escapeHtml(reviewDate)}</small>
      </div>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    </section>
  `;
}

function exerciseMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) return true;
  return [
    item.title,
    item.objective,
    item.coachingCue,
    item.status,
  ].some((value) => normalizeText(value).toLowerCase().includes(normalizedQuery));
}

function renderExerciseBank(interventions = [], block = {}, canEdit = false, uiState = {}) {
  const savedInterventions = interventions.filter((item) => {
    const itemId = normalizeText(item?.id);
    return Boolean(itemId && !itemId.startsWith("draft-") && !itemId.startsWith("legacy-"));
  });
  const searchQuery = normalizeText(uiState.idpPlayerBoardExerciseSearchQuery);
  const visibleCount = Math.max(
    exerciseBankPageSize,
    Number.isInteger(Number(uiState.idpPlayerBoardExerciseVisibleCount))
      ? Number(uiState.idpPlayerBoardExerciseVisibleCount)
      : exerciseBankPageSize
  );
  const filteredInterventions = savedInterventions.filter((item) => exerciseMatchesSearch(item, searchQuery));
  const visibleInterventions = filteredInterventions.slice(0, visibleCount);
  const hiddenCount = Math.max(0, filteredInterventions.length - visibleInterventions.length);
  const selectedId = block.interventionId || "";
  const hasDraftSelected = uiState.idpPlayerBoardSelectedInterventionId === IDP_PLAYER_BOARD_NEW_EXERCISE_ID;
  return `
    <section class="idp-player-board-exercise-bank" aria-label="Individual exercise bank">
      <div class="idp-player-board-bank-head">
        <div>
          <span>Exercise bank</span>
          <strong>${escapeHtml(String(savedInterventions.length))} saved exercises</strong>
        </div>
        <button type="button" data-idp-board-new ${canEdit ? "" : "disabled"}>New exercise</button>
      </div>
      <label class="idp-player-board-bank-search">
        <span>Search exercises</span>
        <input
          type="search"
          value="${escapeHtml(searchQuery)}"
          placeholder="Search by name, objective or status"
          data-idp-board-exercise-search
        >
      </label>
      <div class="idp-player-board-bank-list">
        ${hasDraftSelected ? `
          <button type="button" class="is-active" data-idp-board-select="${IDP_PLAYER_BOARD_NEW_EXERCISE_ID}">
            <span>Draft exercise</span>
            <small>Unsaved individual board</small>
          </button>
        ` : ""}
        ${filteredInterventions.length ? visibleInterventions.map((item, index) => {
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
            <span>${searchQuery ? "No exercises match your search." : "No saved exercises yet."}</span>
            <small>${searchQuery ? "Try another title, objective or status." : "Create the first individual exercise from the board."}</small>
          </div>
        `}
        ${hiddenCount ? `
          <button type="button" class="idp-player-board-bank-more" data-idp-board-load-more>
            <span>Load more exercises</span>
            <small>${escapeHtml(String(hiddenCount))} more available</small>
          </button>
        ` : ""}
      </div>
    </section>
  `;
}

function renderBoardStage(renderer, block = {}, hasBoardContent = false, canEdit = false) {
  return `
    <div class="idp-player-board-stage-head">
      <div>
        <span>${escapeHtml(block.isDraft ? "Draft exercise" : "Selected exercise")}</span>
        <strong>${escapeHtml(block.title || "IDP Player Board")}</strong>
      </div>
      <div class="idp-player-board-actions" aria-label="Board actions">
        <button type="button" data-idp-board-preview ${hasBoardContent ? "" : "disabled"}>Preview</button>
        <button type="button" data-idp-board-open ${canEdit ? "" : "disabled"}>Edit</button>
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
  const blockRowVersion = Number(block.rowVersion);
  const deleteButton = !block.isDraft && block.interventionId ? `
            <button
              type="button"
              class="idp-player-board-editor-delete"
              data-idp-board-delete="${escapeHtml(block.interventionId)}"
              data-idp-board-row-version="${escapeHtml(String(blockRowVersion > 0 ? blockRowVersion : 0))}"
              ${canEdit ? "" : "disabled"}
            >Delete exercise</button>
  ` : "";
  const closeButton = `<button type="button" class="session-library-close-button" data-session-close-tacticalboard aria-label="Close tacticalboard">Close</button>`;
  const details = `
        <section
          class="idp-player-board-editor-details"
          aria-label="Exercise details"
          data-idp-board-object-count="${Array.isArray(block.tacticalElements) ? block.tacticalElements.length : 0}"
        >
          <label>
            <span>Exercise name</span>
            <input
              type="text"
              value="${escapeHtml(block.title || "")}"
              maxlength="180"
              data-idp-board-title
              ${canEdit ? "" : "disabled"}
            />
          </label>
          <label>
            <span>Objective</span>
            <textarea
              maxlength="1200"
              rows="2"
              data-idp-board-objective
              ${canEdit ? "" : "disabled"}
            >${escapeHtml(block.objective || "")}</textarea>
          </label>
          <small>${block.focusId ? "Linked to the player's current IDP focus." : "Create a current focus before saving this exercise."}</small>
        </section>
  `;
  const actions = `
          <div class="idp-player-board-editor-actions">
            ${deleteButton}
            <button type="button" class="idp-player-board-editor-save" data-idp-board-save ${saveDisabled}>Save exercise</button>
            ${closeButton}
          </div>`;

  const closeButtonPattern = /<button\b[^>]*data-session-close-tacticalboard\b[^>]*>(?:.|[\r\n])*?<\/button>/;
  const withActions = closeButtonPattern.test(overlay)
    ? overlay.replace(closeButtonPattern, actions)
    : overlay.replace("</header>", `${actions}</header>`);
  return withActions.includes("idp-player-board-editor-details")
    ? withActions
    : withActions.replace("</header>", `</header>${details}`);
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
          </header>
          ${renderFocusOverview(focus, block)}
          ${renderExerciseBank(interventions, block, canEdit, uiState)}
        </aside>
        <div class="idp-player-board-visual-stack">
          <div class="idp-player-board-stage">
            ${renderBoardStage(renderer, block, hasBoardContent, canEdit)}
          </div>
        </div>
      </article>
      ${renderer.renderVisualPreviewOverlay(block)}
      ${renderIdpTacticalboardOverlay(renderer, block, canEdit)}
    </section>
  `;
}
