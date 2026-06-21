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

  const playButton = page.locator(".video-analysis-player [data-video-analysis-play]");
  await expect(playButton).toContainText("Play");
  await page.locator("[data-video-analysis-play]").click();
  await expect.poll(() => page.evaluate(() => window.__videoPlayCalls)).toBe(1);
  await expect(playButton).toContainText("Pause");
  await expect(playButton).toHaveAttribute("aria-label", "Pause");
  await page.evaluate(() => {
    document.querySelector("[data-video-analysis-video]")?.dispatchEvent(new Event("pause"));
  });
  await expect(playButton).toContainText("Play");
  await expect(playButton).toHaveAttribute("aria-label", "Play");

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

  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toBeVisible();
  await expect(page.locator(".video-analysis-fs-player-timeline [data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-code-window-dock [data-video-analysis-code-window]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const workspace = document.querySelector("[data-video-analysis-fs-player-workstation]")?.getBoundingClientRect();
    const code = document.querySelector(".video-analysis-code-window-dock")?.getBoundingClientRect();
    const deck = document.querySelector(".video-analysis-fs-player-deck")?.getBoundingClientRect();
    const timeline = document.querySelector(".video-analysis-fs-player-timeline")?.getBoundingClientRect();
    const ruler = document.querySelector(".video-analysis-timeline-ruler")?.getBoundingClientRect();
    return Boolean(
      workspace
        && code
        && deck
        && timeline
        && ruler
        && code.left < deck.left
        && Math.abs(timeline.left - deck.left) < 8
        && Math.abs(timeline.right - deck.right) < 8
        && timeline.top >= deck.bottom
        && timeline.top - deck.bottom <= 16
        && ruler.left > timeline.left + 80
        && Math.abs(ruler.right - deck.right) < 8
    );
  })).toBe(true);
  await expect(page.locator(".video-analysis-workspace-nav")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-status")).toContainText("1 clip");
  await expect(page.locator(".video-analysis-coding-panel")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation")).toHaveCount(0);
  await expect(page.locator(".video-analysis-timeline-header")).toHaveCount(0);
  await expect(page.locator(".video-analysis-timeline-ruler")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-tabs")).toContainText("MG Principle");
  await expect(page.locator(".video-analysis-timeline-tabs")).toContainText("Tags");
  const activeTimelineTabStyle = await page.locator(".video-analysis-timeline-tabs button.is-active").evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  });
  expect(activeTimelineTabStyle.color).toBe("rgb(16, 53, 34)");
  expect(activeTimelineTabStyle.backgroundImage).toContain("linear-gradient");
  await expect(page.locator(".video-analysis-timeline-controls")).toHaveCount(0);
  await expect(page.locator(".video-analysis-filters")).toHaveCount(0);
  await expect(page.locator(".video-analysis-intelligence")).toHaveCount(0);
  await expect(page.locator(".video-analysis-clip-list")).toHaveCount(0);
  const timelineTickLabels = await page.locator(".video-analysis-timeline-tick b").allTextContents();
  expect(new Set(timelineTickLabels).size).toBe(timelineTickLabels.length);
  expect(timelineTickLabels).toContain("0:00:02");
  await expect(page.locator(".video-analysis-template-builder")).toBeVisible();
  await expect(page.locator(".video-analysis-code-window-stats")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const scroll = document.querySelector(".video-analysis-code-window-dock .video-analysis-template-scroll");
    const styles = scroll ? window.getComputedStyle(scroll) : null;
    return {
      maxHeight: styles?.maxHeight || "",
      overflowY: styles?.overflowY || "",
    };
  })).toEqual({ maxHeight: "none", overflowY: "visible" });
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
  await page.locator("[data-video-analysis-timeline-category]").first().click();
  await expect(page.locator(".video-analysis-timeline-category-tray")).toContainText("1 clip selected");
  await expect(page.locator(".video-analysis-timeline-category-tray")).toContainText("Open clips");
  await page.locator("[data-video-analysis-timeline-category-open]").click();
  await expect(page.locator(".video-analysis-timeline-category-view")).toBeVisible();
  await expect(page.locator(".video-analysis-timeline-category-view button")).toHaveCount(1);
  await expect(page.locator("[data-video-analysis-timeline-trim-edge]")).toHaveCount(0);
  await page.locator('[data-video-analysis-seek="clip-1"]').first().click();
  await page.keyboard.press("ControlOrMeta+O");
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "trim-clip")?.body?.clip || null
  ))).toMatchObject({
    id: "clip-1",
    startMs: 12000,
    endMs: 19000,
  });
  await page.keyboard.press("ControlOrMeta+Shift+O");
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "trim-clip")?.body?.clip || null
  ))).toMatchObject({
    id: "clip-1",
    startMs: 12000,
    endMs: 18000,
  });
  await page.keyboard.press("ControlOrMeta+Shift+I");
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "trim-clip")?.body?.clip || null
  ))).toMatchObject({
    id: "clip-1",
    startMs: 13000,
    endMs: 18000,
  });
  await page.keyboard.press("ControlOrMeta+I");
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "trim-clip")?.body?.clip || null
  ))).toMatchObject({
    id: "clip-1",
    startMs: 12000,
    endMs: 18000,
  });
  await expect(page.locator(".video-analysis-clip-block").first()).toHaveAttribute("title", /0:00:12 - 0:00:18/);

  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await expect(page.locator("[data-video-analysis-presentation-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation-library")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation-library")).toContainText("Presentations");
  await expect(page.locator(".video-analysis-presentation-library-card")).toContainText("Football Science Review");
  await expect(page.locator("[data-video-analysis-presentation-library-search]")).toBeVisible();
  await page.locator('[data-video-analysis-presentation-open="presentation-1"]').click();
  await expect(page.locator(".video-analysis-presentation-builder-v2")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation")).toContainText("Football Science Review");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Presentation room");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Data Explorer");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Meeting order");
  await expect(page.locator(".video-analysis-presentation")).toContainText("Clip prep");
  await expect(page.locator(".video-analysis-presentation-access")).toContainText("Share");
  await expect(page.locator(".video-analysis-smart-save-strip")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation-source-clip")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presentation-source-clip")).toContainText("Alex Morgan");
  await expect(page.locator(".video-analysis-smart-collections")).toContainText("Build Up Positive");
  await expect(page.locator(".video-analysis-presentation-outline-section")).toHaveCount(3);
  await expect(page.locator(".video-analysis-presentation .video-analysis-filters")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation .video-analysis-intelligence")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation .video-analysis-clip-list")).toHaveCount(0);
  await expect(page.locator(".video-analysis-presentation-source-clip__thumb")).toBeVisible();

  await page.locator(".video-analysis-smart-save-strip summary").click();
  await page.locator('[data-video-analysis-smart-draft="title"]').fill("High press wins");
  await page.locator("[data-video-analysis-smart-save]").click();
  await expect(page.locator(".video-analysis-smart-collections")).toContainText("High press wins");
  await page.locator(".video-analysis-smart-collection", { hasText: "High press wins" }).locator("[data-video-analysis-smart-share]").click();
  await page.locator(".video-analysis-smart-share-panel").locator('[data-video-analysis-smart-draft="targetType"]').selectOption("player");
  await page.locator(".video-analysis-smart-share-panel").locator('[data-video-analysis-smart-draft="targetId"]').selectOption("p2");
  await page.locator(".video-analysis-smart-share-panel").locator("[data-video-analysis-smart-share-add]").click();
  await expect(page.locator(".video-analysis-smart-share-panel .video-analysis-smart-share-targets")).toContainText("player:p2");
  await page.locator(".video-analysis-smart-share-panel").locator("[data-video-analysis-smart-share-save]").click();
  const smartShareRequest = await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-smart-collection-share-targets")?.body || null
  ))).toBeTruthy();
  const smartShareBody = await page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-smart-collection-share-targets")?.body || null
  ));
  expect(smartShareBody?.targets?.some((target) => target.targetType === "player" && target.targetId === "p2")).toBe(true);

  await page.locator(".video-analysis-presentation-access summary").click();
  await page.locator('[data-video-analysis-presentation-share-draft="targetType"]').selectOption("player");
  await page.locator('[data-video-analysis-presentation-share-draft="targetId"]').selectOption("p1");
  await page.locator("[data-video-analysis-presentation-share-add]").click();
  await expect(page.locator(".video-analysis-presentation-access")).toContainText("player:p1");
  await page.locator("[data-video-analysis-presentation-share-save]").click();
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-share-targets" || item.action === "save-presentation")?.body || null
  ))).toBeTruthy();
  const presentationShareRequest = await page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-share-targets" || item.action === "save-presentation") || null
  ));
  const presentationTargets = presentationShareRequest?.body?.targets || presentationShareRequest?.body?.presentation?.shareTargets || [];
  expect(presentationTargets.some((target) => target.targetType === "player" && target.targetId === "p1")).toBe(true);

  await page.locator("[data-video-analysis-presentation-add]").first().click();
  await expect(page.locator(".video-analysis-presentation-outline-item")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presentation-outline-item")).toContainText("In Possession / Positive");
  await expect(page.locator(".video-analysis-presentation-outline-item__thumb")).toBeVisible();

  await page.getByRole("tab", { name: "Telestrate" }).click();
  await expect(page.locator(".video-analysis-drawing-builder")).toBeVisible();
  await expect(page.locator("[data-video-analysis-drawing-surface]")).toBeVisible();
  await expect(page.locator(".video-analysis-drawing-canvas")).toContainText(/Direct telestration layer|Local video source needed/);
  const drawingSurfaceBox = await page.locator("[data-video-analysis-drawing-surface]").boundingBox();
  expect(drawingSurfaceBox).toBeTruthy();
  await page.mouse.move(drawingSurfaceBox.x + 80, drawingSurfaceBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(drawingSurfaceBox.x + 220, drawingSurfaceBox.y + 150);
  await page.mouse.up();
  await expect(page.locator(".video-analysis-drawing-layer-list li")).toHaveCount(1);
  await expect(page.locator(".video-analysis-drawing-layer-list")).toContainText("arrow");
  await page.locator('[data-video-analysis-draw-tool="text"]').click();
  const textDrawingSurfaceBox = await page.locator("[data-video-analysis-drawing-surface]").boundingBox();
  expect(textDrawingSurfaceBox).toBeTruthy();
  await page.mouse.move(textDrawingSurfaceBox.x + 520, textDrawingSurfaceBox.y + 105);
  await page.mouse.down();
  await page.mouse.move(textDrawingSurfaceBox.x + 560, textDrawingSurfaceBox.y + 135);
  await page.mouse.up();
  await expect(page.locator(".video-analysis-drawing-layer-list li")).toHaveCount(2);
  await page.locator(".video-analysis-drawing-overlay-input").fill("Trigger run");
  await expect(page.locator(".video-analysis-drawing-overlay-input")).toHaveValue("Trigger run");

  await page.getByRole("tab", { name: "Present" }).click();
  await expect(page.locator(".video-analysis-presenter-mode")).toBeVisible();
  await expect(page.locator(".video-analysis-presenter-queue-item")).toHaveCount(1);
  await expect(page.locator(".video-analysis-presenter-frame")).toContainText("arrow");
  await expect(page.locator(".video-analysis-presenter-frame")).toContainText("Clip 1 of 1");
  await page.locator("[data-video-analysis-presenter-freeze]").click();
  await expect(page.locator(".video-analysis-presenter-mode")).toHaveClass(/is-frozen/);
  await expect(page.locator(".video-analysis-player")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-timeline-module]")).toHaveCount(0);

  await page.getByRole("button", { name: "FS Player" }).click();
  await expect(page.locator("[data-video-analysis-timeline-module]")).toBeVisible();
  await expect(page.locator(".video-analysis-presentation")).toHaveCount(0);
  await expect(page.locator(".video-analysis-filters")).toHaveCount(0);
});

test("Video Analysis Clip Library groups clips by searchable football metadata", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoPlayCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        window.__videoPlayCalls += 1;
        return Promise.resolve();
      },
    });
    const libraryClips = [
      {
        id: "clip-build-third",
        matchId: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        videoId: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        matchTitle: "Match #11 @ Angel City - May 31st",
        matchDate: "2026-05-31",
        eventType: "match",
        startMs: 12000,
        endMs: 27000,
        phase: "In Possession",
        subPhase: "Build Up",
        outcome: "Positive",
        players: [{ player_id: "player-8", player_label: "Player Eight" }],
        labels: [{ label_type: "mini_game_principle", label_value: "third-player", label_text: "Third Player" }],
        notes: [{ note: "Finds the third player under pressure." }],
      },
      {
        id: "clip-press-counter",
        matchId: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        videoId: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        matchTitle: "Training/IDP + Lift",
        matchDate: "2026-06-18",
        eventType: "training",
        startMs: 42000,
        endMs: 57000,
        phase: "Out of Possession",
        subPhase: "High Press",
        outcome: "Development",
        players: [{ player_id: "player-6", player_label: "Player Six" }],
        labels: [{ label_type: "mini_game_principle", label_value: "counterpress-five-seconds", label_text: "Counterpress 5s" }],
      },
    ];
    window.__videoAnalysisSmokeClips = libraryClips;
    window.__videoAnalysisInitialState = {
      status: "ready",
      view: "workspace",
      activeAnalysisRoomTab: "match-report",
      match: {
        id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        title: "Match #11 @ Angel City - May 31st",
      },
      video: {
        id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      },
      videoRef: {
        objectUrl: "data:video/mp4;base64,AAAA",
        durationMs: 90000,
        displayName: "Match #11 @ Angel City - May 31st.mp4",
      },
      localFileStatus: "native-ready",
      nativePlaybackReady: true,
      players: [
        { id: "player-8", name: "Player Eight" },
        { id: "player-6", name: "Player Six" },
      ],
      clips: libraryClips,
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-video-analysis-clip-library]")).toBeVisible();
  await expect(page.locator(".analysis-room-tab.is-active")).toContainText("Clip Library");
  await expect(page.locator(".video-analysis-clip-library-hero")).toContainText("Match #11 @ Angel City");
  await expect(page.locator(".video-analysis-clip-library-card")).toHaveCount(2);
  await expect(page.locator(".video-analysis-clip-library-card__time")).toHaveCount(0);
  await expect(page.locator('[data-video-analysis-clip-library-select="clip-build-third"]')).toBeVisible();
  await expect(page.locator("[data-video-analysis-clip-library-play-selected]")).toBeDisabled();
  await expect(page.locator(".video-analysis-clip-library-card").first()).toContainText("Match · Match #11 @ Angel City - May 31st · 31/05/2026");
  await expect(page.locator(".video-analysis-clip-library-group").first()).toContainText("Build Up");

  await page.locator('[data-video-analysis-clip-library-select="clip-build-third"]').check({ force: true });
  await page.locator('[data-video-analysis-clip-library-select="clip-press-counter"]').check({ force: true });
  await expect(page.locator(".video-analysis-clip-library-organizer")).toContainText("2 selected");
  await page.locator("[data-video-analysis-clip-library-play-selected]").click();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toContainText("Organizer · 1 of 2");
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toContainText("0:00:12 - 0:00:27");
  await page.locator("[data-video-analysis-clip-library-preview-close]").click();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toHaveCount(0);

  await page.locator('[data-video-analysis-clip-library-play="clip-build-third"]').click();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toContainText("Build Up / In Possession");
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toContainText("Match #11 @ Angel City - May 31st");
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toContainText("0:00:12 - 0:00:27");
  await expect(page.locator("[data-video-analysis-clip-library-video]")).toBeVisible();
  await expect(page.locator(".video-analysis-clip-library-preview__principles")).toContainText("Third Player");
  await page.locator("[data-video-analysis-clip-library-preview-close]").click();
  await expect(page.locator("[data-video-analysis-clip-library-preview]")).toHaveCount(0);

  await page.locator('[data-video-analysis-filter="miniGamePrincipleId"]').selectOption("third-player");
  await expect(page.locator(".video-analysis-clip-library-card")).toHaveCount(1);
  await expect(page.locator(".video-analysis-clip-library-card")).toContainText("Third Player");
  await page.locator("[data-video-analysis-clear-filters]").click();
  await expect(page.locator(".video-analysis-clip-library-card")).toHaveCount(2);

  await page.locator('[data-video-analysis-clip-library-group="miniGamePrinciple"]').click();
  await expect(page.locator(".video-analysis-clip-library-group").first()).toContainText("Third Player");
  await expect(page.locator(".video-analysis-clip-library-group").nth(1)).toContainText("Counterpress 5s");

  await page.locator('[data-video-analysis-clip-library-add-group="miniGamePrinciple"][data-video-analysis-clip-library-group-value="Third Player"]').click();
  await expect(page.locator(".video-analysis-toast")).toContainText("1 clips added to Presentation.");
});

test("Video Analysis Timeline handles a dense 500 tag match", async ({ page }) => {
  await page.addInitScript(() => {
    const phases = ["In Possession", "Out of Possession", "Offensive Transition", "Defensive Transition", "Set Pieces"];
    const outcomes = ["Positive", "Development", "Neutral"];
    window.__videoAnalysisSmokeClips = Array.from({ length: 500 }, (_, index) => ({
      id: `clip-${index + 1}`,
      match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
      start_ms: index * 14000,
      end_ms: index * 14000 + 15000,
      period: "1",
      phase: phases[index % phases.length],
      sub_phase: index % 2 ? "Build Up" : "Finishing Phase",
      team_principle_id: index % 2 ? "create-free-player" : "secure-first-pass",
      mini_game_principle_id: index % 2 ? "third-player" : "counterpress-5s",
      outcome: outcomes[index % outcomes.length],
      players: [],
      tags: [],
      descriptors: [],
      notes: [],
    }));
    window.__videoAnalysisInitialState = {
      view: "workspace",
      match: {
        id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        title: "500 tag match",
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
        displayName: "500 tag match",
      },
      localFileStatus: "native-ready",
      localFileMessage: "Native playback ready",
      nativePlaybackReady: true,
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  const timeline = page.locator("[data-video-analysis-timeline-module]");
  await expect(timeline).toHaveAttribute("data-video-analysis-timeline-density", "dense");
  await expect(timeline).toHaveAttribute("data-video-analysis-timeline-clip-count", "500");
  await expect(page.locator(".video-analysis-timeline-status")).toContainText("500 clips");
  await expect(page.locator(".video-analysis-code-window-dock [data-video-analysis-code-window]")).toBeVisible();
  await expect(page.locator(".video-analysis-clip-block")).toHaveCount(500);
  await expect(page.locator(".video-analysis-clip-block__copy small")).toHaveCount(0);
  const subPhaseLane = page.locator('[data-video-analysis-timeline-category-label="Build Up"]');
  await expect(subPhaseLane).toContainText("Build Up (250)");
  await expect(subPhaseLane).toContainText("0:00:14 - 1:56:41");
  await subPhaseLane.click();
  await expect(page.locator(".video-analysis-timeline-category-tray")).toContainText("250 clips selected");
  await page.locator("[data-video-analysis-timeline-category-open]").click();
  await expect(page.locator(".video-analysis-timeline-category-view button")).toHaveCount(250);
  await expect.poll(() => page.evaluate(() => (
    (window.__videoAnalysisRequests || []).filter((request) => request.action === "clips").length
  ))).toBe(3);
});

test("Video Analysis deletes a selected timeline tag with the Delete key", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisSmokeClips = [
      {
        id: "clip-delete-1",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        start_ms: 12000,
        end_ms: 27000,
        phase: "In Possession",
        sub_phase: "Build Up",
        outcome: "Neutral",
        players: [],
        tags: [],
        descriptors: [],
        notes: [],
      },
      {
        id: "clip-delete-2",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        start_ms: 42000,
        end_ms: 57000,
        phase: "Out of Possession",
        sub_phase: "High Press",
        outcome: "Positive",
        players: [],
        tags: [],
        descriptors: [],
        notes: [],
      },
    ];
    window.__videoAnalysisInitialState = {
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      match: { id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152", title: "Delete shortcut match" },
      video: { id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725", match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152" },
      source: { id: "source-1", match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152", video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725" },
      videoRef: { objectUrl: "data:video/mp4;base64,AAAA", durationMs: 120000, displayName: "Delete shortcut match" },
      localFileStatus: "native-ready",
      localFileMessage: "Native playback ready",
      nativePlaybackReady: true,
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".video-analysis-clip-block")).toHaveCount(2);
  await page.locator(".video-analysis-clip-block").first().click();
  await page.keyboard.press("Delete");
  await expect.poll(() => page.evaluate(() => (
    [...(window.__videoAnalysisRequests || [])].reverse().find((request) => request.action === "archive-clip")?.body?.id || ""
  ))).toBe("clip-delete-1");
  await expect(page.locator(".video-analysis-clip-block")).toHaveCount(1);
  await expect(page.locator(".video-analysis-toast")).toContainText("Timeline tag deleted.");
});

test("Video Analysis confirms before deleting an entire timeline row", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoAnalysisSmokeClips = [
      {
        id: "row-delete-1",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        start_ms: 10000,
        end_ms: 25000,
        phase: "In Possession",
        sub_phase: "Build Up",
        outcome: "Neutral",
        players: [],
        tags: [],
        descriptors: [],
        notes: [],
      },
      {
        id: "row-delete-2",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        start_ms: 40000,
        end_ms: 55000,
        phase: "In Possession",
        sub_phase: "Build Up",
        outcome: "Positive",
        players: [],
        tags: [],
        descriptors: [],
        notes: [],
      },
      {
        id: "row-keep-1",
        match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
        video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725",
        start_ms: 70000,
        end_ms: 85000,
        phase: "In Possession",
        sub_phase: "Finishing Phase",
        outcome: "Development",
        players: [],
        tags: [],
        descriptors: [],
        notes: [],
      },
    ];
    window.__videoAnalysisInitialState = {
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      match: { id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152", title: "Row delete match" },
      video: { id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725", match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152" },
      source: { id: "source-1", match_id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152", video_id: "26c70a43-5ee1-43f7-9e56-8e1c1be3a725" },
      videoRef: { objectUrl: "data:video/mp4;base64,AAAA", durationMs: 120000, displayName: "Row delete match" },
      localFileStatus: "native-ready",
      localFileMessage: "Native playback ready",
      nativePlaybackReady: true,
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".video-analysis-clip-block")).toHaveCount(3);
  await page.locator('[data-video-analysis-timeline-category-label="Build Up"]').click();
  let confirmMessage = "";
  page.once("dialog", async (dialog) => {
    confirmMessage = dialog.message();
    await dialog.accept();
  });
  await page.keyboard.press("Delete");

  await expect.poll(() => confirmMessage).toContain("Delete the \"Build Up\" timeline row?");
  await expect.poll(() => page.evaluate(() => {
    const request = [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "archive-clips");
    return request?.body?.ids || [];
  })).toEqual(["row-delete-1", "row-delete-2"]);
  await expect(page.locator(".video-analysis-clip-block")).toHaveCount(1);
  await expect(page.locator('[data-video-analysis-timeline-category-label="Build Up"]')).toHaveCount(0);
  await expect(page.locator('[data-video-analysis-timeline-category-label="Finishing Phase"]')).toBeVisible();
  await expect(page.locator(".video-analysis-toast")).toContainText("2 timeline tags deleted.");
});

test("Video Analysis Tag Panel creates a 15 second timeline tag from a code button", async ({ page }) => {
  await page.addInitScript(() => {
    window.__videoPlayCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        window.__videoPlayCalls += 1;
        return Promise.resolve();
      },
    });
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

  await expect(page.locator("[data-video-analysis-video]")).not.toHaveAttribute("controls", "");
  await expect(page.locator("[data-video-analysis-playback-rate]")).toHaveCount(4);
  await expect(page.locator('[data-video-analysis-playback-rate="1"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-video-analysis-playback-rate="1.5"]').click();
  await expect(page.locator('[data-video-analysis-playback-rate="1.5"]')).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-video-analysis-video]")?.playbackRate)).toBe(1.5);
  await page.locator('[data-video-analysis-playback-rate="0.5"]').click();
  await expect(page.locator('[data-video-analysis-playback-rate="0.5"]')).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-video-analysis-video]")?.playbackRate)).toBe(0.5);
  await expect(page.locator(".video-analysis-player-tag-filter")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-video-fullscreen]")).toBeVisible();
  await expect(page.locator("[data-video-analysis-code-mode]")).toContainText("Code mode");
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
  await expect(page.locator("[data-video-analysis-code-mode]")).toHaveAttribute("aria-pressed", "true");
  const codeModeLayout = await page.evaluate(() => {
    const videoFrame = document.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame")?.getBoundingClientRect();
    const timeline = document.querySelector(".video-analysis-fs-player-timeline")?.getBoundingClientRect();
    const timelineScroll = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-scroll");
    const transport = document.querySelector(".video-analysis-player-transport")?.getBoundingClientRect();
    const scrollStyle = timelineScroll ? getComputedStyle(timelineScroll) : null;
    return {
      timelineHeight: timeline?.height ?? 0,
      timelineOverflowY: scrollStyle?.overflowY || "",
      transportHeight: transport?.height ?? 0,
      videoHeight: videoFrame?.height ?? 0,
    };
  });
  expect(codeModeLayout.videoHeight).toBeGreaterThan(codeModeLayout.timelineHeight * 1.8);
  expect(codeModeLayout.timelineHeight).toBeLessThanOrEqual(225);
  expect(codeModeLayout.timelineOverflowY).toBe("auto");
  expect(codeModeLayout.transportHeight).toBeLessThanOrEqual(52);
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).not.toHaveClass(/is-code-mode/);
  const timelineLayout = await page.evaluate(() => {
    const videoFrame = document.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame")?.getBoundingClientRect();
    const timeline = document.querySelector(".video-analysis-fs-player-timeline")?.getBoundingClientRect();
    const timelineScroll = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-scroll");
    const scroll = timelineScroll?.getBoundingClientRect();
    const canvas = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-canvas")?.getBoundingClientRect();
    const ruler = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-ruler")?.getBoundingClientRect();
    const label = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-lane__label")?.getBoundingClientRect();
    return {
      canvasWidth: canvas?.width ?? 0,
      frameLeft: timeline?.left ?? 0,
      frameWidth: timeline?.width ?? 0,
      labelRight: label?.right ?? 0,
      rulerLeft: ruler?.left ?? 0,
      rulerWidth: ruler?.width ?? 0,
      scrollClientWidth: timelineScroll?.clientWidth ?? 0,
      scrollLeft: scroll?.left ?? 0,
      scrollWidth: scroll?.width ?? 0,
      videoLeft: videoFrame?.left ?? 0,
      videoWidth: videoFrame?.width ?? 0,
    };
  });
  expect(timelineLayout.videoWidth).toBeGreaterThan(300);
  expect(Math.abs(timelineLayout.frameLeft - timelineLayout.videoLeft)).toBeLessThanOrEqual(3);
  expect(Math.abs(timelineLayout.frameWidth - timelineLayout.videoWidth)).toBeLessThanOrEqual(3);
  expect(Math.abs(timelineLayout.scrollLeft - timelineLayout.frameLeft)).toBeLessThanOrEqual(3);
  expect(Math.abs(timelineLayout.scrollWidth - timelineLayout.frameWidth)).toBeLessThanOrEqual(3);
  expect(timelineLayout.rulerLeft).toBeGreaterThan(timelineLayout.frameLeft + 80);
  expect(timelineLayout.labelRight).toBeLessThanOrEqual(timelineLayout.rulerLeft + 1);
  expect(timelineLayout.canvasWidth).toBeGreaterThanOrEqual(timelineLayout.scrollClientWidth - 2);
  const timelineZoom = await page.evaluate(() => {
    const scroll = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-scroll");
    const canvas = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-canvas");
    const frame = document.querySelector(".video-analysis-fs-player-timeline")?.getBoundingClientRect();
    const rect = scroll?.getBoundingClientRect();
    scroll?.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: (rect?.left || 0) + ((rect?.width || 0) / 2),
      clientY: (rect?.top || 0) + ((rect?.height || 0) / 2),
      ctrlKey: true,
      deltaY: -240,
    }));
    return {
      beforeCanvasWidth: canvas?.getBoundingClientRect().width ?? 0,
      beforeFrameWidth: frame?.width ?? 0,
    };
  });
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-canvas");
    return canvas?.getBoundingClientRect().width ?? 0;
  })).toBeGreaterThan(timelineZoom.beforeCanvasWidth * 1.15);
  const zoomedTimeline = await page.evaluate(() => {
    const scroll = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-scroll");
    const canvas = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-timeline-canvas");
    const frame = document.querySelector(".video-analysis-fs-player-timeline")?.getBoundingClientRect();
    return {
      canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
      frameWidth: frame?.width ?? 0,
      scrollClientWidth: scroll?.clientWidth ?? 0,
      scrollWidth: scroll?.scrollWidth ?? 0,
    };
  });
  expect(Math.abs(zoomedTimeline.frameWidth - timelineZoom.beforeFrameWidth)).toBeLessThan(2);
  expect(zoomedTimeline.scrollWidth).toBeGreaterThan(zoomedTimeline.scrollClientWidth + 20);
  const timelineClipBlock = await page.evaluate(() => {
    const block = document.querySelector(".video-analysis-fs-player-timeline .video-analysis-clip-block");
    const detail = block?.querySelector("em");
    const time = block?.querySelector("small");
    return {
      visibleText: block?.innerText.trim() || "",
      detailDisplay: detail ? getComputedStyle(detail).display : "",
      timeDisplay: time ? getComputedStyle(time).display : "",
    };
  });
  expect(timelineClipBlock).toMatchObject({
    visibleText: "1",
    detailDisplay: "none",
    timeDisplay: "none",
  });
  await expect(page.locator(".video-analysis-template-builder")).toContainText("Code Window");
  await expect(page.locator(".video-analysis-template-builder")).toContainText("Football Science Tag Panel");
  await expect(page.locator('[data-video-analysis-code-button="subPhase-build-up"]')).not.toContainText("15s");
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "currentTime", { configurable: true, value: 83 });
  });

  await page.locator('[data-video-analysis-code-button="subPhase-build-up"]').focus();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.__videoPlayCalls || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    return (window.__videoAnalysisRequests || []).filter((item) => item.action === "save-clip").length;
  })).toBe(0);

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
    miniGamePrincipleId: "",
    codingMode: "instant",
    visibility: "private",
  });
  await expect(page.locator(".video-analysis-playhead-time")).toContainText("0:01:23");
  await expect.poll(() => page.evaluate(() => {
    const block = [...document.querySelectorAll(".video-analysis-clip-block")]
      .find((item) => String(item.getAttribute("title") || "").includes("0:01:23"));
    const playhead = document.querySelector(".video-analysis-playhead");
    return {
      blockNumber: block?.querySelector("strong")?.textContent || "",
      blockLeft: block ? Number.parseFloat(block.style.left || "0") : null,
      playheadLeft: playhead ? Number.parseFloat(playhead.style.left || "0") : null,
    };
  })).toMatchObject({
    blockNumber: "2",
  });
  const alignment = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".video-analysis-clip-block")]
      .find((item) => String(item.getAttribute("title") || "").includes("0:01:23"));
    const playhead = document.querySelector(".video-analysis-playhead");
    return Math.abs(Number.parseFloat(block?.style.left || "0") - Number.parseFloat(playhead?.style.left || "0"));
  });
  expect(alignment).toBeLessThan(0.02);

  await page.locator("[data-video-analysis-mg-principles-open]").click();
  await expect(page.locator(".video-analysis-mg-picker-overlay")).toBeVisible();
  await expect(page.locator("#video-analysis-mg-picker-title")).toHaveText("MG Principles");
  await expect(page.locator(".video-analysis-mg-picker-overlay")).not.toContainText("Clip principles");
  await expect(page.locator(".video-analysis-mg-picker-overlay")).not.toContainText("Stored as suggestions");
  await expect(page.locator(".video-analysis-mg-picker-overlay")).not.toContainText("Football Science Core");
  await expect(page.locator(".video-analysis-mg-picker-search")).toBeVisible();
  await expect(page.locator(".video-analysis-mg-picker-group").first()).toContainText("Suggested for Build Up");
  await expect(page.locator(".video-analysis-mg-picker-group").first()).toContainText("Drive past press");
  await expect(page.locator(".video-analysis-mg-picker-group").first()).toContainText("FT3");
  await page.locator(".video-analysis-mg-picker-search").fill("FT3");
  await expect(page.locator(".video-analysis-mg-picker-overlay")).toContainText("FT3 (Find the Third)");
  await expect(page.locator(".video-analysis-mg-picker-overlay")).not.toContainText("Drive past press");
  await page.locator('[data-video-analysis-mg-principle-toggle="ft3-find-the-third"]').click();
  await expect(page.locator('[data-video-analysis-mg-principle-toggle="ft3-find-the-third"]')).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => {
    const request = [...(window.__videoAnalysisRequests || [])]
      .reverse()
      .find((item) => item.action === "save-clip" && (item.body?.clip?.labels || [])
        .some((label) => (label.value || label.label_value) === "ft3-find-the-third"));
    return (request?.body?.clip?.labels || []).map((label) => label.value || label.label_value);
  })).toContain("ft3-find-the-third");
  await page.locator(".video-analysis-mg-picker-close").click();
  await expect(page.locator(".video-analysis-mg-picker-overlay")).toHaveCount(0);

  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await expect(page.locator("[data-video-analysis-template-overlay]")).toBeVisible();
  await expect(page.locator('[data-video-analysis-code-window] [data-video-analysis-button-ms-field="subPhase-build-up:defaultDurationMs"]')).toHaveCount(0);
  await page.locator('[data-video-analysis-template-select-group="Sub-phase"]').click();
  await page.locator('[data-video-analysis-template-select-button="subPhase-build-up"]').click();
  await expect(page.locator("[data-video-analysis-template-overlay] .video-analysis-builder-preview")).toContainText("Build Up");
  await expect(page.locator('[data-video-analysis-template-overlay] [data-video-analysis-button-ms-field="subPhase-build-up:defaultDurationMs"]')).toHaveValue("15");
  await expect(page.locator('[data-video-analysis-template-overlay] [data-video-analysis-button-field="subPhase-build-up:buttonBehavior"]')).toHaveValue("create_tag");
});

test("Video Analysis Tag Panel uses the red timeline playhead when video metadata is not ready", async ({ page }) => {
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
      timeline: {
        zoom: 1,
        laneMode: "phase",
        playheadMs: 42000,
        selectedCategory: { laneMode: "", label: "", viewOpen: false },
      },
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html", { waitUntil: "domcontentloaded" });

  await page.locator('[data-video-analysis-code-button="phase-offensive-transition"]').click();
  await expect.poll(() => {
    return page.evaluate(() => {
      const request = (window.__videoAnalysisRequests || []).find((item) => item.action === "save-clip");
      return request?.body?.clip || null;
    });
  }).toMatchObject({
    startMs: 42000,
    endMs: 57000,
    phase: "Offensive Transition",
    codingMode: "instant",
    visibility: "private",
  });
  await expect(page.locator(".video-analysis-playhead-time")).toContainText("0:00:42");
});

test("Video Analysis player buttons create IDP player clips from the playhead", async ({ page }) => {
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
  await expect(page.locator(".video-analysis-player-tag-panel")).toContainText("Players");
  await expect(page.locator('[data-video-analysis-player-tag="p1"]')).toContainText("AM");
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "currentTime", { configurable: true, value: 121 });
  });

  await page.locator('[data-video-analysis-player-tag="p1"]').click();

  await expect.poll(() => page.evaluate(() => {
    const request = [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-clip");
    return request?.body?.clip || null;
  })).toMatchObject({
    startMs: 121000,
    endMs: 136000,
    visibility: "idp",
    players: [
      { playerId: "p1", playerLabel: "Alex Morgan", role: "primary" },
    ],
  });
  await expect(page.locator(".video-analysis-notifications")).toContainText("Alex Morgan sent to IDP.");
});

test("Video Analysis Panel Builder creates a custom tag button", async ({ page }) => {
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

  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await expect(page.locator("[data-video-analysis-template-overlay]")).toBeVisible();
  await page.locator('[data-video-analysis-template-builder-field="newGroupName"]').fill("Pressing Triggers");
  await page.locator("[data-video-analysis-add-button-group]").click();

  const overlay = page.locator("[data-video-analysis-template-overlay]");
  const inspector = overlay.locator(".video-analysis-panel-builder-inspector");
  const buttonsList = overlay.locator('[data-video-analysis-template-button-list="Pressing Triggers"]');
  await expect(overlay.locator('[data-video-analysis-template-select-group="Pressing Triggers"]')).toBeVisible();
  await expect(buttonsList).toBeVisible();
  await expect(inspector).toContainText("Preview");
  await inspector.locator('input[data-video-analysis-button-field$=":label"]').fill("Jump press");
  await inspector.locator('input[data-video-analysis-button-field$=":hotkey"]').fill("1");
  await expect(overlay.locator(".video-analysis-hotkey-warning")).toContainText("already used");
  await inspector.locator('input[data-video-analysis-button-field$=":hotkey"]').fill("j");
  await expect(overlay.locator(".video-analysis-hotkey-warning")).toHaveCount(0);
  await inspector.locator('select[data-video-analysis-button-field$=":targetField"]').selectOption("tags");
  await inspector.locator('input[data-video-analysis-button-ms-field$=":defaultDurationMs"]').fill("8");
  await inspector.locator('input[data-video-analysis-button-ms-field$=":startOffsetMs:lead"]').fill("2");
  await inspector.locator('input[data-video-analysis-button-ms-field$=":endOffsetMs"]').fill("10");
  await inspector.locator("[data-video-analysis-button-color-preset]").nth(4).click();
  await expect(overlay.locator("[data-video-analysis-template-dirty]")).toBeVisible();
  await buttonsList.locator("[data-video-analysis-duplicate-code-button]").first().click();
  await expect(buttonsList.locator(".video-analysis-code-button-editor")).toHaveCount(2);
  await buttonsList.locator("[data-video-analysis-remove-code-button]").last().click();
  await expect(buttonsList.locator(".video-analysis-code-button-editor")).toHaveCount(1);
  await overlay.locator('[data-video-analysis-template-move-group="Pressing Triggers:-1"]').click();
  await page.locator("[data-video-analysis-save-template]").click();
  await expect.poll(() => page.evaluate(() => {
    return (window.__videoAnalysisRequests || []).find((item) => item.action === "save-coding-template")?.body?.template || null;
  })).toMatchObject({
    title: "Football Science Tag Panel",
  });
  const savedPressingButton = await page.evaluate(() => {
    const template = (window.__videoAnalysisRequests || []).find((item) => item.action === "save-coding-template")?.body?.template;
    return (template?.buttons || []).find((item) => item.group === "Pressing Triggers") || null;
  });
  expect(savedPressingButton).toMatchObject({
    label: "Jump press",
    groupSortOrder: 2,
    sortOrder: 0,
    defaultDurationMs: 8000,
    startOffsetMs: -2000,
    endOffsetMs: 10000,
  });

  await page.locator('[data-video-analysis-template-overlay] .video-analysis-template-close[data-video-analysis-panel-mode="use"]').click();
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    Object.defineProperty(video, "currentTime", { configurable: true, value: 12 });
  });
  await page.locator('[data-video-analysis-code-button]').filter({ hasText: "Jump press" }).click();
  await expect.poll(() => {
    return page.evaluate(() => {
      const request = (window.__videoAnalysisRequests || []).findLast?.((item) => item.action === "save-clip")
        || [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-clip");
      return request?.body?.clip || null;
    });
  }).toMatchObject({
    startMs: 10000,
    endMs: 22000,
    tags: ["Jump press"],
    codingMode: "instant",
    preRollMs: 2000,
    postRollMs: 10000,
  });
  await page.locator('[data-video-analysis-timeline-lane="tags"]').click();
  await expect(page.locator(".video-analysis-lane__label").filter({ hasText: "Jump press" })).toBeVisible();
  const jumpPressBlock = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".video-analysis-clip-block")]
      .find((item) => String(item.getAttribute("title") || "").includes("Jump press"));
    return {
      number: block?.querySelector("strong")?.textContent || "",
      style: block?.getAttribute("style") || "",
    };
  });
  expect(jumpPressBlock.number).toBe("1");
  expect(jumpPressBlock.style).toContain("--video-analysis-clip-color:#dc2626;");
});

test("Video Analysis Label selected buttons update the selected timeline clip", async ({ page }) => {
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

  await page.locator('[data-video-analysis-seek="clip-1"]').click();
  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await expect(page.locator("[data-video-analysis-template-overlay]")).toBeVisible();
  await page.locator('[data-video-analysis-template-builder-field="newGroupName"]').fill("Clip Labels");
  await page.locator("[data-video-analysis-add-button-group]").click();
  const inspector = page.locator("[data-video-analysis-template-overlay] .video-analysis-panel-builder-inspector");
  await expect(page.locator('[data-video-analysis-template-button-list="Clip Labels"]')).toBeVisible();
  await inspector.locator('input[data-video-analysis-button-field$=":label"]').fill("Press trigger");
  await inspector.locator('select[data-video-analysis-button-field$=":buttonBehavior"]').selectOption("label_current");
  await inspector.locator('select[data-video-analysis-button-field$=":targetField"]').selectOption("tags");
  await page.locator("[data-video-analysis-save-template]").click();
  await page.locator('[data-video-analysis-template-overlay] .video-analysis-template-close[data-video-analysis-panel-mode="use"]').click();
  await page.locator('[data-video-analysis-code-button]').filter({ hasText: "Press trigger" }).click();

  await expect.poll(() => page.evaluate(() => {
    const request = [...(window.__videoAnalysisRequests || [])].reverse().find((item) => item.action === "save-clip");
    return request?.body?.clip || null;
  })).toMatchObject({
    id: "clip-1",
    startMs: 12000,
    endMs: 18000,
    tags: ["wide", "third-player", "Press trigger"],
  });
  await expect(page.locator('[data-video-analysis-seek="clip-1"]')).toHaveCount(1);
  await expect(page.locator(".video-analysis-template-builder")).toContainText("Press trigger");
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
  await expect(page.locator(".video-analysis-player-time")).toContainText("0:00:00");
  await expect(page.locator(".video-analysis-player-time")).toContainText("/ 2:01:07");
  await expect(page.locator(".video-analysis-player__meta")).toContainText("2:01:07");
  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.__videoAnalysisTestCurrentTime = 83;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get() {
        return this.__videoAnalysisTestCurrentTime || 0;
      },
      set(value) {
        this.__videoAnalysisTestCurrentTime = Number(value) || 0;
      },
    });
    video.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator(".video-analysis-player-time")).toContainText("0:01:23");
  await expect(page.locator(".video-analysis-player-time")).toContainText("/ 2:01:07");
  await expect.poll(() => page.evaluate(() => {
    const scroller = document.querySelector(".video-analysis-timeline-scroll");
    const canvas = document.querySelector(".video-analysis-timeline-canvas");
    if (!scroller || !canvas) return 0;
    canvas.style.width = "180%";
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 280,
      deltaMode: 0,
    }));
    return scroller.scrollLeft;
  })).toBeGreaterThan(0);
  await page.evaluate(() => {
    const scroller = document.querySelector(".video-analysis-timeline-scroll");
    const canvas = document.querySelector(".video-analysis-timeline-canvas");
    if (canvas) canvas.style.width = "";
    if (scroller) scroller.scrollLeft = 0;
  });

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
  const y = railBox.y + 10;
  const startX = railBox.x + 4;
  await page.mouse.move(startX, y);
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

test("Video Analysis video frame shuttles playback with horizontal two finger wheel", async ({ page }) => {
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

  await page.evaluate(() => {
    const video = document.querySelector("[data-video-analysis-video]");
    video.__videoAnalysisTestCurrentTime = 60;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get() {
        return this.__videoAnalysisTestCurrentTime || 0;
      },
      set(value) {
        this.__videoAnalysisTestCurrentTime = Number(value) || 0;
      },
    });
    video.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator(".video-analysis-player-time")).toContainText("0:01:00");

  const forward = await page.evaluate(() => {
    const frame = document.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame");
    const video = document.querySelector("[data-video-analysis-video]");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 180,
      deltaY: 6,
      deltaMode: 0,
    });
    frame.dispatchEvent(event);
    return {
      currentTime: video.currentTime,
      defaultPrevented: event.defaultPrevented,
      cue: frame.classList.contains("is-shuttle-scrubbing"),
    };
  });
  expect(forward.defaultPrevented).toBe(true);
  expect(forward.cue).toBe(true);
  expect(forward.currentTime).toBeGreaterThan(70);
  await expect(page.locator(".video-analysis-player-time")).toContainText("0:01:14");

  const backward = await page.evaluate(() => {
    const frame = document.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame");
    const video = document.querySelector("[data-video-analysis-video]");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: -90,
      deltaY: 0,
      deltaMode: 0,
    });
    frame.dispatchEvent(event);
    return {
      currentTime: video.currentTime,
      defaultPrevented: event.defaultPrevented,
    };
  });
  expect(backward.defaultPrevented).toBe(true);
  expect(backward.currentTime).toBeLessThan(forward.currentTime);
  await expect(page.locator(".video-analysis-player-time")).toContainText("0:01:07");
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
