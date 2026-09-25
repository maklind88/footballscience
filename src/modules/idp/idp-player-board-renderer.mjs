import { createSessionPlannerVisualRenderer } from "../session-planner/session-planner-visual-renderer.mjs";
import { renderFocusSelect } from "./idp-focus-controls.mjs";
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
    : "No current focus";
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

function renderExerciseEntry(item, block, canEdit, uiState, detail, { draft = false, index = 0 } = {}) {
  const id = draft ? IDP_PLAYER_BOARD_NEW_EXERCISE_ID : item.id;
  const selected = draft
    ? uiState.idpPlayerBoardSelectedInterventionId === id
    : block.interventionId === id;
  const editing = selected && canEdit && uiState.idpPlayerBoardEditingInterventionId === id;
  const title = draft ? "Draft exercise" : normalizeText(item.title, `Exercise ${index + 1}`);
  const objective = draft ? "Unsaved individual board" : normalizeText(item.objective || item.coachingCue, "Individual intervention");
  const frameCount = Array.isArray(item.boardState?.tacticalFrames) ? item.boardState.tacticalFrames.length : 1;
  return `
    <article class="idp-exercise-entry${selected ? " is-active" : ""}">
      <div class="idp-exercise-entry-head">
        <button type="button" aria-pressed="${selected}" data-idp-board-select="${escapeHtml(id)}">
          <span>${escapeHtml(title)}</span>
          <small>${escapeHtml(objective)}</small>
          ${draft ? "" : `<em>${frameCount} frame${frameCount === 1 ? "" : "s"}</em>`}
        </button>
        ${canEdit ? `<div class="idp-exercise-entry-actions">
          <button type="button" data-idp-board-edit-details="${escapeHtml(id)}" aria-expanded="${editing}" aria-label="Edit exercise: ${escapeHtml(title)}" title="Edit exercise">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5L16 3Zm-2 2 5 5"/></svg>
          </button>
          ${draft ? "" : `<button type="button" data-idp-board-delete="${escapeHtml(id)}" data-idp-board-row-version="${escapeHtml(String(item.rowVersion || 0))}" aria-label="Delete exercise: ${escapeHtml(title)}" title="Delete exercise">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>
          </button>`}
        </div>` : ""}
      </div>
      ${editing ? `<section class="idp-exercise-link-details" aria-label="Edit exercise">
        <label><span>Exercise name</span><input data-idp-board-title maxlength="180" value="${escapeHtml(block.title)}"></label>
        <label><span>Objective</span><textarea data-idp-board-objective maxlength="1200">${escapeHtml(block.objective)}</textarea></label>
        ${renderFocusSelect(detail, block.focusId, { attribute: "data-idp-board-focus" })}
        <button type="button" data-idp-board-save>Save exercise</button>
      </section>` : ""}
    </article>
  `;
}

function renderExerciseBank(interventions = [], block = {}, canEdit = false, uiState = {}, detail = {}) {
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
  const hasDraftSelected = uiState.idpPlayerBoardSelectedInterventionId === IDP_PLAYER_BOARD_NEW_EXERCISE_ID;
  return `
    <section class="idp-player-board-exercise-bank" aria-label="Individual exercise bank">
      <div class="idp-player-board-bank-head">
        <div>
          <span>Exercise bank</span>
          <strong>${escapeHtml(String(savedInterventions.length))} saved exercise${savedInterventions.length === 1 ? "" : "s"}</strong>
        </div>
        <button type="button" data-idp-board-new ${canEdit ? "" : "disabled"}>New exercise</button>
      </div>
      <label class="idp-player-board-bank-search">
        <span>Search exercises</span>
        <input
          type="search"
          value="${escapeHtml(searchQuery)}"
          placeholder="Search exercises"
          data-idp-board-exercise-search
        >
      </label>
      <div class="idp-player-board-bank-list">
        ${hasDraftSelected ? renderExerciseEntry({}, block, canEdit, uiState, detail, { draft: true }) : ""}
        ${filteredInterventions.length ? visibleInterventions.map((item, index) =>
          renderExerciseEntry(item, block, canEdit, uiState, detail, { index })
        ).join("") : hasDraftSelected ? "" : `
          <div class="idp-player-board-bank-empty">
            <span>${searchQuery ? "No exercises match your search." : "No saved exercises yet."}</span>
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

function renderBoardStage(renderer, block = {}, hasBoardContent = false, canEdit = false, playerName = "") {
  return `
    <div class="idp-player-board-stage-head">
      <div>
        <span>Player Board</span>
        <strong>${escapeHtml(normalizeText(playerName, "Player"))}</strong>
      </div>
      <div class="idp-player-board-actions" aria-label="Board actions">
        <button type="button" data-idp-board-preview ${hasBoardContent ? "" : "disabled"}>Preview</button>
        <button type="button" data-idp-board-open ${canEdit ? "" : "disabled"}>Edit</button>
      </div>
    </div>
    <div class="idp-player-board-pitch-preview${hasBoardContent ? " has-content" : " is-empty"}">
      ${renderer.renderExerciseVisual(block, { large: true })}
    </div>
  `;
}

function renderIdpTacticalboardOverlay(renderer, block = {}, canEdit = false, playerName = "") {
  const overlay = renderer.renderTacticalboardOverlay({ ...block, title: normalizeText(playerName, "Player") });
  if (!overlay) return "";
  const saveDisabled = !canEdit ? "disabled" : "";
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
  const actions = `
          <div class="idp-player-board-editor-actions">
            <label class="idp-player-board-editor-name">
              <span>Exercise name</span>
              <input type="text" data-idp-board-title value="${escapeHtml(block.title || "")}" maxlength="180" placeholder="Exercise name" ${canEdit ? "" : "readonly"}>
            </label>
            ${deleteButton}
            <button type="button" class="idp-player-board-editor-save" data-idp-board-save ${saveDisabled}>Save exercise</button>
            ${closeButton}
          </div>`;

  const closeButtonPattern = /<button\b[^>]*data-session-close-tacticalboard\b[^>]*>(?:.|[\r\n])*?<\/button>/;
  const withActions = closeButtonPattern.test(overlay)
    ? overlay.replace(closeButtonPattern, actions)
    : overlay.replace("</header>", `${actions}</header>`);
  return withActions;
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
          ${renderExerciseBank(interventions, block, canEdit, uiState, detail)}
          ${renderFocusOverview(focus, block)}
        </aside>
        <div class="idp-player-board-visual-stack">
          <div class="idp-player-board-stage">
            ${renderBoardStage(renderer, block, hasBoardContent, canEdit, detail.profile?.playerName)}
          </div>
        </div>
      </article>
      ${renderer.renderVisualPreviewOverlay(block)}
      ${renderIdpTacticalboardOverlay(renderer, block, canEdit, detail.profile?.playerName)}
    </section>
  `;
}
