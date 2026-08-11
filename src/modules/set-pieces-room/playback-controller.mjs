import { interpolateSetPieceValue } from "./geometry.mjs";

function elementMap(phase = {}) {
  return new Map((phase.elements || []).map((element) => [element.id, element]));
}

export function createSetPiecesPlaybackController(options = {}) {
  const win = options.win || globalThis;
  let frameId = 0;
  let holdTimer = 0;
  let playing = false;
  let paused = false;
  let speed = 1;
  let transition = null;

  function emitStatus() {
    options.onStatus?.({ isPlaying: playing && !paused, isPaused: paused, speed });
  }

  function clearScheduled() {
    if (frameId) win.cancelAnimationFrame?.(frameId);
    if (holdTimer) win.clearTimeout?.(holdTimer);
    frameId = 0;
    holdTimer = 0;
  }

  function stop({ resetFrame = true } = {}) {
    clearScheduled();
    playing = false;
    paused = false;
    transition = null;
    if (resetFrame) options.onResetFrame?.();
    emitStatus();
  }

  function getContext() {
    const context = options.getContext?.() || {};
    const phases = context.variant?.phases || [];
    const activeIndex = phases.findIndex((phase) => phase.id === context.phase?.id);
    return { ...context, phases, activeIndex: activeIndex >= 0 ? activeIndex : 0 };
  }

  function renderTransitionFrame(progress, fromPhase, toPhase) {
    const start = elementMap(fromPhase);
    const end = elementMap(toPhase);
    const positions = new Map();
    for (const [id, fromElement] of start.entries()) {
      const toElement = end.get(id);
      if (!toElement) continue;
      const totalDuration = Math.max(250, Number(toPhase.durationMs || 1400));
      const elapsed = progress * totalDuration;
      const delay = Math.max(0, Number(toElement.delayMs || 0));
      const duration = Math.max(100, Math.min(totalDuration - Math.min(delay, totalDuration - 100), Number(toElement.durationMs || totalDuration)));
      const localProgress = Math.min(1, Math.max(0, (elapsed - delay) / duration));
      positions.set(id, {
        x: interpolateSetPieceValue(fromElement.x, toElement.x, localProgress),
        y: interpolateSetPieceValue(fromElement.y, toElement.y, localProgress),
        rotation: interpolateSetPieceValue(fromElement.rotation, toElement.rotation, localProgress),
      });
    }
    options.onFrame?.(positions, progress);
  }

  function beginTransition(fromIndex, elapsedBeforePause = 0) {
    const { phases } = getContext();
    if (!playing || fromIndex >= phases.length - 1) {
      stop({ resetFrame: false });
      return;
    }
    const fromPhase = phases[fromIndex];
    const toPhase = phases[fromIndex + 1];
    transition = {
      fromIndex,
      fromPhase,
      toPhase,
      startedAt: 0,
      elapsedBeforePause,
    };

    const tick = (timestamp) => {
      if (!playing || paused || !transition) return;
      if (!transition.startedAt) transition.startedAt = timestamp - transition.elapsedBeforePause / speed;
      const duration = Math.max(250, Number(toPhase.durationMs || 1400));
      const elapsed = Math.max(0, (timestamp - transition.startedAt) * speed);
      const progress = Math.min(1, elapsed / duration);
      transition.elapsedBeforePause = elapsed;
      renderTransitionFrame(progress, fromPhase, toPhase);
      if (progress < 1) {
        frameId = win.requestAnimationFrame?.(tick) || 0;
        return;
      }
      transition = null;
      options.onPhaseChange?.(toPhase.id);
      if (fromIndex + 1 >= phases.length - 1) {
        stop({ resetFrame: false });
        return;
      }
      holdTimer = win.setTimeout?.(() => beginTransition(fromIndex + 1), Math.max(0, Number(toPhase.holdMs || 0)) / speed) || 0;
    };
    frameId = win.requestAnimationFrame?.(tick) || 0;
  }

  function play() {
    if (playing && paused && transition) {
      const { fromIndex, elapsedBeforePause } = transition;
      paused = false;
      emitStatus();
      beginTransition(fromIndex, elapsedBeforePause);
      return;
    }
    const { phases, activeIndex } = getContext();
    if (phases.length < 2) return;
    clearScheduled();
    playing = true;
    paused = false;
    const startIndex = activeIndex >= phases.length - 1 ? 0 : activeIndex;
    if (startIndex !== activeIndex) options.onPhaseChange?.(phases[0].id);
    emitStatus();
    beginTransition(startIndex);
  }

  function pause() {
    if (!playing || paused) return;
    paused = true;
    clearScheduled();
    emitStatus();
  }

  function toggle() {
    if (playing && !paused) pause();
    else play();
  }

  function setSpeed(nextSpeed) {
    const numeric = Number(nextSpeed);
    speed = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    emitStatus();
  }

  return Object.freeze({
    get isPaused() { return paused; },
    get isPlaying() { return playing && !paused; },
    get speed() { return speed; },
    pause,
    play,
    setSpeed,
    stop,
    toggle,
  });
}
