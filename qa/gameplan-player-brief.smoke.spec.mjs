import { expect, test } from "@playwright/test";

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isOpen = await page.evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      return Boolean(modalRoot && !modalRoot.hidden);
    });

    if (!isOpen) {
      return;
    }

    const closeButton = page
      .locator(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
      )
      .first();

    if ((await closeButton.count()) > 0) {
      await closeButton.click({ force: true });
    }

    await page.waitForTimeout(150);
  }
}

async function bootApp(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  await page.evaluate((targetWorkspaceId) => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
  }, workspaceId);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

test("Gameplan Player Brief portal is audience-gated and records player receipts", async ({ context, page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await bootApp(page);
  await openWorkspace(page, "gameplan");
  await expect(page.locator("#gameplanWorkspace .gameplan-shell")).toBeVisible();

  await page.locator('[data-gameplan-tab="player-brief"]').click();
  await expect(page.locator(".gameplan-player-layout")).toBeVisible();

  const playerInputs = page.locator('[data-gameplan-player-audience]');
  await expect(playerInputs.first()).toBeVisible();
  const selectedPlayerId = await playerInputs.first().getAttribute("data-gameplan-player-audience");
  const blockedPlayerId = await playerInputs.nth(1).getAttribute("data-gameplan-player-audience");
  expect(selectedPlayerId).toBeTruthy();
  expect(blockedPlayerId).toBeTruthy();

  await playerInputs.first().check();
  await page.locator('[data-gameplan-field="playerBrief.headline"]').fill("Press together, finish the first action");
  await page.locator('[data-gameplan-field="playerBrief.message"]').fill("Player-facing only. Keep the distances compact.");
  await page.locator('[data-gameplan-field="playerBrief.focus"]').fill("Win second balls and protect the rest defence.");
  await page.locator('[data-gameplan-publish-player-brief]').click();

  const linkInput = page.locator('[data-gameplan-player-brief-link]').first();
  await expect(linkInput).toBeVisible();
  const playerBriefUrl = await linkInput.inputValue();
  expect(playerBriefUrl).toContain("workspace=gameplan");
  expect(playerBriefUrl).toContain(`player=${selectedPlayerId}`);

  const portal = await context.newPage();
  const portalErrors = [];
  portal.on("pageerror", (error) => portalErrors.push(error.message));
  await portal.goto(playerBriefUrl, { waitUntil: "domcontentloaded" });
  await expect(portal.locator(".gameplan-player-portal-card")).toBeVisible();
  await expect(portal.locator(".gameplan-player-portal-card")).toContainText("Press together, finish the first action");
  await expect(portal.locator(".gameplan-player-portal-card")).toContainText("Player-facing only");
  await expect(portal.locator(".gameplan-player-portal-card")).not.toContainText(/Staff Responsibilities|Halftime report|Decision trigger|Opponent Plan/i);

  await portal.locator("[data-gameplan-ack-player-brief]").click();
  await expect(portal.locator("[data-gameplan-ack-player-brief]")).toBeDisabled();

  const receipt = await portal.evaluate((playerId) => {
    const state = JSON.parse(window.localStorage.getItem("football-gameplan-v1") || "{}");
    const plan = state.gameplans?.find((candidate) => candidate.id === state.activeGameplanId) || state.gameplans?.[0];
    return plan?.playerBrief?.readReceipts?.[playerId] || null;
  }, selectedPlayerId);
  expect(receipt?.firstOpenedAt).toBeTruthy();
  expect(receipt?.lastOpenedAt).toBeTruthy();
  expect(receipt?.acknowledgedAt).toBeTruthy();
  expect(receipt?.openCount).toBeGreaterThanOrEqual(1);

  const blockedUrl = new URL(playerBriefUrl);
  blockedUrl.searchParams.set("player", blockedPlayerId);
  const blockedPortal = await context.newPage();
  await blockedPortal.goto(blockedUrl.toString(), { waitUntil: "domcontentloaded" });
  await expect(blockedPortal.locator(".gameplan-player-portal-card")).toContainText("Brief unavailable");
  await expect(blockedPortal.locator(".gameplan-player-portal-card")).toContainText("not assigned");
  await expect(blockedPortal.locator(".gameplan-player-portal-card")).not.toContainText("Press together, finish the first action");

  await page.reload({ waitUntil: "domcontentloaded" });
  await openWorkspace(page, "gameplan");
  await page.locator('[data-gameplan-tab="player-brief"]').click();
  await expect(page.locator(".gameplan-delivery-panel")).toContainText("Acknowledged");

  expect(pageErrors).toEqual([]);
  expect(portalErrors).toEqual([]);
});
