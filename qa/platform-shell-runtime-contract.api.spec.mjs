import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatformShellRuntime } from "../src/core/platform-shell-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createRuntimeHarness(options = {}) {
  const storage = new Map();
  const preloads = [];
  const stylesheets = [];
  const timeouts = [];
  const intervals = [];
  const mediaListeners = [];
  const ui = { platformThemeModeSelect: { value: "" } };
  const classState = new Set();
  const body = {
    dataset: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) classState.add(name);
        else classState.delete(name);
      },
      contains(name) {
        return classState.has(name);
      },
    },
  };
  const mediaQuery = {
    matches: Boolean(options.prefersDark),
    addEventListener(eventName, listener) {
      mediaListeners.push({ eventName, listener });
    },
    removeEventListener() {},
  };
  const win = {
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    matchMedia(query) {
      return query === "(prefers-color-scheme: dark)" ? mediaQuery : null;
    },
    requestIdleCallback(callback) {
      callback();
    },
    setTimeout(callback, delay) {
      timeouts.push(delay);
      callback();
      return timeouts.length;
    },
    setInterval(callback, delay) {
      intervals.push(delay);
      return intervals.length;
    },
    clearInterval() {},
  };
  const runtime = createPlatformShellRuntime({
    documentRef: { body },
    getUi: () => ui,
    platformModuleLoader: {
      loadStylesheet(key, href, attrs) {
        stylesheets.push({ key, href, attrs });
        return Promise.resolve();
      },
    },
    queueWorkspaceModulePreload(workspaceId) {
      preloads.push(workspaceId);
    },
    win,
  });
  return { body, intervals, mediaListeners, preloads, runtime, storage, stylesheets, ui };
}

test("platform shell runtime owns theme and preload wiring outside app.js", () => {
  const app = readProjectFile("app.js");
  const runtime = readProjectFile("src/core/platform-shell-runtime.mjs");

  expect(app).toContain('import { createPlatformShellRuntime } from "./src/core/platform-shell-runtime.mjs";');
  expect(app).toContain("const platformShellRuntime = createPlatformShellRuntime({");
  expect(app).not.toContain("function isPlatformDarkThemeActive");
  expect(app).not.toContain("function startPlatformThemeScheduler");
  expect(runtime).toContain("football-platform-theme-mode-v1");
  expect(runtime).toContain("dashboard-chat.css");
});

test("platform shell runtime preserves theme modes and scheduled work", async () => {
  const harness = createRuntimeHarness({ prefersDark: true });

  harness.runtime.startPlatformThemeScheduler();
  expect(harness.body.dataset.themeMode).toBe("dark");
  expect(harness.body.classList.contains("is-dark-mode")).toBe(true);
  expect(harness.ui.platformThemeModeSelect.value).toBe("auto");
  expect(harness.mediaListeners).toHaveLength(1);
  expect(harness.intervals).toEqual([60 * 1000]);

  harness.runtime.setPlatformThemeMode("light");
  expect(harness.body.dataset.themeMode).toBe("light");
  expect(harness.body.classList.contains("is-dark-mode")).toBe(false);
  expect(harness.ui.platformThemeModeSelect.value).toBe("light");
  expect(harness.storage.get("football-platform-theme-mode-v1")).toBe("light");

  harness.runtime.setPlatformThemeMode("not-real");
  expect(harness.ui.platformThemeModeSelect.value).toBe("auto");

  harness.runtime.queueDashboardChatStylesheetLoad();
  await Promise.resolve();
  expect(harness.stylesheets).toEqual([
    { key: "dashboard-chat", href: "dashboard-chat.css", attrs: { id: "dashboardChatStylesheet" } },
  ]);

  harness.runtime.queueCriticalWorkspacePreloads();
  expect(harness.preloads).toEqual(["transfer-room", "scouting"]);
});
