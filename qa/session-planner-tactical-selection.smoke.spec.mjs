import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const date = "2026-11-02";
const readBlock = (page) => page.evaluate(({ key, date }) =>
  JSON.parse(localStorage.getItem(key)).sessions[date].blocks[0], { key, date });

async function boot(page) {
  await page.addInitScript(({ key, date }) => {
    if (localStorage.getItem(key)) return;
    const elements = [
      { id: "inside-1", type: "blue-player", x: 28, y: 26 },
      { id: "inside-2", type: "cone", x: 34, y: 32 },
      // The old selection code also selected these at invisible midpoint coordinates.
      { id: "outside-original", type: "red-player", x: 56, y: 52 },
      { id: "outside-old-copy", type: "blue-player", x: 64, y: 60, x2: 4, y2: 4, controlX: 4, controlY: 4 },
    ];
    const block = { id: "selection", title: "Selection regression QA", label: "Block 1", minutes: 10,
      diagram: "empty", tacticalPitchMode: "full", tacticalElements: elements, tacticalActiveFrameId: "f1",
      tacticalFrames: [{ id: "f1", label: "Frame 1", elements },
        { id: "f2", label: "Frame 2", elements: elements.map((el) => ({ ...el, x: el.x + 5 })) }] };
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: {
      [date]: { id: "session-selection", date, title: "QA", selectedBlockId: block.id, blocks: [block] },
    } }));
  }, { key, date });
  await page.goto("/?workspace=session-planner");
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.locator("[data-session-open-tacticalboard]").click();
  return page.getByRole("dialog", { name: "Tacticalboard", exact: true });
}

async function boxSelect(page, modal) {
  const canvas = await modal.locator("[data-session-tactical-canvas]").boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.20, canvas.y + canvas.height * 0.20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.38, canvas.y + canvas.height * 0.38, { steps: 8 });
  await page.mouse.up();
}

async function dragMarker(page, marker) {
  const bounds = await marker.boundingBox();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 25, y + 20, { steps: 8 });
  await page.mouse.up();
}

for (const width of [1470, 1170]) {
  test(`marquee and group drag ignore distant originals and copies at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const modal = await boot(page);
    const marker = (id) => modal.locator(`.session-tactical-marker[data-session-tactical-element-id="${id}"]`);
    const selectedIds = () => modal.locator(".session-tactical-marker.is-selected")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sessionTacticalElementId).sort());
    const initial = await readBlock(page);
    // A fresh marquee replaces a prior distant selection.
    await marker("outside-original").click();
    await boxSelect(page, modal);
    expect(await selectedIds()).toEqual(["inside-1", "inside-2"]);
    expect(await readBlock(page)).toEqual(initial);
    await dragMarker(page, marker("inside-1"));
    const moved = await readBlock(page);
    for (const id of ["outside-original", "outside-old-copy"]) {
      expect(moved.tacticalElements.find((el) => el.id === id)).toEqual(initial.tacticalElements.find((el) => el.id === id));
    }
    for (const id of ["inside-1", "inside-2"]) {
      expect(moved.tacticalElements.find((el) => el.id === id).x).toBeGreaterThan(initial.tacticalElements.find((el) => el.id === id).x);
    }
    expect(moved.tacticalFrames[1]).toEqual(initial.tacticalFrames[1]);
    await modal.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await readBlock(page)).tacticalElements).toEqual(initial.tacticalElements);
    await boxSelect(page, modal);
    await modal.getByRole("button", { name: "Copy selected", exact: true }).click();
    await modal.getByRole("button", { name: "Paste", exact: true }).click();
    const pasted = await readBlock(page);
    expect(pasted.tacticalElements).toHaveLength(6);
    const copies = pasted.tacticalElements.filter((el) => !initial.tacticalElements.some((source) => source.id === el.id));
    expect(new Set(pasted.tacticalElements.map((el) => el.id)).size).toBe(6);
    for (const copy of copies) {
      expect(copy.x2 ?? null).toBeNull();
      expect(copy.y2 ?? null).toBeNull();
    }
    await dragMarker(page, marker(copies[0].id));
    const copyMoved = await readBlock(page);
    for (const original of initial.tacticalElements) {
      expect(copyMoved.tacticalElements.find((el) => el.id === original.id)).toEqual(original);
    }
    expect(copyMoved.tacticalElements.find((el) => el.id === copies[1].id)).toEqual(copies[1]);
    await page.reload();
    await page.waitForFunction(() => window.__footballScienceAppReady);
    expect((await readBlock(page)).tacticalFrames).toEqual(copyMoved.tacticalFrames);
    expect(errors).toEqual([]);
  });
}
