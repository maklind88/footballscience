import { expect, test } from "@playwright/test";

const h264Mp4Fixture = Buffer.from("ftypisommp42moovtrakmdiahdlrstsdavc1", "latin1");

async function installDeterministicMedia(page) {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "error", {
      configurable: true,
      get() {
        return this.__videoAnalysisForcedError || null;
      },
    });
    const nativeLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function load() {
      if (this.matches?.("[data-video-analysis-video]")) return;
      return nativeLoad?.call(this);
    };
    const nativeAddEventListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
      if (type !== "error" || !this.matches?.("[data-video-analysis-video]") || typeof listener !== "function") {
        return nativeAddEventListener.call(this, type, listener, options);
      }
      const once = typeof options === "object" && options?.once === true;
      const wrapped = (event) => {
        if (!this.__videoAnalysisForcedError) return;
        listener.call(this, event);
        if (once) this.removeEventListener(type, wrapped, options);
      };
      const nextOptions = typeof options === "object" ? { ...options, once: false } : options;
      return nativeAddEventListener.call(this, type, wrapped, nextOptions);
    };
  });
}

async function markVideoMetadataReady(page, duration = 55.5) {
  await page.evaluate((durationSeconds) => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "duration", { configurable: true, value: durationSeconds });
    video.dispatchEvent(new Event("loadedmetadata"));
  }, duration);
}

test("Video Analysis keeps the local video element stable after metadata loads", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await installDeterministicMedia(page);
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

  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-library]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-load]").first()).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match.mp4",
    mimeType: "video/mp4",
    buffer: h264Mp4Fixture,
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await markVideoMetadataReady(page);
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);

  await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);

  const stableAfterSameMetadata = await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.dispatchEvent(new Event("loadedmetadata"));
    return video === document.querySelector("[data-video-analysis-video]");
  });
  expect(stableAfterSameMetadata).toBe(true);

  await page.locator("[data-video-analysis-play]").click();
  await expect.poll(() => page.evaluate(() => window.__videoPlayCalls)).toBe(1);

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.__videoAnalysisForcedError = { code: 4 };
    video.dispatchEvent(new Event("error"));
  });
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Prepare a local H.264 playback copy");
  await expect(page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]")).toBeVisible();
  await expect(page.locator(".video-analysis-toast")).toHaveCount(0);
  await expect(page.locator(".video-analysis-notifications")).toHaveCSS("position", "fixed");

  expect(pageErrors).toEqual([]);
});

test("Video Analysis tries native H264 MP4 playback before offering bridge prepare", async ({ page }) => {
  await installDeterministicMedia(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
    mimeType: "video/mp4",
    buffer: h264Mp4Fixture,
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-player__meta")).toContainText("H.264 / MP4");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);

  await markVideoMetadataReady(page);
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.__videoAnalysisForcedError = { code: 4 };
    video.dispatchEvent(new Event("error"));
  });
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Prepare a local H.264 playback copy");
  await expect(page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]")).toBeVisible();
});

test("Video Analysis shows a schedule-aware library and autosaves day links", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-library]")).toBeVisible();
  await expect(page.locator(".video-analysis-library__list")).toContainText("Match #11 @ Angel City");
  await expect(page.locator(".video-analysis-library__list")).toContainText("MD+2 Training");

  await page.locator('[data-video-analysis-library-filter="search"]').fill("Angel");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.locator(".video-analysis-library-row")).toContainText("Match #11 @ Angel City");

  await page.locator('[data-video-analysis-library-filter="search"]').fill("");
  await page.locator('[data-video-analysis-library-filter="date"]').fill("2026-06-02");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.locator(".video-analysis-library-row")).toContainText("MD+2 Training");

  await page.locator('[data-video-analysis-library-filter="date"]').fill("");
  await page.locator('[data-video-analysis-link-schedule]').first().selectOption("schedule-training-1");
  await expect.poll(() => page.evaluate(() => (
    window.__videoAnalysisRequests || []
  ).some((request) => request.action === "update-match-link" && request.body.scheduleEventId === "schedule-training-1"))).toBe(true);
});

test("Video Analysis renders the FS Player Timeline module with lanes and clip blocks", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await page.locator('[data-video-analysis-open-library-item^="match:"]').first().click();
  await expect(page.locator("[data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-ruler")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-tabs")).toContainText("Team Principle");
  await expect(page.locator(".video-analysis-clip-block").first()).toBeVisible();
  await expect(page.locator(".video-analysis-playhead")).toHaveCount(1);
  await expect(page.locator(".video-analysis-playhead").first()).toBeVisible();
  const firstClipStyle = await page.locator(".video-analysis-clip-block").first().getAttribute("style");
  expect(firstClipStyle).not.toContain("left:99.5%");

  const railBox = await page.locator(".video-analysis-playhead-rail").boundingBox();
  const stackBox = await page.locator(".video-analysis-lane-stack").boundingBox();
  expect(railBox).toBeTruthy();
  expect(stackBox).toBeTruthy();
  expect(railBox.height).toBeGreaterThan(stackBox.height);

  await page.locator('[data-video-analysis-timeline-lane="outcome"]').click();
  await expect(page.locator('[data-video-analysis-timeline-lane="outcome"]')).toHaveClass(/is-active/);
  await expect(page.locator(".video-analysis-lane__label").first()).toContainText(/Positive|Development|Neutral/);
});

test("Video Analysis timeline uses h:mm:ss and scrubs video by dragging the red playhead", async ({ page }) => {
  await installDeterministicMedia(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
    mimeType: "video/mp4",
    buffer: h264Mp4Fixture,
  });
  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await markVideoMetadataReady(page, 7267.24);

  await expect(page.locator(".video-analysis-timeline-ruler")).toContainText("0:00:00");
  await expect(page.locator(".video-analysis-timeline-ruler")).toContainText("2:01:07");
  await expect(page.locator(".video-analysis-player__meta")).toContainText("2:01:07");

  const rail = page.locator("[data-video-analysis-timeline-scrub-surface]");
  const playhead = page.locator(".video-analysis-playhead").first();
  await expect(rail).toBeVisible();
  await expect(playhead).toBeVisible();
  await playhead.scrollIntoViewIfNeeded();
  const railBox = await rail.boundingBox();
  const playheadBox = await playhead.boundingBox();
  expect(railBox).toBeTruthy();
  expect(playheadBox).toBeTruthy();
  const y = playheadBox.y + playheadBox.height / 2;
  await page.mouse.move(playheadBox.x + playheadBox.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width / 2, y);
  await page.mouse.up();

  const currentTime = await page.evaluate(() => document.querySelector("[data-video-analysis-video]")?.currentTime || 0);
  expect(currentTime).toBeGreaterThan(3600);
  expect(currentTime).toBeLessThan(3700);
  await expect(page.locator(".video-analysis-playhead").first()).toHaveAttribute("aria-valuetext", /1:00:3/);
});

test("Video Analysis clears a codec warning when native playback succeeds", async ({ page }) => {
  await installDeterministicMedia(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
    mimeType: "video/mp4",
    buffer: h264Mp4Fixture,
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.__videoAnalysisForcedError = { code: 4 };
    video.dispatchEvent(new Event("error"));
  });
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Prepare a local H.264 playback copy");

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "duration", { configurable: true, value: 7267.24 });
    video.dispatchEvent(new Event("canplay"));
    video.dispatchEvent(new Event("playing"));
  });

  await expect(page.locator(".video-analysis-error[role='alert']")).toHaveCount(0);
  await expect(page.locator(".video-analysis-player__meta")).toContainText("Native playback ready");
  await expect(page.locator(".video-analysis-player__actions [data-video-analysis-prepare-playback]")).toHaveCount(0);
});

test("Video Analysis lets coaches load and reload a local match from the empty player", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await page.locator('[data-video-analysis-open-library-item^="schedule:"]').first().click();
  await expect(page.locator(".video-analysis-empty-video [data-video-analysis-load]")).toBeVisible();
  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "first-half.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("football-science-first-half"),
  });
  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-player h2")).toContainText("first-half.mp4");

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "second-half.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("football-science-second-half"),
  });
  await expect(page.locator(".video-analysis-player h2")).toContainText("second-half.mp4");
  await expect(page.locator("[data-video-analysis-file]")).toHaveValue("");
});

test("Video Analysis warns when a local file appears to use HEVC", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]").first()).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match-hevc.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.from("ftypqt  moovtrakmdiahdlrstsdhvc1"),
  });

  await expect(page.locator("[data-video-analysis-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-player__meta")).toContainText("HEVC/H.265 / MOV");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("HEVC/H.265");
  await expect(page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]")).toBeVisible();
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

  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]").first()).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "angle-1.mp4",
    mimeType: "video/mp4",
    buffer: sample,
  });

  await expect(page.locator(".video-analysis-player__meta")).toContainText("HEVC/H.265 / MP4");
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("HEVC/H.265");
  await expect(page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Video Analysis explains when the local transcode bridge is not running", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-video-analysis-load]").first()).toBeVisible();

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match-hevc.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.from("ftypqt  moovtrakmdiahdlrstsdhvc1"),
  });

  await page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]").click();
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Local video bridge is not");
});
