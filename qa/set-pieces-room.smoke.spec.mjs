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
  await page.getByRole("button", { name: "Create set piece" }).click();
  await expect(page.locator("[data-set-piece-pitch]")).toBeVisible();

  const pitch = page.locator("[data-set-piece-pitch]");
  const box = await pitch.boundingBox();
  expect(box).not.toBeNull();

  await page.getByRole("button", { name: "Own player" }).click();
  await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.34);
  await page.getByRole("button", { name: "Opponent" }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
  await page.getByRole("button", { name: "Ball", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.48);

  await expect(page.locator(".spr-board-element.is-home-player text")).toHaveText("AE");
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("1");
  await expect(page.locator(".spr-board-element.is-ball")).toHaveCount(1);

  await page.getByRole("button", { name: "Run" }).click();
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.34);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.25, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".spr-drawing.is-run")).toHaveCount(1);

  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(2);
  const homeMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const markerBox = await homeMarker.boundingBox();
  expect(markerBox).not.toBeNull();
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 110, markerBox.y + markerBox.height / 2 + 45, { steps: 10 });
  await page.mouse.up();

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
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedTransform = await page.locator(".spr-board-element.is-home-player:not(.is-ghost)").getAttribute("transform");
  await page.waitForTimeout(250);
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveAttribute("transform", pausedTransform);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".spr-phase-counter")).toContainText("Phase 2", { timeout: 5_000 });
  await expect(page.locator(".spr-phase-counter")).toContainText("of 2");

  await page.getByRole("button", { name: "Create variant" }).click();
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("1");
  expect(pageErrors).toEqual([]);
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
  await expect(page.locator(".spr-inspector")).toBeVisible();
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    toolRailWidth: document.querySelector(".spr-tool-rail")?.scrollWidth || 0,
    boardWidth: document.querySelector(".spr-board-stage")?.getBoundingClientRect().width || 0,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.toolRailWidth).toBeGreaterThan(300);
  expect(metrics.boardWidth).toBeGreaterThan(280);
});
