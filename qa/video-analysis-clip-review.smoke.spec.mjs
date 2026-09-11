import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";

const popup = "[data-video-analysis-clip-editor]";
const highPress = '[data-video-analysis-timeline-category-label="Sub-phase / High Press"]';
const field = name => `[data-video-analysis-timeline-edit-field="${name}"]`;
const select = index => `[data-clip-review-select="row-clip-${index}"]`;
const writes = page => page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "save-clip"));
let mediaPath;

test.beforeAll(() => {
  mediaPath = path.join(mkdtempSync(path.join(os.tmpdir(), "fs-row-review-qa-")), "row-review.mp4");
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15", "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", mediaPath]);
});
test.afterAll(() => { if (mediaPath) rmSync(path.dirname(mediaPath), { recursive: true, force: true }); });

async function openTimeline(page, { media = false, canEdit = true } = {}) {
  await page.addInitScript(({ canEdit }) => {
    const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
    const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
    window.__videoAnalysisSmokeClips = [3, 1, 4, 2, 5].map(index => ({
      id: `row-clip-${index}`, revision: 3, match_id: matchId, video_id: videoId,
      start_ms: (index - 1) * 1000 + 100, end_ms: (index - 1) * 1000 + 600,
      phase: index === 5 ? "In Possession" : "Out of Possession", sub_phase: index === 5 ? "Build Up" : "High Press",
      outcome: "Neutral", tags: [`original-${index}`], notes: [{ note: `Note ${index}` }],
      players: [{ player_id: index === 2 ? "p2" : "p1", player_label: index === 2 ? "Debinha" : "Alex Morgan" }],
    }));
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit, activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title: "Row review test" }, video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId }, videoRef: { durationMs: 5000 },
      timeline: { laneMode: "all", selectedClipIds: [], history: [] },
    };
  }, { canEdit });
  await page.goto("/qa/video-analysis-browser-smoke.html?row-review=1");
  if (media) {
    await page.locator("[data-video-analysis-file]").setInputFiles(mediaPath);
    await expect.poll(() => page.locator("[data-video-analysis-video]").evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  }
  await expect(page.locator(highPress)).toBeVisible();
}

for (const [width, height] of [[1470, 772], [1280, 720], [1920, 1080], [844, 390], [390, 844]]) {
  test(`row double click opens all four clips with video and editing at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await openTimeline(page, { media: true });
    await page.locator(highPress).scrollIntoViewIfNeeded();
    const originalViewport = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const mainTime = await page.locator("[data-video-analysis-video]").evaluate(el => el.currentTime);
    await page.locator(highPress).dblclick();
    await expect(page.locator(popup)).toBeVisible();
    await expect(page.locator(popup).getByRole("heading")).toHaveText("High Press (4)");
    await expect(page.locator("[data-clip-review-select]")).toHaveCount(4);
    expect(await page.locator("[data-clip-review-select]").evaluateAll(items => items.map(el => el.dataset.clipReviewSelect)))
      .toEqual(["row-clip-1", "row-clip-2", "row-clip-3", "row-clip-4"]);
    await expect(page.locator(select(1))).toHaveAttribute("aria-pressed", "true");
    const video = page.locator("[data-video-analysis-clip-preview]");
    await expect.poll(() => video.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
    await expect(page.locator(popup).getByRole("button", { name: "Previous clip" })).toBeDisabled();
    await page.locator(popup).getByRole("button", { name: "Next clip" }).click();
    await expect(page.locator(select(2))).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(field("note"))).toHaveValue("Note 2");
    await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThanOrEqual(1.1);
    await expect.poll(() => video.evaluate(el => el.paused && Math.abs(el.currentTime - 1.6) < .02)).toBe(true);
    const box = await page.locator(popup).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(width - 20);
    expect(box.height).toBeGreaterThanOrEqual(height - 20);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const close = page.locator(".video-analysis-clip-editor__close");
    await expect(close).toHaveAttribute("title", "Close and return to timeline");
    const closeBox = await close.boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    expect(closeBox.y).toBeGreaterThanOrEqual(0);
    expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(width);
    expect(await page.locator(popup).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const save = await page.locator("[data-video-analysis-timeline-edit-save]").boundingBox();
    expect(save.y).toBeGreaterThanOrEqual(0);
    expect(save.y + save.height).toBeLessThanOrEqual(height);
    if (width >= 1000) {
      const screen = page.locator(".video-analysis-clip-editor__screen");
      const before = await screen.boundingBox();
      expect(before.width).toBeGreaterThan(width * .7);
      expect(before.height).toBeGreaterThan(height * .58);
      await page.locator(".video-analysis-clip-editor__principles summary").click();
      await page.locator(field("note")).focus();
      expect(await screen.boundingBox()).toEqual(before);
      await page.locator(".video-analysis-clip-editor__principles summary").click();
    }
    await page.screenshot({ path: testInfo.outputPath(`row-review-${width}.png`) });
    await page.locator(select(4)).click();
    await expect(page.locator(field("note"))).toHaveValue("Note 4");
    await expect(page.locator(popup).getByRole("button", { name: "Next clip" })).toBeDisabled();
    if (width === 1470 || width === 390) await close.click();
    else await page.keyboard.press("Escape");
    await expect(page.locator(popup)).toHaveCount(0);
    await expect(page.locator(highPress)).toBeFocused();
    await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(originalViewport);
    expect(await page.locator("[data-video-analysis-video]").evaluate(el => el.currentTime)).toBeCloseTo(mainTime, 2);
    expect(await writes(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("row editing retains per-clip drafts and saves only the selected clip", async ({ page }) => {
  await openTimeline(page);
  await page.locator(highPress).dblclick();
  await page.locator(field("note")).fill("Unsaved first clip");
  await page.getByRole("button", { name: "Edit clip timing" }).click();
  await page.locator(field("duration")).fill("0.6");
  await page.getByRole("button", { name: "Edit clip timing" }).click();
  await page.locator(".video-analysis-clip-editor__principles summary").click();
  await page.locator("[data-video-analysis-timeline-edit-principle]").first().check();
  await expect(page.locator(select(1)).getByText("Unsaved", { exact: true })).toBeVisible();
  await page.locator(select(2)).click();
  await page.locator(field("phase")).selectOption("In Possession");
  await page.locator(field("subPhase")).selectOption("Build Up");
  await page.locator(field("note")).fill("Saved second clip");
  await page.locator(select(1)).click();
  await expect(page.locator(field("note"))).toHaveValue("Unsaved first clip");
  await expect(page.locator(field("duration"))).toHaveValue("0.6");
  await expect(page.locator("[data-video-analysis-timeline-edit-principle]:checked")).toHaveCount(1);
  await page.locator(select(2)).click();
  await expect(page.locator(field("phase"))).toHaveValue("In Possession");
  await page.locator(popup).getByRole("button", { name: "Save clip", exact: true }).click();
  await expect(page.locator("[data-clip-review-notice]")).toHaveText("Clip saved");
  await expect(page.locator("[data-clip-review-select]")).toHaveCount(4);
  await expect(page.locator(select(2)).getByText("Unsaved", { exact: true })).toBeHidden();
  expect(await writes(page)).toHaveLength(1);
  expect((await writes(page))[0].body.clip).toMatchObject({ id: "row-clip-2", expectedRevision: 3, phase: "In Possession", subPhase: "Build Up", note: "Saved second clip" });
  await page.locator(select(1)).click();
  await expect(page.locator(field("note"))).toHaveValue("Unsaved first clip");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
  await page.locator("[data-clip-review-keep]").click();
  await expect(page.locator(field("note"))).toHaveValue("Unsaved first clip");
  await page.locator(popup).getByRole("button", { name: "Close", exact: true }).first().click();
  await page.locator("[data-clip-review-discard]").click();
  await expect(page.locator(popup)).toHaveCount(0);
  await page.locator(highPress).dblclick();
  await expect(page.locator("[data-clip-review-select]")).toHaveCount(3);
  await expect(page.locator(field("note"))).toHaveValue("Note 1");
  expect(await writes(page)).toHaveLength(1);
});

test("row review preserves invalid drafts and failed saves without leaving the selected clip", async ({ page }) => {
  await openTimeline(page);
  await page.locator(highPress).dblclick();
  await page.getByRole("button", { name: "Edit clip timing" }).click();
  await page.locator(field("endMs")).fill("invalid");
  await page.locator(select(2)).click();
  await page.locator(select(1)).click();
  await expect(page.locator(field("endMs"))).toHaveValue("invalid");
  await expect(page.locator(field("endMs"))).toBeVisible();
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(page.locator(popup).getByRole("alert")).toContainText("Enter a time");
  expect(await writes(page)).toHaveLength(0);
  await page.locator(field("endMs")).fill("0:00:00.600");
  await page.locator(field("note")).fill("Preserve this draft");
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes("action=save-clip")) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return Response.json({ ok: false, error: "Save unavailable" }, { status: 503 });
      }
      return original(...args);
    };
  });
  await page.locator("[data-video-analysis-timeline-editor]").dispatchEvent("submit");
  await page.locator(select(2)).dispatchEvent("click");
  await expect(page.locator(popup).getByRole("alert")).toBeVisible();
  await expect(page.locator(select(1))).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(field("note"))).toHaveValue("Preserve this draft");
  await expect(page.locator(popup).getByRole("button", { name: "Previous clip" })).toBeDisabled();
});

test("row review delete removes one clip, keeps the other three and remains undoable", async ({ page }) => {
  await openTimeline(page);
  await page.locator(highPress).dblclick();
  await page.locator("[data-video-analysis-clip-editor-delete]").click();
  await page.locator("[data-video-analysis-clip-editor-delete-confirm]").click();
  await expect(page.locator(popup).getByRole("heading")).toHaveText("High Press (3)");
  await expect(page.locator(select(1))).toHaveCount(0);
  await expect(page.locator(select(2))).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.locator("[data-video-analysis-player-settings]").click();
  await page.locator("[data-video-analysis-timeline-undo]").click();
  await expect(page.locator(highPress)).toContainText("(4)");
});

test("row review saves a clip repeatedly using its latest revision", async ({ page }) => {
  await openTimeline(page);
  await page.locator(highPress).scrollIntoViewIfNeeded();
  const originalViewport = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.locator(highPress).dblclick();
  await page.locator(field("note")).fill("First revision");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(page.locator("[data-clip-review-notice]")).toHaveText("Clip saved");
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeHidden();
  await page.locator(select(2)).click();
  await page.locator(select(1)).click();
  await expect(page.locator(field("note"))).toHaveValue("First revision");
  await page.locator(field("note")).fill("Second revision");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(page.locator("[data-clip-review-notice]")).toHaveText("Clip saved");
  const saves = await writes(page);
  expect(saves).toHaveLength(2);
  expect(saves[0].body.clip).toMatchObject({ id: "row-clip-1", expectedRevision: 3, note: "First revision" });
  expect(saves[1].body.clip).toMatchObject({ id: "row-clip-1", expectedRevision: 4, note: "Second revision" });
  await page.locator(".video-analysis-clip-editor__close").click();
  await expect(page.locator(popup)).toHaveCount(0);
  await expect(page.locator(highPress)).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(originalViewport);
});

test("player rows use the same popup and readonly users cannot edit", async ({ page }) => {
  await openTimeline(page, { canEdit: false });
  const row = page.locator('[data-video-analysis-timeline-category-label="Player / Alex Morgan"]');
  await row.click();
  await expect(page.locator(popup)).toHaveCount(0);
  await row.press("F2");
  await expect(page.locator(popup).getByRole("heading")).toHaveText("Alex Morgan (4)");
  await expect(page.locator(select(2))).toHaveCount(0);
  await expect(page.locator(field("note"))).toBeDisabled();
  await expect(page.locator("[data-video-analysis-timeline-edit-save]")).toHaveCount(0);
  await page.locator(select(5)).click();
  await expect(page.locator(field("note"))).toHaveValue("Note 5");
  expect(await writes(page)).toHaveLength(0);
});

test("row popup opens with two taps", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await openTimeline(page);
    await page.locator(highPress).tap();
    await page.locator(highPress).tap();
    await expect(page.locator("[data-clip-review-select]")).toHaveCount(4);
  } finally { await context.close(); }
});
