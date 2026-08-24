import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openTrackingWorkspace(page) {
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
  await page.locator('[data-video-analysis-tracking-mode="tracking"]').click();
  await expect(page.locator(".video-analysis-tracking-side")).toBeVisible();
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
  await page.locator('[data-video-analysis-tracking-action="manual"]').click();
  await expect(page.locator(".video-analysis-tracking-list li")).toHaveCount(1);
  await expect(page.locator(".video-analysis-track-box")).toBeVisible();
  await page.locator('[data-video-analysis-tracking-action="add-graphic"]').click();
  await expect(page.locator(".video-analysis-dynamic-anchor.is-circle")).toBeVisible();
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
