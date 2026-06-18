export const platformOverlayStabilityRootSelectors = Object.freeze([
  '[role="dialog"][aria-modal="true"]',
  "[data-session-library-overlay]",
  "[data-session-save-conflict-overlay]",
  "[data-session-visual-preview-overlay]",
  "[data-session-tacticalboard-overlay]",
  "[data-session-player-board-overlay]",
  "[data-session-player-board-profile-overlay]",
  "[data-session-selection-assistant-overlay]",
  "[data-session-periodization-overlay]",
  "[data-periodization-overlay]",
  "[data-staff-create-user-overlay]",
  "[data-admin-create-user-overlay]",
  "[data-admin-user-editor-overlay]",
  "[data-player-profile-modal-overlay]",
  "[data-player-profile-new-modal-overlay]",
  ".dashboard-modal-root:not([hidden])",
  ".medical-modal-layer",
  ".scouting-profile-modal",
]);

export function createPlatformOverlayStabilityInstaller(options = {}) {
  const win = options.win ?? globalThis.window;
  const doc = options.document ?? win?.document ?? globalThis.document;
  const ElementCtor = options.Element ?? win?.Element ?? globalThis.Element;
  const MutationObserverCtor = options.MutationObserver ?? win?.MutationObserver ?? globalThis.MutationObserver;
  const requestFrame = options.requestAnimationFrame ?? win?.requestAnimationFrame?.bind(win) ?? globalThis.requestAnimationFrame;
  const rootSelectors = options.rootSelectors ?? platformOverlayStabilityRootSelectors;
  const closestSelector = rootSelectors.join(",");
  const state = {
    active: false,
    rootScrollTop: 0,
    rootScrollLeft: 0,
    backgroundScroller: null,
    scrollPositions: new Map(),
    workspaceScrollPositions: new Map(),
    restoreFrame: 0,
    syncFrame: 0,
    workspaceRestoreFrame: 0,
    pendingWorkspaceRestoreId: "",
    suppressWorkspaceCapture: false,
    observer: null,
    installed: false,
  };

  function isElement(node) {
    return Boolean(ElementCtor && node instanceof ElementCtor);
  }

  function getContentScroller() {
    const contentScroller = doc?.querySelector?.(".platform-content");
    if (isElement(contentScroller) && contentScroller.scrollHeight > contentScroller.clientHeight + 1) {
      return contentScroller;
    }
    return doc?.scrollingElement || doc?.documentElement || null;
  }

  function getActiveWorkspaceId() {
    return String(doc?.body?.dataset?.activeWorkspace || "").trim();
  }

  function normalizeWorkspaceId(workspaceId = getActiveWorkspaceId()) {
    return String(workspaceId || "").trim();
  }

  function isOverlayElementVisible(node) {
    if (!isElement(node) || node.hidden || node.closest("[hidden]")) {
      return false;
    }
    const style = win.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeOverlayRoot(node) {
    if (!isElement(node)) {
      return null;
    }
    const dialog = node.matches('[role="dialog"][aria-modal="true"]')
      ? node
      : node.querySelector?.('[role="dialog"][aria-modal="true"]');
    return isElement(dialog) ? dialog : node;
  }

  function getActiveOverlayRoots() {
    const roots = new Set();
    doc.querySelectorAll(closestSelector).forEach((node) => {
      const root = normalizeOverlayRoot(node);
      if (root && isOverlayElementVisible(root)) {
        roots.add(root);
      }
    });
    return Array.from(roots);
  }

  function getOverlayRootForNode(node) {
    if (!isElement(node)) {
      return null;
    }
    const root = normalizeOverlayRoot(node.closest(closestSelector));
    return root && isOverlayElementVisible(root) ? root : null;
  }

  function getOverlayDataIdentity(node) {
    if (!isElement(node)) {
      return "";
    }
    const dataset = node.dataset || {};
    const dataKey = Object.keys(dataset).find((key) => dataset[key] === "" || dataset[key] === "true");
    if (dataKey) {
      return dataKey;
    }
    return node.id || node.getAttribute("aria-label") || node.className || node.tagName;
  }

  function getOverlayIdentity(root) {
    if (!root) {
      return "root";
    }
    const ownDataIdentity = getOverlayDataIdentity(root);
    if (ownDataIdentity) {
      return ownDataIdentity;
    }
    const wrapperDataIdentity = getOverlayDataIdentity(root.closest(closestSelector));
    return wrapperDataIdentity || "overlay";
  }

  function getOverlayNodePath(node, root) {
    const path = [];
    let current = node;
    while (current && current !== root && path.length < 8) {
      if (!isElement(current)) {
        break;
      }
      const dataIdentity = getOverlayDataIdentity(current);
      const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName) : [];
      const siblingIndex = siblings.indexOf(current);
      path.push(`${current.tagName.toLowerCase()}:${dataIdentity || siblingIndex}`);
      current = current.parentElement;
    }
    return path.reverse().join("/");
  }

  function getScrollerKey(scroller, root) {
    return `${getOverlayIdentity(root)}::${getOverlayNodePath(scroller, root)}`;
  }

  function rememberScroll(node) {
    const root = getOverlayRootForNode(node);
    if (!root) {
      return;
    }
    state.scrollPositions.set(getScrollerKey(node, root), {
      top: node.scrollTop,
      left: node.scrollLeft,
    });
  }

  function getScrollableNodes(root) {
    if (!root) {
      return [];
    }
    return [root, ...root.querySelectorAll("*")].filter((node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
  }

  function restoreScrollPositions() {
    state.restoreFrame = 0;
    const activeRoots = getActiveOverlayRoots();
    const contentScroller = state.backgroundScroller || getContentScroller();
    if (state.active && contentScroller) {
      contentScroller.scrollTop = state.rootScrollTop;
      contentScroller.scrollLeft = state.rootScrollLeft;
    }
    activeRoots.forEach((root) => {
      getScrollableNodes(root).forEach((node) => {
        const position = state.scrollPositions.get(getScrollerKey(node, root));
        if (!position) {
          return;
        }
        if (Math.abs(node.scrollTop - position.top) > 1) {
          node.scrollTop = position.top;
        }
        if (Math.abs(node.scrollLeft - position.left) > 1) {
          node.scrollLeft = position.left;
        }
      });
    });
  }

  function rememberWorkspaceScroll(workspaceId = getActiveWorkspaceId(), scroller = getContentScroller()) {
    const workspaceKey = normalizeWorkspaceId(workspaceId);
    if (!workspaceKey || !scroller) {
      return false;
    }
    state.workspaceScrollPositions.set(workspaceKey, {
      top: scroller.scrollTop || 0,
      left: scroller.scrollLeft || 0,
    });
    return true;
  }

  function releaseWorkspaceCaptureAfterRestore(workspaceId) {
    const workspaceKey = normalizeWorkspaceId(workspaceId);
    const release = () => {
      if (!state.pendingWorkspaceRestoreId || state.pendingWorkspaceRestoreId === workspaceKey) {
        state.pendingWorkspaceRestoreId = "";
        state.suppressWorkspaceCapture = false;
      }
    };
    if (typeof requestFrame === "function") {
      requestFrame(() => requestFrame(release));
      return;
    }
    release();
  }

  function prepareWorkspaceRestore(workspaceId = getActiveWorkspaceId()) {
    const workspaceKey = normalizeWorkspaceId(workspaceId);
    if (!workspaceKey) {
      return false;
    }
    state.pendingWorkspaceRestoreId = workspaceKey;
    state.suppressWorkspaceCapture = true;
    return true;
  }

  function restoreWorkspaceScrollNow(workspaceId = getActiveWorkspaceId()) {
    const workspaceKey = normalizeWorkspaceId(workspaceId);
    const position = workspaceKey ? state.workspaceScrollPositions.get(workspaceKey) : null;
    const scroller = getContentScroller();
    if (!workspaceKey || !position || !scroller) {
      releaseWorkspaceCaptureAfterRestore(workspaceKey);
      return false;
    }
    if (Math.abs((scroller.scrollTop || 0) - position.top) > 1) {
      scroller.scrollTop = position.top;
    }
    if (Math.abs((scroller.scrollLeft || 0) - position.left) > 1) {
      scroller.scrollLeft = position.left;
    }
    releaseWorkspaceCaptureAfterRestore(workspaceKey);
    return true;
  }

  function restoreWorkspaceScroll(workspaceId = getActiveWorkspaceId()) {
    const workspaceKey = normalizeWorkspaceId(workspaceId);
    if (!workspaceKey) {
      return false;
    }
    if (state.workspaceRestoreFrame || typeof requestFrame !== "function") {
      return restoreWorkspaceScrollNow(workspaceKey);
    }
    state.workspaceRestoreFrame = requestFrame(() => {
      requestFrame(() => {
        state.workspaceRestoreFrame = 0;
        restoreWorkspaceScrollNow(workspaceKey);
      });
    });
    return state.workspaceScrollPositions.has(workspaceKey);
  }

  function rememberWorkspaceScrollFromEvent(event) {
    if (state.active || state.suppressWorkspaceCapture || state.pendingWorkspaceRestoreId) {
      return;
    }
    const contentScroller = getContentScroller();
    const target = event?.target === doc ? contentScroller : event?.target;
    if (!contentScroller || target !== contentScroller) {
      return;
    }
    rememberWorkspaceScroll(getActiveWorkspaceId(), contentScroller);
  }

  function scheduleRestore() {
    if (state.restoreFrame || typeof requestFrame !== "function") {
      return;
    }
    state.restoreFrame = requestFrame(() => {
      requestFrame(restoreScrollPositions);
    });
  }

  function sync() {
    state.syncFrame = 0;
    const activeRoots = getActiveOverlayRoots();
    const contentScroller = getContentScroller();
    if (activeRoots.length && !state.active) {
      state.active = true;
      state.backgroundScroller = contentScroller;
      state.rootScrollTop = contentScroller?.scrollTop || 0;
      state.rootScrollLeft = contentScroller?.scrollLeft || 0;
      doc.body.classList.add("has-platform-overlay-open");
    }
    if (!activeRoots.length && state.active) {
      const lockedScroller = state.backgroundScroller || contentScroller;
      if (lockedScroller) {
        lockedScroller.scrollTop = state.rootScrollTop;
        lockedScroller.scrollLeft = state.rootScrollLeft;
      }
      state.active = false;
      state.backgroundScroller = null;
      doc.body.classList.remove("has-platform-overlay-open");
      return;
    }
    if (activeRoots.length) {
      scheduleRestore();
    }
  }

  function scheduleSync() {
    if (state.syncFrame || typeof requestFrame !== "function") {
      return;
    }
    state.syncFrame = requestFrame(sync);
  }

  function install() {
    if (state.installed || !win || !doc?.body || !MutationObserverCtor) {
      return false;
    }
    state.installed = true;
    doc.addEventListener(
      "scroll",
      (event) => {
        if (!state.active) {
          rememberWorkspaceScrollFromEvent(event);
          return;
        }
        const target = event.target === doc ? state.backgroundScroller || getContentScroller() : event.target;
        if (!isElement(target)) {
          return;
        }
        if (target === (state.backgroundScroller || getContentScroller())) {
          target.scrollTop = state.rootScrollTop;
          target.scrollLeft = state.rootScrollLeft;
          return;
        }
        rememberScroll(target);
      },
      true
    );
    doc.addEventListener("focusin", scheduleRestore, true);
    win.addEventListener("resize", scheduleRestore);
    state.observer = new MutationObserverCtor(scheduleSync);
    state.observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style", "aria-hidden"],
    });
    win.footballScienceOverlayStability = {
      capture: rememberScroll,
      captureWorkspace: rememberWorkspaceScroll,
      getBackgroundScroller: getContentScroller,
      prepareWorkspaceRestore,
      restore: restoreScrollPositions,
      restoreWorkspace: restoreWorkspaceScroll,
      sync,
    };
    sync();
    return true;
  }

  return {
    install,
    state,
  };
}

export function installPlatformOverlayStability(options = {}) {
  return createPlatformOverlayStabilityInstaller(options).install();
}
