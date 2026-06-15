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

async function installFixedDate(page, fixedIso = "2026-06-15T12:00:00.000Z") {
  await page.addInitScript((value) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [value]));
      }

      static now() {
        return new RealDate(value).getTime();
      }

      static parse(input) {
        return RealDate.parse(input);
      }

      static UTC(...args) {
        return RealDate.UTC(...args);
      }
    }
    window.Date = FixedDate;
  }, fixedIso);
}

async function openScheduleDayForLocalVideo(page) {
  await expect(page.locator("[data-video-analysis-library]")).toBeVisible();
  await page.locator('[data-video-analysis-open-library-item^="schedule:"]').first().click();
  await expect(page.locator("[data-video-analysis-file]")).toHaveCount(1);
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
  await openScheduleDayForLocalVideo(page);

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
  await openScheduleDayForLocalVideo(page);

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
  await installFixedDate(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-library]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const library = document.querySelector("[data-video-analysis-library]");
    const search = library?.querySelector(".video-analysis-library-search");
    const calendar = library?.querySelector(".video-analysis-calendar-overview");
    return Boolean(search && calendar && (search.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await expect(page.locator(".video-analysis-calendar-overview")).toContainText("Jun 2026");
  await expect(page.locator(".video-analysis-calendar-day.is-today")).toHaveAttribute("aria-label", "Today, 15/06/2026");
  await expect(page.locator(".video-analysis-calendar-overview")).toContainText("MD+2 Training");
  await expect(page.locator(".video-analysis-library__list")).toHaveCount(0);

  await page.locator('[data-video-analysis-library-filter="search"]').fill("Angel");
  await expect(page.locator(".video-analysis-library__list")).toBeVisible();
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.locator(".video-analysis-library-row")).toContainText("Match #11 @ Angel City");
  await page.locator('[data-video-analysis-link-schedule]').first().selectOption("schedule-training-1");
  await expect.poll(() => page.evaluate(() => (
    window.__videoAnalysisRequests || []
  ).some((request) => request.action === "update-match-link" && request.body.scheduleEventId === "schedule-training-1"))).toBe(true);

  await page.locator('[data-video-analysis-library-filter="search"]').fill("");
  await page.locator('[data-video-analysis-library-filter="date"]').fill("2026-06-02");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.locator(".video-analysis-library-row")).toContainText("MD+2 Training");
});

test("Video Analysis renders the FS Player Timeline module with lanes and clip blocks", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: {
        id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        title: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
      },
      video: {
        id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      },
      source: {
        id: "source-1",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        local_video_identifier: "existing-video",
      },
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html?timeline=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-coding-panel")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation")).toHaveCount(0);
  await expect(page.locator(".video-analysis-timeline-header")).toHaveCount(0);
  await expect(page.locator(".video-analysis-timeline-ruler")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-tabs")).toContainText("Team Principle");
  await expect(page.locator(".video-analysis-timeline-controls")).toHaveCount(0);
  await expect(page.locator(".video-analysis-filters")).toHaveCount(0);
  await expect(page.locator(".video-analysis-intelligence")).toHaveCount(0);
  await expect(page.locator(".video-analysis-clip-list")).toHaveCount(0);
  await expect(page.locator(".video-analysis-template-builder")).toBeVisible();
  await expect(page.locator(".video-analysis-clip-block").first()).toBeVisible();
  await expect(page.locator(".video-analysis-playhead")).toHaveCount(1);
  await expect(page.locator(".video-analysis-playhead").first()).toBeVisible();
  await expect(page.locator(".video-analysis-playhead").first()).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".video-analysis-playhead-time")).toHaveCount(1);
  await expect(page.locator(".video-analysis-playhead-time")).toHaveCSS("opacity", "0");
  const firstClipStyle = await page.locator(".video-analysis-clip-block").first().getAttribute("style");
  expect(firstClipStyle).not.toContain("left:99.5%");

  const railBox = await page.locator(".video-analysis-playhead-rail").boundingBox();
  const stackBox = await page.locator(".video-analysis-lane-stack").boundingBox();
  expect(railBox).toBeTruthy();
  expect(stackBox).toBeTruthy();
  expect(railBox.height).toBeGreaterThan(stackBox.height);
  const playheadMarker = await page.evaluate(() => {
    const playhead = document.querySelector(".video-analysis-playhead");
    const firstTimeLabel = document.querySelector(".video-analysis-timeline-tick b");
    const before = window.getComputedStyle(playhead, "::before");
    const playheadRect = playhead.getBoundingClientRect();
    return {
      borderLeftWidth: before.borderLeftWidth,
      borderRightWidth: before.borderRightWidth,
      borderTopColor: before.borderTopColor,
      borderTopWidth: before.borderTopWidth,
      markerBottom: playheadRect.top + parseFloat(before.top || "0") + parseFloat(before.borderTopWidth || "0"),
      timeLabelTop: firstTimeLabel.getBoundingClientRect().top,
      width: before.width,
    };
  });
  expect(playheadMarker.width).toBe("0px");
  expect(playheadMarker.borderLeftWidth).toBe("6px");
  expect(playheadMarker.borderRightWidth).toBe("6px");
  expect(playheadMarker.borderTopWidth).toBe("9px");
  expect(playheadMarker.borderTopColor).toBe("rgb(225, 53, 45)");
  expect(playheadMarker.markerBottom).toBeLessThan(playheadMarker.timeLabelTop);
  expect(await page.locator(".video-analysis-playhead").first().getAttribute("role")).toBeNull();

  await page.locator('[data-video-analysis-timeline-lane="outcome"]').click();
  await expect(page.locator('[data-video-analysis-timeline-lane="outcome"]')).toHaveClass(/is-active/);
  await expect(page.locator(".video-analysis-lane__label").first()).toContainText(/Positive|Development|Neutral/);

  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await expect(page.locator("[data-video-analysis-presentation-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation")).toContainText("Football Science Review");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Presentation Builder");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Data Explorer");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Outline");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Selected clip");
  await expect(page.locator(".video-analysis-presentation-source-clip")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presentation-source-clip")).toContainText("Alex Morgan");
  await expect(page.locator(".video-analysis-presentation-outline-section")).toHaveCount(3);
  await expect(page.locator(".video-analysis-presentation .video-analysis-filters")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation .video-analysis-intelligence")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation .video-analysis-clip-list")).toHaveCount(0);

  await page.locator("[data-video-analysis-presentation-add]").first().click();
  await expect(page.locator(".video-analysis-presentation-outline-item")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presentation-outline-item")).toContainText("In Possession / Positive");

  await page.getByRole("tab", { name: "Draw" }).click();
  await expect(page.locator(".video-analysis-drawing-builder")).toBeVisible();
  await page.locator('[data-video-analysis-drawing-field="text"]').fill("Press trigger");
  await page.locator("[data-video-analysis-drawing-add]").click();
  await expect(page.locator(".video-analysis-drawing-layer-list li")).toHaveCount(1);
  await expect(page.locator(".video-analysis-drawing-layer-list")).toContainText("arrow");

  await page.getByRole("tab", { name: "Presenter" }).click();
  await expect(page.locator(".video-analysis-presenter-mode")).toBeVisible();
  await expect(page.locator(".video-analysis-presenter-queue-item")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presenter-frame")).toContainText("1 drawing layers ready");
  await expect(page.locator(".video-analysis-player")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-timeline-module]")).toHaveCount(0);

  await page.getByRole("button", { name: "FS Player" }).click();
  await expect(page.locator("[data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation")).toHaveCount(0);
  await expect(page.locator(".video-analysis-filters")).toHaveCount(0);
});

test("Video Analysis Tag Panel creates a 15 second timeline tag from a code button", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: {
        id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        title: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
      },
      video: {
        id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      },
      source: {
        id: "source-1",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        local_video_identifier: "existing-video",
      },
      videoRef: {
        objectUrl: "data:video/mp4;base64,AAAA",
        durationMs: 7267240,
        displayName: "Match #11 @ Angel City - May 31st - Angle 1.mp4",
      },
      localFileStatus: "native-ready",
      localFileMessage: "Native playback ready",
      nativePlaybackReady: true,
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".video-analysis-template-builder")).toContainText("Tag Panel");
  await expect(page.locator(".video-analysis-template-builder")).toContainText("Football Science Tag Panel");
  await expect(page.locator('[data-video-analysis-code-button="subPhase-build-up"]')).toContainText("15s");
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "currentTime", { configurable: true, value: 83 });
  });

  await page.locator('[data-video-analysis-code-button="subPhase-build-up"]').click();
  await expect.poll(() => {
    return page.evaluate(() => {
      const request = (window.__videoAnalysisRequests || []).find((item) => item.action === "save-clip");
      return request?.body?.clip || null;
    });
  }).toMatchObject({
    startMs: 83000,
    endMs: 98000,
    subPhase: "Build Up",
    miniGamePrincipleId: "fix-release",
    codingMode: "instant",
  });

  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await expect(page.locator('[data-video-analysis-button-ms-field="subPhase-build-up:defaultDurationMs"]')).toHaveValue("15");
  await expect(page.locator('[data-video-analysis-button-field="subPhase-build-up:buttonBehavior"]')).toHaveValue("create_tag");
});

test("Video Analysis timeline uses h:mm:ss and scrubs video by dragging the red playhead", async ({ page }) => {
  await installDeterministicMedia(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await openScheduleDayForLocalVideo(page);

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
  await page.evaluate(() => {
    const scroller = document.querySelector(".video-analysis-timeline-scroll");
    scroller.scrollLeft = 0;
  });

  const hoverResult = await page.evaluate(() => ({
    currentTime: document.querySelector("[data-video-analysis-video]")?.currentTime || 0,
    left: document.querySelector(".video-analysis-playhead")?.style.left || "",
    badgeOpacity: window.getComputedStyle(document.querySelector(".video-analysis-playhead-time")).opacity,
    scrollLeft: document.querySelector(".video-analysis-timeline-scroll")?.scrollLeft || 0,
  }));
  const y = playheadBox.y + playheadBox.height / 2;
  await page.mouse.move(playheadBox.x + playheadBox.width / 2, y);
  const afterHoverResult = await page.evaluate(() => ({
    currentTime: document.querySelector("[data-video-analysis-video]")?.currentTime || 0,
    left: document.querySelector(".video-analysis-playhead")?.style.left || "",
    badgeOpacity: window.getComputedStyle(document.querySelector(".video-analysis-playhead-time")).opacity,
    scrollLeft: document.querySelector(".video-analysis-timeline-scroll")?.scrollLeft || 0,
  }));
  expect(afterHoverResult).toEqual(hoverResult);

  await page.mouse.down();
  await expect(page.locator(".video-analysis-playhead-time")).toHaveCSS("opacity", "1");
  await page.mouse.move(railBox.x + railBox.width / 2, y);
  await expect(page.locator(".video-analysis-playhead-time")).toContainText("1:00:");
  await page.mouse.up();

  const currentTime = await page.evaluate(() => document.querySelector("[data-video-analysis-video]")?.currentTime || 0);
  const timelineScrollLeft = await page.evaluate(() => document.querySelector(".video-analysis-timeline-scroll")?.scrollLeft || 0);
  expect(currentTime).toBeGreaterThan(3600);
  expect(currentTime).toBeLessThan(3700);
  expect(timelineScrollLeft).toBe(0);
  await expect(page.locator(".video-analysis-playhead-time")).toHaveCSS("opacity", "0");
  await expect(page.locator(".video-analysis-playhead-time")).toContainText("1:00:");
});

test("Video Analysis clears a codec warning when native playback succeeds", async ({ page }) => {
  await installDeterministicMedia(page);
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1", { waitUntil: "domcontentloaded" });
  await openScheduleDayForLocalVideo(page);

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

  await openScheduleDayForLocalVideo(page);
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
  await openScheduleDayForLocalVideo(page);

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
  await openScheduleDayForLocalVideo(page);

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
  await openScheduleDayForLocalVideo(page);

  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "match-hevc.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.from("ftypqt  moovtrakmdiahdlrstsdhvc1"),
  });

  await page.locator(".video-analysis-error[role='alert'] [data-video-analysis-prepare-playback]").click();
  await expect(page.locator(".video-analysis-error[role='alert']")).toContainText("Local video bridge is not");
});
