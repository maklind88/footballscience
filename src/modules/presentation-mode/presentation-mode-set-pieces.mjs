import { renderSetPieceBoard } from "../set-pieces-room/board-renderer.mjs";

const presentationLayers = new Set(["home", "opponent", "ball", "drawings", "labels"]);

function formatSeconds(value = 0) {
  const seconds = Math.max(0, Number(value || 0)) / 1000;
  return `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`;
}

function renderSourceControls(model = {}, slide = {}, escapeHtml) {
  if (model.presenting) return "";
  const setPiece = slide.setPiece || {};
  const catalog = Array.isArray(setPiece.catalog) ? setPiece.catalog : [];
  const selectedPlay = catalog.find((play) => play.id === setPiece.playId) || catalog[0] || null;
  return `<div class="presentation-set-piece-source-controls">
    <label><span>Routine</span><select data-presentation-set-piece-play data-presentation-info-id="${escapeHtml(slide.infoSlide?.id || "")}">
      ${catalog.map((play) => `<option value="${escapeHtml(play.id)}" ${play.id === selectedPlay?.id ? "selected" : ""}>${escapeHtml(play.title)}</option>`).join("")}
    </select></label>
    <label><span>Variant</span><select data-presentation-set-piece-variant data-presentation-info-id="${escapeHtml(slide.infoSlide?.id || "")}">
      ${(selectedPlay?.variants || []).map((variant) => `<option value="${escapeHtml(variant.id)}" ${variant.id === setPiece.variantId ? "selected" : ""}>${escapeHtml(variant.title)}</option>`).join("")}
    </select></label>
  </div>`;
}

function renderPlayback(setPiece = {}, escapeHtml) {
  const phases = Array.isArray(setPiece.phases) ? setPiece.phases : [];
  const activeIndex = Math.max(0, phases.findIndex((phase) => phase.id === setPiece.activePhaseId));
  const activePhase = phases[activeIndex] || phases[0] || {};
  const disabled = phases.length < 2 ? "disabled" : "";
  const playback = setPiece.playback || {};
  return `<div class="presentation-set-piece-playback" aria-label="Set piece playback controls">
    <div class="presentation-set-piece-transport">
      <button type="button" data-presentation-set-piece-action="restart" aria-label="Back to first phase" ${disabled}>|◀</button>
      <button type="button" data-presentation-set-piece-action="previous" aria-label="Previous set piece phase" ${activeIndex <= 0 ? "disabled" : ""}>◀</button>
      <button type="button" class="is-play" data-presentation-set-piece-action="toggle" data-set-piece-action="toggle-play" aria-label="${playback.isPlaying ? "Pause" : "Play"}" ${disabled}><span aria-hidden="true">${playback.isPlaying ? "Ⅱ" : "▶"}</span></button>
      <button type="button" data-presentation-set-piece-action="next" aria-label="Next set piece phase" ${activeIndex >= phases.length - 1 ? "disabled" : ""}>▶</button>
      <button type="button" data-presentation-set-piece-action="stop" aria-label="Stop set piece playback" ${disabled}>■</button>
    </div>
    <label class="presentation-set-piece-playhead"><span class="sr-only">Set piece playback position</span><input type="range" min="0" max="${Math.max(1, phases.length - 1)}" step="0.01" value="${activeIndex + Number(playback.progress || 0)}" data-presentation-set-piece-scrubber data-set-piece-scrubber ${disabled}></label>
    <span class="presentation-set-piece-counter"><b data-set-piece-playback-primary>Phase ${activeIndex + 1}</b><span data-set-piece-playback-secondary>${escapeHtml(activePhase.cue || `of ${phases.length}`)}</span></span>
    <label class="presentation-set-piece-speed"><span class="sr-only">Set piece playback speed</span><select data-presentation-set-piece-speed data-set-piece-playback-speed>${[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => `<option value="${speed}" ${Number(playback.speed || 1) === speed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label>
    <button type="button" class="presentation-set-piece-loop ${playback.loop ? "is-active" : ""}" data-presentation-set-piece-action="loop" data-set-piece-action="toggle-loop" aria-label="Loop set piece playback" aria-pressed="${Boolean(playback.loop)}">↻</button>
  </div>`;
}

export function renderPresentationSetPieceBody(model = {}, slide = {}, escapeHtml = String) {
  const setPiece = slide.setPiece || {};
  const phases = Array.isArray(setPiece.phases) ? setPiece.phases : [];
  const activePhase = phases.find((phase) => phase.id === setPiece.activePhaseId) || phases[0] || null;
  if (!setPiece.available || !activePhase) {
    return `<section class="presentation-set-piece-empty">
      ${renderSourceControls(model, slide, escapeHtml)}
      <strong>No Set Piece selected</strong>
    </section>`;
  }
  return `<section class="presentation-set-piece-layout">
    <header class="presentation-set-piece-heading">
      <div><span>${escapeHtml([setPiece.restart, setPiece.moment].filter(Boolean).join(" · ").replaceAll("-", " "))}</span><h2>${escapeHtml(setPiece.playTitle)}</h2><p>${escapeHtml(setPiece.variantTitle)}${setPiece.opponent ? ` · ${escapeHtml(setPiece.opponent)}` : ""}</p></div>
      ${renderSourceControls(model, slide, escapeHtml)}
    </header>
    <div class="presentation-set-piece-board">
      ${renderSetPieceBoard({
        phase: activePhase,
        pitchView: setPiece.pitchView,
        layers: presentationLayers,
        markerPrefix: `presentation-set-piece-${slide.id || "active"}`,
      })}
    </div>
    <div class="presentation-set-piece-phases" aria-label="Set piece phases">
      ${phases.map((phase, index) => `<button type="button" class="${phase.id === activePhase.id ? "is-active" : ""}" data-presentation-set-piece-phase="${escapeHtml(phase.id)}" aria-label="Show phase ${index + 1}: ${escapeHtml(phase.title)}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHtml(phase.title)}</span><small>${formatSeconds(phase.durationMs)}</small></button>`).join("")}
    </div>
    ${renderPlayback({ ...setPiece, activePhaseId: activePhase.id }, escapeHtml)}
  </section>`;
}
