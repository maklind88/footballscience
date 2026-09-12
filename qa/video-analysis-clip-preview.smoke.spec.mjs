import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const clip = '.video-analysis-clip-block[data-video-analysis-seek="preview-clip"]';
const popup = "[data-video-analysis-clip-editor]";
const preview = "[data-video-analysis-clip-preview]";
const field = name => `[data-video-analysis-timeline-edit-field="${name}"]`;
let mediaPath;

test.beforeAll(() => {
  mediaPath = path.join(mkdtempSync(path.join(os.tmpdir(), "fs-clip-preview-qa-")), "clip-preview-test.mp4");
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15", "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", mediaPath]);
});
test.afterAll(() => { if (mediaPath) rmSync(path.dirname(mediaPath), { recursive: true, force: true }); });

async function open(page, { media = true, canEdit = true } = {}) {
  await page.addInitScript(({ matchId, videoId, canEdit }) => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    window.__videoAnalysisSmokeClips = [{
      id: "preview-clip", revision: 3, match_id: matchId, video_id: videoId,
      start_ms: 1000, end_ms: 3000, phase: "Out of Possession", sub_phase: "High Press",
      outcome: "Neutral", players: [], tags: [], notes: [{ note: "Original note" }],
    }];
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit, activeAnalysisRoomTab: "fs-player",
      match: { id: matchId, title: "Clip preview test" }, video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId },
      videoRef: { durationMs: 5000 },
      timeline: { laneMode: "subPhase", selectedClipIds: [], zoom: 1, history: [] },
    };
  }, { matchId, videoId, canEdit });
  await page.goto("/qa/video-analysis-browser-smoke.html?clip-preview=1");
  if (media) {
    await page.locator("[data-video-analysis-file]").setInputFiles(mediaPath);
    await expect.poll(() => page.locator("[data-video-analysis-video]").evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  }
  await page.locator(clip).dblclick();
  await expect(page.locator(popup)).toBeVisible();
}

for (const [width, height] of [[1470, 844], [1280, 720], [1920, 1080], [844, 390], [390, 844]]) {
  test(`clip preview plays actual video within clip boundaries and fits at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await open(page);
    const video = page.locator(preview);
    await expect.poll(() => video.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(1.1);
    expect(await page.locator("[data-video-analysis-video]").evaluate(el => el.paused)).toBe(true);
    expect(await video.getAttribute("src")).toBe(await page.locator("[data-video-analysis-video]").getAttribute("src"));
    const pixels = await video.evaluate(el => {
      const canvas = document.createElement("canvas");
      canvas.width = 32; canvas.height = 18;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(el, 0, 0, 32, 18);
      return [...ctx.getImageData(0, 0, 32, 18).data].filter((v, i) => i % 4 !== 3 && v > 40).length;
    });
    expect(pixels).toBeGreaterThan(300);
    await expect.poll(() => video.evaluate(el => el.paused && Math.abs(el.currentTime - 3) < .02)).toBe(true);
    await page.locator("[data-clip-preview-play]").click();
    await expect.poll(() => video.evaluate(el => !el.paused && el.currentTime < 2.5)).toBe(true);
    await page.locator("[data-clip-preview-play]").click();
    const seek = page.locator("[data-clip-preview-seek]");
    await seek.fill("750");
    await expect.poll(() => video.evaluate(el => el.currentTime)).toBeCloseTo(1.75, 2);
    await expect(video).toBeVisible();
    const box = await page.locator(popup).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(width - 20);
    expect(box.height).toBeGreaterThanOrEqual(height - 20);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const saveBox = await page.locator("[data-video-analysis-timeline-edit-save]").boundingBox();
    expect(saveBox.y).toBeGreaterThanOrEqual(0);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(height);
    expect(await page.locator(popup).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const screen = await page.locator(".video-analysis-clip-editor__screen").boundingBox();
    if (width >= 1000) {
      expect(screen.width).toBeGreaterThan(width * .7);
      expect(screen.height).toBeGreaterThan(height * .58);
    }
    expect(await video.evaluate(el => getComputedStyle(el).objectFit)).toBe("contain");
    const transport = page.getByRole("group", { name: "Clip playback" });
    const playBox = await transport.locator("button").boundingBox();
    expect(playBox.width).toBe(44);
    expect(playBox.height).toBe(40);
    expect(["rgb(21, 87, 60)", "rgb(16, 63, 44)"])
      .toContain(await transport.locator("button").evaluate(el => getComputedStyle(el).backgroundColor));
    expect(await transport.locator("button").evaluate(el => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    const seekBox = await seek.boundingBox(), timeBox = await transport.locator("output").boundingBox();
    expect(seekBox.x).toBeGreaterThan(playBox.x + playBox.width);
    expect(timeBox.x).toBeGreaterThan(seekBox.x + seekBox.width);
    expect(await transport.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await seek.evaluate(el => el.style.getPropertyValue("--clip-preview-progress"))).toBe("37.5%");
    await page.screenshot({ path: testInfo.outputPath(`clip-preview-${width}.png`) });
    await page.getByRole("button", { name: "Edit clip timing" }).click();
    await fieldLocator(page, "startMs").fill("0:00:02");
    await fieldLocator(page, "duration").fill("2");
    await expect(fieldLocator(page, "endMs")).toHaveValue("0:00:04");
    await page.getByRole("button", { name: "Edit clip timing" }).click();
    await seek.fill("1800");
    await expect.poll(() => video.evaluate(el => el.currentTime)).toBeCloseTo(3.8, 2);
    await page.locator("[data-clip-preview-play]").click();
    await expect.poll(() => video.evaluate(el => el.paused && Math.abs(el.currentTime - 4) < .02)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(popup)).toHaveCount(0);
    const main = page.locator("[data-video-analysis-video]");
    await page.locator("[data-video-analysis-play]").first().click();
    await expect.poll(() => main.evaluate(el => !el.paused && el.currentTime > 1.2)).toBe(true);
    expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "save-clip"))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

function fieldLocator(page, name) { return page.locator(field(name)); }

test("clip preview reconnects from the modal and preserves unsaved fields across repaint", async ({ page }) => {
  await open(page, { media: false });
  await fieldLocator(page, "note").fill("Keep my draft");
  const chooser = page.waitForEvent("filechooser");
  await page.locator(popup).getByRole("button", { name: "Reconnect local file" }).click();
  await (await chooser).setFiles(mediaPath);
  await expect.poll(() => page.locator(preview).evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  await expect(fieldLocator(page, "note")).toHaveValue("Keep my draft");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(page.locator(popup)).toHaveCount(0);
  const writes = await page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "save-clip"));
  expect(writes).toHaveLength(1);
  expect(writes[0].body.clip).toMatchObject({ id: "preview-clip", videoId, startMs: 1000, endMs: 3000, note: "Keep my draft" });
});

test("readonly clip preview still plays but cannot edit or save", async ({ page }) => {
  await open(page, { canEdit: false });
  await expect.poll(() => page.locator(preview).evaluate(el => el.currentTime)).toBeGreaterThan(1.1);
  await expect(fieldLocator(page, "phase")).toBeDisabled();
  await expect(fieldLocator(page, "note")).toBeDisabled();
  await expect(page.locator("[data-video-analysis-timeline-edit-save]")).toHaveCount(0);
});

test("blocked autoplay leaves a usable Play button and media errors allow reconnection", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.matches("[data-video-analysis-clip-preview]") && !this.dataset.attempted) {
        this.dataset.attempted = "true";
        return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
      }
      return original.call(this);
    };
  });
  await open(page);
  await expect(page.locator("[data-clip-preview-play]")).toBeEnabled();
  expect(await page.locator(preview).evaluate(el => el.paused)).toBe(true);
  await page.locator("[data-clip-preview-play]").click();
  await expect.poll(() => page.locator(preview).evaluate(el => el.currentTime)).toBeGreaterThan(1.1);
  await page.locator(preview).evaluate(el => { el.src = "data:video/mp4;base64,AAAA"; el.load(); });
  await expect(page.locator("[data-clip-preview-status]")).toHaveText("Video unavailable");
  await expect(page.locator(popup).getByRole("button", { name: "Reconnect local file" })).toBeVisible();
  await expect(page.locator("[data-clip-preview-play]")).toBeDisabled();
  await expect(fieldLocator(page, "note")).toBeEditable();
});

test("preview shows a recoverable missing source and closes when the selected video changes", async ({ page }) => {
  await open(page, { media: false });
  await expect(page.locator("[data-clip-preview-play]")).toBeDisabled();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (!String(args[0]).includes("action=create-local-video-source")) return response;
      const payload = await response.json();
      payload.video.id = "different-video";
      return Response.json(payload);
    };
  });
  await page.locator("[data-clip-preview-file]").setInputFiles(mediaPath);
  await expect(page.locator(popup)).toHaveCount(0);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "save-clip"))).toEqual([]);
});

test("clip transport shuttles both ways, stops at clip boundaries and leaves the main player untouched", async ({ page }) => {
  await open(page);
  const video = page.locator(preview), seek = page.locator("[data-clip-preview-seek]");
  const surface = page.locator(".video-analysis-clip-editor__media");
  await expect(seek).toBeEnabled();
  await seek.fill("1000");
  const mainTime = await page.locator("[data-video-analysis-video]").evaluate(el => el.currentTime);
  await page.getByRole("group", { name: "Clip playback" }).hover();
  await page.mouse.wheel(60, 0);
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(2.2);
  await expect.poll(() => video.evaluate(el => el.paused && Math.abs(el.currentTime - 3) < .01)).toBe(true);
  await expect(surface).not.toHaveClass(/is-clip-shuttling/);
  await page.locator(".video-analysis-clip-editor__screen").hover();
  await page.mouse.wheel(-60, 0);
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeLessThan(2.5);
  await expect.poll(() => video.evaluate(el => el.paused && Math.abs(el.currentTime - 1) < .01)).toBe(true);
  await expect(surface).not.toHaveClass(/is-clip-shuttling/);
  expect(await video.evaluate(el => ({ rate: el.playbackRate, muted: el.muted }))).toEqual({ rate: 1, muted: false });
  expect(await page.locator("[data-video-analysis-video]").evaluate(el => el.currentTime)).toBe(mainTime);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "save-clip"))).toEqual([]);
});

test("shuttle restores playback after idle and Pause interrupts an active gesture", async ({ page }) => {
  await open(page);
  const video = page.locator(preview), surface = page.locator(".video-analysis-clip-editor__media");
  await page.getByRole("button", { name: "Edit clip timing" }).click();
  await fieldLocator(page, "duration").fill("3.8");
  await page.getByRole("button", { name: "Edit clip timing" }).click();
  await page.locator("[data-clip-preview-seek]").fill("50");
  await video.evaluate(el => { el.playbackRate = 1.25; el.muted = true; });
  await page.getByRole("button", { name: "Play clip", exact: true }).click();
  await page.locator(".video-analysis-clip-editor__screen").hover();
  await page.mouse.wheel(8, 0);
  await expect(surface).toHaveClass(/is-clip-shuttling/);
  await expect(surface).not.toHaveClass(/is-clip-shuttling/);
  expect(await video.evaluate(el => ({ paused: el.paused, rate: el.playbackRate, muted: el.muted })))
    .toEqual({ paused: false, rate: 1.25, muted: true });
  await page.mouse.wheel(-8, 0);
  await expect(surface).toHaveClass(/is-clip-shuttling/);
  await page.getByRole("button", { name: "Pause clip", exact: true }).click();
  await expect(surface).not.toHaveClass(/is-clip-shuttling/);
  const stoppedAt = await video.evaluate(el => el.currentTime);
  await page.waitForTimeout(650);
  expect(await video.evaluate(el => el.currentTime)).toBeCloseTo(stoppedAt, 2);
  expect(await video.evaluate(el => el.paused)).toBe(true);
});

test("preview keeps vertical scrolling, pinch gestures and note entry independent of playback", async ({ page }) => {
  await open(page);
  const video = page.locator(preview);
  await page.locator("[data-clip-preview-seek]").fill("1000");
  const surface = page.locator(".video-analysis-clip-editor__screen");
  for (const values of [{ deltaX: 0, deltaY: 80 }, { deltaX: 60, ctrlKey: true }, { deltaX: 60, metaKey: true }]) {
    expect(await surface.evaluate((el, values) => el.dispatchEvent(new WheelEvent("wheel", { ...values, bubbles: true, cancelable: true })), values)).toBe(true);
  }
  await fieldLocator(page, "note").fill("My note");
  await page.keyboard.press("Space");
  await expect(fieldLocator(page, "note")).toHaveValue("My note ");
  expect(await video.evaluate(el => el.currentTime)).toBeCloseTo(2, 2);
  await video.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => video.evaluate(el => el.paused)).toBe(false);
  await page.keyboard.press("Space");
  await expect.poll(() => video.evaluate(el => el.paused)).toBe(true);
});

test("closing during a shuttle cancels its timers and does not resume the main video", async ({ page }) => {
  await open(page);
  await page.locator("[data-clip-preview-seek]").fill("1000");
  const main = page.locator("[data-video-analysis-video]");
  const mainTime = await main.evaluate(el => el.currentTime);
  await page.locator(".video-analysis-clip-editor__screen").hover();
  await page.mouse.wheel(8, 0);
  await expect(page.locator(".video-analysis-clip-editor__media")).toHaveClass(/is-clip-shuttling/);
  await page.keyboard.press("Escape");
  await expect(page.locator(popup)).toHaveCount(0);
  await page.waitForTimeout(650);
  expect(await main.evaluate(el => ({ paused: el.paused, time: el.currentTime, rate: el.playbackRate })))
    .toEqual({ paused: true, time: mainTime, rate: 1 });
});

test("two-finger touch swipes seek the preview without moving the page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await open(page);
  await page.locator("[data-clip-preview-seek]").fill("1000");
  const screen = page.locator(".video-analysis-clip-editor__screen");
  await screen.scrollIntoViewIfNeeded();
  const box = await screen.boundingBox();
  const cdp = await context.newCDPSession(page);
  const points = [{ x: box.x + box.width / 2 - 40, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2 + 40, y: box.y + box.height / 2 }];
  const scroll = await page.locator(popup).evaluate(el => el.scrollTop);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points.map(point => ({ ...point, x: point.x - 24 })) });
  await expect.poll(() => page.locator(preview).evaluate(el => el.currentTime)).toBeGreaterThan(2.05);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator(preview).evaluate(el => el.paused)).toBe(true);
  expect(await page.locator(popup).evaluate(el => el.scrollTop)).toBe(scroll);
  await context.close();
});
