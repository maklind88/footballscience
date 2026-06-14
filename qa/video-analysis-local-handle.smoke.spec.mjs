import { expect, test } from "@playwright/test";

const h264Mp4FixtureBase64 = Buffer.from("ftypisommp42moovtrakmdiahdlrstsdavc1", "latin1").toString("base64");

async function installDeterministicMedia(page) {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "error", {
      configurable: true,
      get() {
        return this.__videoAnalysisForcedError || null;
      },
    });
    const nativeLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function load() {
      if (this.matches?.("[data-video-analysis-video]")) return;
      return nativeLoad?.call(this);
    };
  });
}

async function clearHandleDatabase(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("football-science-video-handles");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(true);
    request.onblocked = () => resolve(false);
  }));
}

test("local video handle store saves, restores, lists and removes IndexedDB handles", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await clearHandleDatabase(page);

  const result = await page.evaluate(async () => {
    const store = await import("/src/modules/video-analysis/services/localVideoHandleStore.js");
    const handle = { kind: "file", name: "match.mp4" };
    const identity = {
      organizationId: "org-1",
      teamId: "team-1",
      matchId: "match-1",
      videoId: "video-1",
      localVideoIdentifier: "local-video-1",
    };
    const saved = await store.saveVideoHandle({ ...identity, handle });
    const found = await store.getVideoHandle(identity);
    const listed = await store.listVideoHandlesForMatch({ organizationId: "org-1", teamId: "team-1", matchId: "match-1" });
    await store.saveVideoHandle({
      organizationId: "local",
      teamId: "team",
      matchId: "match-legacy",
      videoId: "video-legacy",
      localVideoIdentifier: "local-video-legacy",
      handle: { kind: "file", name: "legacy-match.mp4" },
    });
    const legacyFound = await store.getVideoHandle({
      organizationId: "org-live",
      teamId: "team-live",
      matchId: "match-legacy",
      videoId: "video-legacy",
      localVideoIdentifier: "local-video-legacy",
    });
    const removed = await store.removeVideoHandle(identity);
    const afterRemove = await store.getVideoHandle(identity);
    return {
      savedName: saved.name,
      foundName: found.handle.name,
      listedCount: listed.length,
      legacyFoundName: legacyFound.handle.name,
      removed,
      afterRemove,
    };
  });

  expect(result).toEqual({
    savedName: "match.mp4",
    foundName: "match.mp4",
    listedCount: 1,
    legacyFoundName: "legacy-match.mp4",
    removed: true,
    afterRemove: null,
  });
});

test("local video permission helpers verify and request read access", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const store = await import("/src/modules/video-analysis/services/localVideoHandleStore.js");
    const calls = [];
    const handle = {
      queryPermission: async (options) => {
        calls.push(`query:${options.mode}`);
        return "prompt";
      },
      requestPermission: async (options) => {
        calls.push(`request:${options.mode}`);
        return "granted";
      },
    };
    return {
      first: await store.verifyPermission(handle),
      second: await store.requestPermission(handle),
      calls,
    };
  });

  expect(result).toEqual({
    first: "prompt",
    second: "granted",
    calls: ["query:read", "request:read"],
  });
});

test("video analysis restores a persisted File System Access handle after refresh", async ({ page }) => {
  await installDeterministicMedia(page);
  const identity = {
    organizationId: "local",
    teamId: "team",
    matchId: "match-restore",
    videoId: "video-restore",
    localVideoIdentifier: "local-video-restore",
  };

  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await clearHandleDatabase(page);

  const setup = await page.evaluate(async ({ identityPayload, fixtureBase64 }) => {
    if (!navigator.storage?.getDirectory) return { supported: false };
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("restore-match.mp4", { create: true });
    const writable = await handle.createWritable();
    const binary = atob(fixtureBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    await writable.write(new File([bytes], "restore-match.mp4", { type: "video/mp4" }));
    await writable.close();
    const store = await import("/src/modules/video-analysis/services/localVideoHandleStore.js");
    await store.saveVideoHandle({ ...identityPayload, handle });
    return { supported: true };
  }, { identityPayload: identity, fixtureBase64: h264Mp4FixtureBase64 });

  test.skip(!setup.supported, "Origin Private File System handles are not available in this browser.");

  await page.addInitScript((identityPayload) => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: { id: identityPayload.matchId, title: "Restore match" },
      video: { id: identityPayload.videoId, match_id: identityPayload.matchId },
      source: {
        id: "source-restore",
        match_id: identityPayload.matchId,
        video_id: identityPayload.videoId,
        local_video_identifier: identityPayload.localVideoIdentifier,
      },
    };
  }, identity);

  await page.goto("/qa/video-analysis-browser-smoke.html?restore=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "duration", { configurable: true, value: 55.5 });
    video.dispatchEvent(new Event("loadedmetadata"));
  });
  await expect(page.locator(".video-analysis-player h2")).toContainText("restore-match.mp4");
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);
});

test("missing local file metadata shows link state instead of bridge-first prepare", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: { id: "match-missing", title: "Missing local file" },
      video: { id: "video-missing", match_id: "match-missing" },
      source: {
        id: "source-missing",
        match_id: "match-missing",
        video_id: "video-missing",
        local_video_identifier: "local-video-missing",
      },
    };
  });

  await page.goto("/qa/video-analysis-browser-smoke.html?missing=1", { waitUntil: "domcontentloaded" });
  await clearHandleDatabase(page);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-video]")).toHaveCount(0);
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Local file linked but not available on this device");
  await expect(page.locator(".video-analysis-empty-video [data-video-analysis-load]")).toContainText("Link local file");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);
});

test("permission-needed local handles show reconnect instead of a new link flow", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisInitialState = {
      status: "ready",
      view: "workspace",
      match: { id: "match-permission", title: "Permission match" },
      video: { id: "video-permission", match_id: "match-permission" },
      source: {
        id: "source-permission",
        match_id: "match-permission",
        video_id: "video-permission",
        local_video_identifier: "local-video-permission",
      },
      localFileStatus: "permission-needed",
      localFileMessage: "Local file permission needed",
    };
  });

  await page.goto("/qa/video-analysis-browser-smoke.html?permission-needed=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".video-analysis-empty-video [data-video-analysis-restore-local-file]")).toContainText("Reconnect local file");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-restore-local-file]")).toContainText("Reconnect local file");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-load]")).toHaveCount(0);
});

test("unsupported File System Access browsers keep the file input fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    window.__videoAnalysisInitialState = { view: "workspace" };
  });

  await page.goto("/qa/video-analysis-browser-smoke.html?fallback=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-file]")).toHaveCount(1);
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-load]")).toContainText("Link local file");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);
});

test("File System Access gesture failures fall back to the file input picker", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisInitialState = { view: "workspace" };
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => {
        throw new DOMException(
          "Failed to execute 'showOpenFilePicker' on 'Window': Must be handling a user gesture to show a file picker.",
          "NotAllowedError"
        );
      },
    });
    window.__videoAnalysisFileInputClicks = 0;
    const nativeClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function click() {
      if (this.matches?.("[data-video-analysis-file]")) window.__videoAnalysisFileInputClicks += 1;
      return nativeClick.call(this);
    };
  });

  await page.goto("/qa/video-analysis-browser-smoke.html?gesture-fallback=1", { waitUntil: "domcontentloaded" });
  await page.locator(".video-analysis-player__actions [data-video-analysis-load]").click();

  await expect.poll(() => page.evaluate(() => window.__videoAnalysisFileInputClicks)).toBe(1);
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-load]")).toContainText("Link local file");
  await expect(page.locator(".video-analysis-error[role='alert']")).toHaveCount(0);
});
