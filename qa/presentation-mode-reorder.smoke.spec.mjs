import { expect, test } from "@playwright/test";

async function openHarness(page, meetingType) {
  await page.route("**/presentation-drag-harness", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/presentation-mode.css"></head><body></body></html>',
  }));
  await page.goto("/presentation-drag-harness");
  await page.evaluate(async (type) => {
    const { createPresentationModeController, createPresentationModeRenderer, dashboardPresentationStorageKey } =
      await import("/src/modules/presentation-mode/index.mjs");
    const date = "2026-09-23";
    const deck = { infoSlides: Array.from({ length: 40 }, (_, i) => ({
      id: `note-${i}`, title: `Slide ${i + 1}`, body: `Content ${i + 1}`, layout: "text",
    })) };
    const store = type === "technical" ? { meetingDecks: { technical: { [date]: deck } } } : { decks: { [date]: deck } };
    localStorage.setItem(dashboardPresentationStorageKey, JSON.stringify(store));
    const stats = { sessionReads: 0, renders: 0, writes: 0 };
    const renderer = createPresentationModeRenderer();
    const render = renderer.render;
    renderer.render = (model) => { stats.renders++; return render(model); };
    const controller = createPresentationModeController({
      documentRef: document, win: window, renderer,
      getTodayValue: () => date,
      getSessionForDate: () => { stats.sessionReads++; return { blocks: [] }; },
      getBirthdayCalendar: () => ({ items: [{ id: "birthday", name: "Birthday Player", nextBirthday: date, daysUntil: 0, turningAge: 25 }] }),
      readJson: (key, fallback) => JSON.parse(localStorage.getItem(key) || "null") || fallback,
      writeJson: (key, value) => { stats.writes++; localStorage.setItem(key, JSON.stringify(value)); },
    });
    controller.bindInteractions();
    controller.open(date, type);
    window.dragHarness = { controller, stats, date, type };
  }, meetingType);
  await expect(page.locator("[data-presentation-mode-shell]")).toBeVisible();
}

async function dragSlide(page, { from = "Slide 1", to = "Slide 3", side = "after", cancel = false, refresh = false } = {}) {
  return page.evaluate(({ from, to, side, cancel, refresh }) => {
    const { controller, stats } = window.dragHarness;
    const tabs = () => [...document.querySelectorAll("[data-presentation-slide-tab]")];
    const find = (name) => tabs().find((tab) => tab.querySelector("strong").textContent === name);
    const source = find(from);
    const target = find(to);
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const stage = document.querySelector("[data-presentation-stage]");
    const activeSlide = stage.firstElementChild;
    const before = { ...stats };
    const dt = new DataTransfer();
    const start = performance.now();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    const startReads = stats.sessionReads - before.sessionReads;
    const rect = target.getBoundingClientRect();
    const clientX = side === "after" ? rect.right - 2 : rect.left + 2;
    for (let i = 0; i < 120; i++) {
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX }));
    }
    const dragReads = stats.sessionReads - before.sessionReads;
    if (refresh) controller.render();
    const retainedDuringDrag = stage === document.querySelector("[data-presentation-stage]");
    target.dispatchEvent(new DragEvent(cancel ? "dragend" : "drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX }));
    const elapsed = performance.now() - start;
    return {
      startReads, dragReads, retainedDuringDrag,
      elapsed,
      totalReads: stats.sessionReads - before.sessionReads,
      renders: stats.renders - before.renders,
      writes: stats.writes - before.writes,
      retainedSlide: activeSlide === document.querySelector("[data-presentation-stage]")?.firstElementChild,
      labels: tabs().map((tab) => tab.querySelector("strong").textContent),
      active: tabs().find((tab) => tab.classList.contains("is-active"))?.querySelector("strong").textContent,
      indicators: document.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after, .is-reordering").length,
    };
  }, { from, to, side, cancel, refresh });
}

for (const type of ["team", "technical"]) {
  test(`${type}: slide drag avoids model work and preserves the active canvas, saved order and undo`, async ({ page }) => {
    await openHarness(page, type);
    await page.getByRole("button", { name: "Go to Slide 1", exact: true }).click();
    const moved = await dragSlide(page);
    console.log(`${type} reorder: ${moved.elapsed.toFixed(1)}ms, ${moved.totalReads} session reads, ${moved.renders} full renders`);
    expect(moved.startReads).toBe(0);
    expect(moved.dragReads).toBe(0);
    expect(moved.totalReads).toBe(2);
    expect(moved.renders).toBe(0);
    expect(moved.writes).toBe(1);
    expect(moved.retainedSlide).toBe(true);
    expect(moved.active).toBe("Slide 1");
    expect(moved.labels.indexOf("Slide 1")).toBe(moved.labels.indexOf("Slide 3") + 1);
    expect(moved.indicators).toBe(0);
    await page.keyboard.press("Control+z");
    let labels = await page.locator("[data-presentation-slide-tab] strong").allTextContents();
    expect(labels.indexOf("Slide 1")).toBeLessThan(labels.indexOf("Slide 2"));
    await page.keyboard.press("Control+Shift+z");
    await page.evaluate(() => {
      const { controller, date, type } = window.dragHarness;
      controller.close(); controller.open(date, type);
    });
    labels = await page.locator("[data-presentation-slide-tab] strong").allTextContents();
    expect(labels.indexOf("Slide 1")).toBe(labels.indexOf("Slide 3") + 1);
    if (type === "team") expect(labels.indexOf("Birthday")).toBe(labels.indexOf("Cover") + 1);
  });
}

test("cancelled and no-op drags do not save; background refresh cannot replace a tab mid-drag", async ({ page }) => {
  await openHarness(page, "team");
  const noop = await dragSlide(page, { from: "Slide 1", to: "Slide 2", side: "before" });
  expect(noop.writes).toBe(0);
  expect(noop.totalReads).toBe(0);
  expect(noop.indicators).toBe(0);
  const cancelled = await dragSlide(page, { cancel: true, refresh: true });
  expect(cancelled.retainedDuringDrag).toBe(true);
  expect(cancelled.writes).toBe(0);
  expect(cancelled.indicators).toBe(0);
  await expect.poll(() => page.evaluate(() => window.dragHarness.stats.renders)).toBeGreaterThan(1);
});

test("native mouse drag keeps the insertion marker, scroll position and pinned birthday slide", async ({ page }, testInfo) => {
  await openHarness(page, "team");
  const nav = page.locator(".presentation-slide-tabs");
  const source = page.getByRole("button", { name: "Go to Slide 18", exact: true });
  const target = page.getByRole("button", { name: "Go to Slide 19", exact: true });
  await source.click();
  await source.evaluate((tab) => tab.scrollIntoView({ block: "nearest", inline: "center" }));
  const scrollLeft = await nav.evaluate((element) => element.scrollLeft);
  expect(scrollLeft).toBeGreaterThan(0);
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width - 4, to.y + to.height / 2, { steps: 6 });
  await expect(target).toHaveClass(/is-drop-after/);
  await page.screenshot({ path: testInfo.outputPath("drag-indicator.png") });
  await page.mouse.up();
  await expect(page.locator(".is-dragging, .is-drop-after, .is-reordering")).toHaveCount(0);
  expect(await nav.evaluate((element) => element.scrollLeft)).toBe(scrollLeft);
  const labels = await nav.locator("strong").allTextContents();
  expect(labels.indexOf("Slide 18")).toBe(labels.indexOf("Slide 19") + 1);
  await page.screenshot({ path: testInfo.outputPath("after-reorder.png") });
  const movedCover = await dragSlide(page, { from: "Cover", to: "Slide 2" });
  expect(movedCover.labels.indexOf("Birthday")).toBe(movedCover.labels.indexOf("Cover") + 1);
  expect(movedCover.active).toBe("Slide 18");
  const readOnly = await dragSlide(page, { from: "Birthday", to: "Slide 3" });
  expect(readOnly.writes).toBe(0);
});
