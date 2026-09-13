import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";

let mediaDirectory, mediaBase64;
const videoSelector = "[data-video-analysis-video]";
const camera = page => page.getByRole("button", { name: "Cameras and media", exact: true });
const panel = page => page.getByRole("dialog", { name: "Cameras and media", exact: true });
const angle = (page, id) => panel(page).locator(`[data-video-analysis-media-action="select-angle"][data-video-analysis-media-angle="${id}"]`);

test.beforeAll(() => {
  mediaDirectory = mkdtempSync(path.join(os.tmpdir(), "fs-camera-qa-"));
  const file = path.join(mediaDirectory, "camera.mp4");
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15", "-t", "16", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", file]);
  mediaBase64 = readFileSync(file).toString("base64");
});
test.afterAll(() => { if (mediaDirectory) rmSync(mediaDirectory, { recursive: true, force: true }); });

async function open(page) {
  await page.addInitScript(base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const reference = name => ({
      objectUrl: URL.createObjectURL(new Blob([bytes], { type: "video/mp4" })),
      displayName: name, localVideoIdentifier: name, durationMs: 16000,
      playbackCompatibility: { status: "supported", canPlay: true },
    });
    const angles = [{ id: "primary", label: "Broadcast", role: "primary", primary: true, localVideoIdentifier: "Broadcast" },
      { id: "unavailable", label: "Not connected", role: "bench" },
      { id: "tactical", label: "Tactical", role: "tactical", syncOffsetMs: 2000, driftPpm: 200, durationMs: 16000 }];
    window.__videoAnalysisSmokeMediaAngles = angles;
    window.__videoAnalysisInitialState = {
      view: "workspace", status: "ready", activeAnalysisRoomTab: "fs-player",
      match: { id: "camera-match", title: "Camera test" },
      video: { id: "camera-video", match_id: "camera-match", duration_ms: 16000 },
      source: { id: "primary", video_id: "camera-video", match_id: "camera-match", local_video_identifier: "Broadcast" },
      videoRef: reference("Broadcast"),
      mediaProduction: { loadedMatchId: "camera-match", primaryAngleId: "primary", activeAngleId: "primary", angles,
        angleRefs: { tactical: reference("Tactical") }, viewMode: "single" },
    };
  }, mediaBase64);
  await page.goto("/qa/video-analysis-browser-smoke.html?camera-popup=1");
  await expect.poll(() => page.locator(videoSelector).evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator(videoSelector).evaluate(el => { el.pause(); el.currentTime = 4; });
  await expect.poll(() => page.locator(videoSelector).evaluate(el => el.seeking)).toBe(false);
}

test("camera popup and shortcut preserve paused match time with offset and drift", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await camera(page).click();
  await expect(angle(page, "unavailable")).toBeDisabled();
  await angle(page, "tactical").click();
  const video = page.locator(videoSelector);
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeCloseTo(6.001, 1);
  await expect(video).toHaveJSProperty("paused", true);
  await expect(angle(page, "tactical")).toHaveAttribute("aria-pressed", "true");
  await expect(angle(page, "tactical")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("camera-selection.png") });
  await page.keyboard.press("Escape");
  await expect(camera(page)).toBeFocused();
  await page.keyboard.press("Alt+Shift+KeyC");
  await expect(page.locator(".video-analysis-player h2")).toHaveText("Broadcast");
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeCloseTo(4, 1);
  await expect(video).toHaveJSProperty("paused", true);
  expect(errors).toEqual([]);
});

test("camera shortcut keeps actual video playing and skips missing cameras", async ({ page }) => {
  await open(page);
  const video = page.locator(videoSelector);
  await video.evaluate(el => { el.muted = true; return el.play(); });
  await camera(page).focus();
  const before = await video.evaluate(el => el.currentTime);
  await page.keyboard.press("Alt+KeyC");
  await expect(page.locator(".video-analysis-player h2")).toHaveText("Tactical");
  await expect.poll(() => video.evaluate(el => el.readyState >= 2 && !el.paused && el.currentTime > 6)).toBe(true);
  const after = await video.evaluate(el => el.currentTime);
  expect(after - 2).toBeGreaterThanOrEqual(before - .1);
  expect(after - 2).toBeLessThan(before + 2);
  await video.evaluate(el => el.pause());
  const pixels = await video.evaluate(el => {
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 18;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(el, 0, 0, 32, 18);
    return [...ctx.getImageData(0, 0, 32, 18).data].filter((v, i) => i % 4 !== 3 && v > 40).length;
  });
  expect(pixels).toBeGreaterThan(300);
  await expect(panel(page)).toBeHidden();
});

test("camera popup owns keyboard focus without triggering tags and reopens to angles", async ({ page }) => {
  await open(page);
  await camera(page).click();
  const name = panel(page).locator('[data-video-analysis-media-field="newAngleLabel"]');
  await name.fill("Camera draft");
  await name.press("Alt+KeyC");
  await expect(page.locator(".video-analysis-player h2")).toHaveText("Broadcast");
  await expect(name).toHaveValue("Camera draft");
  await name.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement.closest("dialog[open]")))).toBe(true);
  await page.locator('[data-video-analysis-media-panel="proxy"]').click();
  await page.keyboard.press("Escape");
  await camera(page).click();
  await expect(angle(page, "primary")).toBeVisible();
  const requests = await page.evaluate(() => window.__videoAnalysisRequests || []);
  expect(requests.filter(request => /save-clip|archive-clip/.test(request.action))).toEqual([]);
});
