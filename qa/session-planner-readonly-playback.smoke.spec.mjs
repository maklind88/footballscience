import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const player = '[data-session-tactical-element-id="player"]';
const widget = "[data-session-readonly-playback]";
const animated = ".session-tactical-playback-surface";
const localDate = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
};

async function boot(page, { presentation = false, pitchMode = "full-wide", frames = true, visualImage = "", blockCount = 2 } = {}) {
  const date = localDate();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const elements = [{ id: "player", type: "blue-player", x: 20, y: 40, playerNumber: "9" },
    { id: "ball", type: "ball", x: 25, y: 50 }];
  const second = elements.map((item) => ({ ...item, x: item.x + 20, y: item.y + 10 }));
  const block = { id: "qa-readonly", label: "Block 1", title: "Passing sequence", minutes: 15,
    objective: "Find the free player", organization: "Two groups", principles: "Scan before receiving",
    diagram: "empty", tacticalPitchMode: pitchMode, tacticalElements: second, visualImage,
    ...(frames ? { tacticalActiveFrameId: "second", tacticalFrames: [
      { id: "first", label: "Frame 1", elements }, { id: "second", label: "Frame 2", elements: second },
    ] } : {}) };
  await page.addInitScript(({ key, date, block, blockCount }) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: { [date]: {
      id: "qa-readonly-session", date, title: "QA Training", selectedBlockId: block.id,
      blocks: Array.from({ length: blockCount }, (_, index) => index === 0 ? block : {
        ...block, id: index === 1 ? "qa-second" : `qa-block-${index + 1}`,
        label: `Block ${index + 1}`, title: index === 1 ? "Second exercise" : `Exercise ${index + 1}`,
      }),
    } } }));
    localStorage.setItem("football-schedule-v1", JSON.stringify({ selectedDate: date,
      events: [{ id: "qa-training", date, type: "training", time: "10:30", title: "QA Training" }] }));
    localStorage.setItem("football-periodization-v2", JSON.stringify({ selectedDate: date,
      days: { [date]: { sessionType: "Training", matchDay: "Match Day -1" } } }));
  }, { key, date, block, blockCount });
  await page.goto(presentation ? "/?workspace=home" : "/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(() => document.querySelector("[data-dashboard-news-dismiss], [data-dashboard-modal-close]")?.click());
  if (presentation) {
    await page.locator('[data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]').click();
    await page.getByRole("button", { name: "Go to Block 1", exact: true }).click();
  } else {
    await page.locator("[data-session-preview-visual]").click();
  }
  const view = page.locator(widget);
  await expect(view).toBeVisible();
  await expect.poll(async () => (await view.locator(".session-readonly-source .session-visual-board").boundingBox())?.width || 0).toBeGreaterThan(50);
  await page.evaluate(() => {
    window.qaPlaybackWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (["football-session-planner-v3", "football-dashboard-presentation-mode-v1"].includes(key)) window.qaPlaybackWrites.push(key);
      return setItem.call(this, key, value);
    };
  });
  return { view, errors };
}

async function storage(page) { return page.evaluate((key) => localStorage.getItem(key), key); }
async function seek(view, value) {
  await view.locator("[data-session-tactical-playhead]").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function position(marker) {
  return marker.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const pitch = element.parentElement.getBoundingClientRect();
    return { x: 100 * (box.x + box.width / 2 - pitch.x) / pitch.width,
      y: 100 * (box.y + box.height / 2 - pitch.y) / pitch.height };
  });
}
async function assertFirst(view) {
  expect((await position(view.locator(`.session-readonly-source ${player}`))).x).toBeCloseTo(20, 1);
  await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 1 / 2");
}
async function assertFit(view, viewport) {
  const bounds = await view.locator(".session-readonly-viewport").boundingBox();
  const board = await view.locator(".session-readonly-source .session-visual-board").boundingBox();
  expect(board.width).toBeGreaterThan(50);
  expect(board.height).toBeGreaterThan(50);
  expect(board.x).toBeGreaterThanOrEqual(bounds.x - 1);
  expect(board.y).toBeGreaterThanOrEqual(bounds.y - 1);
  expect(board.x + board.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  expect(board.y + board.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
  for (const control of await view.locator(".session-readonly-controls button, .session-readonly-controls input, .session-readonly-controls select").all()) {
    const box = await control.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

test("Preview starts on frame one, plays without editing, and resets on reopening", async ({ page }) => {
  const { view, errors } = await boot(page);
  const before = await storage(page);
  await assertFirst(view);
  await expect(view.locator(".session-readonly-source")).toHaveAttribute("inert", "");
  await expect(view.locator("[data-session-add-tactical-frame], [data-session-delete-tactical-frame], [data-session-tactical-canvas]")).toHaveCount(0);
  const still = await view.locator(`.session-readonly-source ${player}`).boundingBox();
  await seek(view, 0);
  const first = await view.locator(`${animated} ${player}`).boundingBox();
  expect(first.x).toBeCloseTo(still.x, 1);
  expect(first.y).toBeCloseTo(still.y, 1);
  expect(first.width).toBeCloseTo(still.width, 1);
  await seek(view, 0.5);
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(30, 1);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await view.getByRole("button", { name: "Loop playback" }).click();
  await view.getByLabel("Playback speed").selectOption("2");
  await view.getByRole("button", { name: "Play", exact: true }).click();
  for (const label of ["Frame 2 / 2", "Frame 1 / 2"]) {
    await page.waitForFunction((label) => document.querySelector("[data-session-readonly-playback] output")?.textContent === label, label);
  }
  await view.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await position(view.locator(`${animated} ${player}`));
  await page.waitForTimeout(120);
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(paused.x, 1);
  await view.getByRole("button", { name: "Back to start" }).click();
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(20, 1);
  await view.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(view.locator(animated)).toHaveCount(0);
  await assertFirst(view);
  await page.locator("[data-session-close-visual-preview]").click();
  await page.locator("[data-session-preview-visual]").click();
  await assertFirst(view);
  expect(await storage(page)).toBe(before);
  expect(await page.evaluate(() => window.qaPlaybackWrites)).toEqual([]);
  expect(errors).toEqual([]);
});

test("overview and both coach sheet pages keep frame one after preview playback", async ({ page }, testInfo) => {
  const { view, errors } = await boot(page, { blockCount: 4 });
  const before = await storage(page);
  await seek(view, 1);
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(40, 1);
  await page.locator("[data-session-close-visual-preview]").click();
  const overview = page.locator(`.session-media-preview ${player}`);
  await expect(overview).toBeVisible();
  expect((await position(overview)).x).toBeCloseTo(20, 1);
  await page.locator("[data-session-open-print]").click();
  const pages = page.locator(".session-print-page");
  await expect(pages).toHaveCount(2);
  for (const paper of ["letter", "a4"]) {
    await page.locator("select[data-session-print-paper]").selectOption(paper);
    for (const sheet of await pages.all()) {
      const markers = sheet.locator(player);
      await expect(markers).toHaveCount(2);
      expect(await markers.evaluateAll((items) => items.map((item) => [item.style.left, item.style.top])))
        .toEqual([["20%", "40%"], ["20%", "40%"]]);
    }
  }
  await page.screenshot({ path: testInfo.outputPath("first-frame-coach-sheet.png") });
  await page.locator("[data-session-close-print]").click();
  await page.locator("[data-session-preview-visual]").click();
  await assertFirst(page.locator(widget));
  expect(await storage(page)).toBe(before);
  expect(await page.evaluate(() => window.qaPlaybackWrites)).toEqual([]);
  expect(errors).toEqual([]);
});

test("Preview retains paused playback through refresh but resets for changed source or block", async ({ page }) => {
  const { view } = await boot(page);
  const before = await storage(page);
  await seek(view, 0.5);
  await view.evaluate((node) => { node.dataset.retained = "yes"; });
  await view.getByLabel("Playback speed").focus();
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    runtime.renderSessionPlannerWorkspace();
  });
  await expect(view).toHaveAttribute("data-retained", "yes");
  await expect(view.getByLabel("Playback speed")).toBeFocused();
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(30, 1);
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    runtime.getSessionPlannerSelectedBlock().tacticalFrames[0].elements[0].x = 15;
    runtime.renderSessionPlannerWorkspace();
  });
  await expect(view.locator(animated)).toHaveCount(0);
  expect((await position(view.locator(`.session-readonly-source ${player}`))).x).toBeCloseTo(15, 1);
  expect(await storage(page)).toBe(before);
  await seek(view, 0.5);
  await page.evaluate(async () => {
    const runtime = await import("/src/modules/session-planner/session-planner-runtime-accessors.mjs");
    runtime.selectSessionPlannerBlock("qa-second");
  });
  await expect(view).toHaveCount(0);
  await page.locator("[data-session-preview-visual]").click();
  await assertFirst(view);
  expect(await storage(page)).toBe(before);
});

for (const viewport of [{ width: 1470, height: 649 }, { width: 390, height: 844 }]) {
  for (const presentation of [false, true]) {
    test(`${presentation ? "Presentation" : "Preview"} fits controls outside the pitch at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const { view, errors } = await boot(page, { presentation, pitchMode: "full" });
      await assertFirst(view);
      await assertFit(view, viewport);
      await seek(view, 0.5);
      const rect = await view.locator(`${animated} .session-visual-board`).boundingBox();
      expect(rect.width / rect.height).toBeCloseTo(65 / 105, 2);
      await page.screenshot({ path: testInfo.outputPath(`${presentation ? "presentation" : "preview"}-${viewport.width}.png`) });
      expect(errors).toEqual([]);
    });
  }
}

for (const pitchMode of ["full-wide", "attacking-half", "defending-half", "goalkeeper"]) {
  test(`Preview preserves geometry and marker scale for ${pitchMode}`, async ({ page }) => {
    const { view } = await boot(page, { pitchMode });
    const before = await view.locator(".session-readonly-source .session-visual-board-surface").boundingBox();
    await seek(view, 0.5);
    const after = await view.locator(`${animated} .session-visual-board-surface`).boundingBox();
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 3);
    expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(30, 1);
  });
}

test("single-frame legacy boards remain visible without inactive playback controls", async ({ page }) => {
  const { view, errors } = await boot(page, { frames: false });
  await expect(view.locator(".session-readonly-controls")).toHaveCount(0);
  expect((await position(view.locator(`.session-readonly-source ${player}`))).x).toBeCloseTo(40, 1);
  expect(errors).toEqual([]);
});

test("uploaded image geometry, reduced motion and reloading preserve the first saved frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const { view, errors } = await boot(page, { visualImage: image });
  const before = await storage(page);
  const box = await view.locator(".session-readonly-source .session-visual-board-surface").boundingBox();
  await expect(view.locator(".session-readonly-source img")).toHaveJSProperty("naturalWidth", 1);
  await seek(view, 0.5);
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(20, 1);
  const after = await view.locator(`${animated} .session-visual-board-surface`).boundingBox();
  expect(after.width).toBeCloseTo(box.width, 1);
  expect(after.height).toBeCloseTo(box.height, 1);
  await seek(view, 1);
  expect((await position(view.locator(`${animated} ${player}`))).x).toBeCloseTo(40, 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-session-preview-visual]").click();
  await assertFirst(view);
  expect(await storage(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("Presentation playback, native keyboard controls, fullscreen and navigation never write session data", async ({ page }) => {
  const { view, errors } = await boot(page, { presentation: true });
  const before = await storage(page);
  const presentation = page.locator("[data-presentation-mode-shell]");
  await assertFirst(view);
  await view.getByRole("button", { name: "Play", exact: true }).press("Space");
  await expect(view.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await view.getByRole("button", { name: "Pause", exact: true }).press("Space");
  await seek(view, 0.5);
  await view.getByLabel("Animation position").press("ArrowRight");
  await expect(presentation.locator(".presentation-block-copy")).toContainText("Passing sequence");
  await view.evaluate((node) => { node.dataset.retained = "yes"; });
  await presentation.locator("[data-presentation-start]").click();
  await expect(presentation).toHaveClass(/is-presenting/);
  await expect(view).toHaveAttribute("data-retained", "yes");
  await view.getByRole("button", { name: "Stop", exact: true }).click();
  await assertFirst(view);
  await view.locator(".session-readonly-viewport").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Space");
  await expect(view.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(presentation.locator(".presentation-block-copy")).toContainText("Second exercise");
  await expect(view.locator(animated)).toHaveCount(0);
  await assertFirst(view);
  await page.keyboard.press("ArrowLeft");
  await assertFirst(view);
  await page.keyboard.press("Escape");
  await presentation.locator("[data-presentation-close]").click();
  expect(await storage(page)).toBe(before);
  expect(await page.evaluate(() => window.qaPlaybackWrites)).toEqual([]);
  expect(errors).toEqual([]);
});
