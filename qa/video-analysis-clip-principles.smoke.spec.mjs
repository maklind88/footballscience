import { expect, test } from "@playwright/test";

const panel = "#video-analysis-clip-principles-dialog";
const editPanel = "#video-analysis-clip-edit-dialog";
const option = id => `[data-video-analysis-timeline-edit-principle][value="${id}"]`;
const field = name => `[data-video-analysis-timeline-edit-field="${name}"]`;
const writes = page => page.evaluate(() => (window.__videoAnalysisRequests || []).filter(r => r.action === "save-clip"));

async function openClip(page, { canEdit = true, kind = "subPhase" } = {}) {
  await page.addInitScript(({ canEdit, kind }) => {
    const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
    const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
    window.__videoAnalysisSmokeClips = [{
      id: "principle-clip", revision: 3, match_id: matchId, video_id: videoId,
      start_ms: 57076, end_ms: 72076, phase: "Out of Possession", sub_phase: "High Press", outcome: "Neutral",
      players: kind === "player" ? [{ player_id: "p1", player_label: "Uno Shiragaki" }] : [],
      mini_game_principle_id: "trigger", labels: [{ label_type: "mini_game_principle", label_value: "trigger" }],
      notes: [{ note: "Original note" }], metadata: { clipKind: kind },
    }];
    window.__videoAnalysisInitialState = {
      view: "workspace", canEdit, match: { id: matchId }, video: { id: videoId, match_id: matchId },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "synthetic" },
      videoRef: { durationMs: 625000 }, timeline: { laneMode: "all", selectedClipIds: [], zoom: 1, history: [] },
    };
  }, { canEdit, kind });
  await page.goto("/qa/video-analysis-browser-smoke.html?clip-principles=1");
  await expect(page.locator('[data-video-analysis-timeline-category-label^="MG Principle / "]')).toHaveCount(0);
  await expect(page.locator('[data-video-analysis-timeline-lane-select] option[value="miniGamePrinciple"]')).toHaveCount(0);
  await page.locator('[data-video-analysis-seek="principle-clip"]').first().dblclick();
}

for (const [width, kind] of [[1470, "subPhase"], [390, "player"]]) {
  test(`MG tool searches and attaches principles to the same ${kind} clip at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 767 });
    await openClip(page, { kind });
    const tool = page.getByRole("button", { name: "MG Principles", exact: true });
    const toolBox = await tool.boundingBox();
    const pencilBox = await page.getByRole("button", { name: "Edit clip", exact: true }).boundingBox();
    expect(toolBox.x + toolBox.width).toBeLessThanOrEqual(pencilBox.x);
    await expect(page.locator("[data-video-analysis-principle-count]")).toHaveText("1");
    await page.screenshot({ path: testInfo.outputPath(`principle-tool-${width}.png`) });
    await tool.click();
    const search = page.getByRole("searchbox", { name: "Search MG Principles" });
    await expect(search).toBeFocused();
    await expect(page.locator(option("trigger"))).toBeChecked();
    await search.fill("DRIVE press");
    await expect(page.locator("[data-clip-principle-option]:visible")).toHaveCount(1);
    await page.locator(option("drive-past-press")).check();
    await search.fill("nonexistent principle");
    await expect(page.locator("[data-clip-principles-results]")).toHaveText("No matching principles");
    await search.press("Enter");
    expect(await writes(page)).toEqual([]);
    await search.fill("high press");
    await page.locator(option("ballside")).check();
    await expect(page.locator("[data-clip-principles-selected]")).toHaveText("3 selected");
    const box = await page.locator(panel).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(767);
    expect(await page.locator(panel).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`principle-search-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(tool).toBeFocused();
    await expect(page.locator("[data-clip-review-notice]")).toHaveText("Unsaved");
    await page.getByRole("button", { name: "Edit clip", exact: true }).click();
    await expect(page.locator(`${editPanel} [data-video-analysis-timeline-edit-principle]`)).toHaveCount(0);
    await expect(page.locator(field("subPhase"))).toHaveValue("High Press");
    await page.getByRole("button", { name: "Back to video", exact: true }).click();
    await tool.click();
    await page.locator("[data-clip-principles-save]").click();
    await expect(page.locator(panel)).not.toBeVisible();
    await expect(page.locator("[data-clip-review-notice]")).toHaveText("Playlist changed");
    expect(await writes(page)).toEqual([]);
    await expect(page.locator("[data-video-analysis-timeline-edit-principle]:checked")).toHaveCount(3);
    await tool.click();
    await search.fill("");
    for (const id of ["ballside", "drive-past-press", "trigger"]) await page.locator(option(id)).uncheck();
    await page.locator("[data-clip-principles-save]").click();
    await expect(page.locator(panel)).not.toBeVisible();
    expect(await writes(page)).toEqual([]);
    await expect(page.locator("[data-video-analysis-principle-count]")).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test("failed MG save retains principles and text drafts without claiming success", async ({ page }) => {
  await openClip(page);
  await page.getByRole("button", { name: "Edit clip", exact: true }).click();
  await page.locator(field("note")).fill("Unsaved text");
  await page.getByRole("button", { name: "Back to video", exact: true }).click();
  await page.getByRole("button", { name: "MG Principles", exact: true }).click();
  await page.locator(option("ballside")).check();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (...args) => String(args[0]).includes("action=save-timeline")
      ? Promise.resolve(Response.json({ ok: false, reason: "Save unavailable" }, { status: 503 })) : original(...args);
  });
  await page.locator("[data-clip-principles-save]").click();
  await page.locator("[data-playlist-save]").click();
  await expect(page.locator("[data-review-playlist] [role=alert]")).toHaveText("Save unavailable");
  await expect(page.locator(option("ballside"))).toBeChecked();
  await expect(page.locator(field("note"))).toHaveValue("Unsaved text");
  await expect(page.locator("[data-playlist-status]")).toHaveText("Unsaved");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-clip-review-close-confirm]")).toBeVisible();
});

test("MG search remains readable without permission to change clip principles", async ({ page }) => {
  await openClip(page, { canEdit: false });
  await page.getByRole("button", { name: "MG Principles", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search MG Principles" }).fill("trigger");
  await expect(page.locator(option("trigger"))).toBeChecked();
  await expect(page.locator(option("trigger"))).toBeDisabled();
  await expect(page.locator("[data-clip-principles-save]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await writes(page)).toEqual([]);
});
