const platformThemeModeStorageKey = "football-platform-theme-mode-v1";
const platformThemeModeDefault = "auto";
const platformThemeModeSupported = new Set(["auto", "light", "dark"]);
const platformDarkThemeStartHour = 19;
const platformDarkThemeEndHour = 6;
const platformThemeRefreshIntervalMs = 60 * 1000;

export function createPlatformShellRuntime(deps = {}) {
  const {
    documentRef = globalThis.document,
    getUi = () => ({}),
    platformModuleLoader = null,
    queueWorkspaceModulePreload = () => {},
    win = globalThis,
  } = deps;
  let platformThemeRefreshTimer = null;
  let platformThemeMediaQuery = null;
  let platformThemeMediaQueryListener = null;

  function queuePlatformIdleTask(callback, timeout = 300) {
    if (typeof callback !== "function") return;
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(callback, { timeout });
      return;
    }
    win.setTimeout(callback, Math.min(timeout, 120));
  }

  function ensureDashboardChatStylesheet() {
    return platformModuleLoader?.loadStylesheet?.("dashboard-chat", "dashboard-chat.css", {
      id: "dashboardChatStylesheet",
    }) ?? Promise.resolve(null);
  }

  function queueDashboardChatStylesheetLoad() {
    queuePlatformIdleTask(() => {
      ensureDashboardChatStylesheet().catch(() => {});
    }, 220);
  }

  function queueCriticalWorkspacePreloads() {
    queuePlatformIdleTask(() => {
      queueWorkspaceModulePreload("transfer-room");
    }, 900);
    win.setTimeout(() => queuePlatformIdleTask(() => queueWorkspaceModulePreload("scouting"), 600), 1600);
  }

  function getPlatformColorSchemeMediaQuery() {
    if (platformThemeMediaQuery) return platformThemeMediaQuery;
    if (typeof win.matchMedia !== "function") return null;
    return win.matchMedia("(prefers-color-scheme: dark)");
  }

  function readPlatformThemeMode() {
    try {
      return win.localStorage.getItem(platformThemeModeStorageKey) || platformThemeModeDefault;
    } catch {
      return platformThemeModeDefault;
    }
  }

  function normalizePlatformThemeMode(value = "") {
    const normalizedMode = String(value || "").trim().toLowerCase();
    return platformThemeModeSupported.has(normalizedMode) ? normalizedMode : platformThemeModeDefault;
  }

  function getPlatformThemeMode() {
    return normalizePlatformThemeMode(readPlatformThemeMode());
  }

  function isPlatformDarkThemeActive(now = new Date()) {
    const mode = getPlatformThemeMode();
    if (mode === "dark") return true;
    if (mode === "light") return false;
    const query = platformThemeMediaQuery ?? getPlatformColorSchemeMediaQuery();
    if (query && typeof query.matches === "boolean") return Boolean(query.matches);
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const start = platformDarkThemeStartHour * 60;
    const end = platformDarkThemeEndHour * 60;
    return totalMinutes >= start || totalMinutes < end;
  }

  function applyPlatformThemeByTime() {
    const nextMode = getPlatformThemeMode();
    const isDark = isPlatformDarkThemeActive();
    const ui = getUi();
    if (!documentRef?.body) return;
    documentRef.body.classList.toggle("is-dark-mode", isDark);
    documentRef.body.dataset.themeMode = isDark ? "dark" : "light";
    if (ui.platformThemeModeSelect) {
      ui.platformThemeModeSelect.value = platformThemeModeSupported.has(nextMode)
        ? nextMode
        : platformThemeModeDefault;
    }
  }

  function startPlatformThemeScheduler() {
    if (platformThemeMediaQueryListener && platformThemeMediaQuery) {
      if (typeof platformThemeMediaQuery.removeEventListener === "function") {
        platformThemeMediaQuery.removeEventListener("change", platformThemeMediaQueryListener);
      } else if (typeof platformThemeMediaQuery.removeListener === "function") {
        platformThemeMediaQuery.removeListener(platformThemeMediaQueryListener);
      }
    }
    platformThemeMediaQuery = getPlatformColorSchemeMediaQuery();
    if (platformThemeMediaQuery) {
      if (!platformThemeMediaQueryListener) {
        platformThemeMediaQueryListener = () => applyPlatformThemeByTime();
      }
      if (typeof platformThemeMediaQuery.addEventListener === "function") {
        platformThemeMediaQuery.addEventListener("change", platformThemeMediaQueryListener);
      } else if (typeof platformThemeMediaQuery.addListener === "function") {
        platformThemeMediaQuery.addListener(platformThemeMediaQueryListener);
      }
    }
    applyPlatformThemeByTime();
    if (platformThemeRefreshTimer) {
      win.clearInterval(platformThemeRefreshTimer);
    }
    platformThemeRefreshTimer = win.setInterval(applyPlatformThemeByTime, platformThemeRefreshIntervalMs);
  }

  function setPlatformThemeMode(rawMode = platformThemeModeDefault) {
    const mode = normalizePlatformThemeMode(rawMode);
    try {
      win.localStorage.setItem(platformThemeModeStorageKey, mode);
    } catch {
    }
    const ui = getUi();
    if (ui.platformThemeModeSelect) {
      ui.platformThemeModeSelect.value = mode;
    }
    applyPlatformThemeByTime();
  }

  return {
    applyPlatformThemeByTime,
    ensureDashboardChatStylesheet,
    getPlatformThemeMode,
    isPlatformDarkThemeActive,
    normalizePlatformThemeMode,
    queueCriticalWorkspacePreloads,
    queueDashboardChatStylesheetLoad,
    setPlatformThemeMode,
    startPlatformThemeScheduler,
  };
}
