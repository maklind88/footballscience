import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function openTimeline(page) {
  await page.addInitScript(({ matchId, videoId }) => {
    const base = { match_id: matchId, video_id: videoId, sub_phase: "High Press", phase: "Out of Possession",
      outcome: "Neutral", players: [{ player_label: "Ally Schlegel", player_id: "p1" }], tags: [], descriptors: [] };
    window.__videoAnalysisSmokeClips = [
      { ...base, id: "short", start_ms: 10000, end_ms: 25000 },
      { ...base, id: "overlap", start_ms: 20000, end_ms: 35000 },
      { ...base, id: "long", start_ms: 40000, end_ms: 70000 },
      { ...base, id: "adjacent", start_ms: 70000, end_ms: 85000 },
      { ...base, id: "duplicate-time", start_ms: 40000, end_ms: 70000 },
      { ...base, id: "tiny", start_ms: 95000, end_ms: 95100 },
      { ...base, id: "long-name", start_ms: 105000, end_ms: 120000,
        players: [{ player_label: "A Very Long Player Name That Must Not Widen The Timeline", player_id: "p2" }] },
    ];
    window.__videoAnalysisInitialState = {
      view: "workspace", match: { id: matchId, title: "Timeline preview" },
      video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "existing-video" },
      videoRef: { durationMs: 120000, displayName: "Timeline preview" },
      timeline: { laneMode: "all", zoom: 1, playheadMs: 0, selectedClipIds: [], history: [] },
    };
  }, { matchId, videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html?rectangles=1");
  await expect(page.locator('[data-video-analysis-timeline-category-label="Sub-phase / High Press"]')).toBeVisible();
}

for (const width of [1470, 390]) {
  test(`timeline uses compact names and full-height proportional rectangles at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 772 });
    await openTimeline(page);
    const timeline = page.locator("[data-video-analysis-timeline-module]");
    const category = timeline.locator('[data-video-analysis-timeline-category-label="Sub-phase / High Press"]');
    const lane = category.locator("..");
    await expect(category).toHaveText("High Press (7)");
    await expect(timeline.locator('[data-video-analysis-timeline-category-label="Player / Ally Schlegel"]'))
      .toHaveText("Ally Schlegel (6)");
    expect((await category.boundingBox()).width).toBe(width < 600 ? 160 : 200);

    async function geometry() {
      return lane.evaluate(element => {
        const track = element.querySelector("[data-video-analysis-timeline-track]");
        const trackRect = track.getBoundingClientRect();
        return {
          width: track.clientWidth, height: track.clientHeight,
          blocks: [...track.querySelectorAll(".video-analysis-clip-block")].map(block => {
            const rect = block.getBoundingClientRect();
            const css = getComputedStyle(block);
            return { id: block.dataset.videoAnalysisSeek, x: rect.x - trackRect.x - track.clientLeft,
              y: rect.y - trackRect.y - track.clientTop, width: rect.width, height: rect.height,
              radius: css.borderRadius, padding: css.padding, background: css.backgroundColor };
          }),
        };
      });
    }

    const result = await geometry();
    const byId = Object.fromEntries(result.blocks.map(block => [block.id, block]));
    for (const block of result.blocks) {
      expect(block.y).toBe(0);
      expect(block.height).toBe(result.height);
      expect(block.radius).toBe("0px");
      expect(block.padding).toBe("0px");
    }
    expect(byId.short.width).toBeCloseTo(result.width * 15000 / 120000, 1);
    expect(byId.long.width).toBeCloseTo(byId.short.width * 2, 1);
    expect(byId.overlap.x).toBeCloseTo(result.width * 20000 / 120000, 1);
    expect(byId.short.x + byId.short.width).toBeGreaterThan(byId.overlap.x);
    expect(byId.adjacent.x).toBeCloseTo(byId.long.x + byId.long.width, 1);
    expect(byId.tiny.width).toBeCloseTo(result.width * 100 / 120000, 1);
    expect(byId["duplicate-time"].x).toBe(byId.long.x);
    expect(byId["duplicate-time"].width).toBe(byId.long.width);

    await timeline.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`timeline-rectangles-${width}.png`) });
    const bounds = await timeline.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await lane.locator('[data-video-analysis-seek="long"]').focus();
    await page.keyboard.press("Enter");
    await expect(lane.locator('[data-video-analysis-seek="long"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window.__videoAnalysisRequests || []).filter(request => request.action === "save-clip")))
      .toEqual([]);
    await page.locator("[data-video-analysis-code-mode]").click();
    const code = await geometry();
    for (const block of code.blocks) expect(block.height).toBe(code.height);
    expect(code.blocks.find(block => block.id === "tiny").width).toBeCloseTo(code.width * 100 / 120000, 1);
    expect(errors).toEqual([]);
  });
}
