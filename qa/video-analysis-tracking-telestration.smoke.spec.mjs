import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openDrawingWorkspace(page) {
  await page.addInitScript(({ currentMatchId, currentVideoId }) => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: { id: currentMatchId, title: "Match #11 @ Angel City" },
      video: { id: currentVideoId, match_id: currentMatchId },
      source: { id: "source-1", match_id: currentMatchId, video_id: currentVideoId, local_video_identifier: "existing-video" },
      selectedClipId: "clip-1",
      timeline: {
        zoom: 1,
        viewMode: "overview",
        laneMode: "all",
        playheadMs: 12_000,
        selectedClipIds: ["clip-1"],
        history: [],
      },
    };
  }, { currentMatchId: matchId, currentVideoId: videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html?elite=1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await page.locator('[data-video-analysis-presentation-open="presentation-1"]').click();
  await page.locator("[data-video-analysis-presentation-add]").first().click();
  await page.getByRole("tab", { name: "Telestrate" }).click();
  await expect(page.locator(".video-analysis-drawing-builder")).toBeVisible();
}

async function openTrackingWorkspace(page) {
  await openDrawingWorkspace(page);
  await page.locator('[data-video-analysis-tracking-mode="tracking"]').click();
  await expect(page.locator(".video-analysis-tracking-side")).toBeVisible();
  await expect(page.locator(".video-analysis-tracking-provider")).toContainText("SAM 2.1");
}

async function createTrackedHighlight(page) {
  await page.locator('[data-video-analysis-tracking-field="playerId"]').selectOption("p1");
  await page.locator('[data-video-analysis-tracking-action="select-target"]').click();
  const surface = page.locator("[data-video-analysis-drawing-surface]");
  const box = await surface.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + (box.width * 0.34), box.y + (box.height * 0.34));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 0.43), box.y + (box.height * 0.62));
  await page.mouse.up();
  await expect(page.locator(".video-analysis-track-prompt")).toBeVisible();
  await expect(page.locator('[data-video-analysis-tracking-action="run"]')).toBeEnabled();
  await page.locator('[data-video-analysis-tracking-action="manual"]').click();
  await expect(page.locator(".video-analysis-tracking-list li")).toHaveCount(1);
  await expect(page.locator(".video-analysis-track-box")).toBeVisible();
  await expect(page.locator(".video-analysis-tracking-review")).toContainText("Add at least two tracking points");
  await page.locator('[data-video-analysis-tracking-action="add-graphic"]').click();
  await expect(page.locator(".video-analysis-dynamic-anchor.is-circle")).toBeVisible();
}

async function drawFreehandPath(page) {
  await page.locator('[data-video-analysis-draw-tool="freehand"]').click();
  const surface = page.locator("[data-video-analysis-drawing-surface]");
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + (box.width * 0.18), box.y + (box.height * 0.38));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 0.42), box.y + (box.height * 0.24), { steps: 8 });
  await page.mouse.move(box.x + (box.width * 0.68), box.y + (box.height * 0.52), { steps: 8 });
  await page.mouse.up();
  return page.locator(".video-analysis-drawing-freehand:not(.is-draft) polyline");
}

async function mountTrackingProgressFixture(page) {
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { renderTrackingSidebar } = await import("/src/modules/video-analysis/components/TrackingTelestration.js");
    const track = {
      id: "track-progress",
      entityType: "player",
      playerLabel: "Player 8",
      status: "review",
      startMs: 0,
      endMs: 1000,
      confidence: 0.91,
      identityConfidence: 0.88,
      metadata: { model: "SAM 2.1 Hiera Tiny", device: "mps", sampleFps: 12.5 },
      segments: [{ startMs: 0, endMs: 1000, points: [
        { atMs: 0, x: 0.2, y: 0.4, width: 0.1, height: 0.2, confidence: 0.91, identityConfidence: 0.88 },
        { atMs: 1000, x: 0.3, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, identityConfidence: 0.87 },
      ] }],
    };
    const sidebar = renderTrackingSidebar({
      players: [],
      presentation: { tracking: {
        mode: "tracking",
        provider: { status: "ready", available: true, name: "Football Science SAM 2.1 Player Tracker", version: "1.0.0" },
        selectedTrackIds: [track.id],
        job: {
          stage: "Tracking player",
          progress: 0.64,
          elapsedMs: 64_000,
          estimatedRemainingMs: 36_000,
          processedFrames: 16,
          totalFrames: 25,
        },
      } },
    }, { id: "item-progress", clipId: "clip-progress", objectTracks: [track], dynamicGraphics: [] });
    document.body.innerHTML = `<main style="box-sizing:border-box;width:min(360px,calc(100vw - 24px));margin:12px;padding:12px;background:#fff">${sidebar}</main>`;
  });
}

test("tracking telestration follows a selected player and persists metadata", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openTrackingWorkspace(page);
  await createTrackedHighlight(page);
  await expect(page.locator(".video-analysis-tracking-list li")).toContainText("Alex Morgan");
  await expect.poll(() => page.evaluate(() => (window.__videoAnalysisRequests || []).some((request) => request.action === "save-object-track"))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window.__videoAnalysisRequests || []).some((request) => request.action === "save-dynamic-graphic"))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tracking-telestration-desktop.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("freehand telestration draws, undoes, redoes and persists a bounded path", async ({ page }, testInfo) => {
  await openDrawingWorkspace(page);
  const path = await drawFreehandPath(page);
  await expect(path).toBeVisible();
  expect((await path.getAttribute("points"))?.trim().split(/\s+/).length).toBeGreaterThan(4);
  await expect(page.locator(".video-analysis-drawing-layer-list")).toContainText("freehand");

  await page.locator("[data-video-analysis-drawing-undo]").click();
  await expect(page.locator(".video-analysis-drawing-freehand:not(.is-draft)")).toHaveCount(0);
  await page.locator("[data-video-analysis-drawing-redo]").click();
  await expect(page.locator(".video-analysis-drawing-freehand:not(.is-draft)")).toHaveCount(1);
  await page.locator(".video-analysis-drawing-settings summary").click();
  await page.locator("[data-video-analysis-drawing-save]").click();
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((request) => request.action === "save-drawing-layer")?.body?.drawingLayer || null
  ))).toMatchObject({ tool: "freehand" });
  const savedPointCount = await page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((request) => request.action === "save-drawing-layer")?.body?.drawingLayer?.geometry?.points?.length || 0
  ));
  expect(savedPointCount).toBeGreaterThan(4);
  expect(savedPointCount).toBeLessThanOrEqual(256);
  await page.screenshot({ path: testInfo.outputPath("freehand-telestration-desktop.png"), fullPage: true });
});

test("freehand controls and saved path stay contained on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDrawingWorkspace(page);
  await expect(await drawFreehandPath(page)).toBeVisible();
  const geometry = await page.locator(".video-analysis-drawing-builder").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("freehand-telestration-mobile.png"), fullPage: true });
});

test("tracking controls and overlays stay contained on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrackingWorkspace(page);
  await createTrackedHighlight(page);
  const geometry = await page.locator(".video-analysis-drawing-builder").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("tracking-telestration-mobile.png"), fullPage: true });
});

test("tracking progress telemetry stays contained on desktop and mobile", async ({ page }, testInfo) => {
  await mountTrackingProgressFixture(page);
  const progress = page.locator(".video-analysis-tracking-progress");
  await expect(progress).toBeVisible();
  await expect(progress).toContainText("64% | 1m 4s elapsed | ~36s left | 16/25 frames");
  await expect(page.locator(".video-analysis-tracking-provenance")).toContainText("SAM 2.1 Hiera Tiny | MPS | 12.5 fps");
  const geometry = async () => progress.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      elementOverflow: element.scrollWidth - element.clientWidth,
    };
  });
  let measured = await geometry();
  expect(measured.left).toBeGreaterThanOrEqual(0);
  expect(measured.right).toBeLessThanOrEqual(measured.viewportWidth + 1);
  expect(measured.pageOverflow).toBeLessThanOrEqual(1);
  expect(measured.elementOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("tracking-progress-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  measured = await geometry();
  expect(measured.left).toBeGreaterThanOrEqual(0);
  expect(measured.right).toBeLessThanOrEqual(measured.viewportWidth + 1);
  expect(measured.pageOverflow).toBeLessThanOrEqual(1);
  expect(measured.elementOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("tracking-progress-mobile.png"), fullPage: true });
});
