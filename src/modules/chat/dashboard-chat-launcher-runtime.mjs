const DEFAULT_VIEWPORT_BUFFER = 12;
const DEFAULT_DRAG_THRESHOLD = 6;

export function clampDashboardChatLauncherPosition({
  left = 0,
  top = 0,
  width = 0,
  height = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  buffer = DEFAULT_VIEWPORT_BUFFER,
} = {}) {
  const safeBuffer = Math.max(0, Number(buffer) || 0);
  const safeWidth = Math.max(40, Number(width) || 0);
  const safeHeight = Math.max(40, Number(height) || 0);
  return {
    left: Math.min(Math.max(safeBuffer, Number(left) || 0), Math.max(safeBuffer, viewportWidth - safeWidth - safeBuffer)),
    top: Math.min(Math.max(safeBuffer, Number(top) || 0), Math.max(safeBuffer, viewportHeight - safeHeight - safeBuffer)),
  };
}

function isVisibleExternalDialog(dialog, root) {
  if (!dialog || root?.contains?.(dialog) || dialog.closest?.("[hidden], [aria-hidden='true']")) {
    return false;
  }
  return Boolean(dialog.getClientRects?.().length || dialog.offsetWidth || dialog.offsetHeight);
}

export function isDashboardChatImmersiveSurfaceActive(documentRef, root) {
  if (!documentRef) {
    return false;
  }
  if (documentRef.fullscreenElement) {
    return true;
  }
  const body = documentRef.body;
  if (
    body?.classList?.contains("is-video-analysis-fs-player-code-mode")
    || body?.classList?.contains("is-video-analysis-fs-player-fullscreen")
  ) {
    return true;
  }
  return Array.from(documentRef.querySelectorAll?.('[role="dialog"][aria-modal="true"]') || [])
    .some((dialog) => isVisibleExternalDialog(dialog, root));
}

export function createDashboardChatLauncherRuntime({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  getRoot = () => documentRef?.getElementById?.("dashboardChatWidgetRoot"),
  readState = () => ({ isOpen: false }),
  readPosition = () => null,
  writePosition = () => {},
  dragThreshold = DEFAULT_DRAG_THRESHOLD,
} = {}) {
  let dragState = null;
  let positionFrame = 0;
  let availabilityFrame = 0;

  function getViewportSize() {
    return {
      viewportWidth: Number(windowRef?.innerWidth) || Number(documentRef?.documentElement?.clientWidth) || 0,
      viewportHeight: Number(windowRef?.innerHeight) || Number(documentRef?.documentElement?.clientHeight) || 0,
    };
  }

  function clearInlinePosition(root) {
    root.style.removeProperty("left");
    root.style.removeProperty("top");
    root.style.removeProperty("right");
    root.style.removeProperty("bottom");
  }

  function getClampedPosition(root, position) {
    const rect = root.getBoundingClientRect();
    return clampDashboardChatLauncherPosition({
      left: position?.left,
      top: position?.top,
      width: rect.width,
      height: rect.height,
      ...getViewportSize(),
    });
  }

  function applyPosition() {
    const root = getRoot();
    if (!root) {
      return;
    }
    if (readState()?.isOpen) {
      clearInlinePosition(root);
      return;
    }
    const storedPosition = readPosition();
    if (!Number.isFinite(Number(storedPosition?.left)) || !Number.isFinite(Number(storedPosition?.top))) {
      clearInlinePosition(root);
      return;
    }
    const position = getClampedPosition(root, storedPosition);
    root.style.setProperty("left", `${position.left}px`, "important");
    root.style.setProperty("top", `${position.top}px`, "important");
    root.style.setProperty("right", "auto", "important");
    root.style.setProperty("bottom", "auto", "important");
  }

  function syncAvailability() {
    const root = getRoot();
    documentRef?.body?.classList?.toggle(
      "is-dashboard-chat-surface-suppressed",
      isDashboardChatImmersiveSurfaceActive(documentRef, root),
    );
  }

  function requestPositionApply() {
    if (positionFrame) {
      return;
    }
    positionFrame = windowRef.requestAnimationFrame(() => {
      positionFrame = 0;
      applyPosition();
    });
  }

  function requestAvailabilitySync() {
    if (availabilityFrame) {
      return;
    }
    availabilityFrame = windowRef.requestAnimationFrame(() => {
      availabilityFrame = 0;
      syncAvailability();
    });
  }

  function applyPendingDragPosition() {
    if (!dragState) {
      return;
    }
    dragState.root.style.setProperty("left", `${dragState.pendingLeft}px`, "important");
    dragState.root.style.setProperty("top", `${dragState.pendingTop}px`, "important");
    dragState.root.style.setProperty("right", "auto", "important");
    dragState.root.style.setProperty("bottom", "auto", "important");
    dragState.lastLeft = dragState.pendingLeft;
    dragState.lastTop = dragState.pendingTop;
  }

  function stopDrag(event) {
    if (!dragState || (event?.pointerId != null && event.pointerId !== dragState.pointerId)) {
      return;
    }
    const completedDrag = dragState;
    documentRef.removeEventListener("pointermove", handlePointerMove);
    documentRef.removeEventListener("pointerup", stopDrag);
    documentRef.removeEventListener("pointercancel", stopDrag);
    completedDrag.launcher.classList.remove("is-dashboard-chat-launcher-dragging");
    completedDrag.root.classList.remove("is-dashboard-chat-launcher-dragging");

    if (completedDrag.frameId) {
      windowRef.cancelAnimationFrame(completedDrag.frameId);
      completedDrag.frameId = 0;
      applyPendingDragPosition();
    }
    if (completedDrag.moved) {
      writePosition({
        left: completedDrag.lastLeft,
        top: completedDrag.lastTop,
      });
      completedDrag.launcher.dataset.dashboardChatLauncherIgnoreNextOpen = "true";
    } else {
      delete completedDrag.launcher.dataset.dashboardChatLauncherIgnoreNextOpen;
    }
    dragState = null;
  }

  function handlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved) {
      if (Math.hypot(deltaX, deltaY) <= dragThreshold) {
        return;
      }
      dragState.moved = true;
    }

    event.preventDefault();
    const position = getClampedPosition(dragState.root, {
      left: dragState.baseLeft + deltaX,
      top: dragState.baseTop + deltaY,
    });
    dragState.pendingLeft = position.left;
    dragState.pendingTop = position.top;
    if (!dragState.frameId) {
      dragState.frameId = windowRef.requestAnimationFrame(() => {
        if (!dragState) {
          return;
        }
        dragState.frameId = 0;
        applyPendingDragPosition();
      });
    }
  }

  function startDrag(event) {
    if (event?.isPrimary === false || event?.button > 0 || !Number.isFinite(Number(event?.pointerId))) {
      return;
    }
    const launcher = event.target?.closest?.("button.dashboard-chat-launcher[data-dashboard-chat-widget-toggle]");
    if (!launcher || readState()?.isOpen) {
      return;
    }
    const root = getRoot();
    if (!root) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const storedPosition = readPosition();
    const startLeft = Number.isFinite(Number(storedPosition?.left)) ? Number(storedPosition.left) : rect.left;
    const startTop = Number.isFinite(Number(storedPosition?.top)) ? Number(storedPosition.top) : rect.top;
    const startPosition = getClampedPosition(root, { left: startLeft, top: startTop });
    dragState = {
      root,
      launcher,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: startPosition.left,
      baseTop: startPosition.top,
      pendingLeft: startPosition.left,
      pendingTop: startPosition.top,
      lastLeft: startPosition.left,
      lastTop: startPosition.top,
      moved: false,
      frameId: 0,
    };
    launcher.classList.add("is-dashboard-chat-launcher-dragging");
    root.classList.add("is-dashboard-chat-launcher-dragging");
    launcher.setPointerCapture?.(event.pointerId);
    documentRef.addEventListener("pointermove", handlePointerMove, { passive: false });
    documentRef.addEventListener("pointerup", stopDrag, { passive: true });
    documentRef.addEventListener("pointercancel", stopDrag, { passive: true });
  }

  function start() {
    const root = getRoot();
    root?.addEventListener("pointerdown", startDrag, { passive: true });
    windowRef?.addEventListener?.("resize", requestPositionApply, { passive: true });
    windowRef?.addEventListener?.("orientationchange", requestPositionApply, { passive: true });
    documentRef?.addEventListener?.("fullscreenchange", requestAvailabilitySync);
    if (documentRef?.body && typeof windowRef?.MutationObserver === "function") {
      const observer = new windowRef.MutationObserver(requestAvailabilitySync);
      observer.observe(documentRef.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "hidden", "open", "aria-hidden"],
      });
    }
    applyPosition();
    syncAvailability();
  }

  return {
    start,
    applyPosition,
    syncAvailability,
    requestPositionApply,
  };
}
