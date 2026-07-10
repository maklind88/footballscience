export const platformInstallAppPreferenceStorageKey = "footballscience-install-app-prefs-v1";
export const platformInstallAppReminderDelayMs = 7 * 24 * 60 * 60 * 1000;

const installedDisplayModes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];
const installActionLabels = Object.freeze({
  prompt: "Install app",
  guide: "Show guide",
  installed: "Installed",
  unavailable: "Open in Safari",
});

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readInstallAppPreferences(storage) {
  if (!storage?.getItem) return {};
  return safeJsonParse(storage.getItem(platformInstallAppPreferenceStorageKey) || "{}", {});
}

export function writeInstallAppPreferences(storage, preferences = {}) {
  if (!storage?.setItem) return preferences;
  const nextPreferences = {
    remindedAt: "",
    remindAfter: 0,
    dismissedAt: "",
    installedAt: "",
    ...preferences,
  };
  try {
    storage.setItem(platformInstallAppPreferenceStorageKey, JSON.stringify(nextPreferences));
  } catch {
  }
  return nextPreferences;
}

export function detectInstallAppEnvironment(win = globalThis) {
  const nav = win.navigator || {};
  const userAgent = String(nav.userAgent || "");
  const platform = String(nav.platform || "");
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const isIpadLikeMac = platform === "MacIntel" && maxTouchPoints > 1;
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || isIpadLikeMac;
  const isMac = /Mac/i.test(platform) && !isIos;
  const isAndroid = /Android/i.test(userAgent);
  const isEdge = /Edg\//i.test(userAgent);
  const isCriOs = /CriOS/i.test(userAgent);
  const isChrome = /Chrome|Chromium|CriOS/i.test(userAgent) && !/OPR|Opera/i.test(userAgent);
  const isFirefox = /Firefox|FxiOS/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Opera|Firefox|FxiOS/i.test(userAgent);
  const standaloneFromMedia = installedDisplayModes.some((mode) => {
    try {
      return Boolean(win.matchMedia?.(`(display-mode: ${mode})`)?.matches);
    } catch {
      return false;
    }
  });
  return {
    isAndroid,
    isChrome,
    isChromiumLike: isChrome || isEdge,
    isEdge,
    isFirefox,
    isIos,
    isMac,
    isSafari,
    isStandalone: Boolean(standaloneFromMedia || nav.standalone),
    maxTouchPoints,
    platform,
    userAgent,
  };
}

export function getInstallAppCapability(options = {}) {
  const {
    deferredPrompt = null,
    environment = detectInstallAppEnvironment(options.win),
    preferences = {},
    now = Date.now(),
  } = options;
  if (environment.isStandalone || preferences.installedAt) {
    return {
      action: "installed",
      actionLabel: installActionLabels.installed,
      body: "Football Science already opens as an app on this device.",
      canPrompt: false,
      guideSteps: [],
      isInstalled: true,
      status: "installed",
      title: "App installed",
    };
  }
  if (preferences.dismissedAt) {
    return {
      action: "dismissed",
      actionLabel: "",
      body: "Install suggestion hidden for this device.",
      canPrompt: false,
      guideSteps: [],
      isDismissed: true,
      status: "dismissed",
      title: "Hidden",
    };
  }
  if (Number(preferences.remindAfter || 0) > now) {
    return {
      action: "remind-later",
      actionLabel: "",
      body: "Install suggestion will return later on this device.",
      canPrompt: false,
      guideSteps: [],
      isSnoozed: true,
      status: "snoozed",
      title: "Reminder paused",
    };
  }
  if (deferredPrompt) {
    return {
      action: "prompt",
      actionLabel: installActionLabels.prompt,
      body: "Install Football Science as a focused app window for this device.",
      canPrompt: true,
      guideSteps: [],
      status: "ready",
      title: "Install Football Science",
    };
  }
  if (environment.isIos) {
    return {
      action: "guide",
      actionLabel: installActionLabels.guide,
      body: environment.isSafari
        ? "Install from Safari using Share and Add to Home Screen."
        : "Open this page in Safari on iPad, then add it to the Home Screen.",
      canPrompt: false,
      guideSteps: environment.isSafari
        ? ["Open footballscience.xyz in Safari.", "Tap Share.", "Choose Add to Home Screen.", "Confirm Football Science."]
        : ["Open Safari.", "Go to footballscience.xyz.", "Tap Share.", "Choose Add to Home Screen."],
      status: environment.isSafari ? "guide-ios" : "open-safari",
      title: environment.isSafari ? "Install on iPad" : "Use Safari to install",
    };
  }
  if (environment.isMac && environment.isSafari) {
    return {
      action: "guide",
      actionLabel: installActionLabels.guide,
      body: "In Safari on Mac, add Football Science to the Dock from the Share menu.",
      canPrompt: false,
      guideSteps: ["Open footballscience.xyz in Safari.", "Use File or Share.", "Choose Add to Dock.", "Confirm Football Science."],
      status: "guide-mac-safari",
      title: "Add to Dock",
    };
  }
  if (environment.isChromiumLike) {
    return {
      action: "waiting",
      actionLabel: "",
      body: "Your browser will show the install action when Football Science is eligible on this device.",
      canPrompt: false,
      guideSteps: ["Use the browser install icon near the address bar when it appears."],
      status: "waiting",
      title: "Install from browser",
    };
  }
  return {
    action: "unsupported",
    actionLabel: "",
    body: "Install support depends on this browser. Use Chrome, Edge, or Safari for the best app experience.",
    canPrompt: false,
    guideSteps: [],
    status: "unsupported",
    title: "Install support limited",
  };
}

export function renderInstallAppSurfaceContent(surface = "profile", capability = {}) {
  const status = capability.status || "waiting";
  const isAdmin = surface === "admin";
  const isPrompt = surface === "prompt";
  const title = escapeHtml(capability.title || "Install Football Science");
  const body = escapeHtml(capability.body || "Install Football Science on this device.");
  const actionLabel = escapeHtml(capability.actionLabel || installActionLabels.guide);
  const shouldShowPrimary = ["prompt", "guide"].includes(capability.action);
  const action = capability.action === "prompt" ? "install" : "guide";
  const profileMenuItemRole = surface === "profile" ? ' role="menuitem"' : "";
  const steps = Array.isArray(capability.guideSteps) ? capability.guideSteps : [];
  const stepMarkup = steps.length
    ? `<ol class="platform-install-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    : "";
  const detailMarkup = isAdmin || isPrompt ? `${stepMarkup}<p>${body}</p>` : `<p>${body}</p>`;
  const controls = capability.isInstalled
    ? `<span class="platform-install-chip is-installed">Installed</span>`
    : shouldShowPrimary
      ? `<button type="button" class="platform-install-primary" data-install-app-action="${action}"${profileMenuItemRole}>${actionLabel}</button>`
      : `<span class="platform-install-chip">${escapeHtml(capability.status || "Info")}</span>`;
  const reminderControls = !capability.isInstalled && !capability.isDismissed && !isAdmin
    ? `
      <button type="button" class="platform-install-muted" data-install-app-action="later"${profileMenuItemRole}>Remind later</button>
      <button type="button" class="platform-install-muted" data-install-app-action="dismiss"${profileMenuItemRole}>Don't show again</button>
    `
    : "";

  return `
    <div class="platform-install-card is-${escapeHtml(surface)}" data-install-app-status="${escapeHtml(status)}">
      <div class="platform-install-icon" aria-hidden="true"></div>
      <div class="platform-install-copy">
        <strong>${title}</strong>
        ${detailMarkup}
      </div>
      <div class="platform-install-actions">
        ${controls}
        ${reminderControls}
      </div>
    </div>
  `;
}

export function renderPlatformInstallAppAdminPanel() {
  return `
    <article class="admin-card platform-install-admin-panel" data-install-app-surface="admin">
      ${renderInstallAppSurfaceContent("admin", getInstallAppCapability())}
    </article>
  `;
}

export function renderInstallAppGuideModal(capability = {}) {
  const steps = Array.isArray(capability.guideSteps) ? capability.guideSteps : [];
  return `
    <div class="platform-install-modal-backdrop" data-install-app-action="close-guide" role="presentation">
      <article class="platform-install-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(capability.title || "Install Football Science")}">
        <header>
          <div>
            <p>Football Science App</p>
            <h2>${escapeHtml(capability.title || "Install Football Science")}</h2>
          </div>
          <button type="button" data-install-app-action="close-guide" aria-label="Close install guide">Close</button>
        </header>
        <p>${escapeHtml(capability.body || "Install Football Science from this browser.")}</p>
        <ol class="platform-install-modal-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </article>
    </div>
  `;
}

export function createInstallAppController(options = {}) {
  const {
    documentRef = globalThis.document,
    storage = globalThis.localStorage,
    ui = {},
    win = globalThis,
  } = options;
  let deferredPrompt = null;
  let guideOpen = false;
  let renderQueued = false;
  let mutationObserver = null;
  const renderedSurfaceHtml = new WeakMap();

  function getPreferences() {
    return readInstallAppPreferences(storage);
  }

  function setPreferences(nextPreferences) {
    return writeInstallAppPreferences(storage, { ...getPreferences(), ...nextPreferences });
  }

  function getCapability() {
    return getInstallAppCapability({
      deferredPrompt,
      environment: detectInstallAppEnvironment(win),
      preferences: getPreferences(),
      now: Date.now(),
      win,
    });
  }

  function shouldShowSurface(surface, capability) {
    if (surface === "admin") return true;
    if (surface === "prompt") return !guideOpen && !capability.isInstalled && !capability.isDismissed && !capability.isSnoozed && !ui.hubShell?.hidden && ["prompt", "guide"].includes(capability.action);
    return !capability.isDismissed && !capability.isSnoozed && (capability.isInstalled || ["prompt", "guide", "waiting"].includes(capability.action));
  }

  function renderSurface(surfaceElement, capability) {
    const surface = surfaceElement?.dataset?.installAppSurface || "profile";
    if (!surfaceElement) return;
    const visible = shouldShowSurface(surface, capability);
    if (surfaceElement.hidden === visible) {
      surfaceElement.hidden = !visible;
    }
    if (!visible) {
      surfaceElement.innerHTML = "";
      renderedSurfaceHtml.delete(surfaceElement);
      return;
    }
    const html = renderInstallAppSurfaceContent(surface, capability);
    if (renderedSurfaceHtml.get(surfaceElement) !== html) {
      surfaceElement.innerHTML = html;
      renderedSurfaceHtml.set(surfaceElement, html);
    }
  }

  function render() {
    renderQueued = false;
    if (!documentRef?.querySelectorAll) return;
    const capability = getCapability();
    documentRef.querySelectorAll("[data-install-app-surface]").forEach((surfaceElement) => renderSurface(surfaceElement, capability));
    const guideHost = ui.platformInstallGuideHost || documentRef.getElementById?.("platformInstallGuideHost");
    if (guideHost) {
      guideHost.innerHTML = guideOpen ? renderInstallAppGuideModal(capability) : "";
    }
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    win.setTimeout?.(render, 0);
  }

  function rememberLater() {
    const now = Date.now();
    setPreferences({ remindedAt: new Date(now).toISOString(), remindAfter: now + platformInstallAppReminderDelayMs });
    guideOpen = false;
    queueRender();
  }

  function dismiss() {
    setPreferences({ dismissedAt: new Date().toISOString(), remindAfter: 0 });
    guideOpen = false;
    queueRender();
  }

  async function requestInstall() {
    const promptEvent = deferredPrompt;
    if (!promptEvent?.prompt) {
      guideOpen = true;
      queueRender();
      return;
    }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        setPreferences({ installedAt: new Date().toISOString(), dismissedAt: "", remindAfter: 0 });
      }
    } catch {
      guideOpen = true;
    } finally {
      deferredPrompt = null;
      queueRender();
    }
  }

  function handleClick(event) {
    const trigger = event?.target?.closest?.("[data-install-app-action]");
    if (!trigger) return;
    const action = trigger.dataset.installAppAction;
    if (action === "close-guide" && trigger.classList?.contains("platform-install-modal-backdrop") && event.target !== trigger) {
      return;
    }
    if (action === "install") {
      event.preventDefault?.();
      requestInstall();
    } else if (action === "guide") {
      event.preventDefault?.();
      guideOpen = true;
      queueRender();
    } else if (action === "later") {
      event.preventDefault?.();
      rememberLater();
    } else if (action === "dismiss") {
      event.preventDefault?.();
      dismiss();
    } else if (action === "close-guide") {
      event.preventDefault?.();
      guideOpen = false;
      queueRender();
    }
  }

  function initialize() {
    if (!documentRef?.addEventListener || !win?.addEventListener) return { refresh: render };
    win.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault?.();
      deferredPrompt = event;
      queueRender();
    });
    win.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      setPreferences({ installedAt: new Date().toISOString(), dismissedAt: "", remindAfter: 0 });
      queueRender();
    });
    win.addEventListener("platform:user-change", queueRender);
    documentRef.addEventListener("click", handleClick);
    const MutationObserverConstructor = win.MutationObserver || globalThis.MutationObserver;
    if (typeof MutationObserverConstructor === "function" && documentRef.body) {
      mutationObserver = new MutationObserverConstructor(queueRender);
      [ui.hubShell, ui.adminWorkspace, ui.platformInstallPromptHost, ui.platformInstallLoginSurface, ui.platformInstallProfileSurface]
        .filter(Boolean)
        .forEach((element) => mutationObserver.observe(element, { attributes: true, childList: true, subtree: true }));
    }
    render();
    return { refresh: render, disconnect: () => mutationObserver?.disconnect?.() };
  }

  return {
    dismiss,
    getCapability,
    initialize,
    rememberLater,
    render,
    requestInstall,
  };
}
