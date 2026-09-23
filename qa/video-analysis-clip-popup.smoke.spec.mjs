import { expect, test } from "@playwright/test";

const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
const clipSelector = '.video-analysis-clip-block[data-video-analysis-seek="popup-clip"]';
const popupSelector = "[data-video-analysis-clip-editor]";
const field = (page, name) => page.locator(`[data-video-analysis-timeline-edit-field="${name}"]`);
const writes = page => page.evaluate(() => (window.__videoAnalysisRequests || []).filter(r => r.action === "save-clip"));
const edit = page => page.getByRole("button", { name: "Edit clip", exact: true }).click();
const back = page => page.getByRole("button", { name: "Back to video", exact: true }).click();
const expectSaved = async page => {
  await expect(page.locator("#video-analysis-clip-edit-dialog")).not.toBeVisible();
  await expect(page.locator(popupSelector)).toBeVisible();
  await expect(page.locator("[data-clip-review-notice]")).toHaveText("Playlist changed");
};

async function openTimeline(page, canEdit = true, durationMs = 625000) {
  await page.addInitScript(({ matchId, videoId, canEdit, durationMs }) => {
    window.__videoAnalysisSmokeClips = [{
      id: "popup-clip", revision: 3, match_id: matchId, video_id: videoId,
      start_ms: 67025, end_ms: 82025, sub_phase: "High Press", phase: "Out of Possession", outcome: "Neutral",
      players: [{ player_id: "p1", player_label: "Uno Shiragaki" }],
      tags: ["press"], notes: [{ note: "Original note" }],
      descriptors: [{ type: "unit", value: "Back Line" }],
      metadata: { clipKind: "player", source: "existing-coding" },
    }];
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit,
      match: { id: matchId, title: "Seattle 4 July" },
      video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "existing-video" },
      videoRef: { durationMs, displayName: "Seattle 4 July" },
      timeline: { laneMode: "player", selectedClipIds: [], zoom: 1, history: [] },
    };
  }, { matchId, videoId, canEdit, durationMs });
  await page.goto("/qa/video-analysis-browser-smoke.html?clip-popup=1");
  await expect(page.locator(clipSelector)).toBeVisible();
}

for (const width of [1470, 390]) {
  test(`clip popup opens on double click without a focus panel at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 772 });
    await openTimeline(page);
    const timeline = page.locator("[data-video-analysis-timeline-module]");
    let timelineBox;
    await expect.poll(async () => {
      timelineBox = await timeline.boundingBox();
      return timelineBox?.height || 0;
    }).toBeGreaterThan(0);
    const height = timelineBox.height;
    await page.locator(clipSelector).click();
    await expect(page.locator(clipSelector)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(popupSelector)).toHaveCount(0);
    await expect(page.locator("[data-video-analysis-timeline-focus]")).toHaveCount(0);
    await expect.poll(async () => (await timeline.boundingBox())?.height).toBe(height);
    // Start a separate double click after the first selection.
    await page.waitForTimeout(460);
    await page.locator(clipSelector).dblclick();
    const popup = page.locator(popupSelector);
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Uno Shiragaki");
    await expect(field(page, "startMs")).toHaveValue("0:01:07.025");
    await expect(field(page, "endMs")).toHaveValue("0:01:22.025");
    await expect(field(page, "duration")).toHaveValue("15");
    await expect(field(page, "startMs")).toBeHidden();
    const timingToggle = popup.getByRole("button", { name: "Edit clip", exact: true });
    await expect(timingToggle).toHaveAttribute("aria-expanded", "false");
    await expect(timingToggle).toHaveAttribute("title", "Edit clip");
    await expect(timingToggle).toHaveAttribute("aria-haspopup", "dialog");
    await expect(field(page, "phase")).toBeHidden();
    const pencilBox = await timingToggle.boundingBox();
    const closeBox = await popup.getByRole("button", { name: "Close", exact: true }).boundingBox();
    expect(pencilBox.x + pencilBox.width).toBeLessThanOrEqual(closeBox.x);
    expect(pencilBox.y + pencilBox.height / 2).toBe(closeBox.y + closeBox.height / 2);
    await expect(popup.locator("[data-video-analysis-clip-preview]")).toHaveCount(1);
    await expect(popup.getByRole("button", { name: "Reconnect local file" })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Play clip", exact: true })).toBeDisabled();
    await expect(popup.locator("[data-clip-review-select]")).toHaveCount(1);
    await expect(popup.locator("[data-clip-review-select]")).toHaveAttribute("aria-pressed", "true");
    const stripBox = await popup.locator("[data-clip-review-nav]").boundingBox();
    const transportBox = await popup.locator(".video-analysis-clip-editor__transport").boundingBox();
    expect(stripBox.y).toBeGreaterThanOrEqual(transportBox.y + transportBox.height);
    const box = await popup.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(772);
    expect(await popup.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`clip-popup-${width}.png`) });
    await timingToggle.click();
    await expect(field(page, "startMs")).toBeVisible();
    await expect(field(page, "startMs")).toBeFocused();
    expect(await popup.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const deleteButton = popup.locator("[data-video-analysis-clip-editor-delete]");
    await expect(deleteButton.locator("+ [data-video-analysis-timeline-edit-save]")).toHaveCount(1);
    const deleteBox = await deleteButton.boundingBox();
    const saveBox = await popup.locator("[data-video-analysis-timeline-edit-save]").boundingBox();
    expect(saveBox.x - deleteBox.x - deleteBox.width).toBeCloseTo(8, 1);
    expect(saveBox.y).toBe(deleteBox.y);
    await page.screenshot({ path: testInfo.outputPath(`clip-timing-tool-${width}.png`) });
    await field(page, "duration").fill("16");
    await page.keyboard.press("Escape");
    await expect(field(page, "startMs")).toBeHidden();
    await expect(timingToggle).toBeFocused();
    await timingToggle.click();
    await expect(field(page, "duration")).toHaveValue("16");
    await field(page, "note").fill("Unsaved note");
    await popup.getByRole("button", { name: "Apply", exact: true }).focus();
    await page.keyboard.press("Tab");
    expect(await page.locator("#video-analysis-clip-edit-dialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(popup).toBeVisible();
    await expect(timingToggle).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
    await page.locator("[data-clip-review-discard]").click();
    await expect(popup).toHaveCount(0);
    await expect(page.locator(clipSelector)).toBeFocused();
    expect(await writes(page)).toEqual([]);
    await page.keyboard.press("F2");
    await expect(field(page, "note")).toHaveValue("Original note");
    await page.locator(popupSelector).getByRole("button", { name: "Close", exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test("clip popup applies local timing and tags without editing the original", async ({ page }) => {
  await openTimeline(page);
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await field(page, "startMs").fill("0:01:05");
  await field(page, "duration").fill("20");
  await expect(field(page, "endMs")).toHaveValue("0:01:25");
  await field(page, "outcome").selectOption("Positive");
  await field(page, "tags").fill("press, regain");
  await field(page, "note").fill("Playlist note");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expectSaved(page);
  expect(await writes(page)).toEqual([]);
  await expect(field(page, "note")).toHaveValue("Playlist note");
  await page.keyboard.press("Escape");
  await page.locator("[data-clip-review-discard]").click();
  await page.locator(clipSelector).dblclick();
  await expect(field(page, "startMs")).toHaveValue("0:01:07.025");
  await expect(field(page, "note")).toHaveValue("Original note");
});

test("clip popup changes phase, sub-phase and principles without creating a new clip", async ({ page }) => {
  await openTimeline(page);
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await field(page, "phase").selectOption("In Possession");
  await expect(field(page, "subPhase")).toHaveValue("");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expect(page.locator(popupSelector).getByRole("alert")).toContainText("Choose a sub-phase");
  expect(await writes(page)).toEqual([]);
  await field(page, "subPhase").selectOption("Build Up");
  await back(page);
  await page.getByRole("button", { name: "MG Principles", exact: true }).click();
  await page.locator("[data-video-analysis-timeline-edit-principle]").first().check();
  await page.locator("[data-clip-principles-back]").last().click();
  await edit(page);
  await field(page, "note").fill("Build up with support");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expectSaved(page);
  expect(await writes(page)).toEqual([]);
  await expect(field(page, "note")).toHaveValue("Build up with support");
  await edit(page);
  await expect(field(page, "phase")).toHaveValue("In Possession");
  await expect(page.locator("[data-video-analysis-timeline-edit-principle]:checked")).toHaveCount(1);
  await field(page, "phase").selectOption("Offensive Transition");
  await field(page, "subPhase").selectOption("Offensive Transition");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expectSaved(page);
  await expect(field(page, "phase")).toHaveValue("Offensive Transition");
  expect(await writes(page)).toEqual([]);
});

test("clip popup uses the clicked row name in All Tags", async ({ page }) => {
  await openTimeline(page);
  await page.locator("[data-video-analysis-timeline-lane-select]").selectOption("all");
  const lane = page.locator('[data-video-analysis-timeline-category-label="Player / Uno Shiragaki"]').locator("..");
  await lane.locator(clipSelector).dblclick();
  await expect(page.locator(popupSelector).getByRole("heading")).toHaveText("Uno Shiragaki");
});

test("clip popup rejects invalid ranges and cancelling never writes", async ({ page }) => {
  await openTimeline(page);
  await page.locator(clipSelector).dblclick();
  const popup = page.locator(popupSelector);
  await edit(page);
  for (const [end, message] of [["0:99:00", "Enter a time"], ["0:01:00", "End must be after"], ["0:15:00", "End cannot exceed"]]) {
    await field(page, "endMs").fill(end);
    await popup.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(popup.getByRole("alert")).toContainText(message);
    await expect(field(page, "endMs")).toBeVisible();
    await expect(field(page, "endMs")).toBeFocused();
  }
  await back(page);
  await page.keyboard.press("Escape");
  await page.locator("[data-clip-review-discard]").click();
  expect(await writes(page)).toEqual([]);
});

test("playlist save failure retains local edits and prevents duplicate requests", async ({ page }) => {
  await openTimeline(page);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes("action=save-timeline")) {
        window.__popupSaveAttempts = (window.__popupSaveAttempts || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 150));
        return Response.json({ ok: false, reason: "Save unavailable" }, { status: 503 });
      }
      return original(...args);
    };
  });
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await field(page, "note").fill("Keep this draft");
  await back(page);
  await page.locator("[data-playlist-save]").dispatchEvent("click");
  await page.locator("[data-playlist-save]").dispatchEvent("click");
  await expect(page.locator("[data-review-playlist] [role=alert]")).toHaveText("Save unavailable");
  await expect(field(page, "note")).toHaveValue("Keep this draft");
  expect(await page.evaluate(() => window.__popupSaveAttempts)).toBe(1);
  expect(await writes(page)).toEqual([]);
});

test("clip popup is read only without editing permission", async ({ page }) => {
  await openTimeline(page, false);
  await page.locator(clipSelector).dblclick();
  await expect(field(page, "startMs")).toBeDisabled();
  await expect(page.locator("[data-clip-edit-open]")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-timeline-edit-save]")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-clip-editor-delete]")).toHaveCount(0);
  await page.getByRole("button", { name: "Clip details", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Clip details", exact: true })).toBeVisible();
  await expect(field(page, "note")).toBeVisible();
  await expect(field(page, "note")).toBeDisabled();
  await expect(field(page, "note")).toHaveValue("Original note");
  await back(page);
  await page.keyboard.press("Escape");
  expect(await writes(page)).toEqual([]);
});

test("removing the final playlist clip does not archive the original", async ({ page }) => {
  await openTimeline(page);
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await page.locator("[data-video-analysis-clip-editor-delete]").click();
  await page.locator("[data-video-analysis-clip-editor-delete-confirm]").click();
  await expect(page.locator("#video-analysis-clip-edit-dialog [role=alert]")).toContainText("Keep at least one");
  await expect(page.locator(clipSelector)).toHaveCount(1);
  expect(await page.evaluate(() => window.__videoAnalysisRequests.filter(r => r.action === "archive-clip"))).toEqual([]);
});

test("clip popup preserves code mode and keeps keyboard tagging out of the editor", async ({ page }) => {
  await openTimeline(page);
  await page.locator("[data-video-analysis-code-mode]").click();
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await field(page, "note").fill("Press high");
  await field(page, "note").press("Enter");
  await field(page, "note").pressSequentially("Keep the unit together");
  await page.keyboard.press("Escape");
  await expect(page.locator("#video-analysis-clip-edit-dialog")).not.toBeVisible();
  await expect(page.locator(popupSelector)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
  await page.locator("[data-clip-review-discard]").click();
  await expect(page.locator(popupSelector)).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
  expect(await writes(page)).toEqual([]);
});

test("clip popup can extend the last clip when media duration is unknown", async ({ page }) => {
  await openTimeline(page, true, 0);
  await page.locator(clipSelector).dblclick();
  await edit(page);
  await field(page, "endMs").fill("0:02:00");
  await page.locator("[data-video-analysis-timeline-edit-save]").click();
  await expectSaved(page);
  await expect(field(page, "endMs")).toHaveValue("0:02:00");
  expect(await writes(page)).toEqual([]);
});

test("clip popup opens with two taps on a touch screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 772 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await openTimeline(page);
    await page.locator(clipSelector).tap();
    await page.locator(clipSelector).tap();
    await expect(page.locator(popupSelector)).toBeVisible();
    expect(await writes(page)).toEqual([]);
  } finally { await context.close(); }
});
