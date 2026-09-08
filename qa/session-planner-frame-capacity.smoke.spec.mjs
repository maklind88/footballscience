import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const date = "2026-09-08";
const marker = '[data-session-tactical-element-id="player"]';
const read = (page) => page.evaluate(({ key, date }) => JSON.parse(localStorage.getItem(key)).sessions[date].blocks[0], { key, date });
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), key);
async function boot(page, { count = 23, oversized = false, presentation = false } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ key, date, count, oversized }) => {
    if (localStorage.getItem(key)) return;
    const frames = Array.from({ length: count }, (_, index) => ({ id: `f-${index}`, label: `Frame ${index + 1}`,
      elements: [{ id: "player", type: "blue-player", x: 16 + index / 2, y: 30, playerNumber: "LCB" },
        { id: "other", type: "red-player", x: 70, y: 40, playerNumber: "RW" },
        { id: "ball", type: "ball", x: 20 + index / 2, y: 33 }] }));
    const block = { id: "qa-capacity", label: "Block 1", title: "Long sequence", minutes: 15, diagram: "empty",
      tacticalPitchMode: "full-wide", tacticalElements: frames.at(-1).elements, tacticalFrames: frames,
      tacticalActiveFrameId: frames.at(-1).id, organization: oversized ? "x".repeat(245000) : "Keep all frames" };
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: { [date]: {
      id: "qa-session", date, title: "QA Training", selectedBlockId: block.id, blocks: [block] } } }));
    localStorage.setItem("football-schedule-v1", JSON.stringify({ selectedDate: date, events: [{ id: "qa", date, type: "training", title: "QA Training" }] }));
    localStorage.setItem("football-periodization-v2", JSON.stringify({ selectedDate: date, days: { [date]: { sessionType: "Training" } } }));
  }, { key, date, count, oversized });
  await page.goto(presentation ? "/?workspace=home" : "/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(() => document.querySelector("[data-dashboard-news-dismiss], [data-dashboard-modal-close]")?.click());
  if (presentation) {
    await page.locator('[data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]').click();
    await page.getByRole("button", { name: "Go to Block 1", exact: true }).click();
  } else await page.locator("[data-session-open-tacticalboard]").click();
  return { modal: page.locator(".session-tacticalboard-modal"), errors };
}

for (const width of [1470, 390]) {
  test(`24 frames and custom labels save, reload, undo and fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const { modal, errors } = await boot(page);
    const start = await raw(page);
    await modal.getByLabel("Go to frame", { exact: true }).selectOption("f-0");
    await expect(modal.getByRole("button", { name: "Frame 1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await modal.getByLabel("Go to frame", { exact: true }).selectOption("f-22");
    expect(await raw(page)).toBe(start);
    const barHeight = (await modal.locator(".session-tactical-playback").boundingBox()).height;
    await modal.getByRole("button", { name: "Next frame", exact: true }).click();
    await expect.poll(async () => (await read(page)).tacticalFrames.length).toBe(24);
    expect((await modal.locator(".session-tactical-playback").boundingBox()).height).toBeCloseTo(barHeight, 0);
    const active = modal.locator('.session-tactical-playback-frames [aria-pressed="true"]');
    await expect(active).toBeInViewport();
    await modal.getByRole("button", { name: "Next frame", exact: true }).click();
    await expect(page.getByText("Max 24 frames per board.", { exact: true })).toBeVisible();
    expect((await read(page)).tacticalFrames).toHaveLength(24);
    await modal.locator(marker).click();
    const size = await modal.locator(marker).boundingBox();
    const before = await read(page);
    const geometry = before.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })));
    const label = modal.getByRole("textbox", { name: "Player label", exact: true });
    for (const value of ["1", "12", "CB", "RW", "CF", "LCB"]) {
      await label.fill(value);
      await label.press("Enter");
      await expect(modal.locator(`${marker} .session-tactical-player-badge`)).toHaveText(value);
      expect((await read(page)).tacticalFrames.every((frame) => frame.elements[0].playerNumber === value)).toBe(true);
    }
    const unchanged = await raw(page);
    await label.press("Enter");
    await label.press("Tab");
    expect(await raw(page)).toBe(unchanged);
    const state = await read(page);
    expect(state.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })))).toEqual(geometry);
    expect(state.tacticalFrames.every((frame) => frame.elements[1].playerNumber === "RW")).toBe(true);
    expect((await modal.locator(marker).boundingBox()).width).toBeCloseTo(size.width, 1);
    expect(await modal.locator(`${marker} .session-tactical-player-badge`).evaluate((badge) => {
      const range = document.createRange(); range.selectNodeContents(badge);
      return range.getBoundingClientRect().width <= badge.parentElement.getBoundingClientRect().width;
    })).toBe(true);
    await label.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`label-inspector-${width}.png`) });
    await modal.locator(marker).focus();
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    expect((await read(page)).tacticalElements.filter((element) => element.playerNumber === "LCB")).toHaveLength(2);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await read(page)).tacticalElements.filter((element) => element.playerNumber === "LCB")).toHaveLength(1);
    const saved = await read(page);
    await page.screenshot({ path: testInfo.outputPath(`frames-labels-${width}.png`) });
    await page.reload();
    await page.waitForFunction(() => window.__footballScienceAppReady);
    expect((await read(page)).tacticalFrames).toEqual(saved.tacticalFrames);
    await page.locator("[data-session-save-exercise]").click();
    const library = await page.evaluate(() => JSON.parse(localStorage.getItem("football-session-exercise-library-v1") || "[]")
      .find((exercise) => exercise.title === "Long sequence"));
    expect(library.tacticalFrames).toEqual(saved.tacticalFrames);
    await page.reload();
    await page.waitForFunction(() => window.__footballScienceAppReady);
    const idle = await raw(page);
    await page.locator("[data-session-preview-visual]").click();
    const view = page.locator("[data-session-readonly-playback]");
    await expect(view.locator(marker)).toHaveCSS("left", /.+/);
    expect(await view.locator(marker).evaluate((node) => node.style.left)).toBe("16%");
    await expect(view.locator(`${marker} .session-tactical-player-badge`)).toHaveText("LCB");
    await view.getByRole("button", { name: "Play", exact: true }).click();
    await view.getByRole("slider", { name: "Animation position" }).fill("1");
    await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 24 / 24");
    await view.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 1 / 24");
    await page.locator("[data-session-close-visual-preview]").click();
    await page.locator("[data-session-open-print]").click();
    expect(await page.locator(`.session-print-document ${marker}`).evaluate((node) => node.style.left)).toBe("16%");
    await expect(page.locator(`.session-print-document ${marker} .session-tactical-player-badge`)).toHaveText("LCB");
    expect(await raw(page)).toBe(idle);
    expect(errors).toEqual([]);
  });
}

test("oversized frame creation is refused without writes or removing existing frames", async ({ page }) => {
  const { modal } = await boot(page, { count: 2, oversized: true });
  const before = await raw(page);
  await modal.getByRole("button", { name: "Next frame", exact: true }).click();
  await expect(page.getByText("This exercise is too large to add another frame safely. Your existing frames are unchanged.", { exact: true })).toBeVisible();
  expect(await raw(page)).toBe(before);
  await expect(modal.locator(".session-tacticalboard-frame")).toHaveCount(2);
});

test("existing longer sequences and positions are preserved in readonly Presentation playback", async ({ page }) => {
  const { errors } = await boot(page, { count: 30, presentation: true });
  const before = await raw(page);
  const view = page.locator("[data-session-readonly-playback]");
  expect((await read(page)).tacticalFrames).toHaveLength(30);
  expect(await view.locator(marker).evaluate((node) => node.style.left)).toBe("16%");
  await expect(view.locator(`${marker} .session-tactical-player-badge`)).toHaveText("LCB");
  await view.getByRole("button", { name: "Play", exact: true }).click();
  await view.getByRole("slider", { name: "Animation position" }).fill("1");
  await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 30 / 30");
  await expect(view.locator(`.session-tactical-playback-surface ${marker} .session-tactical-player-badge`)).toHaveText("LCB");
  expect(await raw(page)).toBe(before);
  expect(errors).toEqual([]);
});
