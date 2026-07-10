import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  detectInstallAppEnvironment,
  getInstallAppCapability,
  platformInstallAppPreferenceStorageKey,
  readInstallAppPreferences,
  renderInstallAppGuideModal,
  renderInstallAppSurfaceContent,
  renderPlatformInstallAppAdminPanel,
  writeInstallAppPreferences,
} from "../src/core/install-app-controller.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || "",
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function createWindow(userAgent, platform = "", options = {}) {
  return {
    matchMedia: (query) => ({ matches: Boolean(options.displayMode && query.includes(options.displayMode)) }),
    navigator: {
      maxTouchPoints: options.maxTouchPoints || 0,
      platform,
      standalone: Boolean(options.standalone),
      userAgent,
    },
  };
}

test("install app controller detects desktop, installed, and iPad install paths", () => {
  const chromeWin = createWindow(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    "MacIntel",
  );
  const safariIpadWin = createWindow(
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    "iPad",
    { maxTouchPoints: 5 },
  );
  const standaloneWin = createWindow(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
    "MacIntel",
    { displayMode: "standalone" },
  );

  expect(detectInstallAppEnvironment(chromeWin)).toMatchObject({ isChromiumLike: true, isIos: false, isSafari: false });
  expect(detectInstallAppEnvironment(safariIpadWin)).toMatchObject({ isIos: true, isSafari: true });
  expect(detectInstallAppEnvironment(standaloneWin)).toMatchObject({ isStandalone: true });

  expect(getInstallAppCapability({ win: chromeWin, deferredPrompt: { prompt: async () => {} } })).toMatchObject({
    action: "prompt",
    canPrompt: true,
    status: "ready",
  });
  expect(getInstallAppCapability({ win: safariIpadWin })).toMatchObject({
    action: "guide",
    status: "guide-ios",
    title: "Install on iPad",
  });
  expect(getInstallAppCapability({ win: standaloneWin })).toMatchObject({
    action: "installed",
    isInstalled: true,
    status: "installed",
  });
});

test("install app preferences support remind later, dismissed, and installed states", () => {
  const storage = createStorage();
  const now = Date.UTC(2026, 6, 10, 12);
  writeInstallAppPreferences(storage, { remindAfter: now + 1000, remindedAt: "2026-07-10T12:00:00.000Z" });
  expect(readInstallAppPreferences(storage)).toMatchObject({ remindAfter: now + 1000 });
  expect(storage.getItem(platformInstallAppPreferenceStorageKey)).toContain("remindAfter");

  const win = createWindow(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    "MacIntel",
  );
  expect(getInstallAppCapability({ win, preferences: readInstallAppPreferences(storage), now })).toMatchObject({
    action: "remind-later",
    isSnoozed: true,
  });

  writeInstallAppPreferences(storage, { dismissedAt: "2026-07-10T12:00:00.000Z", remindAfter: 0 });
  expect(getInstallAppCapability({ win, preferences: readInstallAppPreferences(storage), now })).toMatchObject({
    action: "dismissed",
    isDismissed: true,
  });

  writeInstallAppPreferences(storage, { installedAt: "2026-07-10T12:00:00.000Z", dismissedAt: "", remindAfter: 0 });
  expect(getInstallAppCapability({ win, preferences: readInstallAppPreferences(storage), now })).toMatchObject({
    action: "installed",
    isInstalled: true,
  });
});

test("install app surfaces are centralized and never point to local or preview hosts", () => {
  const source = readProjectFile("src/core/install-app-controller.mjs");
  const index = readProjectFile("index.html");
  const adminRenderer = readProjectFile("src/modules/admin/admin-workspace-renderer.mjs");
  const workspaceRenderers = readProjectFile("src/modules/platform/workspace-renderers.mjs");
  const appRuntime = readProjectFile("app-runtime.js");
  const css = readProjectFile("platform-install-app.css");

  expect(source).toContain("createInstallAppController");
  expect(source).toContain('win.addEventListener("beforeinstallprompt"');
  expect(source).toContain('win.addEventListener("appinstalled"');
  expect(source).toContain("ui.adminWorkspace");
  expect(source).not.toContain("localhost");
  expect(source).not.toContain("file://");
  expect(index).toContain('id="platformInstallLoginSurface" data-install-app-surface="login"');
  expect(index).toContain('id="platformInstallProfileSurface" data-install-app-surface="profile" role="none"');
  expect(index).toContain('id="platformInstallPromptHost" data-install-app-surface="prompt"');
  expect(index).toContain('id="platformInstallGuideHost"');
  expect(index).toContain("platform-install-app.css");
  expect(appRuntime).toContain("createInstallAppController({");
  expect(adminRenderer).toContain("renderPlatformInstallAppPanel");
  expect(workspaceRenderers).toContain("renderPlatformInstallAppAdminPanel");
  expect(css).toContain(".platform-install-card.is-prompt");

  const readyHtml = renderInstallAppSurfaceContent("profile", {
    action: "prompt",
    actionLabel: "Install app",
    body: "Install Football Science.",
    status: "ready",
    title: "Install Football Science",
  });
  expect(readyHtml).toContain('data-install-app-action="install"');
  expect(readyHtml).toContain('role="menuitem"');
  expect(readyHtml).toContain('data-install-app-action="later"');
  expect(readyHtml).toContain('data-install-app-action="dismiss"');

  const guideHtml = renderInstallAppSurfaceContent("login", {
    action: "guide",
    actionLabel: "Show guide",
    body: "Use Safari.",
    guideSteps: ["Open Safari.", "Add to Home Screen."],
    status: "guide-ios",
    title: "Install on iPad",
  });
  expect(guideHtml).toContain('data-install-app-action="guide"');
  const guideModalHtml = renderInstallAppGuideModal({
    body: "Use Safari.",
    guideSteps: ["Open Safari.", "Add to Home Screen."],
    title: "Install on iPad",
  });
  expect(guideModalHtml).toContain("Add to Home Screen");
  expect(renderPlatformInstallAppAdminPanel()).toContain('data-install-app-surface="admin"');
});
