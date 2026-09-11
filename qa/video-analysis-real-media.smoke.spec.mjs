import { expect, test } from "@playwright/test";
import path from "node:path";

const sourcePath = process.env.FS_PLAYER_REVIEW_SOURCE || "";
const expectedDuration = Number(process.env.FS_PLAYER_REVIEW_DURATION_SECONDS || 0);
const startSeconds = Number(process.env.FS_PLAYER_REVIEW_START_SECONDS || 256);
const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";

async function installReviewFixture(page) {
  await page.addInitScript(({ matchId, videoId, startSeconds, title }) => {
    window.__videoAnalysisSmokeClips = [0, 4].map((offset, index) => ({
      id: `local-review-${index + 1}`,
      match_id: matchId,
      video_id: videoId,
      start_ms: (startSeconds + offset) * 1000,
      end_ms: (startSeconds + offset + 15) * 1000,
      phase: "In Possession",
      sub_phase: "Build Up",
      players: [], tags: [], descriptors: [], notes: [],
    }));
    window.__videoAnalysisInitialState = {
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title },
      video: { id: videoId, match_id: matchId },
      source: { id: "local-review-source", match_id: matchId, video_id: videoId },
      selectedClipId: "local-review-1",
      timeline: { viewMode: "overview", laneMode: "subPhase", selectedClipIds: ["local-review-1"] },
    };
  }, { matchId, videoId, startSeconds, title: path.basename(sourcePath) });
}

async function decodedPixels(video, atSeconds) {
  await video.evaluate((element, seconds) => {
    element.pause();
    element.currentTime = seconds;
  }, atSeconds);
  await expect.poll(() => video.evaluate((element) => (
    !element.seeking && element.readyState >= 2
  ))).toBe(true);
  return video.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  });
}

for (const viewport of [{ width: 1468, height: 900 }, { width: 390, height: 844 }]) {
  test(`real local match plays, keeps time scale and opens review at ${viewport.width}px`, async ({ page, context }, testInfo) => {
    test.skip(!sourcePath, "Set FS_PLAYER_REVIEW_SOURCE to run the private local-video acceptance check.");
    test.setTimeout(120_000);
    const externalRequests = [];
    const pageErrors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && !["127.0.0.1", "localhost"].includes(url.hostname)) {
        externalRequests.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewport);
    await installReviewFixture(page);
    await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
    await page.locator("[data-video-analysis-file]").setInputFiles(sourcePath);
    const video = page.locator("[data-video-analysis-video]");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate((element) => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    const media = await video.evaluate((element) => ({
      durationSeconds: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
      local: element.currentSrc.startsWith("blob:"),
    }));
    expect(media.local).toBe(true);
    expect(media.durationSeconds).toBeGreaterThan(startSeconds + 19);
    expect(media.width).toBeGreaterThan(0);
    expect(media.height).toBeGreaterThan(0);
    if (expectedDuration) expect(media.durationSeconds).toBeCloseTo(expectedDuration, 1);
    await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");

    const timeline = page.locator("[data-video-analysis-timeline-module]");
    await page.locator("[data-video-analysis-timeline-lane-select]").selectOption("subPhase");
    const lane = page.locator('[data-video-analysis-timeline-category-label="Build Up"]').locator("..");
    const blocks = lane.locator(".video-analysis-clip-block");
    await expect(blocks).toHaveCount(2);
    expect((await blocks.first().boundingBox()).y).toBe((await blocks.nth(1).boundingBox()).y);
    const overviewDuration = Number(await timeline.getAttribute("data-video-analysis-timeline-window-duration-ms"));
    expect(overviewDuration / 1000).toBeCloseTo(media.durationSeconds, 1);
    expect(await blocks.first().evaluate((element) => parseFloat(element.style.width)))
      .toBeCloseTo(15_000 / overviewDuration * 100, 3);
    await blocks.first().click({ position: { x: 2, y: 8 } });
    await expect(timeline).toHaveAttribute("data-video-analysis-timeline-window-duration-ms", String(overviewDuration));
    await expect(timeline.locator("[data-video-analysis-timeline-focus]")).toContainText("0:00:15");
    expect(await blocks.first().evaluate((element) => parseFloat(element.style.width)))
      .toBeCloseTo(15_000 / overviewDuration * 100, 3);

    const firstPixels = await decodedPixels(video, startSeconds + 9);
    const visiblePixels = firstPixels.filter((value, index) => index % 4 !== 3 && value > 20).length;
    expect(visiblePixels).toBeGreaterThan(firstPixels.length * 0.15);
    const secondPixels = await decodedPixels(video, startSeconds + 11);
    const changedPixels = secondPixels.filter((value, index) => Math.abs(value - firstPixels[index]) > 8).length;
    expect(changedPixels).toBeGreaterThan(firstPixels.length * 0.01);
    await page.locator("[data-video-analysis-play]").first().click();
    await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(startSeconds + 11.2);
    await video.evaluate((element) => element.pause());
    await video.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`real-media-${viewport.width}.png`), fullPage: true });

    await page.getByRole("button", { name: "Presentation", exact: true }).click();
    await page.locator('[data-video-analysis-presentation-open="presentation-1"]').click();
    await page.locator("[data-video-analysis-presentation-add]").first().click();
    await page.getByRole("tab", { name: "Telestrate" }).click();
    await page.locator('[data-video-analysis-tracking-mode="tracking"]').click();
    await expect(page.locator(".video-analysis-ground-truth")).toBeVisible();
    await expect(page.locator('[data-video-analysis-tracking-action="ground-truth-lock"]')).toBeDisabled();
    await page.locator('[data-video-analysis-ground-truth-benchmark-type="multi-object"]').click();
    await expect(page.locator(".video-analysis-ground-truth-studio")).toBeVisible();
    await expect(page.locator('[data-video-analysis-tracking-action="ground-truth-lock"]')).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`real-media-review-${viewport.width}.png`), fullPage: true });
    await testInfo.attach("real-media-metadata", { body: JSON.stringify(media, null, 2), contentType: "application/json" });
    expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
