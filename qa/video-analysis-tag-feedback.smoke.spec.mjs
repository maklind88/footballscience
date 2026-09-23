import { expect, test } from "@playwright/test";

const panel = ".video-analysis-template-scroll";
const buildUp = '[data-video-analysis-code-button="subPhase-build-up"]';
const player = '[data-video-analysis-player-tag="p1"]';
const outcome = '[data-video-analysis-outcome-tag="Development"]';
const writes = page => page.evaluate(() => (window.__videoAnalysisRequests || []).filter(r => r.action === "save-clip"));

async function openPlayer(page) {
  await page.addInitScript(() => {
    const matchId = "2a4e615e-f3e7-4fc7-bb70-a02db63c9152";
    const videoId = "26c70a43-5ee1-43f7-9e56-8e1c1be3a725";
    window.__videoAnalysisInitialState = {
      view: "workspace", match: { id: matchId, title: "Seattle 4 July" },
      video: { id: videoId, match_id: matchId },
      videoRef: { durationMs: 625000, displayName: "Seattle 4 July" },
      source: { id: "source-1", match_id: matchId, video_id: videoId, local_video_identifier: "existing-video" },
      draft: { phase: "In Possession", subPhase: "Build Up", outcome: "Neutral", playerId: "p1", unit: "Midfield" },
      codingSession: { activeButtonId: "subPhase-build-up", lastPlayerTagId: "p1", lastUnitTag: "Midfield", lastOutcomeTag: "Development" },
      timeline: { playheadMs: 121000 },
    };
  });
  await page.goto("/qa/video-analysis-browser-smoke.html?tag-feedback=1");
  await expect(page.locator(buildUp)).toBeVisible();
}

async function expectConfirmedThenNeutral(page, selector) {
  const button = page.locator(selector);
  const feedback = button.locator(".video-analysis-tag-feedback");
  await expect(feedback).toHaveCount(1);
  await expect.poll(() => feedback.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
  await expect.poll(async () => (await feedback.count()) ? feedback.evaluate(el => Number(getComputedStyle(el).opacity)) : 0).toBe(0);
  await expect(button).not.toHaveClass(/is-active/);
}

for (const width of [1470, 390]) {
  test(`tag panel is unselected before and after a saved tag at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 772 });
    await openPlayer(page);
    await expect(page.locator(`${panel} .is-active`)).toHaveCount(0);
    expect(await writes(page)).toHaveLength(0);
    await page.locator(buildUp).click();
    await expectConfirmedThenNeutral(page, buildUp);
    const saved = await writes(page);
    expect(saved.map(r => r.body.clip.metadata.clipKind)).toEqual(["subPhase", "phase"]);
    expect(saved[0].body.clip).toMatchObject({ startMs: 121000, endMs: 136000, subPhase: "Build Up" });
    await page.locator(buildUp).click();
    await expectConfirmedThenNeutral(page, buildUp);
    expect(await writes(page)).toHaveLength(2);
    await page.locator('[data-video-analysis-panel-mode="edit"]').click();
    await page.keyboard.press("Escape");
    await expect(page.locator(`${panel} .is-active`)).toHaveCount(0);
    await expect(page.locator(`${panel} .video-analysis-tag-feedback`)).toHaveCount(0);
    await page.locator(panel).screenshot({ path: testInfo.outputPath(`tag-panel-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test("keyboard coding uses the same temporary confirmation", async ({ page }) => {
  await openPlayer(page);
  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await page.locator('[data-video-analysis-template-select-group="Sub-phase"]').click();
  await page.locator('[data-video-analysis-template-select-button="subPhase-build-up"]').click();
  await page.locator('input[data-video-analysis-button-field="subPhase-build-up:hotkey"]').fill("b");
  await page.locator('.video-analysis-template-close').click();
  await page.keyboard.press("b");
  await expectConfirmedThenNeutral(page, buildUp);
  expect(await writes(page)).toHaveLength(2);
  await expect(page.locator(`${panel} .is-active`)).toHaveCount(0);
});

test("players, outcomes, Units and MG launchers return to neutral", async ({ page }) => {
  await openPlayer(page);
  await page.locator(player).click();
  await expectConfirmedThenNeutral(page, player);
  await page.locator(outcome).click();
  await expectConfirmedThenNeutral(page, outcome);
  await page.locator("[data-video-analysis-unit-open]").click();
  await expect(page.locator(".video-analysis-unit-chip.is-active")).toHaveCount(0);
  await page.locator('[data-video-analysis-unit-tag="Midfield"]').click();
  await expectConfirmedThenNeutral(page, "[data-video-analysis-unit-open]");
  await expect(page.locator("[data-video-analysis-unit-open]")).toHaveText("Unit");
  await page.locator("[data-video-analysis-unit-open]").click();
  await expect(page.locator(".video-analysis-unit-chip.is-active")).toHaveCount(0);
  await page.locator('[data-video-analysis-unit-close][aria-label="Close"]').click();
  await page.locator("[data-video-analysis-mg-principles-open]").click();
  await expect(page.locator(".video-analysis-mg-principle-chip.is-active")).toHaveCount(0);
  await page.locator('[data-video-analysis-mg-principle-toggle="drive-past-press"]').first().click();
  await expect(page.locator('[data-video-analysis-mg-principle-toggle="drive-past-press"]').first()).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-video-analysis-mg-principles-apply]").click();
  await expect(page.locator("[data-video-analysis-mg-principles-open]")).toHaveText("MG Principle");
  await expect(page.locator(`${panel} .is-active`)).toHaveCount(0);
  expect((await writes(page)).map(r => r.body.clip.metadata.clipKind)).toEqual(["player", "outcome", "unit", "miniGamePrinciple"]);
  await page.locator("[data-video-analysis-mg-principles-open]").click();
  await expect(page.locator(".video-analysis-mg-principle-chip.is-active")).toHaveCount(0);
});

test("failed tag save does not show success or leave an active button", async ({ page }) => {
  await openPlayer(page);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => String(args[0]).includes("action=save-clip")
      ? Response.json({ ok: false, error: "Save unavailable" }, { status: 503 })
      : original(...args);
  });
  await page.locator(buildUp).click();
  await expect(page.locator(".video-analysis-notifications")).toContainText("Clip request failed (503)");
  await expect(page.locator(".video-analysis-notifications")).not.toContainText("tagged");
  await expect(page.locator(`${panel} .is-active, ${panel} .video-analysis-tag-feedback`)).toHaveCount(0);
  expect(await writes(page)).toHaveLength(0);
});

test("duration coding stays active only until the recording is finished", async ({ page }) => {
  await openPlayer(page);
  await page.locator('[data-video-analysis-panel-mode="edit"]').click();
  await page.locator('[data-video-analysis-template-select-group="Sub-phase"]').click();
  await page.locator('[data-video-analysis-template-select-button="subPhase-build-up"]').click();
  await page.locator('select[data-video-analysis-button-field="subPhase-build-up:buttonBehavior"]').selectOption("toggle_duration");
  await page.locator('.video-analysis-template-close').click();
  await page.locator(buildUp).click();
  await expect(page.locator(buildUp)).toHaveClass(/is-active/);
  expect(await writes(page)).toHaveLength(0);
  await expect(page.locator(`${panel} .video-analysis-tag-feedback`)).toHaveCount(0);
  await page.locator(buildUp).click();
  await expectConfirmedThenNeutral(page, buildUp);
  expect(await writes(page)).toHaveLength(2);
  await expect(page.locator(`${panel} .is-active`)).toHaveCount(0);
});
