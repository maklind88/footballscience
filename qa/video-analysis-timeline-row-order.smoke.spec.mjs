import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";

const rows = "#analysisRoomWorkspace [data-video-analysis-row-key]";
const label = (page, name) => page.locator(`#analysisRoomWorkspace [data-video-analysis-row-drag="Sub-phase / ${name}"]`);
const order = page => page.locator(rows).evaluateAll(elements => elements.map(row => row.dataset.videoAnalysisRowKey));

async function open(page, count = 4) {
  await page.addInitScript(count => {
    const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152", videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
    const names = ["Build Up", "High Press", "Finishing Phase", "Throw-ins"];
    window.__videoAnalysisSmokeClips = Array.from({ length: count }, (_, i) => ({
      id: `clip-${i}`, match_id: matchId, video_id: videoId, sub_phase: names[i % names.length],
      phase: "Out of Possession", outcome: "Neutral", start_ms: (i + 1) * 1000, end_ms: (i + 1) * 1000 + 15000,
      players: i < 4 ? [] : [{ player_id: `p-${i}`, player_label: `Player ${String(i).padStart(2, "0")}` }], tags: [], descriptors: [],
    }));
    window.__videoAnalysisInitialState = {
      view: "workspace", activeAnalysisRoomTab: "fs-player", match: { id: matchId, title: "Row order preview" }, video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "existing-video" },
      videoRef: { durationMs: 120000, displayName: "Row order preview" },
      timeline: { laneMode: "all", zoom: 1, playheadMs: 0, selectedClipIds: [], history: [] },
    };
  }, count);
  await page.goto("/qa/video-analysis-browser-smoke.html?row-order=1");
  await expect(page.locator(rows)).toHaveCount(count);
  await label(page, "High Press").hover({ trial: true });
}

async function beginDrag(page, source, target, after = false) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(), to = await target.boundingBox();
  const x = from.x + 45, y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 7, y, { steps: 2 });
  await expect(page.locator(".video-analysis-row-ghost")).toBeVisible();
  await page.mouse.move(x, to.y + (after ? to.height - 2 : 2), { steps: 5 });
}

test("drag moves the whole row, persists after reload and leaves clip times untouched", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1470, height: 772 });
  await open(page);
  const original = await order(page);
  const geometry = () => page.locator(rows).evaluateAll(elements => Object.fromEntries(elements.map(row => [row.dataset.videoAnalysisRowKey,
    [...row.querySelectorAll("[data-video-analysis-seek]")].map(clip => ({ id: clip.dataset.videoAnalysisSeek,
      left: clip.style.left, width: clip.style.width, title: clip.title }))])));
  const before = await geometry();
  const press = label(page, "High Press");
  await beginDrag(page, press, label(page, "Build Up"));
  const sourceColumns = await press.locator("..").evaluate(row => getComputedStyle(row).gridTemplateColumns);
  expect(await page.locator(".video-analysis-row-ghost").evaluate(row => getComputedStyle(row).gridTemplateColumns)).toBe(sourceColumns);
  await page.screenshot({ path: testInfo.outputPath("drag-desktop.png") });
  await page.mouse.up();
  const expected = ["Sub-phase / High Press", ...original.filter(key => key !== "Sub-phase / High Press")];
  await expect.poll(() => order(page)).toEqual(expected);
  expect(await geometry()).toEqual(before);
  await expect(page.locator("[data-video-analysis-clip-editor]")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-row-order-status]")).toContainText("position 1 of 4");
  await page.reload();
  await expect.poll(() => order(page)).toEqual(expected);
  expect(await geometry()).toEqual(before);
  await press.click();
  await expect(press).toHaveAttribute("aria-pressed", "true");
  await press.dblclick();
  await expect(page.locator("[data-video-analysis-clip-editor]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-clip-editor]").getByRole("heading")).toHaveText("High Press (1)");
  await page.locator("[data-video-analysis-clip-editor]").getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(press).toBeFocused();
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => request.action === "save-clip"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("keyboard reorders in both directions and maintains focus at boundaries", async ({ page }) => {
  await open(page);
  const original = await order(page);
  const build = label(page, "Build Up");
  await build.focus();
  await page.keyboard.press("Alt+ArrowUp");
  expect(await order(page)).toEqual(original);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => order(page)).toEqual([original[1], original[0], ...original.slice(2)]);
  await expect(build).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => order(page)).toEqual(original);
  await expect(build).toBeFocused();
});

test("clip navigation follows the reordered rows", async ({ page }) => {
  await open(page);
  await beginDrag(page, label(page, "High Press"), label(page, "Build Up"));
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(["Sub-phase / High Press", "Sub-phase / Build Up", "Sub-phase / Finishing Phase", "Sub-phase / Throw-ins"]);
  const clip = id => page.locator(`#analysisRoomWorkspace [data-video-analysis-seek="clip-${id}"]`);
  await clip(1).focus();
  await page.keyboard.press("Enter");
  await expect(clip(1)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await expect(clip(0)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(clip(1)).toHaveAttribute("aria-pressed", "true");
});

test("escape and outside drops cancel without saving or opening the row", async ({ page }) => {
  await open(page);
  const original = await order(page);
  await beginDrag(page, label(page, "High Press"), label(page, "Build Up"));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".video-analysis-row-ghost")).toHaveCount(0);
  expect(await order(page)).toEqual(original);
  await beginDrag(page, label(page, "High Press"), label(page, "Build Up"));
  await page.mouse.move(1, 1);
  await page.mouse.up();
  expect(await order(page)).toEqual(original);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":row-order:")))).toEqual([]);
  await expect(page.locator("[data-video-analysis-clip-editor]")).toHaveCount(0);
});

test("mobile grip supports touch drag and code mode keeps the label readable", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await open(page);
  const original = await order(page);
  const press = label(page, "High Press"), build = label(page, "Build Up");
  await press.scrollIntoViewIfNeeded();
  const from = await press.locator("[data-video-analysis-row-grip]").boundingBox(), to = await build.boundingBox();
  const cdp = await context.newCDPSession(page);
  const point = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: to.y + 2 }] });
  await expect(page.locator(".video-analysis-row-ghost")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("drag-mobile.png") });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => order(page)).toEqual(["Sub-phase / High Press", ...original.filter(key => key !== "Sub-phase / High Press")]);
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
  await expect.poll(() => press.evaluate(element => getComputedStyle(element).paddingLeft)).toBe("26px");
  await page.screenshot({ path: testInfo.outputPath("ordered-mobile-code-mode.png") });
  await context.close();
});

test("long timelines auto-scroll while dragging and escape preserves code mode", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1470, height: 772 });
  await open(page, 40);
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  const station = page.locator("[data-video-analysis-fs-player-workstation]");
  await expect(station).toHaveClass(/is-code-mode/);
  const build = label(page, "Build Up");
  await build.hover({ trial: true });
  const scrollParent = await build.evaluate(element => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
        node.dataset.rowOrderTestScroll = "true";
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, scrollTop: node.scrollTop };
      }
    }
    return null;
  });
  expect(scrollParent).not.toBeNull();
  const before = await order(page);
  const rect = await build.boundingBox();
  await page.mouse.move(rect.x + 45, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 45, Math.min(scrollParent.bottom, 772) - 5, { steps: 5 });
  await expect(page.locator(".video-analysis-row-ghost")).toBeVisible();
  const scroll = page.locator('[data-row-order-test-scroll="true"]');
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollParent.scrollTop + 100);
  await page.screenshot({ path: testInfo.outputPath("drag-auto-scroll.png") });
  await page.mouse.up();
  await expect.poll(() => order(page)).not.toEqual(before);
  const after = await order(page);
  await build.scrollIntoViewIfNeeded();
  const moved = await build.boundingBox();
  await page.mouse.move(moved.x + 45, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + 45, moved.y - 10, { steps: 2 });
  await expect(page.locator(".video-analysis-row-ghost")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(station).toHaveClass(/is-code-mode/);
  expect(await order(page)).toEqual(after);
  await expect(page.locator(".video-analysis-row-ghost")).toHaveCount(0);
});

test("reordering during video playback keeps the same video playing at its current time", async ({ page }) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "fs-row-order-media-"));
  try {
    const media = path.join(directory, "row-order.mp4");
    execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15",
      "-t", "20", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", media]);
    await open(page);
    await page.locator("[data-video-analysis-file]").setInputFiles(media);
    const video = page.locator("[data-video-analysis-video]");
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
    await page.locator("[data-video-analysis-play]").click();
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
    await video.evaluate(element => { window.__rowOrderOriginalVideo = element; });
    const initial = await video.evaluate(element => element.currentTime);
    const original = await order(page);
    await beginDrag(page, label(page, "Build Up"), label(page, "High Press"), true);
    await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(initial + .3);
    await expect(page.locator(".video-analysis-row-ghost")).toBeVisible();
    const beforeDrop = await video.evaluate(element => element.currentTime);
    await page.mouse.up();
    await expect.poll(() => order(page)).not.toEqual(original);
    expect(await video.evaluate(element => element === window.__rowOrderOriginalVideo)).toBe(true);
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
    expect(await video.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(beforeDrop - .05);
    expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(request => request.action === "save-clip"))).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
