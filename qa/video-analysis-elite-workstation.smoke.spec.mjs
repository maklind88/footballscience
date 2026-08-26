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

test("live analysts preserve a local timeline copy before applying a remote revision", async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEliteWorkspace(page);
  await page.locator("[data-video-analysis-workspace-collaboration]").click();
  await expect(page.locator("[data-video-analysis-workspace-collaboration]")).toContainText("Live (1)");

  await page.evaluate(() => {
    window.__videoAnalysisCollaborationTestApi.setParticipants([
      { actor_id: "smoke-analyst", actor_name: "Smoke Analyst" },
      { actor_id: "remote-analyst", actor_name: "Second Analyst" },
    ]);
  });
  await page.locator("[data-video-analysis-workspace-editor-open]").click();
  const editor = page.locator("[data-video-analysis-workspace-editor]");
  await editor.locator("[data-video-analysis-workspace-row-label]").first().fill("My local press");
  await expect(page.locator("[data-video-analysis-workspace-timeline]").first()).toHaveClass(/is-dirty/);
  await editor.locator("[data-video-analysis-workspace-editor-close]").last().click();

  await page.evaluate(({ currentMatchId }) => {
    const timelineId = "9a4e615e-f3e7-4fc7-bb70-a02db63c9152";
    window.__videoAnalysisCollaborationTestApi.updateTimeline({
      id: timelineId,
      matchId: currentMatchId,
      title: "Team analysis remote",
      revision: 4,
      isDefault: true,
      rows: [
        {
          id: "8a4e615e-f3e7-4fc7-bb70-a02db63c0001",
          label: "Remote team press",
          kind: "coding",
          color: "#be123c",
          clipIds: ["clip-1"],
          sortOrder: 0,
        },
        {
          id: "8a4e615e-f3e7-4fc7-bb70-a02db63c0002",
          label: "Build up",
          kind: "coding",
          color: "#2563eb",
          clipIds: [],
          sortOrder: 1,
        },
      ],
    });
    window.__videoAnalysisCollaborationTestApi.pushOperation({
      id: "remote-timeline-revision-4",
      actor_id: "remote-analyst",
      entity_id: timelineId,
      resulting_revision: 4,
    });
  }, { currentMatchId: matchId });

  const remoteChanges = page.locator("[data-video-analysis-workspace-remote-changes]");
  await expect(remoteChanges).toBeVisible({ timeout: 5000 });
  await expect(remoteChanges).toContainText("1 team update waiting");
  await expect(remoteChanges).toContainText("Keep copy & reload");
  await expect(page.locator("[data-video-analysis-workspace-collaboration]")).toContainText("Live (2)");
  await page.screenshot({ path: testInfo.outputPath("collaboration-conflict.png"), fullPage: true });
  await remoteChanges.locator('[data-video-analysis-workspace-remote-resolution="preserve"]').click();

  await expect(remoteChanges).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-workspace-timeline]")).toHaveCount(3);
  const recoveryTab = page.locator("[data-video-analysis-workspace-timeline]").filter({ hasText: "local recovery" });
  await expect(recoveryTab).toHaveCount(1);
  await expect(recoveryTab).toHaveClass(/is-active/);
  await page.locator("[data-video-analysis-workspace-editor-open]").click();
  await expect(page.locator("[data-video-analysis-workspace-row-label]").first()).toHaveValue("My local press");
  await expect(page.locator(".video-analysis-workspace-row").first()).toContainText("1 clips");
  await page.locator("[data-video-analysis-workspace-editor-close]").last().click();

  const remoteTab = page.locator("[data-video-analysis-workspace-timeline]").filter({ hasText: "Team analysis remote" });
  await remoteTab.click();
  await page.locator("[data-video-analysis-workspace-editor-open]").click();
  await expect(page.locator("[data-video-analysis-workspace-row-label]").first()).toHaveValue("Remote team press");
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
