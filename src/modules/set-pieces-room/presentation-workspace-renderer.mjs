import { resolveSetPiecePhaseAssignments } from "./assignments.mjs";
import { escapeSetPieceHtml, renderSetPieceBoard, renderSetPiecePhaseThumbnail } from "./board-renderer.mjs";
import { formatSetPieceSeconds, renderSetPiecePlayback } from "./playback-renderer.mjs";

function renderPresentIcon(name) {
  const paths = {
    fullscreen: '<path d="M7 3H3v4M17 3h4v4M7 21H3v-4M17 21h4v-4"/>',
    minimize: '<path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    previous: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.fullscreen}</svg>`;
}

function formatRestart(value = "") {
  return String(value || "Set piece").replaceAll("-", " ");
}

function presentCoachingPoints(play, variant, phase) {
  const points = [phase.cue, ...phase.elements.map((element) => element.instruction), ...phase.drawings.map((drawing) => drawing.label)]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!points.length && play.objective) points.push(play.objective);
  if (!points.length && variant.trigger) points.push(variant.trigger);
  return [...new Set(points)].slice(0, 4);
}

function renderPresentPhaseStrip(play, variant, roster) {
  return `<div class="spr-present-phase-strip" aria-label="Phase timeline">
    ${variant.phases.map((item, index) => `<button type="button" class="spr-present-phase-card ${item.id === variant.activePhaseId ? "is-active" : ""}" data-set-piece-phase-id="${escapeSetPieceHtml(item.id)}" aria-label="Phase ${index + 1}, ${escapeSetPieceHtml(item.title)}, ${formatSetPieceSeconds(item.durationMs)}${item.cue ? `, ${escapeSetPieceHtml(item.cue)}` : ""}">
      ${renderSetPiecePhaseThumbnail(resolveSetPiecePhaseAssignments(item, play, variant, roster), play.pitchView)}
      <span><b>${String(index + 1).padStart(2, "0")}</b><strong>${escapeSetPieceHtml(item.title)}</strong><small>${formatSetPieceSeconds(item.durationMs)}</small></span>
    </button>`).join("")}
  </div>`;
}

export function renderSetPiecesPresentationWorkspace(options = {}) {
  const { play, variant, phase, roster = [], ui = {}, teamIdentityMarkup = "" } = options;
  if (!play || !variant || !phase) return "";
  const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
  const nextPhase = variant.phases[phaseIndex + 1];
  const coachingPoints = presentCoachingPoints(play, variant, phase);
  const resolvedPhase = resolveSetPiecePhaseAssignments(phase, play, variant, roster);
  const context = [play.moment, play.context, play.opponent].filter(Boolean).join(" · ");
  const variantIndex = play.variants.findIndex((item) => item.id === variant.id);
  return `<main class="spr-present-workspace" aria-label="Set piece presentation">
    <header class="spr-present-header">
      <div class="spr-present-team">${teamIdentityMarkup}</div>
      <div class="spr-present-routine">
        <span>${escapeSetPieceHtml(formatRestart(play.restart))}${context ? ` · ${escapeSetPieceHtml(context)}` : ""}</span>
        <strong>${escapeSetPieceHtml(play.title)}</strong>
      </div>
      <div class="spr-present-variant-select"><span>Variant</span><div class="spr-present-variant-controls" role="group" aria-label="Presentation variant controls">
        <button type="button" data-set-piece-action="previous-variant" aria-label="Previous variant" title="Previous variant" aria-keyshortcuts="ArrowUp" ${variantIndex <= 0 ? "disabled" : ""}>${renderPresentIcon("previous")}</button>
        <select data-set-piece-present-variant aria-label="Presentation variant">${play.variants.map((item) => `<option value="${escapeSetPieceHtml(item.id)}" ${item.id === variant.id ? "selected" : ""}>${escapeSetPieceHtml(item.title)}</option>`).join("")}</select>
        <button type="button" data-set-piece-action="next-variant" aria-label="Next variant" title="Next variant" aria-keyshortcuts="ArrowDown" ${variantIndex >= play.variants.length - 1 ? "disabled" : ""}>${renderPresentIcon("next")}</button>
      </div></div>
      <div class="spr-present-actions">
        ${ui.canAddToTeamMeeting ? '<button type="button" class="spr-present-team-meeting" data-set-piece-action="add-to-team-meeting" aria-label="Add to Team Meeting" title="Add to Team Meeting"><span aria-hidden="true">＋</span><span class="spr-present-team-meeting-label">Team Meeting</span></button>' : ""}
        ${ui.fullscreenAvailable ? `<button type="button" class="spr-present-icon-button" data-set-piece-action="toggle-fullscreen" aria-label="${ui.nativeFullscreen ? "Exit fullscreen" : "Enter fullscreen"}" title="${ui.nativeFullscreen ? "Exit fullscreen" : "Enter fullscreen"}">${renderPresentIcon(ui.nativeFullscreen ? "minimize" : "fullscreen")}</button>` : ""}
        <button type="button" class="spr-present-exit" data-set-piece-action="edit-mode"><span>Edit</span>${renderPresentIcon("close")}</button>
      </div>
    </header>
    ${ui.notice ? `<div class="spr-present-notice" role="status"><span>${escapeSetPieceHtml(ui.notice.message)}</span><button type="button" data-set-piece-action="dismiss-notice" aria-label="Dismiss message">×</button></div>` : ""}
    <div class="spr-present-body">
      <section class="spr-present-stage ${play.pitchView === "full" ? "is-full-pitch" : "is-half-pitch"}" aria-label="Tactical board">
        <div class="spr-present-board-frame spr-board-stage" data-set-piece-board-stage>
          ${renderSetPieceBoard({
            phase: resolvedPhase,
            pitchView: play.pitchView,
            layers: ui.layers,
            selectedElementIds: new Set(),
            selectedDrawingId: "",
            interactive: false,
          })}
        </div>
      </section>
      <details class="spr-present-cues" role="complementary" aria-label="Phase coaching notes" ${ui.nativeFullscreen ? "" : "open"}>
        <summary class="spr-present-cues-summary">
          <span><small>Phase ${String(phaseIndex + 1).padStart(2, "0")} / ${String(variant.phases.length).padStart(2, "0")}</small><strong>${escapeSetPieceHtml(phase.title)}</strong></span>
          ${renderPresentIcon("chevron")}
        </summary>
        <div class="spr-present-cues-content">
          <div class="spr-present-phase-heading"><span>Phase ${String(phaseIndex + 1).padStart(2, "0")} / ${String(variant.phases.length).padStart(2, "0")}</span><small>${formatSetPieceSeconds(phase.durationMs)}</small></div>
          <h2>${escapeSetPieceHtml(phase.title)}</h2>
          ${coachingPoints.length ? `<ol>${coachingPoints.map((point) => `<li>${escapeSetPieceHtml(point)}</li>`).join("")}</ol>` : '<p class="spr-present-empty-cue">No coaching cue for this phase.</p>'}
          ${nextPhase ? `<div class="spr-present-next"><span>Next</span><strong>${escapeSetPieceHtml(nextPhase.title)}</strong></div>` : '<div class="spr-present-next is-last"><span>Final phase</span><strong>Reset or replay</strong></div>'}
        </div>
      </details>
    </div>
    ${renderPresentPhaseStrip(play, variant, roster)}
    ${renderSetPiecePlayback(variant, phase, ui, { presentation: true })}
  </main>`;
}
