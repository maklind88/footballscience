import { expect, test } from "@playwright/test";

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => Boolean(
      window.__footballScienceAppReady &&
      document.body?.dataset.appReady === "true" &&
      document.getElementById("hubShell") &&
      !document.getElementById("hubShell").hidden &&
      !document.body.classList.contains("is-booting")
    ),
    null,
    { timeout: 20_000 }
  );
}

async function openSetPiecesRoom(page) {
  const modal = page.locator("#dashboardIntroModal, .dashboard-intro-modal, [data-dashboard-intro-modal]").first();
  if (await modal.isVisible().catch(() => false)) {
    const dismiss = modal.getByRole("button", { name: /close|dismiss|skip|later|continue|got it/i }).first();
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else await page.keyboard.press("Escape");
  }
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "set-pieces-room" } }));
  });
  await expect(page.locator('[data-workspace-view="set-pieces-room"].is-active')).toBeVisible();
  await expect(page.locator("[data-set-pieces-room]")).toBeVisible();
}

test("Set Pieces editor gives the pitch the viewport and anchors compact playback controls", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 772 });
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [{ id: "player-alex", name: "Alex Example", position: "Forward" }],
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  const metrics = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const editor = rect(".spr-editor");
    const command = rect(".spr-editor-command-bar");
    const variants = rect(".spr-variant-bar");
    const toolbar = rect(".spr-editor-toolbar");
    const stage = rect(".spr-board-stage");
    const timeline = rect(".spr-timeline");
    const playback = rect(".spr-playback");
    return { editor, command, variants, toolbar, stage, timeline, playback };
  });

  expect(metrics.editor).toBeTruthy();
  expect(metrics.command.height).toBeLessThanOrEqual(48);
  expect(Math.abs(metrics.variants.top - metrics.toolbar.top)).toBeLessThanOrEqual(1);
  expect(metrics.timeline.height).toBeLessThanOrEqual(46);
  expect(metrics.stage.height).toBeGreaterThan(420);
  expect(metrics.stage.width).toBeGreaterThan(540);
  expect(Math.abs(metrics.playback.bottom - metrics.editor.bottom)).toBeLessThanOrEqual(1);

  for (const tool of ["Select", "Own player", "Opponent", "Ball", "Run", "Pass", "Dribble", "Block", "Press", "Track", "Zone"]) {
    const button = page.getByRole("button", { name: tool, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".spr-active-tool-copy strong")).toHaveText(tool);
  }

  const playIcon = page.getByRole("button", { name: "Play", exact: true }).locator("svg");
  await expect(playIcon).toBeVisible();
  const playIconBox = await playIcon.boundingBox();
  const playButtonBox = await page.getByRole("button", { name: "Play", exact: true }).boundingBox();
  expect(playIconBox).not.toBeNull();
  expect(playButtonBox).not.toBeNull();
  expect(Math.abs((playIconBox.x + playIconBox.width / 2) - (playButtonBox.x + playButtonBox.width / 2))).toBeLessThan(2);
  expect(Math.abs((playIconBox.y + playIconBox.height / 2) - (playButtonBox.y + playButtonBox.height / 2))).toBeLessThan(2);
});

test("Set Pieces Room builds, persists and plays a phased opponent response", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const isFreshTestRun = !window.sessionStorage.getItem("set-pieces-room-smoke-seeded");
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-alex", name: "Alex Example", position: "Forward" },
        { id: "player-beth", name: "Beth Miller", position: "Midfielder" },
      ],
    }));
    if (isFreshTestRun) {
      window.localStorage.removeItem("football-set-pieces-room-v1");
      window.sessionStorage.setItem("set-pieces-room-smoke-seeded", "true");
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);

  await expect(page.getByRole("heading", { name: "Set Pieces Room" })).toBeVisible();
  await expect(page.locator(".spr-header-team-mark")).toBeVisible();
  await expect(page.locator(".spr-header-team-name")).not.toHaveText("Football Science");
  const libraryTrigger = page.getByRole("button", { name: "Library" });
  const editSurface = page.locator(".spr-layout > main");
  const closedEditorWidth = await editSurface.evaluate((element) => element.getBoundingClientRect().width);
  await expect(page.locator(".spr-library-layer")).toBeHidden();
  await libraryTrigger.click();
  await expect(page.getByRole("complementary", { name: "Set piece library" })).toBeVisible();
  await expect(page.locator("[data-set-piece-search]")).toBeFocused();
  const openEditorWidth = await editSurface.evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(openEditorWidth - closedEditorWidth)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".spr-library-layer")).toBeHidden();
  await expect(libraryTrigger).toBeFocused();
  await page.getByRole("button", { name: "Create set piece" }).click();
  await expect(page.locator("[data-set-piece-pitch]")).toBeVisible();

  const pitch = page.locator("[data-set-piece-pitch]");
  let box = await pitch.boundingBox();
  expect(box).not.toBeNull();

  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitem", { name: "Add Alex Example" }).click();
  await page.getByRole("button", { name: "Opponent" }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
  const opponentNumber = page.getByRole("spinbutton", { name: "Number" });
  await opponentNumber.fill("12");
  await opponentNumber.press("Tab");
  const showOpponentNumber = page.getByRole("checkbox", { name: "Show number on board" });
  await showOpponentNumber.uncheck();
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveCount(0);
  await showOpponentNumber.check();
  box = await pitch.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("button", { name: "Ball", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.48);

  await expect(page.locator(".spr-board-element.is-home-player text")).toHaveText("AE");
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-body-direction")).toHaveCount(0);
  await expect(page.locator(".spr-board-element.is-ball")).toHaveCount(1);

  const initialHomeMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const keyboardStartTransform = await initialHomeMarker.getAttribute("transform");
  await initialHomeMarker.press("ArrowRight");
  await expect(initialHomeMarker).not.toHaveAttribute("transform", keyboardStartTransform);
  const initialHomeBox = await initialHomeMarker.boundingBox();
  expect(initialHomeBox).not.toBeNull();
  await page.getByRole("button", { name: "Run" }).click();
  await page.mouse.move(initialHomeBox.x + initialHomeBox.width / 2, initialHomeBox.y + initialHomeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.25, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".spr-drawing.is-run")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Linked actor" })).toHaveValue(/.+/);

  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(2);
  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitem", { name: "Add Beth Miller" }).click();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(2);
  await page.locator("[data-set-piece-phase-id]").first().click();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(2);
  await page.locator("[data-set-piece-phase-id]").nth(1).click();
  const homeMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)").first();
  const markerBox = await homeMarker.boundingBox();
  expect(markerBox).not.toBeNull();
  const startCenter = { x: markerBox.x + markerBox.width / 2, y: markerBox.y + markerBox.height / 2 };
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 110, markerBox.y + markerBox.height / 2 + 45, { steps: 10 });
  await page.mouse.up();
  const movedMarkerBox = await homeMarker.boundingBox();
  expect(movedMarkerBox).not.toBeNull();
  expect(movedMarkerBox.x + movedMarkerBox.width / 2).toBeGreaterThan(startCenter.x + 80);
  expect(movedMarkerBox.y + movedMarkerBox.height / 2).toBeGreaterThan(startCenter.y + 25);
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.12);
  await homeMarker.click({ position: { x: movedMarkerBox.width - 2, y: movedMarkerBox.height / 2 } });
  await expect(page.locator(".spr-inspector-title").filter({ hasText: "Selected role" })).toBeVisible();
  const movedTransform = await homeMarker.getAttribute("transform");

  await page.locator("[data-set-piece-phase-id]").first().click();
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  await scrubber.fill("0.5");
  await expect(scrubber).toHaveValue("0.5");
  await page.getByRole("button", { name: "Back to phase 1" }).click();
  const loopButton = page.getByRole("button", { name: "Loop playback" });
  await loopButton.click();
  await expect(loopButton).toHaveAttribute("aria-pressed", "true");
  await loopButton.click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(350);
  await expect(page.locator(".spr-drawing.is-playing")).toHaveCount(1);
  await expect(page.locator("[data-set-piece-playback-primary]")).toContainText("Phase 1 → 2");
  await expect(page.locator("[data-set-piece-playback-secondary]")).toContainText("/");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedTransform = await page.locator(".spr-board-element.is-home-player:not(.is-ghost)").first().getAttribute("transform");
  await page.waitForTimeout(250);
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)").first()).toHaveAttribute("transform", pausedTransform);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".spr-phase-counter")).toContainText("Phase 2", { timeout: 5_000 });
  await expect(page.locator(".spr-phase-counter")).toContainText("of 2");

  await page.getByRole("button", { name: "Create variant" }).click();
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);

  await page.getByRole("button", { name: "Present", exact: true }).click();
  const setPieces = page.locator("[data-set-pieces-room]");
  await expect(setPieces).toHaveClass(/is-presenting/);
  await expect(setPieces.locator(".spr-present-workspace")).toBeVisible();
  await expect(setPieces.locator(".spr-present-cues")).toBeVisible();
  await expect(setPieces.locator(".spr-present-phase-strip")).toBeVisible();
  await expect(setPieces.locator(".spr-playback")).toBeVisible();
  const presentationVariant = setPieces.getByRole("combobox", { name: "Presentation variant" });
  await expect(presentationVariant.locator("option")).toHaveCount(2);
  const primaryVariantId = await presentationVariant.locator("option").first().getAttribute("value");
  await presentationVariant.selectOption({ label: "Primary" });
  await expect(presentationVariant).toHaveValue(primaryVariantId);
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await expect(setPieces.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();
  }
  await expect(setPieces.locator(".spr-board-element.is-ghost")).toHaveCount(0);
  const presentPitchSize = await setPieces.locator("[data-set-piece-pitch]").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(presentPitchSize.width).toBeGreaterThan(presentPitchSize.height);
  await page.keyboard.press("Home");
  await expect(setPieces.locator(".spr-present-phase-card").first()).toHaveClass(/is-active/);
  await page.keyboard.press("ArrowRight");
  await expect(setPieces.locator(".spr-present-phase-card").nth(1)).toHaveClass(/is-active/);

  await setPieces.getByRole("button", { name: /Team Meeting/ }).click();
  const presentation = page.locator("#presentationModeRoot");
  await expect(presentation).toBeVisible();
  await expect(presentation.locator(".presentation-slide-set-piece")).toBeVisible();
  await expect(presentation.locator(".presentation-set-piece-board [data-set-piece-pitch]")).toBeVisible();
  await expect(presentation.locator("[data-presentation-set-piece-play]")).toBeVisible();
  await presentation.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(250);
  await expect(presentation.locator(".spr-drawing.is-playing")).toHaveCount(1);
  await presentation.getByRole("button", { name: "Pause", exact: true }).click();
  await presentation.getByRole("button", { name: "Close presentation" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-set-pieces-room]")).toHaveClass(/is-editing/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)").first()).toHaveAttribute("transform", movedTransform);
  expect(pageErrors).toEqual([]);
});

test("Set Pieces Room reassigns stable tactical roles across routines and variants", async ({ page }) => {
  await page.addInitScript(() => {
    const isFreshTestRun = !window.sessionStorage.getItem("set-pieces-assignment-smoke-seeded");
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-alex", name: "Alex Example", position: "Forward" },
        { id: "player-beth", name: "Beth Miller", position: "Midfielder" },
        { id: "player-casey", name: "Casey Evans", position: "Defender" },
      ],
    }));
    if (isFreshTestRun) {
      window.localStorage.removeItem("football-set-pieces-room-v1");
      window.sessionStorage.setItem("set-pieces-assignment-smoke-seeded", "true");
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  const addPlayer = async (name) => {
    await page.locator("[data-set-piece-player-picker] summary").click();
    await page.getByRole("menuitem", { name: `Add ${name}` }).click();
  };
  await addPlayer("Alex Example");
  await addPlayer("Beth Miller");

  const alexMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)").filter({ hasText: "AE" });
  const alexSlotId = await alexMarker.getAttribute("data-element-id");
  expect(alexSlotId).toBeTruthy();
  await alexMarker.click();
  await expect(page.locator(".spr-assignment-picker[open]")).toBeVisible();
  const roleField = page.getByRole("textbox", { name: "Tactical role" });
  await roleField.fill("Near post");
  await roleField.press("Tab");
  await page.getByRole("menuitem", { name: "Assign Beth Miller to Near post" }).click();

  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("BM");
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost) text")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost) text")).toContainText(["BM", "AE"]);

  await page.getByRole("button", { name: "Assignments" }).click();
  await expect(page.locator(".spr-assignments-overview")).toContainText("Near post");
  await expect(page.locator(".spr-assignment-row").filter({ hasText: "Near post" })).toContainText("Beth Miller");

  await page.getByRole("button", { name: "Create variant" }).click();
  await page.locator(".spr-assignment-row").filter({ hasText: "Near post" }).click();
  await page.getByRole("button", { name: "This variant" }).click();
  await page.getByRole("menuitem", { name: "Assign Casey Evans to Near post" }).click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");

  const variants = page.locator("[data-set-piece-variant-id]");
  await variants.first().click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("BM");
  await variants.nth(1).click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");
});

test("Set Pieces Room handles a match-sized routine without stacking roles", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: Array.from({ length: 11 }, (_, index) => ({
        id: `player-${index + 1}`,
        name: `Player ${String(index + 1).padStart(2, "0")}`,
        position: index === 0 ? "Goalkeeper" : "Outfield",
      })),
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  for (let index = 1; index <= 11; index += 1) {
    await page.locator("[data-set-piece-player-picker] summary").click();
    await page.getByRole("menuitem", { name: `Add Player ${String(index).padStart(2, "0")}` }).click();
  }
  const ownMarkers = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  await expect(ownMarkers).toHaveCount(11);
  const uniqueTransforms = await ownMarkers.evaluateAll((markers) => new Set(markers.map((marker) => marker.getAttribute("transform"))).size);
  expect(uniqueTransforms).toBe(11);

  const pitch = page.locator("[data-set-piece-pitch]");
  const pitchBox = await pitch.boundingBox();
  expect(pitchBox).not.toBeNull();
  const opponentPoints = [
    [.62, .2], [.72, .2], [.82, .2], [.67, .4],
    [.77, .4], [.87, .4], [.72, .62], [.82, .62],
  ];
  for (const [x, y] of opponentPoints) {
    await page.getByRole("button", { name: "Opponent", exact: true }).click();
    const currentPitchBox = await pitch.boundingBox();
    expect(currentPitchBox).not.toBeNull();
    await page.mouse.click(currentPitchBox.x + currentPitchBox.width * x, currentPitchBox.y + currentPitchBox.height * y);
  }
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost)")).toHaveCount(8);

  await page.getByRole("button", { name: "Assignments" }).click();
  await expect(page.locator(".spr-assignment-row")).toHaveCount(11);
});

test("Set Pieces presentation stays composed on landscape and portrait tablets", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();
  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  const tabletLibrary = await page.getByRole("complementary", { name: "Set piece library" }).boundingBox();
  expect(tabletLibrary).not.toBeNull();
  expect(tabletLibrary.width).toBeLessThanOrEqual(360);
  expect(tabletLibrary.x + tabletLibrary.width).toBeLessThanOrEqual(1024);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Present", exact: true }).click();

  const shell = page.locator("[data-set-pieces-room]");
  const landscapeStage = await shell.locator(".spr-present-stage").boundingBox();
  const landscapeCues = await shell.locator(".spr-present-cues").boundingBox();
  const landscapePlayback = await shell.locator(".spr-playback").boundingBox();
  expect(landscapeStage).not.toBeNull();
  expect(landscapeCues).not.toBeNull();
  expect(landscapePlayback).not.toBeNull();
  expect(landscapeStage.x + landscapeStage.width).toBeLessThanOrEqual(landscapeCues.x + 1);
  expect(landscapePlayback.y + landscapePlayback.height).toBeLessThanOrEqual(768);

  await page.setViewportSize({ width: 820, height: 1180 });
  const portraitStage = await shell.locator(".spr-present-stage").boundingBox();
  const portraitCues = await shell.locator(".spr-present-cues").boundingBox();
  const portraitPlayback = await shell.locator(".spr-playback").boundingBox();
  expect(portraitStage).not.toBeNull();
  expect(portraitCues).not.toBeNull();
  expect(portraitPlayback).not.toBeNull();
  expect(portraitStage.y + portraitStage.height).toBeLessThanOrEqual(portraitCues.y + 1);
  expect(portraitPlayback.y + portraitPlayback.height).toBeLessThanOrEqual(1180);
  await expect(shell.locator(".spr-present-phase-card")).toHaveCount(2);
});

test("Set Pieces Room keeps its editor usable on a narrow touch viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [{ id: "player-alex", name: "Alex Example", position: "Forward" }],
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  await expect(page.locator("[data-set-piece-pitch]")).toBeVisible();
  await expect(page.locator(".spr-playback")).toBeVisible();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await page.getByRole("button", { name: "Toggle details" }).click();
  await expect(page.locator(".spr-inspector")).toBeVisible();
  const addPhase = page.getByRole("button", { name: "Duplicate current phase" });
  for (let index = 0; index < 6; index += 1) await addPhase.click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(7);
  await expect(page.locator(".spr-phase-card.is-active small")).toHaveText("1.4s");
  const activePhaseMetrics = await page.evaluate(() => {
    const strip = document.querySelector(".spr-phase-strip")?.getBoundingClientRect();
    const active = document.querySelector(".spr-phase-card.is-active")?.getBoundingClientRect();
    return strip && active ? { stripLeft: strip.left, stripRight: strip.right, activeLeft: active.left, activeRight: active.right } : null;
  });
  expect(activePhaseMetrics).not.toBeNull();
  expect(activePhaseMetrics.activeLeft).toBeGreaterThanOrEqual(activePhaseMetrics.stripLeft - 1);
  expect(activePhaseMetrics.activeRight).toBeLessThanOrEqual(activePhaseMetrics.stripRight + 1);
  await page.locator("[data-set-piece-player-picker] summary").click();
  await expect(page.locator(".spr-player-menu")).toBeVisible();
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    toolRailWidth: document.querySelector(".spr-tool-rail")?.scrollWidth || 0,
    boardWidth: document.querySelector(".spr-board-stage")?.getBoundingClientRect().width || 0,
    playerMenuRight: document.querySelector(".spr-player-menu")?.getBoundingClientRect().right || 0,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.toolRailWidth).toBeGreaterThan(300);
  expect(metrics.boardWidth).toBeGreaterThan(280);
  expect(metrics.playerMenuRight).toBeLessThanOrEqual(metrics.viewportWidth);
});
