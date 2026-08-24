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
        replay: { inMs: 1000, outMs: 6000, loop: false },
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

  await page.locator('[data-video-analysis-media-panel="replay"]').click();
  await expect(page.locator(".video-analysis-media-replay-range")).toContainText("0:00:01");
  await expect(page.locator(".video-analysis-media-replay-range")).toContainText("0:00:06");
  await page.locator('[data-video-analysis-media-action="toggle-loop"]').click();
  await expect(page.locator('[data-video-analysis-media-action="toggle-loop"]')).toHaveClass(/is-active/);

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
