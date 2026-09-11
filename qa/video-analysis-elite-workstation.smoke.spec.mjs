import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openMatchTimeline(page) {
  await page.addInitScript(({ matchId, videoId }) => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: { id: matchId, title: "Match #11 @ Angel City" },
      video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "existing-video" },
      selectedClipId: "clip-1",
      timeline: { zoom: 1, viewMode: "overview", laneMode: "all", playheadMs: 12000, selectedClipIds: ["clip-1"], history: [] },
    };
  }, { matchId, videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html?elite=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window.__videoAnalysisRequests || [])
    .some(request => request.action === "timelines"))).toBe(true);
  await expect(page.locator('.video-analysis-clip-block[data-video-analysis-seek="clip-1"]').first()).toBeVisible();
}

for (const width of [1388, 390]) {
  test(`single match timeline has no workspace bar at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 762 });
    await openMatchTimeline(page);
    const timeline = page.locator("[data-video-analysis-timeline-module]");
    await expect(timeline).toHaveCount(1);
    await expect(page.locator(".video-analysis-workspace-bar")).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Analysis timelines" })).toHaveCount(0);
    await expect(page.locator("[data-video-analysis-workspace-editor-open]")).toHaveCount(0);
    await expect(page.locator("[data-video-analysis-workspace-timeline-add]")).toHaveCount(0);
    await expect(page.locator("[data-video-analysis-workspace-save]")).toHaveCount(0);
    await expect(page.locator("[data-video-analysis-workspace-collaboration]")).toHaveCount(0);
    await expect(timeline.locator(":scope > :first-child")).toHaveClass("video-analysis-timeline-scroll");
    await expect(timeline.locator(".video-analysis-timeline-window-controls")).toHaveCount(0);
    await expect(timeline.locator("[data-video-analysis-timeline-view], [data-video-analysis-timeline-zoom], [data-video-analysis-timeline-undo]")).toHaveCount(0);
    await expect(timeline.locator("[data-video-analysis-timeline-ruler]")).toBeVisible();
    await expect(timeline.locator('[data-video-analysis-timeline-category-label="High press"]')).toHaveCount(0);
    await timeline.scrollIntoViewIfNeeded();
    const bounds = await timeline.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`single-match-timeline-${width}.png`), fullPage: false });
    const writes = await page.evaluate(() => (window.__videoAnalysisRequests || [])
      .filter(request => /^(save-timeline|join-collaboration-session|archive|delete)/.test(request.action || "")));
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("single match timeline retains wheel zoom, clip selection, category actions and code mode", async ({ page }) => {
  await openMatchTimeline(page);
  const timeline = page.locator("[data-video-analysis-timeline-module]");
  await timeline.locator("[data-video-analysis-timeline-pan]").dispatchEvent("wheel", { deltaY: -100, ctrlKey: true });
  await expect(timeline.locator(".video-analysis-timeline-canvas")).not.toHaveAttribute("style", "width:100%;");
  await timeline.locator('.video-analysis-clip-block[data-video-analysis-seek="clip-1"]').first().click();
  await expect(timeline.locator("[data-video-analysis-timeline-focus]")).toBeVisible();
  await timeline.locator("[data-video-analysis-timeline-category]").first().click({ button: "right" });
  await expect(page.locator(".video-analysis-timeline-category-tray")).toContainText("Play active");
  await page.locator("[data-video-analysis-timeline-category-close]").click();
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
  await expect(page.locator(".video-analysis-workspace-bar")).toHaveCount(0);
  await expect(timeline.locator(".video-analysis-timeline-window-controls")).toHaveCount(0);
  await expect(timeline.locator("[data-video-analysis-timeline-ruler]")).toBeVisible();
});
