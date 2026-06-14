const rootContexts = new WeakMap();
const fallbackBoundRoots = new WeakSet();

export function eventElement(event) {
  const target = event?.target;
  if (target?.nodeType === 1) return target;
  return target?.parentElement || null;
}

function contextForRoot(root) {
  return rootContexts.get(root) || {};
}

export function bindRootEventFallback(root, context = {}, handlers = {}) {
  if (!root) return;
  rootContexts.set(root, context);
  if (fallbackBoundRoots.has(root)) return;
  Object.entries(handlers).forEach(([type, handler]) => {
    if (typeof handler !== "function") return;
    root.addEventListener(type, (event) => {
      if (event.__videoAnalysisHandled) return;
      const handled = handler(event, contextForRoot(root));
      if (handled) {
        event.__videoAnalysisHandled = true;
        event.stopPropagation();
      }
    }, true);
  });
  fallbackBoundRoots.add(root);
}

function handleDirectControlEvent(event, handler) {
  if (event?.currentTarget?.disabled || typeof handler !== "function") return;
  event?.preventDefault?.();
  event.__videoAnalysisHandled = true;
  handler();
  event?.stopPropagation?.();
}

export function bindPaintedVideoControls(root, actions = {}) {
  if (!root) return;
  root.querySelectorAll("[data-video-analysis-load]").forEach((button) => {
    button.addEventListener("click", (event) => handleDirectControlEvent(event, () => {
      actions.openLocalVideoPicker?.(contextForRoot(root));
    }));
  });
  root.querySelectorAll("[data-video-analysis-restore-local-file]").forEach((button) => {
    button.addEventListener("click", (event) => handleDirectControlEvent(event, () => {
      actions.restoreLocalVideoHandle?.(contextForRoot(root), { requestPermission: true });
    }));
  });
  root.querySelectorAll("[data-video-analysis-play]").forEach((button) => {
    button.addEventListener("click", (event) => handleDirectControlEvent(event, () => {
      actions.togglePlayback?.(contextForRoot(root));
    }));
  });
  root.querySelectorAll("[data-video-analysis-prepare-playback]").forEach((button) => {
    button.addEventListener("click", (event) => handleDirectControlEvent(event, () => {
      actions.preparePlayableCopy?.(contextForRoot(root));
    }));
  });
  root.querySelectorAll("[data-video-analysis-file]").forEach((input) => {
    input.addEventListener("change", (event) => {
      event.__videoAnalysisHandled = true;
      if (input.files?.[0]) {
        actions.handleFileSelection?.(input.files[0], contextForRoot(root));
        input.value = "";
      }
      event.stopPropagation();
    });
  });
}
