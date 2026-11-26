import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { registeredMp4Source } from "./helpers/video-analysis-media.mjs";

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
const readTimelines = page => page.evaluate(async () => (await (await fetch("/api/video-analysis?action=timelines")).json()).timelines);

async function drawOnClip(page, review, tool, offsetMs, { finished = true } = {}) {
  const preview = review.locator("[data-video-analysis-clip-preview]");
  const seek = review.getByRole("slider", { name: "Clip position" });
  await expect(seek).toBeEnabled();
  await seek.evaluate((input, position) => { input.value = position; input.dispatchEvent(new Event("input", { bubbles: true })); }, offsetMs);
  await expect.poll(() => preview.evaluate(video => !video.seeking && video.paused && video.readyState >= 2)).toBe(true);
  const draw = review.getByRole("button", { name: "Draw", exact: true });
  if (await draw.getAttribute("aria-expanded") !== "true") await draw.click();
  await review.getByRole("button", { name: tool, exact: true }).click();
  const overlay = review.locator("[data-clip-drawing-overlay]");
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .53, box.y + box.height * .42, { steps: 8 });
  await page.mouse.up();
  const atMs = await preview.evaluate(video => Math.round(video.currentTime * 1000));
  await expect(overlay.locator(tool === "Spotlight" ? "ellipse" : "line")).toHaveCount(1);
  if (finished) await draw.click();
  return atMs;
}

test("Seattle High Press clips go from Timeline to one saved, playable playlist without changing originals", async ({ page, context }, info) => {
  test.skip(!media, "Set FS_PLAYER_SEATTLE_SOURCE to the private July 4 original file.");
  test.setTimeout(120_000);
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  await page.setViewportSize({ width: 1470, height: 900 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const existingLabel = "Other staff review";
  const existingRow = { id: "retained-review", kind: "manual", label: existingLabel, sortOrder: 0, color: "#0f766e",
    clipIds: [originals[2].id], query: { source: "fs-player-playlist", playlistKey: "other-staff-review", clipEdits: { [originals[2].id]: { note: "Retain this note" } } } };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
  await page.addInitScript(({ originals, matchId, videoId, existingRow }) => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    window.__videoAnalysisSmokeClips = originals;
    if (!window.__videoAnalysisSmokeTimelines) window.__videoAnalysisSmokeTimelines = [{
      id: "9a4e615e-f3e7-4fc7-bb70-a02db63c9152", matchId, title: "Match timeline", isDefault: true,
      revision: 2, rows: [existingRow],
    }];
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit: true, activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title: "NCC vs Seattle - July 4" },
      video: { id: videoId, match_id: matchId, local_video_identifier: originals[0].video_source_identifier },
      source: { id: "source-1", match_id: matchId, video_id: videoId },
      timeline: { laneMode: "all", selectedClipIds: [], history: [] },
    };
  }, { originals: originals.map(clip => ({ ...clip, video_source_identifier: registeredMp4Source(media) })), matchId, videoId, existingRow });
  await page.goto("/qa/video-analysis-browser-smoke.html?playlist-selection=1", { waitUntil: "domcontentloaded" });
  const row = page.locator('[data-video-analysis-timeline-category-label="Sub-phase / High Press"]');
  const localFile = page.locator("[data-video-analysis-file]");
  await localFile.setInputFiles(media);
  const main = page.locator("[data-video-analysis-video]");
  await expect.poll(() => main.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  expect(await main.evaluate(video => video.duration)).toBeCloseTo(7167.23, 0);
  await expect(row).toContainText("High Press (3)");
  const before = await originalRows(page);
  const retainedBefore = (await readTimelines(page))[0].rows[0];
  expect(before).toHaveLength(3);
  await expect(page.getByRole("button", { name: "Draw", exact: true })).toHaveCount(0);
  const origin = await main.evaluate(video => video.currentTime);

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
  await expect.poll(() => preview.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  const pairToggle = review.getByRole("button", { name: "Follow two players" });
  await pairToggle.click();
  await expect(review.locator("[data-player-pair-status]")).toHaveText("Player 1 / 2");
  const drawingTimes = [await drawOnClip(page, review, "Arrow", 900)];
  await expect(pairToggle).toHaveAttribute("aria-pressed", "false");
  await expect(review.locator("[data-player-pair]")).not.toBeVisible();
  await queue.nth(1).click();
  await drawOnClip(page, review, "Spotlight", 950, { finished: false });
  await review.getByRole("button", { name: "Undo drawing", exact: true }).click();
  await expect(review.locator("[data-clip-drawing-overlay] ellipse")).toHaveCount(0);
  drawingTimes.push(await drawOnClip(page, review, "Spotlight", 1000));
  await queue.nth(2).click();
  await page.setViewportSize({ width: 390, height: 844 });
  drawingTimes.push(await drawOnClip(page, review, "Line", 1100, { finished: false }));
  const mediaBox = await review.locator(".video-analysis-clip-editor__screen").boundingBox();
  const toolsBox = await review.getByRole("group", { name: "Drawing tools" }).boundingBox();
  expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(mediaBox.x + mediaBox.width);
  expect(await review.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("seattle-draw-mobile.png") });
  await review.getByRole("button", { name: "Draw", exact: true }).click();
  await page.setViewportSize({ width: 1470, height: 900 });
  expect(await timelineWrites(page)).toEqual([]);
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
  await review.getByRole("button", { name: "Add to playlist", exact: true }).click();
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
  for (const [index, tool] of ["arrow", "spotlight", "line"].entries()) {
    expect(savedRow.query.clipEdits[order[index]].drawings).toMatchObject([{ tool, atMs: drawingTimes[index], sourceId: registeredMp4Source(media) }]);
  }
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row).toBeFocused();
  expect(await main.evaluate(video => video.currentTime)).toBeCloseTo(origin, 1);
  await expect(row).toContainText("High Press (3)");
  await expect(page.locator("[data-video-analysis-playlist-row]")).toHaveCount(0);
  expect(await originalRows(page)).toEqual(before);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => /^(save|archive|delete|restore)-clips?$/.test(request.action)))).toEqual([]);

  const snapshot = await readTimelines(page);
  expect(snapshot[0].rows.find(item => item.id === existingRow.id)).toMatchObject(retainedBefore);
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
    await expect.poll(() => preview.evaluate(video => !video.seeking && video.readyState >= 2)).toBe(true);
    if (await preview.evaluate(video => video.paused)) {
      await review.getByRole("button", { name: "Play clip", exact: true }).click();
    }
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
  await review.getByRole("button", { name: "Present", exact: true }).click();
  await expect(review.getByRole("button", { name: "Draw", exact: true })).not.toBeVisible();
  for (const [index, atMs] of drawingTimes.entries()) {
    await expect(queue.nth(index)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => preview.evaluate(video => ({ at: Math.round(video.currentTime * 1000), paused: video.paused, seeking: video.seeking })))
      .toEqual({ at: atMs, paused: true, seeking: false });
    await expect(review.locator("[data-clip-drawing-overlay]").locator(["polyline", "ellipse", "line"][index])).toHaveCount(1);
    if (!index) await page.screenshot({ path: info.outputPath("seattle-present-drawing.png") });
    await preview.evaluate(video => { video.playbackRate = 4; });
    await review.getByRole("button", { name: "Play clip", exact: true }).click();
    await expect(review.locator("[data-clip-drawing-overlay] > *")).toHaveCount(0);
  }
  await expect(review.getByRole("button", { name: "Exit presentation" })).toHaveCount(0);
  await expect.poll(() => preview.evaluate(video => ({ at: video.currentTime, paused: video.paused, seeking: video.seeking })))
    .toEqual({ at: 313.136, paused: true, seeking: false });

  // A drawing added from Playlists belongs to this playlist, even if it shares a source clip.
  await queue.first().click();
  const later = await drawOnClip(page, review, "Line", 2200);
  await review.getByRole("button", { name: "Save playlist", exact: true }).click();
  await expect(review.locator("[data-playlist-status]")).toHaveText("Saved");
  const edited = await readTimelines(page);
  expect(edited[0].rows.find(item => item.label === name).query.clipEdits[order[0]].drawings).toMatchObject([
    { tool: "arrow", atMs: drawingTimes[0] }, { tool: "line", atMs: later },
  ]);
  expect(edited[0].rows.find(item => item.id === existingRow.id)).toEqual(snapshot[0].rows.find(item => item.id === existingRow.id));
  await page.screenshot({ path: info.outputPath("seattle-playlist-reopened.png") });
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await expect(playSaved).toBeVisible();
  await expect(page.locator(".video-analysis-playlist-library__title").filter({ hasText: name })).toBeFocused();
  await page.getByRole("button", { name: `Play ${existingLabel}`, exact: true }).click();
  const otherChooser = page.waitForEvent("filechooser");
  await review.getByRole("button", { name: "Reconnect local file" }).click();
  await (await otherChooser).setFiles(media);
  const seek = review.getByRole("slider", { name: "Clip position" });
  await expect(seek).toBeEnabled();
  await seek.evaluate((input, offsetMs) => { input.value = offsetMs; input.dispatchEvent(new Event("input", { bubbles: true })); }, drawingTimes[0] - 554000);
  await expect.poll(() => preview.evaluate(video => !video.seeking && video.paused && Math.round(video.currentTime * 1000)))
    .toBe(drawingTimes[0]);
  await expect(review.locator("[data-clip-drawing-overlay] > *")).toHaveCount(0);
  await review.getByRole("button", { name: "Close", exact: true }).click();
  expect(await originalRows(page)).toEqual(before);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => /^(save|archive|delete|restore)-clips?$/.test(request.action)))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("a saved Seattle playlist with two sources rejects the wrong file without changing any tags or playlist", async ({ page, context }) => {
  test.skip(!media, "Set FS_PLAYER_SEATTLE_SOURCE to the private July 4 original file.");
  const temp = mkdtempSync(join(tmpdir(), "fs-playlist-source-test-"));
  try {
    const alternate = join(temp, "Seattle QA second video.mp4");
    execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=red:size=320x180:rate=15",
      "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", alternate]);
    const label = "Seattle mixed sources QA";
    const sourceClips = originals.map(clip => ({ ...clip, video_title: "Seattle July 4", video_source_identifier: registeredMp4Source(media) }));
    const secondSource = {
      ...sourceClips[1], video_id: "46c70a43-5ee1-43f7-9e56-8e1c1be3a725", video_title: "Seattle QA second video",
      video_source_identifier: registeredMp4Source(alternate), start_ms: 1000, end_ms: 3500, video_duration_ms: 5000,
    };
    const clips = [sourceClips[0], secondSource, sourceClips[2]];
    const timelines = [{ id: "9a4e615e-f3e7-4fc7-bb70-a02db63c9152", matchId, title: "Timeline",
      rows: [{ id: "qa-mixed-sources", kind: "manual", label, clipIds: clips.map(clip => clip.id), query: { source: "fs-player-playlist", playlistKey: "qa-seattle-mixed" } }] }];
    await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
    await page.addInitScript(({ clips, timelines, matchId, videoId }) => {
      Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
      window.__videoAnalysisSmokeClips = clips;
      window.__videoAnalysisSmokeTimelines = timelines;
      window.__videoAnalysisInitialState = {
        view: "workspace", canEdit: true, activeAnalysisRoomTab: "fs-player",
        match: { id: matchId, title: "NCC vs Seattle - July 4" },
        video: { id: videoId, match_id: matchId, local_video_identifier: clips[0].video_source_identifier },
        timeline: { laneMode: "all", selectedClipIds: [], history: [] },
      };
    }, { clips, timelines, matchId, videoId });
    await page.goto("/qa/video-analysis-browser-smoke.html?playlist-selection=1");
    await page.locator("[data-video-analysis-file]").setInputFiles(media);
    const main = page.locator("[data-video-analysis-video]");
    await expect.poll(() => main.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
    const primary = await main.getAttribute("src");
    const readTimelines = () => page.evaluate(async () => (await (await fetch("/api/video-analysis?action=timelines")).json()).timelines);
    const before = [await originalRows(page), await readTimelines()];
    await page.getByRole("button", { name: "Playlists", exact: true }).click();
    await page.getByRole("button", { name: `Play ${label}`, exact: true }).click();
    const review = page.locator("dialog.video-analysis-clip-editor");
    const preview = review.locator("[data-video-analysis-clip-preview]");
    const next = review.getByRole("button", { name: "Next clip", exact: true });
    await expect(preview).toHaveAttribute("src", primary);
    await expect.poll(() => preview.evaluate(video => video.currentTime)).toBeGreaterThan(177.6);
    await next.click();
    await expect(preview).not.toHaveAttribute("src", /.+/);
    await expect(review.getByRole("button", { name: "Play clip", exact: true })).toBeDisabled();
    const connect = async path => {
      const choose = page.waitForEvent("filechooser");
      await review.getByRole("button", { name: "Reconnect local file" }).click();
      await (await choose).setFiles(path);
    };
    await connect(media);
    await expect(review.locator("[data-clip-preview-status]")).toHaveText("This file is not the source for this clip.");
    await expect(preview).not.toHaveAttribute("src", /.+/);
    await connect(alternate);
    await expect.poll(() => preview.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
    expect(await preview.getAttribute("src")).not.toBe(primary);
    expect(await preview.evaluate(video => video.duration)).toBe(5);
    await next.click();
    await expect(preview).toHaveAttribute("src", primary);
    await expect.poll(() => preview.evaluate(video => video.currentTime)).toBeGreaterThan(554.1);
    await review.getByRole("button", { name: "Previous clip", exact: true }).click();
    await expect.poll(() => preview.evaluate(video => video.duration)).toBe(5);
    await review.getByRole("button", { name: "Close", exact: true }).click();
    expect([await originalRows(page), await readTimelines()]).toEqual(before);
    expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request =>
      /^(save|archive|delete|restore)-/.test(request.action)
      || request.action === "create-local-video-source"))).toMatchObject([{ action: "create-local-video-source" }]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
