import { performance } from "node:perf_hooks";
import { expect, test } from "@playwright/test";

const media = process.env.FS_PLAYER_SEATTLE_SOURCE;
const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const name = "Seattle - High Press";
// Ranges from the Seattle review screenshot and prior local pilot. These are QA records, not live tags.
const originals = [177515, 298136, 554000].map((start, index) => ({
  id: `36c70a43-5ee1-43f7-9e56-8e1c1be3a72${index + 1}`, revision: 3, match_id: matchId, video_id: videoId,
  start_ms: start, end_ms: start + 15000, phase: "Out of Possession", sub_phase: "High Press",
  outcome: "Neutral", tags: ["original"], notes: [{ note: `Original clip ${index + 1}` }],
}));
const timelineWrites = page => page.evaluate(() => window.__videoAnalysisRequests.filter(request => request.action === "save-timeline"));
const originalRows = page => page.evaluate(async id => (await (await fetch(`/api/video-analysis?action=clips&matchId=${id}`)).json()).clips, matchId);

test("Seattle High Press clips go from Timeline to one saved, playable playlist without changing originals", async ({ page, context }, info) => {
  test.skip(!media, "Set FS_PLAYER_SEATTLE_SOURCE to the private July 4 original file.");
  test.setTimeout(120_000);
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  await page.setViewportSize({ width: 1470, height: 900 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
  await page.addInitScript(({ originals, matchId, videoId }) => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    window.__videoAnalysisSmokeClips = originals;
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit: true, activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title: "NCC vs Seattle - July 4" },
      video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId },
      timeline: { laneMode: "all", selectedClipIds: [], history: [] },
    };
  }, { originals, matchId, videoId });
  await page.goto("/qa/video-analysis-browser-smoke.html?playlist-selection=1", { waitUntil: "domcontentloaded" });
  const row = page.locator('[data-video-analysis-timeline-category-label="Sub-phase / High Press"]');
  const localFile = page.locator("[data-video-analysis-file]");
  await localFile.setInputFiles(media);
  const main = page.locator("[data-video-analysis-video]");
  await expect.poll(() => main.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  expect(await main.evaluate(video => video.duration)).toBeCloseTo(7167.23, 0);
  await expect(row).toContainText("High Press (3)");
  const before = await originalRows(page);
  expect(before).toHaveLength(3);

  const started = performance.now();
  await row.dblclick();
  const review = page.locator("dialog.video-analysis-clip-editor");
  const queue = review.locator("[data-clip-review-select]");
  const preview = review.locator("[data-video-analysis-clip-preview]");
  const order = [originals[2].id, originals[0].id, originals[1].id];
  await expect(queue).toHaveCount(3);
  await review.getByRole("textbox", { name: "Playlist name" }).fill(name);
  await queue.nth(2).dragTo(queue.nth(0), { targetPosition: { x: 7, y: 18 } });
  await expect.poll(() => queue.evaluateAll(items => items.map(item => item.dataset.clipReviewSelect))).toEqual(order);
  await queue.first().click();
  await review.getByRole("button", { name: "Edit clip", exact: true }).click();
  const pencil = review.locator("#video-analysis-clip-edit-dialog");
  await pencil.getByRole("spinbutton", { name: "Duration (s)" }).fill("14");
  await pencil.locator('[data-video-analysis-timeline-edit-field="note"]').fill("Watch the press trigger.");
  await pencil.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(pencil).not.toBeVisible();
  const writesAfterTrim = (await timelineWrites(page)).length;

  await review.getByRole("button", { name: "MG Principles", exact: true }).click();
  const principles = review.locator("#video-analysis-clip-principles-dialog");
  await principles.getByRole("searchbox", { name: "Search MG Principles" }).fill("Trigger");
  await principles.locator('input[value="trigger"]').check();
  await principles.locator("[data-clip-principles-save]").click();
  await expect(principles).not.toBeVisible();
  const writesAfterPrinciple = (await timelineWrites(page)).length;
  await review.locator("[data-playlist-save]").click();
  await expect(review.locator("[data-playlist-status]")).toHaveText("Saved");
  const secondsToSave = (performance.now() - started) / 1000;
  const writes = await timelineWrites(page);
  await info.attach("seattle-playlist-measurement", { body: JSON.stringify({ secondsToSave, writesAfterTrim, writesAfterPrinciple, finalWrites: writes.length }), contentType: "application/json" });
  expect(writesAfterTrim, "Editing a clip should not save the whole playlist").toBe(0);
  expect(writesAfterPrinciple, "Adding a principle should not save the whole playlist").toBe(0);
  expect(writes).toHaveLength(1);
  const savedRow = writes.at(-1).body.timeline.rows.find(item => item.label === name);
  expect(savedRow.clipIds).toEqual(order);
  expect(savedRow.query.clipEdits[order[0]]).toMatchObject({ endMs: 568000, note: "Watch the press trigger.", miniGamePrincipleIds: ["trigger"] });
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row).toBeFocused();
  await expect(row).toContainText("High Press (3)");
  await expect(page.locator("[data-video-analysis-playlist-row]")).toHaveCount(0);
  expect(await originalRows(page)).toEqual(before);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => /^(save|archive|delete|restore)-clips?$/.test(request.action)))).toEqual([]);

  const snapshot = await page.evaluate(async () => (await (await fetch("/api/video-analysis?action=timelines")).json()).timelines);
  await page.addInitScript(timelines => { window.__videoAnalysisSmokeTimelines = timelines; }, snapshot);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  const playSaved = page.getByRole("button", { name: `Play ${name}`, exact: true });
  await playSaved.click();
  await expect(review.locator("[data-playlist-status]")).toHaveText("Saved");
  await expect.poll(() => queue.evaluateAll(items => items.map(item => item.dataset.clipReviewSelect))).toEqual(order);
  const chooser = page.waitForEvent("filechooser");
  await review.getByRole("button", { name: "Reconnect local file" }).click();
  await (await chooser).setFiles(media);
  for (const [index, start] of [554, 177.515, 298.136].entries()) {
    if (index) await review.getByRole("button", { name: "Next clip", exact: true }).click();
    await expect(queue.nth(index)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => preview.evaluate(video => !video.seeking && video.readyState >= 2 && video.currentTime), { timeout: 15000 }).toBeGreaterThan(start + .1);
    expect(await preview.evaluate(video => video.currentTime)).toBeLessThan(start + 14);
    expect(await preview.evaluate(video => {
      const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 36;
      const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0, 64, 36);
      return ctx.getImageData(0, 0, 64, 36).data.some((value, offset) => offset % 4 !== 3 && value > 45);
    })).toBe(true);
  }
  await preview.evaluate(video => { video.currentTime = 312.98; });
  await expect.poll(() => preview.evaluate(video => ({ at: video.currentTime, paused: video.paused, seeking: video.seeking })), { timeout: 5000 })
    .toEqual({ at: 313.136, paused: true, seeking: false });
  await page.screenshot({ path: info.outputPath("seattle-playlist-reopened.png") });
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await expect(playSaved).toBeVisible();
  await expect(page.locator(".video-analysis-playlist-library__title").filter({ hasText: name })).toBeFocused();
  expect(await originalRows(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});
