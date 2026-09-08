import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const date = "2026-09-08";
const marker = '[data-session-tactical-element-id="marker-1"]';
const photo = "https://images.example.test/alice.png";
const players = [
  { id: "qa-alice", name: "Alice Smith", number: "9", position: "Forward", photoUrl: photo, rosterType: "squad", countsInSquad: true },
  { id: "qa-anna", name: "Anna Smith", number: "8", position: "Midfielder", rosterType: "squad", countsInSquad: true },
];
const elements = [{ id: "marker-1", type: "blue-player", x: 20, y: 40, playerNumber: "9" },
  { id: "ball", type: "ball", x: 30, y: 50 },
  { id: "generic", type: "red-player", x: 60, y: 40, playerNumber: "4" }];
async function boot(page, { brokenPhoto = false, presentation = false, linked = false } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(photo, (route) => brokenPhoto ? route.fulfill({ status: 404, body: "missing" }) : route.fulfill({
    contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=", "base64"),
  }));
  await page.addInitScript(({ key, date, players, elements, linked }) => {
    if (localStorage.getItem(key)) return;
    if (linked) Object.assign(elements[0], { playerIdentity: { squadPlayerId: "qa-alice", name: "Alice Smith", initials: "ASM", number: "9", photoUrl: players[0].photoUrl }, playerDisplay: "photo" });
    const block = { id: "qa-roster", label: "Block 1", title: "Roster sequence", minutes: 15,
      diagram: "empty", tacticalPitchMode: "full-wide", tacticalElements: elements, tacticalActiveFrameId: "first",
      tacticalFrames: [{ id: "first", elements }, { id: "second", elements: elements.map((item) => ({ ...item, x: item.x + 20 })) }] };
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: { [date]: {
      id: "qa-session", date, title: "QA Training", selectedBlockId: block.id, blocks: [block] } } }));
    localStorage.setItem("football-player-profiles-v1", JSON.stringify({ schemaVersion: 3, players }));
    localStorage.setItem("football-schedule-v1", JSON.stringify({ selectedDate: date, events: [{ id: "qa", date, type: "training", title: "QA Training" }] }));
    localStorage.setItem("football-periodization-v2", JSON.stringify({ selectedDate: date, days: { [date]: { sessionType: "Training" } } }));
  }, { key, date, players, elements, linked });
  await page.goto(presentation ? "/?workspace=home" : "/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(() => document.querySelector("[data-dashboard-news-dismiss], [data-dashboard-modal-close]")?.click());
  if (presentation) {
    await page.locator('[data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]').click();
    await page.getByRole("button", { name: "Go to Block 1", exact: true }).click();
  } else {
    await page.locator("[data-session-open-tacticalboard]").click();
  }
  return { modal: page.locator(".session-tacticalboard-modal"), errors };
}
const saved = (page) => page.evaluate(({ key, date }) => JSON.parse(localStorage.getItem(key)).sessions[date].blocks[0], { key, date });
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), key);
const mode = (modal, name) => modal.getByRole("radio", { name, exact: true }).check();

test("assign a Squad player, change display, copy, undo and reload without changing frame positions", async ({ page }) => {
  const { modal, errors } = await boot(page);
  const initial = await raw(page);
  await modal.locator(marker).click();
  const size = await modal.locator(marker).boundingBox();
  await modal.getByRole("searchbox", { name: "Find squad player" }).fill("Alice");
  expect(await raw(page)).toBe(initial);
  await modal.getByLabel("Squad player", { exact: true }).selectOption("qa-alice");
  const state = await saved(page);
  expect(state.tacticalFrames.map((frame) => frame.elements[0].x)).toEqual([20, 40]);
  const initials = state.tacticalElements[0].playerIdentity.initials;
  await expect(modal.locator(`${marker} .session-tactical-player-badge`)).toHaveText(initials);
  expect(initials.length).toBeGreaterThan(2);
  expect(await modal.locator(`${marker} .session-tactical-player-badge`).evaluate((badge) => {
    const range = document.createRange();
    range.selectNodeContents(badge);
    return range.getBoundingClientRect().width <= badge.parentElement.getBoundingClientRect().width;
  })).toBe(true);
  await mode(modal, "Photo");
  await expect(modal.locator(`${marker} img`)).toBeVisible();
  await expect.poll(() => modal.locator(`${marker} img`).evaluate((img) => img.naturalWidth)).toBe(1);
  expect((await modal.locator(marker).boundingBox()).width).toBeCloseTo(size.width, 1);
  await mode(modal, "Label");
  await expect(modal.locator(`${marker} .session-tactical-player-badge`)).toHaveText("9");
  await modal.locator(marker).focus();
  await page.keyboard.press("W");
  await expect(modal.locator(`${marker} .session-tactical-player-badge`)).toHaveText("W");
  expect((await saved(page)).tacticalFrames[1].elements[0].playerNumber).toBe("W");
  await mode(modal, "Initials");
  await modal.locator(marker).focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  expect((await saved(page)).tacticalElements.filter((item) => item.playerIdentity)).toHaveLength(2);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await saved(page)).tacticalElements.filter((item) => item.playerIdentity)).toHaveLength(1);
  await modal.locator('[data-session-tactical-frame="second"]').click();
  await modal.locator(marker).click();
  await expect(modal.locator(marker)).toHaveAttribute("title", "Alice Smith");
  await page.reload();
  await page.waitForFunction(() => window.__footballScienceAppReady);
  await page.locator("[data-session-open-tacticalboard]").click();
  await expect(modal.locator(marker)).toHaveAttribute("title", "Alice Smith");
  expect((await saved(page)).tacticalElements[0].playerIdentity.name).toBe("Alice Smith");
  await modal.locator(marker).click();
  await modal.getByLabel("Squad player", { exact: true }).selectOption("");
  expect((await saved(page)).tacticalFrames.every((frame) => !frame.elements[0].playerIdentity)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [1470, 390]) {
  test(`roster markers fit at ${width}px and inherit existing marker scale in preview and print`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const { modal, errors } = await boot(page, { linked: true });
    await modal.locator(marker).click();
    const panel = modal.locator("[data-session-tactical-roster-panel]");
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width + 1);
    const assertMarkerSize = async (parent) => {
      const actual = await parent.locator(marker).boundingBox();
      const generic = await parent.locator('[data-session-tactical-element-id="generic"]').boundingBox();
      expect(actual.width).toBeCloseTo(generic.width, 1);
      expect(actual.height).toBeCloseTo(generic.height, 1);
    };
    await assertMarkerSize(modal);
    await page.screenshot({ path: testInfo.outputPath(`roster-editor-${width}.png`) });
    await modal.locator("[data-session-close-tacticalboard]").click();
    const before = await raw(page);
    await page.locator("[data-session-preview-visual]").click();
    const view = page.locator("[data-session-readonly-playback]");
    await expect(view.locator(`${marker} img`)).toBeVisible();
    await expect.poll(() => view.locator(`${marker} img`).evaluate((img) => img.naturalWidth)).toBe(1);
    await assertMarkerSize(view);
    await view.getByRole("button", { name: "Play", exact: true }).click();
    await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 2 / 2");
    await expect(view.locator(`.session-tactical-playback-surface ${marker}`)).toHaveAttribute("title", "Alice Smith");
    await view.getByRole("button", { name: "Stop", exact: true }).click();
    await page.locator("[data-session-close-visual-preview]").click();
    await page.locator("[data-session-open-print]").click();
    await expect(page.locator(`.session-print-document ${marker} img`)).toBeVisible();
    await assertMarkerSize(page.locator(".session-print-document"));
    expect(await raw(page)).toBe(before);
    expect(errors).toEqual([]);
  });
}

test("Presentation photo failures fall back to initials without saving or edit controls", async ({ page }) => {
  const { errors } = await boot(page, { presentation: true, linked: true, brokenPhoto: true });
  const view = page.locator("[data-session-readonly-playback]");
  const before = await raw(page);
  await expect(view.locator(`${marker} img`)).toBeHidden();
  await expect(view.locator(`${marker} .session-tactical-player-badge`)).toHaveText("ASM");
  await expect(view.locator("[data-session-tactical-roster-panel]")).toHaveCount(0);
  await view.getByRole("button", { name: "Play", exact: true }).click();
  await expect(view.locator("[data-session-tactical-playback-status]")).toHaveText("Frame 2 / 2");
  await expect(view.locator(`.session-tactical-playback-surface ${marker} img`)).toBeHidden();
  expect(await raw(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("bulk display and saving to the exercise library preserve player identities", async ({ page }) => {
  const { modal, errors } = await boot(page, { linked: true });
  const generic = modal.locator('[data-session-tactical-element-id="generic"]');
  await generic.click();
  await modal.getByLabel("Squad player", { exact: true }).selectOption("qa-anna");
  await modal.locator(marker).click({ modifiers: ["ControlOrMeta"] });
  await expect(modal.locator("[data-session-tactical-roster-panel] legend")).toHaveText("Players (2)");
  await mode(modal, "Initials");
  const chosen = await saved(page);
  expect(chosen.tacticalFrames.every((frame) => frame.elements.filter((item) => item.playerIdentity)
    .every((item) => item.playerDisplay === "initials"))).toBe(true);
  await modal.locator("[data-session-close-tacticalboard]").click();
  await page.locator("[data-session-save-exercise]").click();
  const readLibrary = () => page.evaluate(() => JSON.parse(localStorage.getItem("football-session-exercise-library-v1") || "[]")
    .find((exercise) => exercise.title === "Roster sequence"));
  await expect.poll(readLibrary).toBeTruthy();
  const exercise = await readLibrary();
  expect(exercise.tacticalFrames.map((frame) => frame.elements.filter((item) => item.playerIdentity).map((item) => item.playerIdentity)))
    .toEqual(chosen.tacticalFrames.map((frame) => frame.elements.filter((item) => item.playerIdentity).map((item) => item.playerIdentity)));
  await page.reload();
  await page.waitForFunction(() => window.__footballScienceAppReady);
  expect((await readLibrary()).tacticalFrames).toEqual(exercise.tacticalFrames);
  expect(errors).toEqual([]);
});
