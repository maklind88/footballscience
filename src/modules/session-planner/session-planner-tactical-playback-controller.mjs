import { renderTacticalPlaybackIcon } from "./session-planner-tactical-playback-renderer.mjs";

export const tacticalFrameDurationMs = 1500;

export function getTacticalPlaybackPosition(frames, elapsed) {
  const last = Math.max(0, frames.length - 1);
  const duration = last * tacticalFrameDurationMs;
  const time = Math.max(0, Math.min(duration, elapsed));
  const index = Math.min(last, Math.floor(time / tacticalFrameDurationMs));
  return { index, nextIndex: Math.min(last, index + 1), progress: (time % tacticalFrameDurationMs) / tacticalFrameDurationMs, duration, time };
}

export function createSessionPlannerTacticalPlaybackController({
  win = globalThis,
  getWorkspace,
  getEditorBlock,
  canEdit = () => false,
  renderVisual,
  readOnly = false,
  workspaceId = "session-planner",
}) {
  let modal = null;
  let surface = null;
  let snapshot = null;
  let source = null;
  let animations = [];
  let locked = [];
  let segment = -1;
  let playing = false;
  let elapsed = 0;
  let lastTime = null;
  let request = null;
  let speed = 1;
  let loop = false;
  let resizeObserver = null;
  let boardSize = null;
  let editScroll = null;
  let editableAtStart = false;
  let viewAtMount = null;
  let readonlyResizeObserver = null;

  function fitReadonlyBoard() {
    const wrap = modal?.querySelector(".session-readonly-viewport");
    const board = wrap?.querySelector(".session-readonly-source > .session-visual-board");
    if (!board?.clientWidth || !board.clientHeight) return;
    const scale = Math.min(wrap.clientWidth / board.clientWidth, wrap.clientHeight / board.clientHeight);
    wrap.style.setProperty("--readonly-board-scale", String(Math.max(0, scale)));
    board.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));
  }

  function controls() { return modal?.querySelector(".session-tactical-playback"); }
  function cancelAnimations() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }
  function cancelTick() {
    if (request !== null) win.cancelAnimationFrame(request);
    request = null;
    lastTime = null;
  }
  function syncControls() {
    const bar = controls();
    if (!bar) return;
    const play = bar.querySelector('[data-session-tactical-playback="play"]');
    const label = playing ? "Pause" : "Play";
    if (play.getAttribute("aria-label") !== label) {
      play.innerHTML = renderTacticalPlaybackIcon(playing ? "pause" : "play");
      play.setAttribute("aria-label", label);
      play.title = label;
    }
    bar.querySelector('[data-session-tactical-playback="loop"]').setAttribute("aria-pressed", String(loop));
    bar.querySelector("[data-session-tactical-playback-speed]").value = String(speed);
  }

  function stop() {
    cancelTick();
    cancelAnimations();
    playing = false;
    snapshot = null;
    source = null;
    segment = -1;
    elapsed = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    surface?.remove();
    surface = null;
    modal?.classList.remove("is-previewing-animation");
    if (editScroll) {
      editScroll.forEach(([element, left, top]) => { element.scrollLeft = left; element.scrollTop = top; });
      editScroll = null;
    }
    locked.forEach(([element, inert]) => { element.inert = inert; });
    locked = [];
    const bar = controls();
    if (bar) {
      bar.querySelector("[data-session-tactical-playhead]").value = "0";
      const view = getEditorBlock();
      const index = readOnly ? 0 : view?.tacticalFrames.findIndex((frame) => frame.id === view.tacticalActiveFrameId) ?? 0;
      bar.querySelector("[data-session-tactical-playback-status]").textContent = `Frame ${index + 1} / ${view?.tacticalFrames.length || 1}`;
      syncControls();
    }
  }

  function fitPreview() {
    if (!surface || !boardSize) return;
    const scale = Math.min(surface.clientWidth / boardSize.width, surface.clientHeight / boardSize.height);
    surface.style.setProperty("--playback-board-scale", String(Math.max(0, scale)));
  }

  function prepare() {
    if (snapshot) return true;
    const view = getEditorBlock();
    const wrap = modal?.querySelector("[data-session-tactical-canvas-wrap]");
    if (!wrap || !view || view.tacticalFrames.length < 2) return false;
    const board = wrap.querySelector(readOnly ? ".session-readonly-source > .session-visual-board" : ".session-visual-board-editor");
    if (!board?.clientWidth || !board.clientHeight) return false;
    boardSize = { width: board.clientWidth, height: board.clientHeight };
    editScroll = [wrap, modal.querySelector(".session-tacticalboard-layout")].filter(Boolean)
      .map((element) => [element, element.scrollLeft, element.scrollTop]);
    source = view;
    editableAtStart = canEdit();
    snapshot = structuredClone(view);
    surface = win.document.createElement("div");
    surface.className = "session-tactical-playback-surface";
    surface.setAttribute("aria-label", "Exercise animation preview");
    surface.inert = true;
    surface.style.setProperty("--playback-board-width", `${boardSize.width}px`);
    surface.style.setProperty("--playback-board-height", `${boardSize.height}px`);
    wrap.appendChild(surface);
    modal.classList.add("is-previewing-animation");
    locked = Array.from(modal.querySelectorAll(".session-tacticalboard-toolbox, .session-tacticalboard-inspector, .session-visual-board-editor"))
      .map((element) => [element, element.inert]);
    locked.forEach(([element]) => { element.inert = true; });
    if (win.ResizeObserver) {
      resizeObserver = new win.ResizeObserver(fitPreview);
      resizeObserver.observe(surface);
    }
    fitPreview();
    return true;
  }

  function paint() {
    if (!snapshot || !surface) return;
    const frames = snapshot.tacticalFrames;
    const position = getTacticalPlaybackPosition(frames, elapsed);
    if (segment !== position.index) {
      cancelAnimations();
      segment = position.index;
      const from = frames[segment];
      const to = frames[position.nextIndex];
      surface.innerHTML = renderVisual({ ...snapshot, tacticalElements: from.elements }, { large: true });
      surface.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));
      if (!win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches && segment !== position.nextIndex) {
        const destinations = new Map(to.elements.map((element) => [element.id, element]));
        const origins = new Map(from.elements.map((element) => [element.id, element]));
        for (const marker of surface.querySelectorAll(".session-tactical-marker[data-session-tactical-element-id]")) {
          const first = origins.get(marker.dataset.sessionTacticalElementId);
          const next = destinations.get(marker.dataset.sessionTacticalElementId);
          if (!first || !next || first.type !== next.type || typeof marker.animate !== "function") continue;
          // Native animations scale with the pitch; no transient coordinates enter app state.
          const animation = marker.animate([
            { left: `${first.x}%`, top: `${first.y}%` },
            { left: `${next.x}%`, top: `${next.y}%` },
          ], { duration: tacticalFrameDurationMs, fill: "both", easing: "linear" });
          animation.pause();
          animations.push(animation);
        }
      }
    }
    animations.forEach((animation) => { animation.currentTime = position.progress * tacticalFrameDurationMs; });
    const bar = controls();
    bar.querySelector("[data-session-tactical-playhead]").value = String(position.duration ? position.time / position.duration : 0);
    const output = bar.querySelector("[data-session-tactical-playback-status]");
    const label = `Frame ${position.index + 1} / ${frames.length}`;
    if (output.textContent !== label) output.textContent = label;
  }

  function tick(time) {
    request = null;
    if (!playing) return;
    if (!modal?.isConnected || !modal.getClientRects().length || win.document.hidden || source !== getEditorBlock()) {
      stop();
      return;
    }
    if (lastTime !== null) elapsed += Math.max(0, time - lastTime) * speed;
    lastTime = time;
    const duration = (snapshot.tacticalFrames.length - 1) * tacticalFrameDurationMs;
    paint();
    if (elapsed >= duration) {
      if (!loop) {
        playing = false;
        cancelTick();
        syncControls();
        return;
      }
      // Hold the final frame briefly, then restart without inventing a return movement.
      if (elapsed >= duration + 600) elapsed = 0;
    }
    request = win.requestAnimationFrame(tick);
  }

  function toggle() {
    if (playing) {
      playing = false;
      cancelTick();
    } else if (prepare()) {
      if (elapsed >= (snapshot.tacticalFrames.length - 1) * tacticalFrameDurationMs) elapsed = 0;
      playing = true;
      paint();
      request = win.requestAnimationFrame(tick);
    }
    syncControls();
  }

  function onClick(event) {
    if (!modal?.contains(event.target)) return;
    const action = event.target.closest("[data-session-tactical-playback]")?.dataset.sessionTacticalPlayback;
    if (action) {
      if (action === "play") toggle();
      if (action === "stop") stop();
      if (action === "loop") { loop = !loop; syncControls(); }
      if (action === "restart" && prepare()) { elapsed = 0; lastTime = null; paint(); }
      event.preventDefault();
      event.stopPropagation();
    } else if (event.target.closest("[data-session-tactical-frame], [data-session-add-tactical-frame], [data-session-delete-tactical-frame], [data-session-close-tacticalboard]")) {
      stop();
    }
  }

  function onInput(event) {
    if (!modal?.contains(event.target)) return;
    if (event.target.matches("[data-session-tactical-playhead]") && prepare()) {
      playing = false;
      cancelTick();
      elapsed = Number(event.target.value) * (snapshot.tacticalFrames.length - 1) * tacticalFrameDurationMs;
      paint();
      syncControls();
    }
    if (event.target.matches("[data-session-tactical-playback-speed]")) {
      const value = Number(event.target.value);
      if ([0.5, 1, 1.5, 2].includes(value)) speed = value;
      lastTime = null;
    }
  }

  function onKey(event) {
    if (!modal?.isConnected || !modal.getClientRects().length) return;
    if (!modal.contains(event.target) && event.target !== win.document.body) return;
    if (readOnly) {
      // Let native controls work without triggering Presentation Mode's slide shortcuts.
      if (event.target.closest?.(".session-tactical-playback") && !["Tab", "Escape"].includes(event.key)) {
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== " " || (getEditorBlock()?.tacticalFrames.length || 0) < 2) return;
    }
    if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
    if (event.type === "keydown" && event.key === " " && !event.target.closest?.("button") && !event.repeat) {
      toggle();
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (!readOnly && snapshot && event.key !== "Tab") {
      if (event.key === "Escape") stop();
      if (!event.target.closest?.(".session-tactical-playback button, [data-session-close-tacticalboard]")) {
        event.preventDefault();
      }
      // Keyboard drawing shortcuts cannot edit the hidden source board during playback.
      event.stopImmediatePropagation();
    }
  }

  function mount() {
    const next = getWorkspace()?.querySelector(readOnly
      ? "[data-session-readonly-playback]"
      : "[data-session-tacticalboard-overlay] .session-tacticalboard-modal") || null;
    if (next === modal) return;
    stop();
    readonlyResizeObserver?.disconnect();
    readonlyResizeObserver = null;
    modal = next;
    viewAtMount = getEditorBlock();
    if (readOnly && modal) {
      fitReadonlyBoard();
      if (win.ResizeObserver) {
        readonlyResizeObserver = new win.ResizeObserver(fitReadonlyBoard);
        readonlyResizeObserver.observe(modal.querySelector(".session-readonly-viewport"));
      }
    }
    syncControls();
    if (modal && !canEdit()) {
      modal.querySelectorAll("[data-session-add-tactical-frame], [data-session-delete-tactical-frame]").forEach((button) => { button.disabled = true; });
    }
  }

  function retainOverlay() {
    if (readOnly && modal?.isConnected && viewAtMount === getEditorBlock()) return modal;
    if (snapshot && modal?.isConnected && source === getEditorBlock() && editableAtStart === canEdit()) {
      return modal.closest("[data-session-tacticalboard-overlay]");
    }
    stop();
    return null;
  }

  const onVisibility = () => { if (win.document.hidden) stop(); };
  const onWorkspace = (event) => { if (workspaceId && event.detail?.workspaceId !== workspaceId) stop(); };
  const workspace = getWorkspace();
  workspace?.addEventListener?.("click", onClick, true);
  workspace?.addEventListener?.("input", onInput, true);
  workspace?.addEventListener?.("change", onInput, true);
  win.addEventListener?.("keydown", onKey, true);
  win.addEventListener?.("keyup", onKey, true);
  win.addEventListener?.("platform:open-workspace", onWorkspace);
  win.document?.addEventListener?.("visibilitychange", onVisibility);
  return { mount, stop, retainOverlay, isPreviewing: () => Boolean(snapshot), destroy() {
    stop();
    readonlyResizeObserver?.disconnect();
    workspace?.removeEventListener?.("click", onClick, true);
    workspace?.removeEventListener?.("input", onInput, true);
    workspace?.removeEventListener?.("change", onInput, true);
    win.removeEventListener?.("keydown", onKey, true);
    win.removeEventListener?.("keyup", onKey, true);
    win.removeEventListener?.("platform:open-workspace", onWorkspace);
    win.document?.removeEventListener?.("visibilitychange", onVisibility);
  } };
}
