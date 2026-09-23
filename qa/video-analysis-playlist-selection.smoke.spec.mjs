import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const id = index => `36c70a43-5ee1-43f7-9e56-8e1c1be3a72${index}`;
const row = (page, name) => page.locator(`[data-video-analysis-timeline-category-label="Sub-phase / ${name}"]`);
const clip = (page, name, index) => row(page, name).locator("..").locator(`[data-video-analysis-seek="${id(index)}"]`);
const popup = page => page.locator("dialog.video-analysis-clip-editor");
const queue = page => page.locator("[data-clip-review-select]");
const queueIds = page => queue(page).evaluateAll(items => items.map(item => item.dataset.clipReviewSelect));
const field = (page, name) => page.locator(`[data-video-analysis-timeline-edit-field="${name}"]`);
const writes = page => page.evaluate(() => window.__videoAnalysisRequests.filter(request => request.action === "save-timeline"));
let mediaPath;

test.beforeAll(() => {
  mediaPath = path.join(mkdtempSync(path.join(os.tmpdir(), "fs-playlist-qa-")), "playlist.mp4");
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", mediaPath]);
});
test.afterAll(() => { if (mediaPath) rmSync(path.dirname(mediaPath), { recursive: true, force: true }); });

async function setup(page, { media = false, canEdit = true } = {}) {
  await page.addInitScript(({ matchId, videoId, canEdit }) => {
    window.__videoAnalysisSmokeClips = [1, 2, 3, 4].map(index => ({
      id: `36c70a43-5ee1-43f7-9e56-8e1c1be3a72${index}`, revision: 3, match_id: matchId, video_id: videoId,
      start_ms: index * 1000, end_ms: index * 1000 + 600,
      phase: index <= 2 ? "Out of Possession" : "In Possession", sub_phase: index <= 2 ? "High Press" : "Build Up",
      outcome: "Neutral", tags: ["original"], notes: [{ note: `Original ${index}` }],
    }));
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit, activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title: "Playlist test" }, video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId }, videoRef: { durationMs: 6000 },
      timeline: { laneMode: "all", selectedClipIds: [], history: [] },
    };
  }, { matchId, videoId, canEdit });
  await page.goto("/qa/video-analysis-browser-smoke.html?playlist-selection=1");
  await expect(row(page, "High Press")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__videoAnalysisRequests.some(request => request.action === "timelines"))).toBe(true);
  if (media) {
    await page.locator("[data-video-analysis-file]").setInputFiles(mediaPath);
    await expect.poll(() => page.locator("[data-video-analysis-video]").evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  }
}

test("CMD rows toggle selection and double-click opens every selected row", async ({ page }) => {
  await setup(page);
  await row(page, "High Press").click();
  await row(page, "Build Up").click({ modifiers: ["Meta"] });
  await expect(row(page, "High Press")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "Build Up")).toHaveAttribute("aria-pressed", "true");
  await row(page, "Build Up").click({ modifiers: ["Meta"] });
  await expect(row(page, "Build Up")).toHaveAttribute("aria-pressed", "false");
  await row(page, "Build Up").click({ modifiers: ["Meta"] });
  await row(page, "High Press").dblclick();
  await expect(queue(page)).toHaveCount(4);
  expect(await queueIds(page)).toEqual([id(1), id(2), id(3), id(4)]);
});

test("CMD clips across rows retain selection through double-click; mixed row selection deduplicates", async ({ page }) => {
  await setup(page);
  await clip(page, "High Press", 2).click();
  await clip(page, "Build Up", 3).click({ modifiers: ["Meta"] });
  await clip(page, "High Press", 2).dblclick();
  expect(await queueIds(page)).toEqual([id(2), id(3)]);
  await expect(page.locator(`[data-clip-review-select="${id(2)}"]`)).toHaveAttribute("aria-pressed", "true");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await row(page, "High Press").click({ modifiers: ["Meta"] });
  await row(page, "High Press").dblclick();
  expect(await queueIds(page)).toEqual([id(1), id(2), id(3)]);
});

test("saved playlist preserves ordering and local edits after reopening without changing originals", async ({ page }) => {
  await setup(page);
  await row(page, "High Press").click();
  await row(page, "Build Up").click({ modifiers: ["Meta"] });
  await row(page, "High Press").dblclick();
  await page.locator("[data-playlist-name]").fill("Team meeting");
  await queue(page).nth(3).focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await queueIds(page)).toEqual([id(1), id(4), id(2), id(3)]);
  await page.locator(`[data-clip-review-select="${id(1)}"]`).click();
  await page.getByRole("button", { name: "Edit clip", exact: true }).click();
  await field(page, "note").fill("Only in this playlist");
  await field(page, "tags").fill("presentation, coaching");
  await field(page, "startMs").fill("0:00:00.500");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => request.action === "save-clip"))).toEqual([]);
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
  const saved = (await writes(page)).at(-1).body.timeline;
  expect(saved.rows.at(-1).clipIds).toEqual([id(1), id(4), id(2), id(3)]);
  expect(saved.rows.at(-1).query.clipEdits[id(1)].note).toBe("Only in this playlist");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  const savedRow = page.locator('[data-video-analysis-playlist-row][data-video-analysis-timeline-category-label="Team meeting"]');
  await expect(savedRow).toBeVisible();
  await savedRow.dblclick();
  expect(await queueIds(page)).toEqual([id(1), id(4), id(2), id(3)]);
  await expect(field(page, "note")).toHaveValue("Only in this playlist");
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await savedRow.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".platform-confirm-dialog")).toHaveCount(0);
  await savedRow.dblclick();
  await page.locator("[data-playlist-name]").fill("Renamed meeting");
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
  expect((await writes(page)).at(-1).body.timeline.rows).toHaveLength(1);
  await page.locator("[data-playlist-copy]").click();
  await page.locator("[data-playlist-name]").fill("Player meeting");
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
  expect((await writes(page)).at(-1).body.timeline.rows).toHaveLength(2);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await clip(page, "High Press", 1).click({ modifiers: ["Meta"] });
  await clip(page, "High Press", 1).dblclick();
  await expect(field(page, "note")).toHaveValue("Original 1");
  await expect(field(page, "tags")).toHaveValue("original");
  await expect(field(page, "startMs")).toHaveValue("0:00:01");
});

test("persisted playlists hydrate on a new page with their own order and tags", async ({ page }) => {
  await setup(page);
  await row(page, "High Press").dblclick();
  await page.locator("[data-playlist-name]").fill("Saved review");
  await page.getByRole("button", { name: "Edit clip", exact: true }).click();
  await field(page, "note").fill("Retained on reload");
  await field(page, "tags").fill("saved-tag");
  await page.getByRole("button", { name: "Back to video", exact: true }).click();
  await queue(page).first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
  const snapshot = await page.evaluate(async () => (await (await fetch("/api/video-analysis?action=timelines")).json()).timelines);
  await page.addInitScript(timelines => { window.__videoAnalysisSmokeTimelines = timelines; }, snapshot);
  await page.reload();
  const savedRow = page.locator('[data-video-analysis-playlist-row][data-video-analysis-timeline-category-label="Saved review"]');
  await expect(savedRow).toBeVisible();
  await savedRow.dblclick();
  expect(await queueIds(page)).toEqual([id(2), id(1)]);
  await page.locator(`[data-clip-review-select="${id(1)}"]`).click();
  await expect(field(page, "note")).toHaveValue("Retained on reload");
  await expect(field(page, "tags")).toHaveValue("saved-tag");
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
});

test("removal affects the playlist only and a failed save keeps changes available", async ({ page }) => {
  await setup(page);
  await row(page, "High Press").dblclick();
  await page.getByRole("button", { name: "Edit clip", exact: true }).click();
  await page.locator("[data-video-analysis-clip-editor-delete]").click();
  await page.locator("[data-video-analysis-clip-editor-delete-confirm]").click();
  expect(await queueIds(page)).toEqual([id(2)]);
  await page.locator("[data-playlist-name]").fill("One clip");
  await page.evaluate(() => {
    const original = window.fetch;
    let fail = true;
    window.fetch = (url, options) => {
      if (fail && String(url).includes("action=save-timeline")) {
        fail = false;
        return Promise.resolve(Response.json({ ok: false, reason: "Timeline revision conflict" }, { status: 409 }));
      }
      return original(url, options);
    };
  });
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-review-playlist] [role=alert]")).toContainText("revision conflict");
  await expect(page.locator("[data-playlist-name]")).toHaveValue("One clip");
  await expect(queue(page)).toHaveCount(1);
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-playlist-status]")).toHaveText("Saved");
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => ["archive-clip", "delete-clip", "save-clip"].includes(request.action)))).toEqual([]);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(row(page, "High Press")).toContainText("(2)");
  await expect(clip(page, "High Press", 1)).toBeVisible();
});

test("drag reorders the bottom playlist and closing unsaved work asks before discarding", async ({ page }) => {
  await setup(page);
  await row(page, "High Press").dblclick();
  const second = page.locator(`[data-clip-review-select="${id(2)}"]`);
  const first = page.locator(`[data-clip-review-select="${id(1)}"]`);
  await second.dragTo(first, { targetPosition: { x: 5, y: 20 } });
  expect(await queueIds(page)).toEqual([id(2), id(1)]);
  await popup(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
  await page.locator("[data-clip-review-keep]").click();
  await expect(queue(page)).toHaveCount(2);
});

for (const [width, height] of [[1470, 772], [390, 844]]) test(`video remains primary with a separate playlist at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await setup(page, { media: true });
  await row(page, "High Press").dblclick();
  await expect.poll(() => page.locator("[data-video-analysis-clip-preview]").evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  const screen = await page.locator(".video-analysis-clip-editor__screen").boundingBox();
  const strip = await page.locator("[data-review-playlist]").boundingBox();
  expect(strip.y).toBeGreaterThan(screen.y + screen.height);
  expect(strip.y + strip.height).toBeLessThanOrEqual(height);
  expect(await page.locator("[data-review-playlist]").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await popup(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  if (width > 1000) expect(screen.height).toBeGreaterThan(height * .58);
  const pixels = await page.locator("[data-video-analysis-clip-preview]").evaluate(video => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 18;
    const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0, 32, 18);
    return [...ctx.getImageData(0, 0, 32, 18).data].filter(value => value > 30).length;
  });
  expect(pixels).toBeGreaterThan(700);
  await page.screenshot({ path: testInfo.outputPath(`playlist-${width}.png`) });
  expect(errors).toEqual([]);
});

test("read-only review does not expose playlist writes", async ({ page }) => {
  await setup(page, { canEdit: false });
  await row(page, "High Press").dblclick();
  await expect(page.locator("[data-playlist-save]")).toHaveCount(0);
  await expect(page.locator("[data-playlist-name]")).toBeDisabled();
});
