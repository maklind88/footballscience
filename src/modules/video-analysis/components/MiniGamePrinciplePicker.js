import { miniGamePrinciplePickerGroups, miniGamePrinciplePickerIds } from "../constants/miniGamePrinciples.js";
import { resolveCurrentCodingTargetClip } from "../services/codingInteractionService.js";
import { clipMiniGamePrincipleIds, miniGamePrincipleLabel, uniqueMiniGamePrincipleIds } from "../services/miniGamePrincipleService.js";
import { escapeHtml } from "./renderHelpers.js";

const pickerPrincipleIds = new Set(miniGamePrinciplePickerIds);
const pickerPrinciples = miniGamePrinciplePickerGroups.flatMap((group) => (
  group.principles.map((principle) => ({ ...principle, groupId: group.id, groupLabel: group.label }))
));
const pickerPrincipleById = new Map(pickerPrinciples.map((principle) => [principle.id, principle]));

function pickerVisiblePrincipleIds(ids = []) {
  return uniqueMiniGamePrincipleIds(ids).filter((id) => pickerPrincipleIds.has(id));
}

function normalizeSearchText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function principleMatchesSearch(principle = {}, groupLabel = "", query = "") {
  if (!query) return true;
  return [principle.label, principle.id, groupLabel]
    .some((value) => String(value || "").toLowerCase().includes(query));
}

function activeSubPhaseLabel(state = {}, targetClip = null) {
  const captureSubPhase = String(state.codingSession?.miniGamePrincipleCapture?.subPhase || "").trim();
  if (captureSubPhase) return captureSubPhase;
  return String(targetClip?.subPhase || targetClip?.sub_phase || state.draft?.subPhase || "").trim();
}

function suggestedPrincipleIds(state = {}, targetClip = null) {
  const subPhase = activeSubPhaseLabel(state, targetClip);
  if (!subPhase) return [];
  const normalizedSubPhase = normalizeSearchText(subPhase);
  return pickerVisiblePrincipleIds((state.template?.links || [])
    .filter((link) => (
      normalizeSearchText(link.sourceValue) === normalizedSubPhase
      && ["miniGamePrincipleIds", "miniGamePrincipleId"].includes(link.targetType)
    ))
    .map((link) => link.targetValue));
}

function orderedPickerGroups(state = {}, targetClip = null) {
  const normalizedSubPhase = normalizeSearchText(activeSubPhaseLabel(state, targetClip));
  if (!normalizedSubPhase) return miniGamePrinciplePickerGroups;
  return [...miniGamePrinciplePickerGroups].sort((a, b) => {
    const aMatch = normalizeSearchText(a.label) === normalizedSubPhase ? 0 : 1;
    const bMatch = normalizeSearchText(b.label) === normalizedSubPhase ? 0 : 1;
    return aMatch - bMatch;
  });
}

function renderPrincipleChip(principle = {}, selectedIds = new Set()) {
  const active = selectedIds.has(principle.id);
  return `
    <button
      type="button"
      class="video-analysis-mg-principle-chip${active ? " is-active" : ""}"
      data-video-analysis-mg-principle-toggle="${escapeHtml(principle.id)}"
      aria-pressed="${active ? "true" : "false"}"
    >
      <span>${escapeHtml(principle.label)}</span>
    </button>
  `;
}

function renderPrincipleGroup(group = {}, selectedIds = new Set()) {
  return `
    <section class="video-analysis-mg-picker-group${group.suggested ? " is-suggested" : ""}">
      <h4>${escapeHtml(group.label)}</h4>
      <div class="video-analysis-mg-picker-grid">
        ${group.principles.map((principle) => renderPrincipleChip(principle, selectedIds)).join("")}
      </div>
    </section>
  `;
}

export function selectedMiniGamePrincipleIds(state = {}) {
  if (
    state.codingSession?.miniGamePrinciplePickerOpen
    && Array.isArray(state.codingSession?.miniGamePrincipleDraftIds)
  ) {
    return pickerVisiblePrincipleIds(state.codingSession.miniGamePrincipleDraftIds);
  }
  const targetClip = resolveCurrentCodingTargetClip(state);
  if (targetClip) return pickerVisiblePrincipleIds(clipMiniGamePrincipleIds(targetClip));
  return pickerVisiblePrincipleIds([
    ...(Array.isArray(state.codingSession?.miniGamePrincipleDraftIds) ? state.codingSession.miniGamePrincipleDraftIds : []),
    ...(Array.isArray(state.draft?.miniGamePrincipleIds) ? state.draft.miniGamePrincipleIds : []),
    state.draft?.miniGamePrincipleId,
  ]);
}

export function renderMiniGamePrincipleLauncher(state = {}) {
  const ids = selectedMiniGamePrincipleIds(state);
  const label = ids.length ? ids.map(miniGamePrincipleLabel).slice(0, 2).join(" + ") : "MG Principle";
  const suffix = ids.length > 2 ? ` +${ids.length - 2}` : "";
  return `
    <section class="video-analysis-code-group video-analysis-mg-principle-launcher">
      <div class="video-analysis-code-group__header">
        <span>MG Principle</span>
        ${ids.length ? `<small>${escapeHtml(`${ids.length} selected`)}</small>` : ""}
      </div>
      <button
        type="button"
        class="video-analysis-code-button video-analysis-mg-picker-button${ids.length ? " is-active" : ""}"
        data-video-analysis-mg-principles-open
        style="--video-analysis-button-color: #d97706"
        aria-haspopup="dialog"
      >
        <span class="video-analysis-code-button__label">${escapeHtml(label)}${escapeHtml(suffix)}</span>
      </button>
    </section>
  `;
}

export function renderMiniGamePrinciplePicker(state = {}) {
  if (!state.codingSession?.miniGamePrinciplePickerOpen) return "";
  const selectedIds = new Set(selectedMiniGamePrincipleIds(state));
  const targetClip = resolveCurrentCodingTargetClip(state);
  const capture = state.codingSession?.miniGamePrincipleCapture || null;
  const searchValue = String(state.codingSession?.miniGamePrincipleSearch || "");
  const searchQuery = normalizeSearchText(searchValue);
  const subPhaseLabel = activeSubPhaseLabel(state, targetClip);
  const suggestedIds = suggestedPrincipleIds(state, targetClip);
  const suggestedPrinciples = suggestedIds
    .map((id) => pickerPrincipleById.get(id))
    .filter((principle) => principle && principleMatchesSearch(principle, "Suggested", searchQuery));
  const suggestedSet = new Set(suggestedIds);
  const groups = orderedPickerGroups(state, targetClip)
    .map((group) => ({
      ...group,
      principles: group.principles.filter((principle) => (
        !suggestedSet.has(principle.id)
        && principleMatchesSearch(principle, group.label, searchQuery)
      )),
    }))
    .filter((group) => group.principles.length);
  const firstSearchMatchId = searchQuery ? (suggestedPrinciples[0]?.id || groups[0]?.principles?.[0]?.id || "") : "";
  const hasResults = suggestedPrinciples.length || groups.length;
  return `
    <div class="video-analysis-mg-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-mg-picker-title">
      <button type="button" class="video-analysis-mg-picker-backdrop" data-video-analysis-mg-principles-close aria-label="Close MG principles"></button>
      <section class="video-analysis-mg-picker-panel">
        <header class="video-analysis-mg-picker-header">
          <div class="video-analysis-mg-picker-titlebar">
            <h3 id="video-analysis-mg-picker-title">MG Principles</h3>
            <input
              type="search"
              class="video-analysis-mg-picker-search"
              data-video-analysis-mg-principle-search
              data-video-analysis-mg-principle-search-first="${escapeHtml(firstSearchMatchId)}"
              value="${escapeHtml(searchValue)}"
              placeholder="Search principles"
              aria-label="Search MG principles"
            >
          </div>
          <button type="button" class="video-analysis-mg-picker-close" data-video-analysis-mg-principles-close aria-label="Close"></button>
        </header>
        <div class="video-analysis-mg-picker-body">
          ${suggestedPrinciples.length ? renderPrincipleGroup({
            label: subPhaseLabel ? `Suggested for ${subPhaseLabel}` : "Suggested",
            principles: suggestedPrinciples,
            suggested: true,
          }, selectedIds) : ""}
          ${groups.map((group) => renderPrincipleGroup(group, selectedIds)).join("")}
          ${hasResults ? "" : `<section class="video-analysis-mg-picker-empty">No principles found.</section>`}
        </div>
        <footer class="video-analysis-mg-picker-footer">
          <span>${capture ? escapeHtml(`${selectedIds.size} principle${selectedIds.size === 1 ? "" : "s"} selected at ${Math.round(Number(capture.startMs || 0))}ms`) : escapeHtml(`${selectedIds.size} selected`)}</span>
          ${capture ? "" : `<button type="button" data-video-analysis-mg-principles-clear>Clear</button>`}
          <button type="button" class="video-analysis-primary-action" data-video-analysis-mg-principles-apply>
            ${capture ? "Done" : targetClip ? "Save to clip" : "Use for next tag"}
          </button>
        </footer>
      </section>
    </div>
  `;
}
