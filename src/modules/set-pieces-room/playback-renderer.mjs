import { setPiecePlaybackSpeedOptions } from "./constants.mjs";
import { escapeSetPieceHtml } from "./board-renderer.mjs";
import { renderSetPieceToolIcon } from "./tool-icons.mjs";

export function formatSetPieceSeconds(value = 0) {
  const seconds = Math.max(0, Number(value || 0)) / 1000;
  return `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`;
}

export function renderSetPiecePlayback(variant, phase, ui, options = {}) {
  const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
  const maxPosition = Math.max(1, variant.phases.length - 1);
  const position = Math.min(maxPosition, Math.max(0, phaseIndex + Number(ui.playbackProgress || 0)));
  const nextPhase = variant.phases[phaseIndex + 1];
  const isTransitioning = Boolean(nextPhase && Number(ui.playbackProgress || 0) > 0);
  const transitionDuration = Number(nextPhase?.durationMs || 0);
  const primaryStatus = isTransitioning ? `Phase ${phaseIndex + 1} → ${phaseIndex + 2}` : `Phase ${phaseIndex + 1}`;
  const secondaryStatus = isTransitioning
    ? `${formatSetPieceSeconds(transitionDuration * Number(ui.playbackProgress || 0))} / ${formatSetPieceSeconds(transitionDuration)}`
    : phase.cue || `of ${variant.phases.length}`;
  const className = options.presentation ? "spr-playback is-present-playback" : "spr-playback";
  return `<div class="${className}" aria-label="Playback controls">
    <div class="spr-playback-transport">
      <button type="button" class="spr-icon-button" data-set-piece-action="restart-playback" title="Back to phase 1" aria-label="Back to phase 1">${renderSetPieceToolIcon("skip-back")}</button>
      <button type="button" class="spr-icon-button" data-set-piece-action="previous-phase" title="Previous phase" aria-label="Previous phase">${renderSetPieceToolIcon("step-back")}</button>
      <button type="button" class="spr-play-button" data-set-piece-action="toggle-play" data-set-piece-icon="${ui.isPlaying ? "pause" : "play"}" aria-label="${ui.isPlaying ? "Pause" : "Play"}">${renderSetPieceToolIcon(ui.isPlaying ? "pause" : "play")}</button>
      <button type="button" class="spr-icon-button" data-set-piece-action="next-phase" title="Next phase" aria-label="Next phase">${renderSetPieceToolIcon("step-forward")}</button>
      <button type="button" class="spr-icon-button" data-set-piece-action="stop" title="Stop" aria-label="Stop">${renderSetPieceToolIcon("stop")}</button>
    </div>
    <label class="spr-playhead"><span class="sr-only">Playback position</span><input type="range" min="0" max="${maxPosition}" step="0.01" value="${position}" data-set-piece-scrubber ${variant.phases.length < 2 ? "disabled" : ""}></label>
    <span class="spr-phase-counter" data-set-piece-playback-status><b data-set-piece-playback-primary>${escapeSetPieceHtml(primaryStatus)}</b><span data-set-piece-playback-secondary>${escapeSetPieceHtml(secondaryStatus)}</span></span>
    <label class="spr-speed-control"><span class="sr-only">Playback speed</span><select data-set-piece-playback-speed>${setPiecePlaybackSpeedOptions.map((speed) => `<option value="${speed}" ${Number(ui.playbackSpeed) === speed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label>
    <button type="button" class="spr-icon-button spr-loop-button ${ui.loopPlayback ? "is-active" : ""}" data-set-piece-action="toggle-loop" aria-label="Loop playback" aria-pressed="${Boolean(ui.loopPlayback)}" title="Loop playback">${renderSetPieceToolIcon("repeat")}</button>
  </div>`;
}
