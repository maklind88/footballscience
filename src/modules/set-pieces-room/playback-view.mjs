import { getSetPieceElementTransform } from "./geometry.mjs";

function escapeSelector(value = "") {
  return globalThis.CSS?.escape?.(String(value)) || String(value).replace(/[^a-z0-9_-]/gi, "\\$&");
}

export function revealActiveSetPiecePhase(root) {
  const phaseStrip = root?.querySelector?.(".spr-phase-strip, .spr-present-phase-strip");
  const activePhase = phaseStrip?.querySelector?.(".spr-phase-card.is-active, .spr-present-phase-card.is-active");
  if (!phaseStrip || !activePhase) return;
  const left = activePhase.offsetLeft;
  const right = left + activePhase.offsetWidth;
  if (left < phaseStrip.scrollLeft) phaseStrip.scrollLeft = Math.max(0, left - 8);
  else if (right > phaseStrip.scrollLeft + phaseStrip.clientWidth) {
    phaseStrip.scrollLeft = Math.max(0, right - phaseStrip.clientWidth + 8);
  }
}

export function renderSetPiecePlaybackFrame(root, previousRouteIds = new Set(), positions = new Map()) {
  const nextRouteIds = new Set();
  positions.forEach((position, id) => {
    const marker = root?.querySelector?.(`[data-element-id="${escapeSelector(id)}"]`);
    const pitchView = marker?.closest?.("[data-set-piece-pitch]")?.dataset?.pitchView || "full";
    if (marker) marker.setAttribute("transform", getSetPieceElementTransform(position, pitchView));
    if (position.routeId && position.localProgress > 0 && position.localProgress < 1) nextRouteIds.add(position.routeId);
  });
  previousRouteIds.forEach((id) => {
    if (!nextRouteIds.has(id)) root?.querySelector?.(`[data-drawing-id="${escapeSelector(id)}"]`)?.classList.remove("is-playing");
  });
  nextRouteIds.forEach((id) => root?.querySelector?.(`[data-drawing-id="${escapeSelector(id)}"]`)?.classList.add("is-playing"));
  return nextRouteIds;
}

export function updateSetPiecePlaybackView(root, ui = {}, context = {}) {
  const button = root?.querySelector?.('[data-set-piece-action="toggle-play"]');
  if (button) {
    button.setAttribute("aria-label", ui.isPlaying ? "Pause" : "Play");
    const symbol = button.querySelector("span");
    if (symbol) symbol.textContent = ui.isPlaying ? "Ⅱ" : "▶";
  }
  const speedControl = root?.querySelector?.("[data-set-piece-playback-speed]");
  if (speedControl) speedControl.value = String(ui.playbackSpeed);
  const scrubber = root?.querySelector?.("[data-set-piece-scrubber]");
  const { variant, phase } = context;
  if (scrubber && variant && phase) {
    const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
    const transitionProgress = Number(ui.playbackProgress || 0);
    const nextPhase = variant.phases[phaseIndex + 1];
    scrubber.value = String(Math.max(0, phaseIndex) + transitionProgress);
    const primary = root?.querySelector?.("[data-set-piece-playback-primary]");
    const secondary = root?.querySelector?.("[data-set-piece-playback-secondary]");
    if (primary) primary.textContent = nextPhase && transitionProgress > 0
      ? `Phase ${phaseIndex + 1} → ${phaseIndex + 2}`
      : `Phase ${phaseIndex + 1}`;
    if (secondary) {
      const elapsed = Number(nextPhase?.durationMs || 0) * transitionProgress;
      secondary.textContent = nextPhase && transitionProgress > 0
        ? `${(elapsed / 1000).toFixed(1)}s / ${(Number(nextPhase.durationMs || 0) / 1000).toFixed(1)}s`
        : phase.cue || `of ${variant.phases.length}`;
    }
  }
  const loopButton = root?.querySelector?.('[data-set-piece-action="toggle-loop"]');
  if (loopButton) {
    loopButton.classList.toggle("is-active", ui.loopPlayback);
    loopButton.setAttribute("aria-pressed", String(ui.loopPlayback));
  }
}
