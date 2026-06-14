import { expect, test } from "@playwright/test";

test("Video Analysis keeps the local video element stable after metadata loads", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    window.__videoPlayCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        window.__videoPlayCalls += 1;
        return Promise.resolve();
      },
    });
  });

  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]")).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("football-science-local-video-smoke"),
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Ready on this device");

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "duration", { configurable: true, value: 12.345 });
    video.dispatchEvent(new Event("loadedmetadata"));
  });
  await expect(page.locator(".video-analysis-player__meta")).toContainText("0:12");

  const stableAfterSameMetadata = await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "duration", { configurable: true, value: 12.345 });
    video.dispatchEvent(new Event("loadedmetadata"));
    return video === document.querySelector("[data-video-analysis-video]");
  });
  expect(stableAfterSameMetadata).toBe(true);

  await page.locator("[data-video-analysis-play]").click();
  await expect.poll(() => page.evaluate(() => window.__videoPlayCalls)).toBe(1);

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "error", { configurable: true, value: { code: 4 } });
    video.dispatchEvent(new Event("error"));
  });
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("MP4 container");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("video stream inside is not browser-playable");
  await expect(page.locator(".video-analysis-toast")).toHaveCount(0);
  await expect(page.locator(".video-analysis-notifications")).toHaveCSS("position", "fixed");

  expect(pageErrors).toEqual([]);
});

test("Video Analysis warns when a local file appears to use HEVC", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]")).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match-hevc.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.from("ftypqt  moovtrakmdiahdlrstsdhvc1"),
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-player__meta")).toContainText("HEVC/H.265 / MOV");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("HEVC/H.265");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("desktop bridge/transcode");
  await expect(page.locator("[data-video-analysis-prepare-playback]")).toBeVisible();
  await expect(page.locator(".video-analysis-notifications")).toHaveCSS("position", "fixed");
  expect(pageErrors).toEqual([]);
});

test("Video Analysis samples large MP4 files for codec markers away from the file edges", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const middlePadding = Buffer.alloc(5 * 1024 * 1024, 0);
  const sample = Buffer.concat([
    Buffer.from("ftypisom"),
    middlePadding,
    Buffer.from("moovtrakmdiahdlrstsdhvcC"),
    middlePadding,
  ]);

  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]")).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "angle-1.mp4",
    mimeType: "video/mp4",
    buffer: sample,
  });

  await expect(page.locator(".video-analysis-player__meta")).toContainText("HEVC/H.265 / MP4");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("HEVC/H.265");
  await expect(page.locator("[data-video-analysis-prepare-playback]")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Video Analysis explains when the local transcode bridge is not running", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]")).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match-hevc.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.from("ftypqt  moovtrakmdiahdlrstsdhvc1"),
  });

  await page.locator("[data-video-analysis-prepare-playback]").click();
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Local video bridge is not");
});
