import { miniGamePrincipleGroups } from "../constants/miniGamePrinciples.js";
import { clipMiniGamePrincipleIds, miniGamePrincipleLabel, uniqueMiniGamePrincipleIds } from "../services/miniGamePrincipleService.js";
import { escapeHtml } from "./renderHelpers.js";

function selectedTargetClip(state = {}) {
  const clips = [
    ...(Array.isArray(state.clips) ? state.clips : []),
    ...(Array.isArray(state.allClips) ? state.allClips : []),
  ];
  const selectedId = state.selectedClipId || state.codingSession?.lastClipId || state.timeline?.selectedCategory?.activeClipId || "";
  return clips.find((clip) => clip.id && clip.id === selectedId) || null;
}

export function selectedMiniGamePrincipleIds(state = {}) {
  const targetClip = selectedTargetClip(state);
  if (targetClip) return clipMiniGamePrincipleIds(targetClip);
  return uniqueMiniGamePrincipleIds([
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
        <span class="video-analysis-code-button__meta"><small>choose</small></span>
      </button>
    </section>
  `;
}

export function renderMiniGamePrinciplePicker(state = {}) {
  if (!state.codingSession?.miniGamePrinciplePickerOpen) return "";
  const selectedIds = new Set(selectedMiniGamePrincipleIds(state));
  const targetClip = selectedTargetClip(state);
  const title = targetClip ? "MG principles for selected tag" : "MG principles for next tag";
  return `
    <div class="video-analysis-mg-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="video-analysis-mg-picker-title">
      <button type="button" class="video-analysis-mg-picker-backdrop" data-video-analysis-mg-principles-close aria-label="Close MG principles"></button>
      <section class="video-analysis-mg-picker-panel">
        <header class="video-analysis-mg-picker-header">
          <div>
            <p class="video-analysis-kicker">Clip principles</p>
            <h3 id="video-analysis-mg-picker-title">${escapeHtml(title)}</h3>
            <span>${escapeHtml(targetClip ? "Saved to this clip and searchable in the library." : "Stored as suggestions until the next tag is created.")}</span>
          </div>
          <button type="button" class="video-analysis-mg-picker-close" data-video-analysis-mg-principles-close aria-label="Close">x</button>
        </header>
        <div class="video-analysis-mg-picker-body">
          ${miniGamePrincipleGroups.map((group) => `
            <section class="video-analysis-mg-picker-group">
              <h4>${escapeHtml(group.label)}</h4>
              <div class="video-analysis-mg-picker-grid">
                ${group.principles.map((principle) => {
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
                }).join("")}
              </div>
            </section>
          `).join("")}
        </div>
        <footer class="video-analysis-mg-picker-footer">
          <span>${escapeHtml(`${selectedIds.size} selected`)}</span>
          <button type="button" data-video-analysis-mg-principles-clear>Clear</button>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-mg-principles-apply>
            ${targetClip ? "Save to clip" : "Use for next tag"}
          </button>
        </footer>
      </section>
    </div>
  `;
}
