import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openEliteWorkspace(page) {
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
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-workspace-timeline]")).toHaveCount(2);
}

test("elite timeline edits rows, batches clips, saves and enters collaboration", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEliteWorkspace(page);

  await expect(page.locator("[data-video-analysis-workspace-timeline]").first()).toHaveText("Team analysis");
  await page.locator("[data-video-analysis-workspace-editor-open]").click();
  const editor = page.locator("[data-video-analysis-workspace-editor]");
  await expect(editor).toBeVisible();
  await expect(editor.locator(".video-analysis-workspace-row")).toHaveCount(2);
  await expect(editor.locator(".video-analysis-workspace-batch-actions")).toContainText("1 selected clips");

  await editor.locator('[data-video-analysis-workspace-clips-place$=":duplicate"]').nth(1).click();
  await expect(editor.locator("[data-video-analysis-workspace-save]")).toBeEnabled();
  await expect(page.locator("[data-video-analysis-workspace-timeline]").first()).toHaveClass(/is-dirty/);
  await editor.locator("[data-video-analysis-workspace-save]").click();
  await expect(editor.locator("[data-video-analysis-workspace-save]")).toHaveText("Saved");

  await editor.locator("[data-video-analysis-workspace-editor-close]").last().click();
  await page.locator("[data-video-analysis-workspace-collaboration]").click();
  await expect(page.locator("[data-video-analysis-workspace-collaboration]")).toContainText("Live (1)");
  await expect.poll(() => page.evaluate(() => (
    window.__videoAnalysisRequests || []
  ).some((request) => request.action === "join-collaboration-session"))).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("elite-workstation-desktop.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("elite timeline editor stays contained on a mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEliteWorkspace(page);
  await page.locator("[data-video-analysis-workspace-editor-open]").click();
  const editorPanel = page.locator(".video-analysis-workspace-editor__panel");
  await expect(editorPanel).toBeVisible();
  const geometry = await editorPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("elite-workstation-mobile.png"), fullPage: true });
});
