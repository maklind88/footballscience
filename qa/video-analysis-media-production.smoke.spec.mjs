import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const primaryAngleId = "41c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const tacticalAngleId = "42c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openMediaWorkspace(page) {
  await page.addInitScript((ids) => {
    try {
      Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => null });
    } catch {
      // The smoke view only needs stable local-angle geometry, not codec validation.
    }
    const primaryUrl = URL.createObjectURL(new Blob(["primary-video"], { type: "video/mp4" }));
    const tacticalUrl = URL.createObjectURL(new Blob(["tactical-video"], { type: "video/mp4" }));
    const primaryProxyUrl = URL.createObjectURL(new Blob(["primary-proxy"], { type: "video/mp4" }));
    const tacticalProxyUrl = URL.createObjectURL(new Blob(["tactical-proxy"], { type: "video/mp4" }));
    const replayUrl = URL.createObjectURL(new Blob(["replay-buffer"], { type: "video/mp4" }));
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const angles = [
      {
        id: ids.primaryAngleId,
        matchId: ids.matchId,
        videoId: ids.videoId,
        sourceId: "31c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        label: "Broadcast main",
        role: "primary",
        localVideoIdentifier: "local-primary-video",
        durationMs: 120_000,
        primary: true,
        status: "available",
        syncConfidence: 1,
        revision: 2,
      },
      {
        id: ids.tacticalAngleId,
        matchId: ids.matchId,
        videoId: "27c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        sourceId: "32c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        label: "Tactical wide",
        role: "tactical",
        localVideoIdentifier: "local-tactical-video",
        syncOffsetMs: 2400,
        driftPpm: 80,
        durationMs: 122_000,
        primary: false,
        status: "available",
        syncConfidence: 0.9,
        revision: 3,
      },
    ];
    window.__videoAnalysisSmokeMediaAngles = angles;
    window.__videoAnalysisInitialState = {
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      match: { id: ids.matchId, title: "Match #11 @ Angel City" },
      video: { id: ids.videoId, match_id: ids.matchId, duration_ms: 120_000 },
      source: {
        id: "31c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        match_id: ids.matchId,
        video_id: ids.videoId,
        local_video_identifier: "local-primary-video",
        duration_ms: 120_000,
      },
      videoRef: {
        displayName: "Broadcast main.mp4",
        objectUrl: primaryUrl,
        localVideoIdentifier: "local-primary-video",
        durationMs: 120_000,
        playbackCompatibility: { status: "supported", canPlay: true },
      },
      timeline: { zoom: 1, viewMode: "overview", laneMode: "all", playheadMs: 12_000, selectedClipIds: [], history: [] },
      mediaProduction: {
        status: "ready",
        panelOpen: false,
        panel: "angles",
        angles,
        angleRefs: {
          [ids.tacticalAngleId]: {
            displayName: "Tactical wide.mp4",
            objectUrl: tacticalUrl,
            localVideoIdentifier: "local-tactical-video",
            durationMs: 122_000,
            playbackCompatibility: { status: "supported", canPlay: true },
          },
        },
        primaryAngleId: ids.primaryAngleId,
        activeAngleId: ids.primaryAngleId,
        viewMode: "compare",
        loadedMatchId: ids.matchId,
        replay: {
          inMs: 1000,
          outMs: 6000,
          loop: false,
          buffer: {
            status: "ready",
            active: false,
            angleId: ids.tacticalAngleId,
            startMatchMs: 1000,
            endMatchMs: 6000,
            progress: 1,
            result: { artifactId: "replay-local-1", replayUrl, expiresAt, durationMs: 5000, sizeBytes: 1_250_000 },
            error: "",
          },
        },
        proxy: {
          preset: "scrub-540p",
          byAngleId: {
            [ids.primaryAngleId]: {
              status: "ready",
              enabled: false,
              result: { artifactId: `proxy-${"a".repeat(40)}`, proxyUrl: primaryProxyUrl, expiresAt, preset: "scrub-540p", height: 540, fps: 25, keyframeSeconds: 1, sizeBytes: 8_250_000, sha256: "1".repeat(64), cacheHit: false },
            },
            [ids.tacticalAngleId]: {
              status: "ready",
              enabled: false,
              result: { artifactId: `proxy-${"b".repeat(40)}`, proxyUrl: tacticalProxyUrl, expiresAt, preset: "scrub-540p", height: 540, fps: 25, keyframeSeconds: 1, sizeBytes: 7_900_000, sha256: "2".repeat(64), cacheHit: true },
            },
          },
        },
        export: {
          id: "",
          title: "Pressing review",
          preset: "analysis-1080p",
          status: "idle",
          stage: "",
          progress: 0,
          result: null,
          error: "",
        },
        error: "",
      },
    };
  }, { matchId, videoId, primaryAngleId, tacticalAngleId });
  await page.goto("/qa/video-analysis-browser-smoke.html?elite=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-media-production]")).toBeVisible();
}

test("media production switches synchronized cameras and edits replay/export state", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openMediaWorkspace(page);

  await expect(page.locator(".video-analysis-video-frame")).toHaveClass(/is-media-compare/);
  await expect(page.locator("[data-video-analysis-media-secondary]")).toHaveCount(1);
  await page.locator('[data-video-analysis-media-action="toggle"]').click();
  await expect(page.locator(".video-analysis-media-angle")).toHaveCount(2);
  await expect(page.locator(".video-analysis-media-angle.is-active")).toContainText("Broadcast main");

  await page.locator(`[data-video-analysis-media-action="select-angle"][data-video-analysis-media-angle="${tacticalAngleId}"]`).click();
  await expect(page.locator(".video-analysis-player h2")).toHaveText("Tactical wide");
  const offset = page.locator(`[data-video-analysis-media-angle-field="syncOffsetSeconds"][data-video-analysis-media-angle="${tacticalAngleId}"]`);
  await offset.fill("3.25");
  await offset.blur();
  await expect.poll(() => page.evaluate(() => {
    const requests = window.__videoAnalysisRequests || [];
    return requests.findLast?.((request) => request.action === "save-media-angle")?.body?.angle?.syncOffsetMs || 0;
  })).toBe(3250);

  await page.locator('[data-video-analysis-media-panel="proxy"]').click();
  await expect(page.locator(".video-analysis-media-proxy-panel")).toContainText("Proxy ready");
  await expect(page.locator(".video-analysis-media-proxy-metrics")).toContainText("540p / 25 fps");
  await expect(page.locator(".video-analysis-media-proxy-fields")).toContainText("Reused");
  await page.locator('[data-video-analysis-proxy-action="toggle"]').click();
  await expect(page.locator('[data-video-analysis-proxy-action="toggle"]')).toHaveText("Use original");
  await page.screenshot({ path: testInfo.outputPath("media-proxy-desktop.png"), fullPage: true });

  await page.locator('[data-video-analysis-media-panel="replay"]').click();
  await expect(page.locator(".video-analysis-media-replay-range")).toContainText("0:00:01");
  await expect(page.locator(".video-analysis-media-replay-range")).toContainText("0:00:06");
  await page.locator('[data-video-analysis-media-action="toggle-loop"]').click();
  await expect(page.locator('[data-video-analysis-media-action="toggle-loop"]')).toHaveClass(/is-active/);
  await expect(page.locator(".video-analysis-media-replay-buffer")).toContainText("Buffer ready");
  await expect(page.locator('[data-video-analysis-proxy-action="play-replay"]')).toBeEnabled();
  await page.locator('[data-video-analysis-proxy-action="play-replay"]').click();
  await expect(page.locator(".video-analysis-media-replay-buffer")).toHaveClass(/is-active/);
  await expect(page.locator('[data-video-analysis-proxy-action="stop-replay"]')).toBeVisible();
  await page.locator('[data-video-analysis-proxy-action="stop-replay"]').click();
  await expect(page.locator(".video-analysis-media-replay-buffer")).not.toHaveClass(/is-active/);

  await page.locator('[data-video-analysis-media-panel="export"]').click();
  await expect(page.locator(".video-analysis-media-export-summary")).toContainText("Tactical wide");
  await expect(page.locator(".video-analysis-media-export-summary")).toContainText("0:00:01 - 0:00:06");
  await page.locator('[data-video-analysis-media-field="export.preset"]').selectOption("master-2160p");
  await expect(page.locator('[data-video-analysis-media-field="export.preset"]')).toHaveValue("master-2160p");
  await page.screenshot({ path: testInfo.outputPath("media-production-desktop.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("media production remains contained on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMediaWorkspace(page);
  await page.locator('[data-video-analysis-media-action="toggle"]').click();
  await page.locator('[data-video-analysis-media-panel="proxy"]').click();
  const geometry = await page.locator("[data-video-analysis-media-production]").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("media-production-mobile.png"), fullPage: true });
});

test("live capture streams to a local file and links a match-synchronized angle", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const chunks = [];
    const tracks = [{
      addEventListener() {},
      stop() {},
    }];
    const stream = {
      getTracks: () => tracks,
      getVideoTracks: () => tracks,
    };
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(value) { return value.startsWith("video/webm"); }
      constructor(input, options = {}) {
        super();
        this.input = input;
        this.mimeType = options.mimeType || "video/webm";
        this.state = "inactive";
      }
      start() { this.state = "recording"; }
      requestData() {
        this.dispatchEvent(new MessageEvent("dataavailable", {
          data: new Blob(["captured-frame-data"], { type: "video/webm" }),
        }));
      }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        queueMicrotask(() => this.dispatchEvent(new Event("stop")));
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => stream,
        getUserMedia: async () => stream,
      },
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        async createWritable() {
          return {
            async write(blob) { chunks.push(blob); },
            async close() {},
            async abort() {},
          };
        },
        async getFile() {
          return new File(chunks, "live-screen.webm", { type: "video/webm", lastModified: 1_786_000_000_000 });
        },
      }),
    });
  });
  await openMediaWorkspace(page);
  await page.locator('[data-video-analysis-media-action="toggle"]').click();
  await page.locator('[data-video-analysis-media-panel="capture"]').click();
  await page.locator('[data-video-analysis-capture-action="prepare-screen"]').click();
  await expect(page.locator(".video-analysis-media-capture-status")).toContainText("Ready to start");
  await page.locator('[data-video-analysis-capture-action="start"]').click();
  await expect(page.locator(".video-analysis-media-capture-status")).toContainText("Recording");
  await page.screenshot({ path: testInfo.outputPath("media-capture-recording.png"), fullPage: true });
  await page.locator('[data-video-analysis-capture-action="stop"]').click();
  await expect(page.locator(".video-analysis-media-capture-status")).toContainText("Angle ready");
  await page.locator('[data-video-analysis-media-panel="angles"]').click();
  await expect(page.locator(".video-analysis-media-angle")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => {
    const requests = window.__videoAnalysisRequests || [];
    const request = requests.findLast?.((entry) => entry.action === "save-media-angle" && entry.body?.angle?.metadata?.capturedLocally);
    return request?.body?.angle?.syncOffsetMs;
  })).toBe(-12_000);
});
