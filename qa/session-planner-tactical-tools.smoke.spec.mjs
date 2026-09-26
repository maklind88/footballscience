import { expect, test } from "@playwright/test";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";

const { normalizeTacticalFrames } = createSessionPlannerTacticalHelpers();

test("dark theme retains readable measurements, football panels and colour swatches", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1470, height: 767 });
  const { modal } = await boot(page);
  await expect(page.locator("body")).toHaveClass(/is-dark-mode/);
  await modal.locator('.session-tactical-shape-hit-target[data-session-tactical-element-id="circle"]').click();
  await expect(modal.locator(".session-tactical-measurement")).toHaveCSS("color", "rgb(24, 43, 32)");
  await expect(modal.locator(".session-tactical-measurement")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(modal.locator('[data-session-tactical-color-choice="#1d8bff"]')).toHaveCSS("background-color", "rgb(29, 139, 255)");
  await expect(modal.locator(".session-tactical-ball .session-football-panel")).toHaveCSS("fill", "rgb(29, 29, 31)");
  await expect(modal.locator(".session-tactical-edit-handle").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: testInfo.outputPath("tools-dark.png") });
});

const key = "football-session-planner-v3";
const date = "2026-09-25";
const readBlock = (page) => page.evaluate(({ key, date }) =>
  JSON.parse(localStorage.getItem(key)).sessions[date].blocks[0], { key, date });
const readRaw = (page) => page.evaluate((key) => localStorage.getItem(key), key);

async function boot(page, pitchMode = "full") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ key, date, pitchMode }) => {
    if (localStorage.getItem(key)) return;
    const elements = [
      { id: "goal", type: "mini-goal", x: 30, y: 70, rotation: 0 },
      { id: "circle", type: "ellipse", x: 50, y: 65, x2: 70, y2: 85, color: "#22c55e" },
      { id: "ball", type: "ball", x: 45, y: 70 },
      { id: "player", type: "blue-player", x: 40, y: 70, playerNumber: "9" },
    ];
    const block = { id: "tools", title: "Tactical tools QA", label: "Block 1", minutes: 15, diagram: "empty",
      tacticalPitchMode: pitchMode, tacticalElements: elements, tacticalActiveFrameId: "f1",
      tacticalFrames: [{ id: "f1", label: "Frame 1", elements },
        { id: "f2", label: "Frame 2", elements: elements.map((el) => ({ ...el, x: el.x + 2 })) }] };
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: {
      [date]: { id: "session-tools", date, title: "QA Training", selectedBlockId: block.id, blocks: [block] },
    } }));
  }, { key, date, pitchMode });
  await page.goto("/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.locator("[data-session-open-tacticalboard]").click();
  const modal = page.getByRole("dialog", { name: "Tacticalboard", exact: true });
  await expect(modal).toBeVisible();
  return { modal, errors };
}

async function stableHover(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  const before = await locator.boundingBox();
  await locator.hover();
  const after = await locator.boundingBox();
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  return after;
}

for (const mode of ["full", "full-wide", "attacking-half", "defending-half", "goalkeeper"]) {
  test(`rotation and resizing stay under the pointer on ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1470, height: 767 });
    const { modal, errors } = await boot(page, mode);
    await expect(modal.getByRole("slider", { name: "Width", exact: true })).toHaveValue("0.25");
    const before = await readRaw(page);
    const untouched = (await readBlock(page)).tacticalFrames[1];
    const goal = modal.locator('.session-tactical-mini-goal[data-session-tactical-element-id="goal"]');
    await goal.click();
    const rotate = modal.getByRole("button", { name: "Rotate Goal", exact: true });
    const handle = await stableHover(page, rotate);
    expect(await readRaw(page)).toBe(before);
    const center = await goal.boundingBox();
    const canvas = modal.locator("[data-session-tactical-canvas]");
    const pitchBefore = await canvas.boundingBox();
    const cx = center.x + center.width / 2;
    const cy = center.y + center.height / 2;
    const sx = handle.x + handle.width / 2 + 3;
    const sy = handle.y + handle.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx, sy);
    await page.mouse.up();
    expect(await readRaw(page)).toBe(before);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // Rotate the actual off-centre grip by 90 degrees around the object.
    for (let i = 1; i <= 12; i++) {
      const angle = i * Math.PI / 24;
      await page.mouse.move(cx + (sx - cx) * Math.cos(angle) - (sy - cy) * Math.sin(angle),
        cy + (sx - cx) * Math.sin(angle) + (sy - cy) * Math.cos(angle));
    }
    await page.mouse.up();
    await expect.poll(async () => (await readBlock(page)).tacticalElements.find((el) => el.id === "goal").rotation).toBe(90);
    expect((await canvas.boundingBox()).y).toBeCloseTo(pitchBefore.y, 0);
    expect(normalizeTacticalFrames([(await readBlock(page)).tacticalFrames[1]])).toEqual(normalizeTacticalFrames([untouched]));
    await modal.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await readBlock(page)).tacticalElements.find((el) => el.id === "goal").rotation || 0).toBe(0);
    await modal.getByRole("button", { name: "Redo", exact: true }).click();
    await modal.locator('.session-tactical-shape-hit-target[data-session-tactical-element-id="circle"]').click();
    const end = modal.getByRole("button", { name: "Move Circle end point", exact: true });
    const endBounds = await stableHover(page, end);
    const pitch = await canvas.boundingBox();
    const initial = (await readBlock(page)).tacticalElements.find((el) => el.id === "circle");
    const start = { x: endBounds.x + endBounds.width / 2 - 3, y: endBounds.y + endBounds.height / 2 - 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 24, start.y - 20, { steps: 10 });
    await page.mouse.up();
    const changed = (await readBlock(page)).tacticalElements.find((el) => el.id === "circle");
    expect(changed.x2).toBeCloseTo(initial.x2 + 24 / pitch.width * 100, 1);
    expect(changed.y2).toBeCloseTo(initial.y2 - 20 / pitch.height * 100, 1);
    expect(changed.x).toBe(initial.x);
    expect(changed.y).toBe(initial.y);
    const label = modal.locator(".session-tactical-measurement");
    await expect(label).toContainText(/\d+.* m x \d+.* m/);
    await expect(label).toHaveCSS("color", "rgb(24, 43, 32)");
    await expect(label).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: testInfo.outputPath(`handles-${mode}.png`) });
    const saved = await readBlock(page);
    await page.reload();
    await page.waitForFunction(() => window.__footballScienceAppReady);
    expect((await readBlock(page)).tacticalFrames).toEqual(saved.tacticalFrames);
    expect(errors).toEqual([]);
  });
}

for (const width of [1470, 1170, 390]) {
  test(`tool labels are not clipped and ball artwork fits its marker at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 767 });
    const { modal, errors } = await boot(page);
    const tools = modal.locator("[data-session-tactical-tool]");
    await expect(tools).toHaveCount(23);
    for (const button of await tools.all()) {
      const layout = await button.evaluate((node) => {
        const label = node.querySelector(".session-tactical-tool-label");
        const range = document.createRange(); range.selectNodeContents(label);
        const text = range.getBoundingClientRect(); const box = node.getBoundingClientRect();
        return { fits: text.left >= box.left && text.right <= box.right + 1 && text.bottom <= box.bottom + 1,
          ellipsis: getComputedStyle(label).textOverflow };
      });
      expect(layout.fits).toBe(true);
      expect(layout.ellipsis).toBe("clip");
    }
    const ball = modal.locator('.session-tactical-marker[data-session-tactical-element-id="ball"]');
    const markerSize = await ball.boundingBox();
    const artSize = await ball.locator("svg").boundingBox();
    expect(artSize.width).toBeCloseTo(markerSize.width, 1);
    expect(artSize.height).toBeCloseTo(markerSize.height, 1);
    await page.screenshot({ path: testInfo.outputPath(`tools-${width}.png`) });
    await modal.getByRole("button", { name: "Close tacticalboard", exact: true }).click();
    await page.locator("[data-session-open-print]").click();
    await expect(page.locator(".session-print-document .session-tactical-ball svg")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
