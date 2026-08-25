import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const otherVideoId = "36c70a43-5ee1-43f7-9e56-8e1c1be3a725";

function analysisClips() {
  return [
    {
      id: "clip-high-positive",
      matchId,
      videoId,
      matchTitle: "First team v City",
      matchDate: "2026-08-20",
      eventType: "match",
      startMs: 12000,
      endMs: 27000,
      period: "1",
      phase: "Out of Possession",
      subPhase: "High Press",
      outcome: "Positive",
      players: [{ player_id: "player-ks", player_label: "KS" }],
      labels: [{ label_type: "mini_game_principle", label_value: "trigger", label_text: "Trigger" }],
      descriptors: [{ descriptor_type: "unit", descriptor_value: "Front line" }],
    },
    {
      id: "clip-high-development",
      matchId,
      videoId,
      matchTitle: "First team v City",
      matchDate: "2026-08-20",
      eventType: "match",
      startMs: 42000,
      endMs: 57000,
      period: "1",
      phase: "Out of Possession",
      subPhase: "High Press",
      outcome: "Development",
      players: [{ player_id: "player-ks", player_label: "KS" }],
    },
    {
      id: "clip-build-positive",
      matchId: "3a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      videoId: otherVideoId,
      matchTitle: "First team v United",
      matchDate: "2026-08-12",
      eventType: "match",
      startMs: 17000,
      endMs: 32000,
      period: "2",
      phase: "In Possession",
      subPhase: "Build Up",
      outcome: "Positive",
      players: [{ player_id: "player-mb", player_label: "MB" }],
    },
    {
      id: "clip-build-development",
      matchId: "3a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      videoId: otherVideoId,
      matchTitle: "First team v United",
      matchDate: "2026-08-12",
      eventType: "match",
      startMs: 64000,
      endMs: 79000,
      period: "2",
      phase: "In Possession",
      subPhase: "Build Up",
      outcome: "Development",
      players: [{ player_id: "player-mb", player_label: "MB" }],
    },
  ];
}

async function openIntelligence(page) {
  const clips = analysisClips();
  await page.addInitScript(({ clips, matchId, videoId }) => {
    window.__videoAnalysisSmokeClips = clips;
    window.__videoAnalysisInitialState = {
      status: "ready",
      view: "workspace",
      activeAnalysisRoomTab: "match-report",
      canEdit: true,
      match: { id: matchId, title: "First team v City" },
      video: { id: videoId, match_id: matchId },
      videoRef: { objectUrl: "data:video/mp4;base64,AAAA", durationMs: 100000, displayName: "city.mp4" },
      localFileStatus: "native-ready",
      nativePlaybackReady: true,
      players: [{ id: "player-ks", name: "KS" }, { id: "player-mb", name: "MB" }],
      clips,
    };
  }, { clips, matchId, videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
}

test("Clip Intelligence runs natural queries, cohort comparison and report output", async ({ page }, testInfo) => {
  await openIntelligence(page);
  const panel = page.locator("[data-video-analysis-intelligence]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Phase x Outcome");

  const query = page.locator("[data-video-analysis-intelligence-query]");
  await query.fill("Visa positiv hög press med KS");
  await page.locator('[data-video-analysis-intelligence-action="run"]').click();
  await expect(panel.locator(".video-analysis-intelligence-status")).toContainText("1 results");
  await expect(panel.locator(".video-analysis-intelligence-chips")).toContainText("High Press");
  await expect(panel.locator(".video-analysis-intelligence-chips")).toContainText("Positive");
  await expect(page.locator(".video-analysis-clip-library-card")).toHaveCount(1);
  await expect(page.locator('[data-video-analysis-clip-library-play="clip-high-positive"]')).toBeVisible();

  await page.locator('[data-video-analysis-matrix-config="rowAxis"]').selectOption("subPhase");
  await page.locator('[data-video-analysis-matrix-config="metric"]').selectOption("duration");
  await expect(panel.locator(".video-analysis-matrix__row")).toContainText("High Press");
  await expect(panel.locator(".video-analysis-intelligence-drilldown")).toContainText("100%");

  await query.fill("Jämför hög press med build up");
  await page.locator('[data-video-analysis-intelligence-action="run"]').click();
  await expect(panel.locator(".video-analysis-intelligence-comparison")).toBeVisible();
  await expect(panel.locator(".video-analysis-intelligence-comparison")).toContainText("High Press");
  await expect(panel.locator(".video-analysis-intelligence-comparison")).toContainText("Build Up");
  await expect(page.locator('[data-video-analysis-clip-library-open-source="3a4e615e-f3e7-4fc7-bb70-a02db63c9152"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("clip-intelligence-desktop.png"), fullPage: true });

  await page.locator('[data-video-analysis-intelligence-action="report"]').click();
  await expect(page.locator("[data-video-analysis-report-summary]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-report-summary]")).toContainText("Analysis report");
  await expect(page.locator("[data-video-analysis-report-summary]")).toContainText("High Press");
  await expect(page.locator("[data-video-analysis-report-print]")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.locator("#analysisRoomWorkspace").evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.locator("[data-video-analysis-report-summary]").screenshot({ path: testInfo.outputPath("analysis-report-mobile.png") });
});
