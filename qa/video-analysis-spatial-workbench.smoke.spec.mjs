import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openTelestration(page) {
  await page.addInitScript(({ currentMatchId, currentVideoId }) => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: { id: currentMatchId, title: "Match #11 @ Angel City" },
      video: { id: currentVideoId, match_id: currentMatchId, duration_ms: 30_000 },
      source: { id: "source-1", match_id: currentMatchId, video_id: currentVideoId, local_video_identifier: "existing-video", duration_ms: 30_000 },
      selectedClipId: "clip-1",
      timeline: { zoom: 1, viewMode: "overview", laneMode: "all", playheadMs: 12_000, selectedClipIds: ["clip-1"], history: [] },
    };
  }, { currentMatchId: matchId, currentVideoId: videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html?elite=1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await page.locator('[data-video-analysis-presentation-open="presentation-1"]').click();
  await page.locator("[data-video-analysis-presentation-add]").first().click();
  await page.getByRole("tab", { name: "Telestrate" }).click();
  await page.locator('[data-video-analysis-tracking-mode="tracking"]').click();
}

async function drawingSurfaceBox(page) {
  const surface = page.locator("[data-video-analysis-drawing-surface]");
  let box = null;
  await expect.poll(async () => {
    try {
      await surface.scrollIntoViewIfNeeded({ timeout: 250 });
      box = await surface.boundingBox();
      return Boolean(box?.width && box?.height);
    } catch {
      box = null;
      return false;
    }
  }, { timeout: 10_000 }).toBe(true);
  return box;
}

async function addManualTrack(page, playerId, startX, startY, endX, endY, expectedCount) {
  await page.locator('[data-video-analysis-tracking-field="playerId"]').selectOption(playerId);
  await page.locator('[data-video-analysis-tracking-action="select-target"]').click();
  const box = await drawingSurfaceBox(page);
  await page.mouse.move(box.x + (box.width * startX), box.y + (box.height * startY));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * endX), box.y + (box.height * endY));
  await page.mouse.up();
  await page.locator('[data-video-analysis-tracking-action="manual"]').click();
  await expect(page.locator(".video-analysis-tracking-list li")).toHaveCount(expectedCount);
}

async function placeLandmark(page, landmarkId, x, y, expectedCount) {
  await page.locator('[data-video-analysis-spatial-field="landmark"]').selectOption(landmarkId);
  await page.locator('[data-video-analysis-spatial-action="place"]').click();
  const box = await drawingSurfaceBox(page);
  await page.mouse.click(box.x + (box.width * x), box.y + (box.height * y));
  await expect(page.locator(".video-analysis-calibration-point")).toHaveCount(expectedCount);
}

async function calibrateFullPitch(page) {
  await placeLandmark(page, "corner-home-left", 0.1, 0.1, 1);
  await placeLandmark(page, "corner-away-left", 0.9, 0.1, 2);
  await placeLandmark(page, "corner-away-right", 0.9, 0.9, 3);
  await placeLandmark(page, "corner-home-right", 0.1, 0.9, 4);
  await expect(page.locator(".video-analysis-spatial-heading")).toContainText("Metres ready");
  await expect(page.locator(".video-analysis-calibration-point")).toHaveCount(4);
  await expect(page.locator(".video-analysis-spatial-stage svg polyline").first()).toBeVisible();
}

test("spatial workbench calibrates metres and creates distance and unit layers", async ({ page }, testInfo) => {
  await openTelestration(page);
  await addManualTrack(page, "p1", 0.18, 0.25, 0.25, 0.62, 1);
  await addManualTrack(page, "p2", 0.42, 0.28, 0.49, 0.64, 2);
  await addManualTrack(page, "p1", 0.68, 0.3, 0.75, 0.66, 3);
  await page.locator('[data-video-analysis-spatial-panel="spatial"]').click();
  await expect(page.locator(".video-analysis-spatial-side")).toBeVisible();
  await calibrateFullPitch(page);
  await page.locator('[data-video-analysis-spatial-action="save"]').click();
  await expect.poll(() => page.evaluate(() => (window.__videoAnalysisRequests || []).filter((request) => request.action === "save-pitch-calibration").length)).toBeGreaterThan(0);
  await page.locator('[data-video-analysis-spatial-action="verify"]').click();
  await expect(page.locator(".video-analysis-spatial-heading > span")).toContainText("verified");

  const pairButtons = page.locator(".video-analysis-spatial-track");
  for (let index = 0; index < 3; index += 1) {
    if ((await pairButtons.nth(index).getAttribute("class"))?.includes("is-selected")) await pairButtons.nth(index).click();
  }
  await pairButtons.nth(0).click();
  await pairButtons.nth(1).click();
  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-video-analysis-spatial-action="assign-unit"][data-video-analysis-spatial-group="a"]').nth(index).click();
  }
  await expect(page.locator(".video-analysis-spatial-metric-grid")).not.toContainText("Unit A L × W--");
  await page.locator('[data-video-analysis-spatial-action="add-distance"]').click();
  await expect(page.locator(".video-analysis-dynamic-distance")).toBeVisible();
  await page.locator('[data-video-analysis-spatial-action="add-unit"][data-video-analysis-spatial-group="a"]').click();
  await expect(page.locator(".video-analysis-dynamic-svg.is-unit-hull polygon")).toBeVisible();
  await expect(page.getByText("Track continuity is needed for a distance curve.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("spatial-workbench-desktop.png"), fullPage: true });
});

test("spatial calibration stays contained on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTelestration(page);
  await page.locator('[data-video-analysis-spatial-panel="spatial"]').click();
  await calibrateFullPitch(page);
  const geometry = await page.locator(".video-analysis-drawing-builder").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("spatial-workbench-mobile.png"), fullPage: true });
});
