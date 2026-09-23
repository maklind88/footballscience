import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const date = "2026-05-19";
const modalSelector = ".session-tacticalboard-modal";
const markerSelector = '[data-session-tactical-element-id="player"]';

async function bootBoard(page, { legacy = false, pitchMode = "full-wide" } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const elements = [
    { id: "player", type: "blue-player", x: 20, y: 40, playerNumber: "9" },
    { id: "ball", type: "ball", x: 25, y: 50 },
    { id: "opponent", type: "red-player", x: 75, y: 45, playerNumber: "4" },
  ];
  const block = {
    id: "qa-animation", label: "Block 1", title: "Passing sequence", minutes: 15,
    objective: "Move into space", diagram: "empty", tacticalPitchMode: pitchMode,
    tacticalElements: elements,
    ...(legacy ? {} : {
      tacticalActiveFrameId: "frame-one",
      tacticalFrames: [
        { id: "frame-one", label: "Frame 1", elements },
        { id: "frame-two", label: "Frame 2", elements: elements.map((item) => ({ ...item, x: item.x + 15, y: item.y + 15 })) },
      ],
    }),
  };
  await page.addInitScript(({ key, date, block }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: {
      [date]: { id: `session-${date}`, date, title: "QA Training", selectedBlockId: block.id, blocks: [block] },
    } }));
  }, { key, date, block });
  await page.goto("/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(() => document.querySelector("[data-dashboard-news-dismiss], [data-dashboard-modal-close]")?.click());
  await page.locator("[data-session-open-tacticalboard]").click();
  const modal = page.locator(modalSelector);
  await expect(modal).toBeVisible();
  await expect(modal.locator("[data-session-tactical-frame]")).toHaveCount(legacy ? 1 : 2);
  return { modal, errors };
}

async function storage(page) { return page.evaluate((key) => localStorage.getItem(key), key); }
async function savedBlock(page) { return JSON.parse(await storage(page)).sessions[date].blocks[0]; }
async function seek(modal, fraction) {
  await modal.locator("[data-session-tactical-playhead]").evaluate((slider, value) => {
    slider.value = String(value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, fraction);
}
async function percentage(marker, axis = "left") {
  return marker.evaluate((element, axis) => {
    const rect = element.parentElement.getBoundingClientRect();
    const marker = element.getBoundingClientRect();
    return axis === "left" ? (marker.x + marker.width / 2 - rect.x) / rect.width * 100
      : (marker.y + marker.height / 2 - rect.y) / rect.height * 100;
  }, axis);
}

test("frames and playback are read-only; players and ball interpolate at the pitch scale", async ({ page }) => {
  const { modal, errors } = await bootBoard(page);
  const before = await storage(page);
  await modal.locator('[data-session-tactical-frame="frame-two"]').click();
  expect(await storage(page)).toBe(before);
  await expect(modal.locator(`.session-visual-board-editor ${markerSelector}`)).toHaveCSS("left", /.+/);
  await modal.locator(`.session-visual-board-editor ${markerSelector}`).click();
  await seek(modal, 0.5);
  const preview = modal.locator(".session-tactical-playback-surface");
  await expect(preview).toBeVisible();
  expect(await percentage(preview.locator(markerSelector))).toBeCloseTo(27.5, 1);
  expect(await percentage(preview.locator('[data-session-tactical-element-id="ball"]'))).toBeCloseTo(32.5, 1);
  expect(await percentage(preview.locator(markerSelector), "top")).toBeCloseTo(47.5, 1);
  await page.keyboard.press("Delete");
  expect(await storage(page)).toBe(before);
  await modal.locator('[data-session-tactical-playback="stop"]').click();
  await expect(preview).toHaveCount(0);
  expect(await percentage(modal.locator(`.session-visual-board-editor ${markerSelector}`))).toBeCloseTo(35, 1);
  await modal.locator('[data-session-tactical-playback-speed]').selectOption("2");
  await modal.locator('[data-session-tactical-playback="play"]').click();
  await expect(modal.locator('[data-session-tactical-playback="play"]')).toHaveAttribute("aria-label", "Pause");
  await expect(modal.locator('[data-session-tactical-playback="play"]')).toHaveAttribute("aria-label", "Play");
  await expect(modal.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 2 / 2");
  expect(await storage(page)).toBe(before);
  await modal.locator('[data-session-close-tacticalboard]').click();
  expect(await storage(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("next frame copies objects; edits, undo, and reload preserve each frame independently", async ({ page }) => {
  const { modal, errors } = await bootBoard(page, { legacy: true });
  const before = await storage(page);
  await expect(modal.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
  expect((await savedBlock(page)).tacticalFrames || []).toHaveLength(0);
  await modal.locator("[data-session-add-tactical-frame]").click();
  await expect(modal.locator("[data-session-tactical-frame]")).toHaveCount(2);
  expect(await storage(page)).not.toBe(before);
  const player = modal.locator(`.session-visual-board-editor ${markerSelector}`);
  await player.click();
  await player.press("ArrowRight");
  await expect.poll(async () => (await savedBlock(page)).tacticalElements[0].x).toBeGreaterThan(20);
  const changed = await savedBlock(page);
  expect(changed.tacticalFrames[0].elements[0].x).toBe(20);
  expect(changed.tacticalFrames[1].elements[0].x).toBeGreaterThan(20);
  await modal.locator('[data-session-undo-board="tactical"]').click();
  await expect.poll(async () => (await savedBlock(page)).tacticalElements[0].x).toBe(20);
  await modal.locator('[data-session-redo-board="tactical"]').click();
  await expect.poll(async () => (await savedBlock(page)).tacticalElements[0].x).toBe(changed.tacticalElements[0].x);
  await modal.locator("[data-session-tactical-frame]").first().click();
  const saved = await storage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-session-open-tacticalboard]")).toBeVisible();
  expect(await storage(page)).toBe(saved);
  await page.locator("[data-session-open-tacticalboard]").click();
  await expect(modal.locator("[data-session-tactical-frame]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1470, height: 649 }, { width: 390, height: 844 }]) {
  test(`playback controls fit and the pitch keeps its ratio at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const { modal, errors } = await bootBoard(page, { pitchMode: "full" });
    for (const button of await modal.locator(".session-tactical-playback button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    const editor = modal.locator(".session-visual-board-editor .session-visual-board-surface");
    const before = await editor.boundingBox();
    await seek(modal, 0.5);
    const after = await modal.locator(".session-tactical-playback-surface .session-visual-board-surface").boundingBox();
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2);
    const stage = await modal.locator("[data-session-tactical-canvas-wrap]").boundingBox();
    expect(after.width).toBeLessThanOrEqual(stage.width);
    expect(after.height).toBeLessThanOrEqual(stage.height);
    expect(after.y).toBeGreaterThanOrEqual(stage.y - 1);
    expect(after.y + after.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    await page.screenshot({ path: testInfo.outputPath(`playback-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test("reduced motion steps between frames without losing positions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { modal } = await bootBoard(page);
  await seek(modal, 0.5);
  const marker = modal.locator(`.session-tactical-playback-surface ${markerSelector}`);
  expect(await percentage(marker)).toBeCloseTo(20, 1);
  await seek(modal, 1);
  expect(await percentage(marker)).toBeCloseTo(35, 1);
});

test("pause, loop, restart, and keyboard controls do not save or edit selected objects", async ({ page }) => {
  const { modal, errors } = await bootBoard(page);
  await modal.locator(`.session-visual-board-editor ${markerSelector}`).click();
  const before = await storage(page);
  await modal.locator('[data-session-tactical-playback="loop"]').click();
  await modal.locator('[data-session-tactical-playback-speed]').selectOption("2");
  const play = modal.locator('[data-session-tactical-playback="play"]');
  await play.click();
  // Observe the brief end hold on animation frames, not Playwright's slower retry cadence.
  for (const label of ["Frame 2 / 2", "Frame 1 / 2"]) {
    await page.waitForFunction((label) => document.querySelector("[data-session-tactical-playback-status]")?.textContent === label, label);
  }
  await expect(play).toHaveAttribute("aria-label", "Pause");
  await play.click();
  const position = await percentage(modal.locator(`.session-tactical-playback-surface ${markerSelector}`));
  await page.waitForTimeout(150);
  expect(await percentage(modal.locator(`.session-tactical-playback-surface ${markerSelector}`))).toBeCloseTo(position, 2);
  await modal.locator('[data-session-tactical-playback="restart"]').click();
  expect(await percentage(modal.locator(`.session-tactical-playback-surface ${markerSelector}`))).toBeCloseTo(20, 1);
  await page.keyboard.press("Backspace");
  expect(await storage(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(modal.locator(".session-tactical-playback-surface")).toHaveCount(0);
  await expect(modal).toBeVisible();
  expect(await storage(page)).toBe(before);
  expect(errors).toEqual([]);
});

for (const pitchMode of ["attacking-half", "defending-half", "goalkeeper"]) {
  test(`animation keeps the ${pitchMode} pitch and normalized coordinates`, async ({ page }) => {
    const { modal } = await bootBoard(page, { pitchMode });
    const pitch = await modal.locator(".session-visual-board-editor .session-visual-board-surface").boundingBox();
    await seek(modal, 0.5);
    const preview = modal.locator(".session-tactical-playback-surface");
    await expect(preview.locator(`.session-visual-board-mode-${pitchMode}`)).toBeVisible();
    const rect = await preview.locator(".session-visual-board-surface").boundingBox();
    expect(rect.width / rect.height).toBeCloseTo(pitch.width / pitch.height, 2);
    expect(await percentage(preview.locator(markerSelector))).toBeCloseTo(27.5, 1);
    expect(await percentage(preview.locator(markerSelector), "top")).toBeCloseTo(47.5, 1);
  });
}

test("deleting a frame requires confirmation and preserves the remaining board", async ({ page }) => {
  const { modal } = await bootBoard(page);
  await modal.locator('[data-session-tactical-frame="frame-two"]').click();
  await modal.locator("[data-session-delete-tactical-frame]").click();
  const dialog = page.locator(".platform-confirm-dialog");
  await expect(dialog).toBeVisible();
  expect((await savedBlock(page)).tacticalFrames).toHaveLength(2);
  await dialog.locator("[data-platform-confirm-ok]").click();
  await expect(modal.locator("[data-session-tactical-frame]")).toHaveCount(1);
  expect((await savedBlock(page)).tacticalFrames[0].elements[0].x).toBe(20);
  await expect(modal.locator("[data-session-delete-tactical-frame]")).toBeDisabled();
});

test("background renders retain playback while changed board content stops it without saving", async ({ page }) => {
  const { modal } = await bootBoard(page);
  await seek(modal, 0.5);
  await modal.locator(".session-tactical-playback-surface").evaluate((element) => { element.dataset.qaRetained = "yes"; });
  const before = await storage(page);
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    runtime.renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
  });
  await expect(modal.locator(".session-tactical-playback-surface")).toHaveAttribute("data-qa-retained", "yes");
  expect(await percentage(modal.locator(`.session-tactical-playback-surface ${markerSelector}`))).toBeCloseTo(27.5, 1);
  expect(await storage(page)).toBe(before);
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    runtime.getSessionPlannerSelectedBlock().tacticalElements[0].x = 30;
    runtime.renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
  });
  await expect(modal.locator(".session-tactical-playback-surface")).toHaveCount(0);
  expect(await percentage(modal.locator(`.session-visual-board-editor ${markerSelector}`))).toBeCloseTo(30, 1);
  expect(await storage(page)).toBe(before);
});

test("appearing and disappearing objects change only at frame boundaries", async ({ page }) => {
  const { modal } = await bootBoard(page);
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    const block = runtime.getSessionPlannerSelectedBlock();
    block.tacticalFrames[1].elements = block.tacticalFrames[1].elements.filter((item) => item.id !== "opponent");
    block.tacticalFrames[1].elements.push({ id: "new-player", type: "neutral-player", x: 10, y: 10 });
    runtime.renderSessionPlannerWorkspace();
  });
  await seek(modal, 0.5);
  const preview = modal.locator(".session-tactical-playback-surface");
  await expect(preview.locator('[data-session-tactical-element-id="opponent"]')).toHaveCount(1);
  await expect(preview.locator('[data-session-tactical-element-id="new-player"]')).toHaveCount(0);
  await seek(modal, 1);
  await expect(preview.locator('[data-session-tactical-element-id="opponent"]')).toHaveCount(0);
  await expect(preview.locator('[data-session-tactical-element-id="new-player"]')).toHaveCount(1);
});
