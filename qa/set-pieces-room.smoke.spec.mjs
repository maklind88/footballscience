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

async function openSetPiecesRoom(page, { dismissIntro = true } = {}) {
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
  const intro = page.getByRole("dialog", { name: "Build directly on the pitch" });
  if (dismissIntro && await intro.isVisible().catch(() => false)) {
    await intro.getByRole("button", { name: "Start creating" }).click();
  }
}

test("Set Pieces quick start appears once without leaving guidance over the pitch", async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("set-pieces-onboarding-test-ready")) {
      window.localStorage.removeItem("football-set-pieces-room-onboarding-v1");
      window.sessionStorage.setItem("set-pieces-onboarding-test-ready", "true");
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page, { dismissIntro: false });

  const intro = page.getByRole("dialog", { name: "Build directly on the pitch" });
  await expect(intro).toBeVisible();
  const startCreating = intro.getByRole("button", { name: "Start creating" });
  const closeIntroduction = intro.getByRole("button", { name: "Close introduction" });
  await expect(startCreating).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeIntroduction).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(startCreating).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(intro).toHaveCount(0);
  await expect(page.locator(".spr-active-tool-hint, .spr-ghost-status")).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page, { dismissIntro: false });
  await expect(page.getByRole("dialog", { name: "Build directly on the pitch" })).toHaveCount(0);
});

test("Set Pieces keeps analysis guides optional across edit and presentation", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 772 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  const shell = page.locator("[data-set-pieces-room]");
  await expect(shell.locator(".spr-pitch-grass")).toBeVisible();
  await expect(shell.locator(".spr-pitch-goal")).toHaveCount(2);
  await expect(shell.locator(".spr-pitch-goal-net")).toHaveCount(2);
  await expect(shell.locator(".spr-pitch-goal-image")).toHaveCount(2);
  await expect(shell.locator(".spr-penalty-spot")).toHaveCount(2);
  await expect(shell.locator(".spr-penalty-spot").first()).toHaveAttribute("r", "0.4");
  await expect(shell.locator(".spr-pitch-corner-flag")).toHaveCount(4);
  await expect(shell.locator(".spr-pitch-corner-flag-pennant")).toHaveCount(4);
  await expect(shell.locator(".spr-pitch-guides")).toHaveCount(0);

  await shell.getByRole("button", { name: "Toggle details" }).click();
  const guides = shell.getByRole("checkbox", { name: /Analysis guides/ });
  await expect(guides).not.toBeChecked();
  await guides.check();
  await expect(shell.locator(".spr-pitch-guides")).toBeVisible();

  await shell.getByRole("button", { name: "Present", exact: true }).click();
  await expect(shell).toHaveClass(/is-presenting/);
  await expect(shell.locator(".spr-pitch-guides")).toBeVisible();
});

test("Set Pieces pitch views behave like cameras without moving placed players", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-camera-test", name: "Camera Test", position: "Forward", rosterType: "squad", countsInSquad: true },
      ],
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();
  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitemcheckbox", { name: "Add Camera Test" }).click();
  await page.locator("[data-set-piece-player-picker] summary").click();

  const pitchView = page.locator('[data-set-piece-play-field="pitchView"]');
  const player = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const readStoredPosition = () => page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("football-set-pieces-room-v1") || "{}");
    const element = state.plays?.[0]?.variants?.[0]?.phases?.[0]?.elements?.find((item) => item.kind === "home-player");
    return element ? { x: element.x, y: element.y } : null;
  });

  await expect(pitchView).toHaveValue("attacking-half");
  await expect(player).toHaveAttribute("transform", "translate(78 10) rotate(90)");
  const initialPosition = await readStoredPosition();
  expect(initialPosition).toEqual({ x: 78, y: 10 });

  await pitchView.selectOption("full");
  await expect(player).toHaveAttribute("transform", "translate(78 10)");
  await pitchView.selectOption("defensive-half");
  await expect(player).toHaveAttribute("transform", "translate(78 10) rotate(90)");
  await pitchView.selectOption("attacking-half");
  await expect(player).toHaveAttribute("transform", "translate(78 10) rotate(90)");
  expect(await readStoredPosition()).toEqual(initialPosition);
});

test("Set Pieces editor gives the pitch the viewport and anchors compact playback controls", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 772 });
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-alex", name: "Alex Example", position: "Forward", rosterType: "squad", countsInSquad: true },
        { id: "player-guest", name: "QA Training Guest", position: "Forward", rosterType: "guest", countsInSquad: false },
      ],
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  await page.setViewportSize({ width: 1230, height: 772 });
  await expect(page.getByRole("checkbox", { name: "Previous phase" })).toBeVisible();
  await expect(page.locator(".spr-board-toggle span")).toHaveText("Previous phase");
  await expect(page.locator(".spr-board-toggle span")).toBeVisible();
  await page.setViewportSize({ width: 1470, height: 772 });

  await page.locator("[data-set-piece-player-picker] summary").click();
  await expect(page.getByRole("menuitemcheckbox", { name: /QA Training Guest/ })).toHaveCount(0);
  await expect(page.getByRole("menuitemcheckbox", { name: /Alex Example/ })).toBeVisible();
  await page.locator("[data-set-piece-player-picker] summary").click();

  const readEditorLayout = () => page.evaluate(() => {
    const readRect = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      } : null;
    };
    return {
      editor: readRect(".spr-editor"),
      command: readRect(".spr-editor-command-bar"),
      slot: readRect(".spr-board-stage-slot"),
      stage: readRect(".spr-board-stage"),
      centerCircle: readRect(".spr-pitch-markings .spr-round-marking"),
      timeline: readRect(".spr-timeline"),
      playback: readRect(".spr-playback"),
    };
  });

  const historyControls = page.getByRole("group", { name: "Edit history and details" });
  await expect(historyControls.getByRole("button", { name: "Undo" }).locator("svg")).toBeVisible();
  await expect(historyControls.getByRole("button", { name: "Redo" }).locator("svg")).toBeVisible();
  await expect(historyControls.getByRole("button", { name: "Toggle details" }).locator("svg")).toBeVisible();
  const controlRects = await historyControls.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  }));
  expect(new Set(controlRects.map(({ width }) => width)).size).toBe(1);
  expect(new Set(controlRects.map(({ height }) => height)).size).toBe(1);
  expect(Math.max(...controlRects.map(({ top }) => top)) - Math.min(...controlRects.map(({ top }) => top))).toBeLessThanOrEqual(1);

  await expect(page.locator(".spr-board-row")).toHaveClass(/is-wide-projection-active/);
  const collapsedLayout = await readEditorLayout();
  expect(Math.abs(collapsedLayout.stage.width - collapsedLayout.slot.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(collapsedLayout.stage.height - collapsedLayout.slot.height)).toBeLessThanOrEqual(1);
  expect(collapsedLayout.stage.width / collapsedLayout.stage.height).toBeGreaterThan(68 / 35);
  expect(Math.abs(collapsedLayout.centerCircle.width - collapsedLayout.centerCircle.height)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Toggle details" }).click();
  await expect(page.locator(".spr-inspector")).toBeVisible();
  await expect(page.locator(".spr-board-row")).not.toHaveClass(/is-wide-projection-active/);
  const expandedLayout = await readEditorLayout();
  expect(expandedLayout.editor.width).toBeLessThan(collapsedLayout.editor.width - 200);
  expect(Math.abs(expandedLayout.editor.height - collapsedLayout.editor.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(expandedLayout.command.top - collapsedLayout.command.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(expandedLayout.stage.top - collapsedLayout.stage.top)).toBeLessThanOrEqual(1);
  expect(expandedLayout.stage.width).toBeLessThanOrEqual(collapsedLayout.stage.width + 1);
  expect(expandedLayout.stage.width).toBeLessThanOrEqual(expandedLayout.slot.width + 1);
  expect(Math.abs((expandedLayout.stage.width / expandedLayout.stage.height) - (145 / 79))).toBeLessThan(0.01);
  expect(Math.abs(expandedLayout.centerCircle.width - expandedLayout.centerCircle.height)).toBeLessThanOrEqual(1);
  expect(expandedLayout.stage.bottom).toBeLessThanOrEqual(expandedLayout.timeline.top + 1);
  expect(Math.abs(expandedLayout.playback.bottom - expandedLayout.editor.bottom)).toBeLessThanOrEqual(1);
  const planSubPhases = page.locator(".spr-sub-phase-field");
  await planSubPhases.getByRole("checkbox", { name: "Second ball" }).check();
  await expect(planSubPhases.getByRole("checkbox", { name: "Second ball" })).toBeChecked();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle details" })).toBeFocused();
  const restoredLayout = await readEditorLayout();
  expect(Math.abs(restoredLayout.editor.width - collapsedLayout.editor.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(restoredLayout.stage.top - collapsedLayout.stage.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(restoredLayout.stage.width - collapsedLayout.stage.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(restoredLayout.stage.width - restoredLayout.slot.width)).toBeLessThanOrEqual(1);

  await page.locator('[data-set-piece-action="toggle-library"]').click();
  const library = page.getByRole("complementary", { name: "Set piece library" });
  await library.getByRole("button", { name: "Filters" }).click();
  const filterPanel = page.locator(".spr-library-filter-panel");
  await expect(library.getByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "true");
  await filterPanel.getByRole("checkbox", { name: "Defending" }).check();
  await expect(library.locator("[data-set-piece-play-id]")).toHaveCount(0);
  await filterPanel.getByRole("checkbox", { name: "Defending" }).uncheck();
  await filterPanel.getByRole("checkbox", { name: "Corner" }).check();
  await filterPanel.getByRole("checkbox", { name: "Second ball", exact: true }).check();
  await expect(library.locator("[data-set-piece-play-id]")).toHaveCount(1);
  await filterPanel.getByRole("button", { name: "Clear" }).click();
  await expect(library.getByRole("button", { name: "Filters" }).locator("small")).toHaveText("All");
  await page.keyboard.press("Escape");
  await expect(filterPanel).toBeHidden();
  await expect(library.getByRole("button", { name: "Filters" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".spr-library-layer")).toBeHidden();

  await page.getByRole("button", { name: "Assignments" }).click();
  await expect(page.locator(".spr-assignments-overview")).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator(".spr-inspector")).toBeHidden();

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

  const tacticalTools = page.getByRole("toolbar", { name: "Tactical tools" });
  const iconSignatures = await tacticalTools.locator(".spr-tool-icon svg").evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  expect(new Set(iconSignatures).size).toBe(12);
  const runTool = tacticalTools.getByRole("button", { name: "Run", exact: true });
  await runTool.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "Drag from the runner" })).toBeVisible();

  await page.locator('[data-set-piece-play-field="pitchView"]').selectOption("defensive-half");
  const squadTool = tacticalTools.getByRole("button", { name: "Squad players", exact: true });
  await squadTool.click();
  await expect(page.locator("[data-set-piece-player-picker]")).toHaveAttribute("open", "");
  await expect(page.locator("[data-set-piece-player-picker] summary")).toBeFocused();
  await page.getByRole("menuitemcheckbox", { name: "Add Alex Example" }).click();
  await page.locator("[data-set-piece-player-picker] summary").click();

  const cornerBoard = page.locator("[data-set-piece-board-stage]");
  const cornerPitch = cornerBoard.locator("[data-set-piece-pitch]");
  const cornerPlayer = cornerBoard.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const cornerPitchBox = await cornerPitch.boundingBox();
  const cornerPlayerStartBox = await cornerPlayer.boundingBox();
  expect(cornerPitchBox).not.toBeNull();
  expect(cornerPlayerStartBox).not.toBeNull();
  await page.mouse.move(
    cornerPlayerStartBox.x + cornerPlayerStartBox.width / 2,
    cornerPlayerStartBox.y + cornerPlayerStartBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(cornerPitchBox.x + 1, cornerPitchBox.y + cornerPitchBox.height - 1, { steps: 6 });
  await page.mouse.up();
  const cornerPlayerEndBox = await cornerPlayer.boundingBox();
  const cornerPlayerVisualBox = await cornerPlayer.locator(".spr-home-avatar-frame").boundingBox();
  expect(cornerPlayerEndBox).not.toBeNull();
  expect(cornerPlayerVisualBox.x).toBeGreaterThanOrEqual(cornerPitchBox.x - 1);
  expect(cornerPlayerVisualBox.y).toBeGreaterThanOrEqual(cornerPitchBox.y - 1);
  expect(cornerPlayerVisualBox.x + cornerPlayerVisualBox.width).toBeLessThanOrEqual(cornerPitchBox.x + cornerPitchBox.width + 1);
  expect(cornerPlayerVisualBox.y + cornerPlayerVisualBox.height).toBeLessThanOrEqual(cornerPitchBox.y + cornerPitchBox.height + 1);
  await expect(cornerPitch).toHaveAttribute("viewBox", "-3.75 -3.75 75.5 45");
  const cornerPlayerTransform = await cornerPlayer.getAttribute("transform");
  const cornerPlayerPosition = cornerPlayerTransform?.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  expect(Number(cornerPlayerPosition?.[1])).toBeCloseTo(-4.05, 2);
  expect(Number(cornerPlayerPosition?.[2])).toBeCloseTo(-1.55, 2);
  const pitchSurface = cornerPitch.locator(".spr-pitch-base");
  await expect(pitchSurface).toHaveAttribute("x", "-6.25");
  await expect(pitchSurface).toHaveAttribute("y", "-3.75");
  await expect(page.locator(".spr-inspector")).toBeHidden();

  await tacticalTools.getByRole("button", { name: "Opponent", exact: true }).click();
  const objectPitchBox = await cornerPitch.boundingBox();
  await page.mouse.click(objectPitchBox.x + objectPitchBox.width * .68, objectPitchBox.y + objectPitchBox.height * .42);
  const opponentMarker = cornerBoard.locator(".spr-board-element.is-opponent:not(.is-ghost)");
  await expect(opponentMarker).toBeVisible();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await opponentMarker.click();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await page.waitForTimeout(500);
  await opponentMarker.dblclick();
  await expect(page.locator(".spr-inspector")).toContainText("Selected object");
  await page.getByRole("button", { name: "Close details" }).click();

  await tacticalTools.getByRole("button", { name: "Zone", exact: true }).click();
  const drawingPitchBox = await cornerPitch.boundingBox();
  await page.mouse.move(drawingPitchBox.x + drawingPitchBox.width * .38, drawingPitchBox.y + drawingPitchBox.height * .38);
  await page.mouse.down();
  await page.mouse.move(drawingPitchBox.x + drawingPitchBox.width * .56, drawingPitchBox.y + drawingPitchBox.height * .55, { steps: 5 });
  await page.mouse.up();
  const zoneDrawing = cornerBoard.locator(".spr-drawing.is-zone");
  await expect(zoneDrawing).toBeVisible();
  const zoneControls = cornerBoard.locator('.spr-drawing-controls[data-drawing-id]');
  await expect(zoneControls.locator("[data-drawing-handle]")).toHaveCount(4);
  const zoneRectBefore = await zoneDrawing.locator(".spr-zone-shape").evaluate((element) => ({
    width: element.getAttribute("width"),
    height: element.getAttribute("height"),
  }));
  const zoneResizeHandle = zoneControls.locator('[data-drawing-handle="zone-se"]');
  const zoneResizeBox = await zoneResizeHandle.boundingBox();
  await page.mouse.move(zoneResizeBox.x + zoneResizeBox.width / 2, zoneResizeBox.y + zoneResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(zoneResizeBox.x + zoneResizeBox.width / 2 + 24, zoneResizeBox.y + zoneResizeBox.height / 2 + 16, { steps: 5 });
  await page.mouse.up();
  const zoneRectAfter = await zoneDrawing.locator(".spr-zone-shape").evaluate((element) => ({
    width: element.getAttribute("width"),
    height: element.getAttribute("height"),
  }));
  expect(zoneRectAfter).not.toEqual(zoneRectBefore);
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await zoneDrawing.click();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await page.waitForTimeout(500);
  await zoneDrawing.dblclick();
  await expect(page.locator(".spr-inspector")).toContainText("Movement");
  const zoneColors = page.getByRole("radiogroup", { name: "Zone color" });
  await expect(zoneColors.getByRole("radio", { name: "Yellow zone" })).toBeChecked();
  await zoneColors.getByRole("radio", { name: "Blue zone" }).check();
  await expect(zoneDrawing).toHaveClass(/is-zone-blue/);
  const savedZoneColor = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("football-set-pieces-room-v1") || "{}");
    return state.plays?.flatMap((play) => play.variants || [])
      .flatMap((variant) => variant.phases || [])
      .flatMap((phase) => phase.drawings || [])
      .find((drawing) => drawing.type === "zone")?.zoneColor;
  });
  expect(savedZoneColor).toBe("blue");
  await page.getByRole("button", { name: "Close details" }).click();

  await tacticalTools.getByRole("button", { name: "Text", exact: true }).click();
  const textPitchBox = await cornerPitch.boundingBox();
  await page.mouse.click(textPitchBox.x + textPitchBox.width * .72, textPitchBox.y + textPitchBox.height * .7);
  const textAnnotation = cornerBoard.locator(".spr-drawing.is-text");
  await expect(textAnnotation).toBeVisible();
  await expect(page.locator(".spr-inspector")).toContainText("Annotation");
  const textField = page.locator('[data-set-piece-drawing-field="label"]');
  await expect(textField).toBeFocused();
  await textField.fill("Block goalkeeper");
  await textField.press("Tab");
  await expect(textAnnotation.locator(".spr-text-annotation-label")).toHaveText("Block goalkeeper");
  const textSize = page.getByRole("slider", { name: "Text size" });
  await expect(textSize).toHaveValue("1.65");
  await textSize.fill("2.25");
  await page.getByRole("radiogroup", { name: "Text color" }).getByRole("radio", { name: "Blue" }).check();
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "Light" }).check();
  await expect(textAnnotation).toHaveClass(/is-text-color-blue/);
  await expect(textAnnotation).toHaveClass(/is-text-background-light/);
  await expect(textAnnotation.locator(".spr-text-annotation-label")).toHaveCSS("font-size", "2.25px");
  await expect(textAnnotation.locator(".spr-text-annotation-surface")).toHaveCSS("filter", "none");
  await expect(cornerBoard.locator(".spr-drawing-controls")).toHaveCount(0);
  const textTransformBefore = await textAnnotation.getAttribute("transform");
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator(".spr-inspector")).toBeHidden();
  const textBox = await textAnnotation.boundingBox();
  await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width / 2 + 32, textBox.y + textBox.height / 2 + 18, { steps: 5 });
  await page.mouse.up();
  await expect(textAnnotation).not.toHaveAttribute("transform", textTransformBefore);
  await expect(page.locator(".spr-inspector")).toBeHidden();
  const savedText = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("football-set-pieces-room-v1") || "{}");
    return state.plays?.flatMap((play) => play.variants || [])
      .flatMap((variant) => variant.phases || [])
      .flatMap((phase) => phase.drawings || [])
      .find((drawing) => drawing.type === "text");
  });
  expect(savedText).toMatchObject({
    label: "Block goalkeeper",
    fontSize: 2.25,
    textColor: "blue",
    textBackground: "light",
  });

  for (const tool of ["Select", "Opponent", "Ball", "Run", "Pass", "Dribble", "Block", "Press", "Track", "Zone", "Text"]) {
    const button = page.getByRole("button", { name: tool, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await expect(page.locator(".spr-active-tool-hint, .spr-ghost-status")).toHaveCount(0);

  const playIcon = page.getByRole("button", { name: "Play", exact: true }).locator("svg");
  await expect(playIcon).toBeVisible();
  const playIconBox = await playIcon.boundingBox();
  const playButtonBox = await page.getByRole("button", { name: "Play", exact: true }).boundingBox();
  expect(playIconBox).not.toBeNull();
  expect(playButtonBox).not.toBeNull();
  expect(Math.abs((playIconBox.x + playIconBox.width / 2) - (playButtonBox.x + playButtonBox.width / 2))).toBeLessThan(2);
  expect(Math.abs((playIconBox.y + playIconBox.height / 2) - (playButtonBox.y + playButtonBox.height / 2))).toBeLessThan(2);

  await page.setViewportSize({ width: 1024, height: 768 });
  const tabletCollapsedLayout = await readEditorLayout();
  await page.getByRole("button", { name: "Toggle details" }).click();
  await expect(page.locator(".spr-inspector")).toBeVisible();
  const tabletExpandedLayout = await readEditorLayout();
  expect(Math.abs(tabletExpandedLayout.editor.height - tabletCollapsedLayout.editor.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(tabletExpandedLayout.stage.top - tabletCollapsedLayout.stage.top)).toBeLessThanOrEqual(1);
  expect(tabletExpandedLayout.stage.width).toBeLessThan(tabletCollapsedLayout.stage.width - 50);
  expect(Math.abs((tabletExpandedLayout.stage.width / tabletExpandedLayout.stage.height) - (145 / 79))).toBeLessThan(0.01);
  expect(tabletExpandedLayout.stage.bottom).toBeLessThanOrEqual(tabletExpandedLayout.timeline.top + 1);
});

test("Set Pieces Room builds, persists and plays a phased opponent response", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const isFreshTestRun = !window.sessionStorage.getItem("set-pieces-room-smoke-seeded");
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        {
          id: "player-alex",
          name: "Alex Example",
          position: "Forward",
          photoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZzrIAAAAASUVORK5CYII=",
        },
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
  await expect(page.getByRole("group", { name: "Own player markers" })).toHaveCount(0);

  const pitch = page.locator("[data-set-piece-pitch]");
  let box = await pitch.boundingBox();
  expect(box).not.toBeNull();

  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitemcheckbox", { name: "Add Alex Example" }).click();
  const selectedPlayer = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  await expect(selectedPlayer.locator(".spr-home-avatar-photo")).toHaveCount(1);
  await expect(selectedPlayer.locator(".spr-home-initials")).toHaveCount(0);
  await selectedPlayer.click({ button: "right" });
  const playerSettings = page.getByRole("menu", { name: "Player settings for Alex Example" });
  await expect(playerSettings).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /Profile photo/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: /Initials/ }).click();
  await expect(playerSettings).toBeHidden();
  await expect(selectedPlayer.locator(".spr-home-avatar-photo")).toHaveCount(0);
  await expect(selectedPlayer.locator(".spr-home-avatar.is-initials")).toHaveCount(1);
  await expect(selectedPlayer.locator(".spr-home-initials")).toHaveText("AE");
  await selectedPlayer.click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(playerSettings).toBeHidden();
  await expect(selectedPlayer).toBeFocused();
  await selectedPlayer.click({ button: "right" });
  await page.getByRole("menuitemradio", { name: /Profile photo/ }).click();
  await expect(selectedPlayer.locator(".spr-home-avatar-photo")).toHaveCount(1);
  await expect(selectedPlayer.locator(".spr-home-initials")).toHaveCount(0);
  await selectedPlayer.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Role & assignment/ }).click();
  await expect(page.locator(".spr-assignment-picker[open]")).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  const avatarBox = await selectedPlayer.locator(".spr-home-avatar-frame").boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(avatarBox.width).toBeLessThan(box.width * 0.07);
  await selectedPlayer.click();
  const deleteSelected = page.getByRole("button", { name: "Delete selected" });
  await expect(deleteSelected).toBeVisible();
  await deleteSelected.click();
  await expect(selectedPlayer).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(selectedPlayer).toHaveCount(1);
  await selectedPlayer.click();
  await page.keyboard.press("Delete");
  await expect(selectedPlayer).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(selectedPlayer).toHaveCount(1);
  await selectedPlayer.click();
  await page.getByRole("textbox", { name: "Set piece" }).press("Backspace");
  await expect(selectedPlayer).toHaveCount(1);
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await expect(deleteSelected).toBeVisible();
  box = await pitch.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("button", { name: "Opponent" }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
  await expect(page.locator(".spr-inspector")).toBeHidden();
  const opponentMarker = page.locator(".spr-board-element.is-opponent:not(.is-ghost)");
  const opponentMarkerBox = await opponentMarker.locator(".spr-opponent-token").boundingBox();
  const ownMarkerBox = await page.locator(".spr-board-element.is-home-player:not(.is-ghost) .spr-home-avatar-frame").boundingBox();
  expect(opponentMarkerBox).not.toBeNull();
  expect(ownMarkerBox).not.toBeNull();
  expect(opponentMarkerBox.width).toBeGreaterThan(ownMarkerBox.width * .76);
  expect(opponentMarkerBox.width).toBeLessThan(ownMarkerBox.width * .84);
  await opponentMarker.dblclick();
  const blueOpponentMarker = page.getByRole("radio", { name: "Blue opponent marker" });
  await blueOpponentMarker.click();
  await expect(blueOpponentMarker).toBeChecked();
  await expect(opponentMarker).toHaveClass(/is-opponent-color-blue/);
  const opponentNumber = page.getByRole("spinbutton", { name: "Number" });
  await opponentNumber.fill("12");
  await opponentNumber.press("Tab");
  const showOpponentNumber = page.getByRole("checkbox", { name: "Show number on board" });
  await showOpponentNumber.uncheck();
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveCount(0);
  await showOpponentNumber.check();
  await page.getByRole("button", { name: "Close details" }).click();
  await opponentMarker.click();
  const originalOpponentTransform = await opponentMarker.getAttribute("transform");
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  const pastedOpponents = page.locator(".spr-board-element.is-opponent:not(.is-ghost)");
  await expect(pastedOpponents).toHaveCount(2);
  const pastedOpponentTransforms = await pastedOpponents.evaluateAll((markers) => (
    markers.map((marker) => marker.getAttribute("transform"))
  ));
  expect(new Set(pastedOpponentTransforms).size).toBe(2);
  expect(pastedOpponentTransforms).toContain(originalOpponentTransform);
  await page.getByRole("textbox", { name: "Set piece" }).focus();
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await expect(pastedOpponents).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(pastedOpponents).toHaveCount(1);
  await expect(pitch).toHaveClass(/is-wide-projection-active/);
  box = await pitch.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("button", { name: "Ball", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.48);

  await expect(page.locator(".spr-board-element.is-home-player .spr-home-avatar-photo")).toHaveCount(1);
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-body-direction")).toHaveCount(0);
  await expect(page.locator(".spr-board-element.is-ball")).toHaveCount(1);
  await expect(page.locator(".spr-board-element.is-ball .spr-ball-token")).toHaveCount(1);
  await expect(page.locator(".spr-board-element.is-ball .spr-ball-panel")).toHaveCount(6);
  await expect(page.locator(".spr-board-element.is-ball .spr-ball-seam")).toHaveCount(5);
  const ballTokenBox = await page.locator(".spr-board-element.is-ball .spr-ball-token").boundingBox();
  const opponentTokenBox = await page.locator(".spr-board-element.is-opponent:not(.is-ghost) .spr-opponent-token").boundingBox();
  expect(ballTokenBox.width).toBeLessThan(opponentTokenBox.width * .38);
  await page.locator(".spr-board-element.is-ball").click();
  const ballSelectionBox = await page.locator(".spr-board-element.is-ball .spr-selection-ring").boundingBox();
  expect(ballSelectionBox.width).toBeLessThan(opponentTokenBox.width * .6);
  await page.locator(".spr-board-element.is-ball").dblclick();
  await expect(page.locator(".spr-inspector")).toBeVisible();

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
  const runDrawing = page.locator(".spr-drawing.is-run");
  await expect(runDrawing).toHaveCount(1);
  const runControls = page.locator('.spr-drawing-controls[data-drawing-id]');
  await expect(runControls.locator("[data-drawing-handle]")).toHaveCount(3);
  const routeVisualMetrics = await runDrawing.evaluate((drawing) => {
    const shape = drawing.querySelector(".spr-drawing-shape");
    const hit = drawing.querySelector(".spr-drawing-hit");
    const markerId = shape?.getAttribute("marker-end")?.match(/#([^\)]+)/)?.[1];
    const marker = markerId ? document.getElementById(markerId) : null;
    return {
      strokeWidth: Number.parseFloat(getComputedStyle(shape).strokeWidth),
      markerWidth: Number(marker?.getAttribute("markerWidth") || 0),
      outlineStyle: getComputedStyle(drawing).outlineStyle,
      hitOpacity: getComputedStyle(hit).opacity,
      hitPointerEvents: getComputedStyle(hit).pointerEvents,
    };
  });
  expect(routeVisualMetrics.strokeWidth).toBeGreaterThanOrEqual(1.5);
  expect(routeVisualMetrics.markerWidth).toBeGreaterThanOrEqual(5);
  expect(routeVisualMetrics.outlineStyle).toBe("none");
  expect(routeVisualMetrics.hitOpacity).toBe("0");
  expect(routeVisualMetrics.hitPointerEvents).toBe("stroke");
  const handleVisualMetrics = await runControls.locator('.spr-drawing-handle-target').first().evaluate((target) => {
    const visible = target.querySelector(".spr-drawing-handle");
    const hit = target.querySelector(".spr-drawing-handle-hit");
    return visible && hit ? {
      visibleRadius: Number(visible.getAttribute("r")),
      hitRadius: Number(hit.getAttribute("r")),
      hitStrokeWidth: Number.parseFloat(getComputedStyle(hit).strokeWidth),
      hitOpacity: getComputedStyle(hit).opacity,
    } : null;
  });
  expect(handleVisualMetrics).not.toBeNull();
  expect(handleVisualMetrics.visibleRadius).toBeLessThan(.3);
  expect(handleVisualMetrics.hitRadius).toBeGreaterThan(handleVisualMetrics.visibleRadius);
  expect(handleVisualMetrics.hitStrokeWidth).toBeGreaterThanOrEqual(24);
  expect(handleVisualMetrics.hitOpacity).toBe("0");
  const runPathBefore = await runDrawing.locator(".spr-drawing-shape").getAttribute("d");
  const runEndHandle = runControls.locator('[data-drawing-handle="end"]');
  const runEndBox = await runEndHandle.boundingBox();
  await page.mouse.move(runEndBox.x + runEndBox.width / 2, runEndBox.y + runEndBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(runEndBox.x + runEndBox.width / 2 + 38, runEndBox.y + runEndBox.height / 2 + 18, { steps: 6 });
  await page.mouse.up();
  await expect(runDrawing.locator(".spr-drawing-shape")).not.toHaveAttribute("d", runPathBefore);
  const curveHandle = runControls.locator('[data-drawing-handle="curve"]');
  const curveBox = await curveHandle.boundingBox();
  await page.mouse.move(curveBox.x + curveBox.width / 2, curveBox.y + curveBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(curveBox.x + curveBox.width / 2, curveBox.y + curveBox.height / 2 + 28, { steps: 6 });
  await page.mouse.up();
  await expect(runDrawing.locator(".spr-drawing-shape")).toHaveAttribute("d", / Q /);
  await expect(page.getByRole("combobox", { name: "Linked actor" })).toHaveValue(/.+/);
  await runDrawing.press("Delete");
  await expect(runDrawing).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(runDrawing).toHaveCount(1);

  box = await pitch.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  const selectedBoardElements = page.locator(".spr-board-element.is-selected:not(.is-ghost)");
  await expect(selectedBoardElements).toHaveCount(3);
  await expect(runDrawing).toHaveClass(/is-selected/);
  await expect(page.locator(".spr-drawing-controls")).toHaveCount(0);

  const groupedHome = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const groupedHomeTransform = await groupedHome.getAttribute("transform");
  const groupedRoutePath = await runDrawing.locator(".spr-drawing-shape").getAttribute("d");
  const groupedHomeBox = await groupedHome.boundingBox();
  await page.mouse.move(groupedHomeBox.x + groupedHomeBox.width / 2, groupedHomeBox.y + groupedHomeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(groupedHomeBox.x + groupedHomeBox.width / 2 + 18, groupedHomeBox.y + groupedHomeBox.height / 2 + 12, { steps: 6 });
  await page.mouse.up();
  await expect(groupedHome).not.toHaveAttribute("transform", groupedHomeTransform);
  await expect(runDrawing.locator(".spr-drawing-shape")).not.toHaveAttribute("d", groupedRoutePath);

  await page.keyboard.press("Delete");
  await expect(page.locator(".spr-board-element:not(.is-ghost)")).toHaveCount(0);
  await expect(runDrawing).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".spr-board-element:not(.is-ghost)")).toHaveCount(3);
  await expect(runDrawing).toHaveCount(1);

  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(2);
  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitemcheckbox", { name: "Add Beth Miller" }).click();
  await expect(page.locator("[data-set-piece-player-picker]")).toHaveAttribute("open", "");
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(2);
  const bethMarker = page.getByRole("button", { name: /Own player Beth Miller/ });
  await expect(bethMarker.locator(".spr-home-avatar-photo")).toHaveCount(0);
  await expect(bethMarker.locator(".spr-home-avatar.is-fallback")).toHaveCount(1);
  await expect(bethMarker.locator(".spr-home-initials")).toHaveText("BM");
  const removeBeth = page.getByRole("menuitemcheckbox", { name: "Remove Beth Miller" });
  await expect(removeBeth).toBeFocused();
  await expect(removeBeth).toHaveAttribute("aria-checked", "true");
  await removeBeth.click();
  await expect(page.locator("[data-set-piece-player-picker]")).toHaveAttribute("open", "");
  await expect(page.getByRole("menuitemcheckbox", { name: "Add Beth Miller" })).toBeFocused();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(1);
  await page.locator("[data-set-piece-phase-id]").first().click();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(1);
  await page.locator("[data-set-piece-phase-id]").nth(1).click();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveCount(2);
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
  const motionSamples = await page.evaluate(() => new Promise((resolve) => {
    const marker = document.querySelector(".spr-board-element.is-home-player:not(.is-ghost)");
    const samples = [];
    const startedAt = performance.now();
    const sample = (timestamp) => {
      samples.push({ timestamp, transform: marker?.getAttribute("transform") || "" });
      if (timestamp - startedAt >= 350) resolve(samples);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  expect(motionSamples.length).toBeGreaterThan(10);
  expect(new Set(motionSamples.map((sample) => sample.transform)).size).toBeGreaterThan(8);
  await expect(page.getByRole("button", { name: "Pause", exact: true }).locator("svg path")).toHaveAttribute("d", "M9 5v14M15 5v14");
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
  const editVariantSelect = page.getByRole("combobox", { name: "Variant", exact: true });
  await expect(editVariantSelect.locator("option")).toHaveCount(2);
  const editPrimaryVariantId = await editVariantSelect.locator("option").first().getAttribute("value");
  const editSecondVariantId = await editVariantSelect.locator("option").nth(1).getAttribute("value");
  await expect(page.getByRole("button", { name: "Next variant" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous variant" }).click();
  await expect(editVariantSelect).toHaveValue(editPrimaryVariantId);
  await page.getByRole("button", { name: "Next variant" }).click();
  await expect(editVariantSelect).toHaveValue(editSecondVariantId);

  await page.getByRole("button", { name: "Present", exact: true }).click();
  const setPieces = page.locator("[data-set-pieces-room]");
  await expect(setPieces).toHaveClass(/is-presenting/);
  await expect(setPieces.locator(".spr-present-workspace")).toBeVisible();
  await expect(setPieces.locator(".spr-present-cues")).toBeVisible();
  await expect(setPieces.locator(".spr-present-phase-strip")).toBeVisible();
  await expect(setPieces.locator(".spr-playback")).toBeVisible();
  const presentationVariant = setPieces.locator(".spr-present-variant-menu");
  await expect(presentationVariant.locator(".spr-present-variant-option")).toHaveCount(2);
  await presentationVariant.locator("summary").click();
  await presentationVariant.getByRole("menuitemradio", { name: "Primary" }).click();
  await expect(presentationVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Primary");
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await expect(setPieces).toHaveClass(/is-native-fullscreen/);
    await expect(setPieces.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
  }
  await expect(setPieces.locator(".spr-board-element.is-ghost")).toHaveCount(0);
  await expect(setPieces.locator(".spr-board-element.is-opponent:not(.is-ghost)").first()).toHaveClass(/is-opponent-color-blue/);
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
  const teamMeetingPlaybackToggle = presentation.locator('[data-presentation-set-piece-action="toggle"]');
  await teamMeetingPlaybackToggle.evaluate((button) => button.setAttribute("data-playback-control-instance", "stable"));
  await teamMeetingPlaybackToggle.click();
  await expect(presentation.getByRole("button", { name: "Pause", exact: true })).toHaveAttribute("data-playback-control-instance", "stable");
  await page.waitForTimeout(250);
  await expect(presentation.locator(".spr-drawing.is-playing")).toHaveCount(1);
  expect(Number(await presentation.locator("[data-presentation-set-piece-scrubber]").inputValue())).toBeGreaterThan(0);
  await teamMeetingPlaybackToggle.click();
  await presentation.getByRole("button", { name: "Close presentation" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-set-pieces-room]")).toHaveClass(/is-editing/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.getByRole("combobox", { name: "Variant", exact: true }).locator("option")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost)")).toHaveClass(/is-opponent-color-blue/);
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

  await page.locator("[data-set-piece-player-picker] summary").click();
  const addPlayer = async (name) => {
    await page.getByRole("menuitemcheckbox", { name: `Add ${name}` }).click();
  };
  await addPlayer("Alex Example");
  await addPlayer("Beth Miller");

  const alexMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)").filter({ hasText: "AE" });
  const alexSlotId = await alexMarker.getAttribute("data-element-id");
  expect(alexSlotId).toBeTruthy();
  await alexMarker.click();
  await expect(alexMarker).toHaveClass(/is-selected/);
  await expect(page.locator(".spr-inspector")).toBeHidden();
  await page.waitForTimeout(500);
  await alexMarker.dblclick();
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

  const variants = page.getByRole("combobox", { name: "Variant", exact: true });
  const primaryVariantId = await variants.locator("option").first().getAttribute("value");
  const secondaryVariantId = await variants.locator("option").nth(1).getAttribute("value");
  await variants.selectOption(primaryVariantId);
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("BM");
  await variants.selectOption(secondaryVariantId);
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

  await page.locator("[data-set-piece-player-picker] summary").click();
  for (let index = 1; index <= 11; index += 1) {
    await page.getByRole("menuitemcheckbox", { name: `Add Player ${String(index).padStart(2, "0")}` }).click();
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
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await expect(shell).toHaveClass(/is-native-fullscreen/);
    await shell.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(shell).not.toHaveClass(/is-native-fullscreen/);
  }
  const landscapeStage = await shell.locator(".spr-present-stage").boundingBox();
  const landscapeCues = await shell.locator(".spr-present-cues").boundingBox();
  const landscapeTimeline = await shell.locator(".spr-present-phase-strip").boundingBox();
  const landscapePlayback = await shell.locator(".spr-playback").boundingBox();
  const landscapePlayButton = await shell.getByRole("button", { name: "Play", exact: true }).boundingBox();
  const landscapeStepButton = await shell.getByRole("button", { name: "Next phase", exact: true }).boundingBox();
  expect(landscapeStage).not.toBeNull();
  expect(landscapeCues).not.toBeNull();
  expect(landscapeTimeline).not.toBeNull();
  expect(landscapePlayback).not.toBeNull();
  expect(landscapePlayButton).not.toBeNull();
  expect(landscapeStepButton).not.toBeNull();
  expect(landscapeStage.x + landscapeStage.width).toBeLessThanOrEqual(landscapeCues.x + 1);
  expect(landscapeTimeline.height).toBeLessThanOrEqual(72);
  expect(landscapePlayback.height).toBeLessThanOrEqual(54);
  expect(landscapePlayButton.width).toBe(34);
  expect(landscapeStepButton.width).toBe(30);
  expect(landscapePlayback.y + landscapePlayback.height).toBeLessThanOrEqual(768);

  await page.setViewportSize({ width: 820, height: 1180 });
  const portraitStage = await shell.locator(".spr-present-stage").boundingBox();
  const portraitCues = await shell.locator(".spr-present-cues").boundingBox();
  const portraitTimeline = await shell.locator(".spr-present-phase-strip").boundingBox();
  const portraitPlayback = await shell.locator(".spr-playback").boundingBox();
  expect(portraitStage).not.toBeNull();
  expect(portraitCues).not.toBeNull();
  expect(portraitTimeline).not.toBeNull();
  expect(portraitPlayback).not.toBeNull();
  expect(portraitStage.y + portraitStage.height).toBeLessThanOrEqual(portraitCues.y + 1);
  expect(portraitTimeline.height).toBeLessThanOrEqual(68);
  expect(portraitPlayback.height).toBeLessThanOrEqual(54);
  expect(portraitPlayback.y + portraitPlayback.height).toBeLessThanOrEqual(1180);
  await expect(shell.locator(".spr-present-phase-card")).toHaveCount(2);
});

test("Set Pieces native fullscreen prioritizes the pitch without distorting it", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 772 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();
  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await page.getByRole("button", { name: "Create variant" }).click();
  const editVariants = page.getByRole("combobox", { name: "Variant", exact: true });
  const primaryVariantId = await editVariants.locator("option").first().getAttribute("value");
  await editVariants.selectOption(primaryVariantId);
  await page.getByRole("button", { name: "Present", exact: true }).click();

  const shell = page.locator("[data-set-pieces-room]");
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await expect(shell).toHaveClass(/is-native-fullscreen/);
  } else {
    await shell.evaluate((element) => element.classList.add("is-native-fullscreen"));
    await shell.locator(".spr-present-cues").evaluate((element) => element.removeAttribute("open"));
  }

  const fullscreenVariant = shell.locator(".spr-present-variant-menu");
  await expect(fullscreenVariant.locator(".spr-present-variant-option")).toHaveCount(2);
  await expect(fullscreenVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Primary");
  await shell.getByRole("button", { name: "Next variant" }).click();
  await expect(fullscreenVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Variant 2");
  await fullscreenVariant.locator("summary").click();
  await page.keyboard.press("ArrowUp");
  await expect(fullscreenVariant.getByRole("menuitemradio", { name: "Primary" })).toBeFocused();
  await fullscreenVariant.getByRole("menuitemradio", { name: "Primary" }).click();
  await expect(fullscreenVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Primary");
  await fullscreenVariant.locator("summary").click();
  await page.keyboard.press("Escape");
  await expect(fullscreenVariant).not.toHaveAttribute("open", "");
  await shell.locator(".spr-present-stage").click();
  await page.keyboard.press("ArrowDown");
  await expect(fullscreenVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Variant 2");
  await shell.getByRole("button", { name: "Previous variant" }).click();
  await expect(fullscreenVariant.locator("summary")).toHaveAccessibleName("Choose presentation variant, Primary");
  const fullscreenPhases = shell.locator(".spr-present-phase-card");
  await fullscreenPhases.first().click();
  await expect(fullscreenPhases.first()).toHaveClass(/is-active/);
  await shell.getByRole("button", { name: "Next phase", exact: true }).click();
  await expect(fullscreenPhases.nth(1)).toHaveClass(/is-active/);
  await shell.getByRole("button", { name: "Play", exact: true }).click();
  await expect(shell.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Pause", exact: true }).click();

  const playAlignment = await shell.locator(".spr-play-button").evaluate((button) => {
    const icon = button.querySelector("svg");
    const buttonBounds = button.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return {
      x: Math.abs((buttonBounds.left + buttonBounds.width / 2) - (iconBounds.left + iconBounds.width / 2)),
      y: Math.abs((buttonBounds.top + buttonBounds.height / 2) - (iconBounds.top + iconBounds.height / 2)),
    };
  });
  expect(playAlignment.x).toBeLessThanOrEqual(1.1);
  expect(playAlignment.y).toBeLessThanOrEqual(0.1);

  const readLayout = () => page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom } : null;
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: rect(".spr-present-header"),
      body: rect(".spr-present-body"),
      stage: rect(".spr-present-stage"),
      board: rect(".spr-present-board-frame"),
      cues: rect(".spr-present-cues"),
      strip: rect(".spr-present-phase-strip"),
      playback: rect(".is-present-playback"),
      frameStyle: (() => {
        const frame = document.querySelector(".spr-present-board-frame");
        const style = frame ? getComputedStyle(frame) : null;
        return style ? {
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
        } : null;
      })(),
      overflow: {
        width: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight - innerHeight,
      },
    };
  });

  const compact = await readLayout();
  expect(compact.header.height).toBeLessThanOrEqual(53);
  expect(compact.body.width).toBeGreaterThanOrEqual(compact.viewport.width - 1);
  expect(compact.stage.width).toBeGreaterThanOrEqual(compact.viewport.width - 1);
  expect(compact.strip.y).toBeCloseTo(compact.playback.y, 0);
  expect(compact.strip.height).toBeLessThanOrEqual(54);
  expect(compact.playback.height).toBeLessThanOrEqual(54);
  expect(compact.board.height).toBeGreaterThanOrEqual(compact.viewport.height - 1);
  expect(compact.board.width).toBeGreaterThanOrEqual(compact.viewport.width - 60);
  expect(compact.board.width / compact.board.height).toBeCloseTo(145 / 79, 2);
  expect(compact.frameStyle).toEqual({ borderWidth: "0px", borderRadius: "0px", boxShadow: "none" });
  expect(compact.cues.height).toBeLessThanOrEqual(44);
  expect(compact.overflow.width).toBeLessThanOrEqual(0);
  expect(compact.overflow.height).toBeLessThanOrEqual(0);

  await shell.locator(".spr-present-cues-summary").click();
  await expect(shell.locator(".spr-present-cues")).toHaveAttribute("open", "");
  const expanded = await readLayout();
  expect(expanded.board.width).toBeCloseTo(compact.board.width, 0);
  expect(expanded.board.height).toBeCloseTo(compact.board.height, 0);
  expect(expanded.cues.height).toBeGreaterThan(compact.cues.height);

  if (await page.evaluate(() => document.fullscreenElement !== null)) {
    await shell.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(shell).not.toHaveClass(/is-native-fullscreen/);
  } else {
    await shell.evaluate((element) => element.classList.remove("is-native-fullscreen"));
  }
  await page.setViewportSize({ width: 820, height: 1180 });
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await shell.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(shell).toHaveClass(/is-native-fullscreen/);
  } else {
    await shell.evaluate((element) => element.classList.add("is-native-fullscreen"));
    await shell.locator(".spr-present-cues").evaluate((element) => element.removeAttribute("open"));
  }
  const portrait = await readLayout();
  expect(portrait.board.width / portrait.board.height).toBeCloseTo(145 / 79, 2);
  expect(portrait.board.width).toBeGreaterThanOrEqual(portrait.viewport.width - 18);
  expect(portrait.overflow.width).toBeLessThanOrEqual(0);
  expect(portrait.overflow.height).toBeLessThanOrEqual(0);
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
  const plusAlignment = await addPhase.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const iconRect = button.querySelector("svg")?.getBoundingClientRect();
    return iconRect ? {
      x: (buttonRect.left + buttonRect.width / 2) - (iconRect.left + iconRect.width / 2),
      y: (buttonRect.top + buttonRect.height / 2) - (iconRect.top + iconRect.height / 2),
    } : null;
  });
  expect(plusAlignment).not.toBeNull();
  expect(Math.abs(plusAlignment.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(plusAlignment.y)).toBeLessThanOrEqual(0.5);
  for (let index = 0; index < 6; index += 1) await addPhase.click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(7);
  await expect(page.locator(".spr-phase-card small")).toHaveCount(0);
  await expect(page.locator(".spr-phase-card.is-active")).not.toHaveAccessibleName(/1\.4s/);
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
