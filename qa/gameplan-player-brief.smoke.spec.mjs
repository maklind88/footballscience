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

async function seedGameplanEvidenceSources(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "football-schedule-v1",
      JSON.stringify({
        importVersion: "ncc-2026-numbers-v1",
        selectedYear: 2026,
        selectedMonthIndex: 5,
        selectedDate: "2026-06-03",
        viewMode: "month",
        overviewSpan: 6,
        events: [
          {
            id: "qa-gameplan-match",
            date: "2026-06-03",
            time: "19:00",
            type: "match",
            title: "Rivals FC",
            location: "Home Stadium",
            competition: "League",
          },
        ],
      })
    );
    window.localStorage.setItem(
      "football-player-profiles-v1",
      JSON.stringify({
        players: [
          { id: "qa-player-1", name: "QA Captain", number: "6", position: "Midfielder", rosterOrder: 1 },
          { id: "qa-player-2", name: "QA Forward", number: "9", position: "Forward", rosterOrder: 2 },
          { id: "qa-player-3", name: "QA Keeper", number: "1", position: "Goalkeeper", rosterOrder: 3 },
        ],
      })
    );
    window.localStorage.setItem(
      "football-session-planner-v3",
      JSON.stringify({
        selectedDate: "2026-05-30",
        sessions: {
          "2026-05-30": {
            id: "session-2026-05-30",
            date: "2026-05-30",
            title: "Training Session",
            theme: "Build and press",
            selectedBlockId: "qa-build",
            blocks: [
              {
                id: "qa-build",
                title: "Build-up Rhythm",
                focus: "Create angles and find the third player",
                phase: "In Possession",
                subPhase: "Build Up",
                principles: "Create width, scan early, play away from pressure.",
              },
              {
                id: "qa-press",
                title: "Pressing Game",
                focus: "Mini-game constraint",
                phase: "Out of Possession",
                subPhase: "High Press",
                principles: "Jump on backwards pass, protect central lane.",
              },
            ],
          },
        },
      })
    );
    window.localStorage.setItem(
      "football-periodization-v2",
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-30",
        days: {
          "2026-05-30": {
            daySchedule: "Training",
            matchDay: "Match Day -4",
            matchPhases: ["In Possession", "Out of Possession"],
            subPhases: ["Build Up", "High Press"],
            teamPrinciples: ["Create width", "Protect central lane"],
            miniGamePrinciples: ["Find the Third", "Counterpress five seconds"],
          },
        },
      })
    );
    window.localStorage.setItem(
      "football-analysis-room-v1",
      JSON.stringify({
        clips: [
          {
            id: "qa-analysis-clip-1",
            title: "Opponent build-up clip",
            note: "Their left centre-back receives free before the press cue.",
            clipUrl: "https://example.com/opponent-build-up.mp4",
            confidence: "high",
          },
        ],
      })
    );
    window.localStorage.setItem(
      "football-scouting-v1",
      JSON.stringify({
        reports: [
          {
            id: "qa-opposition-report-1",
            type: "opposition",
            title: "Opposition memo: left-side build",
            summary: "Scouting report links the clip to opponent build-up behaviour.",
            confidence: 4,
            createdAt: "2026-05-20T12:00:00.000Z",
          },
        ],
        targets: [
          {
            id: "qa-target-1",
            name: "Rivals FC winger",
            position: "LW",
            priority: "high",
            notes: "Back-post threat from early crosses.",
          },
        ],
      })
    );
  });
}

test("Gameplan Player Brief portal is audience-gated and records player receipts", async ({ context, page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await seedGameplanEvidenceSources(page);
  await bootApp(page);
  await openWorkspace(page, "gameplan");
  await expect(page.locator("#gameplanWorkspace .gameplan-shell")).toBeVisible();
  await expect(page.locator("#gameplanWorkspace [data-gameplan-tab]")).toHaveCount(4);
  await expect(page.locator("#gameplanWorkspace")).toContainText("Match Command");
  await expect(page.locator("#gameplanWorkspace")).toContainText("Briefing");
  await expect(page.locator('[data-gameplan-field="summary.objective"]')).toHaveCount(0);
  await page.locator('[data-gameplan-plan-mode="edit"]').click();
  await expect(page.locator('[data-gameplan-field="summary.objective"]')).toBeVisible();
  await expect(page.locator(".gameplan-lineup-editor")).toBeVisible();
  await expect(page.locator(".gameplan-week-focus-card")).toContainText("Create width");
  const lineupRows = page.locator(".gameplan-lineup-player-row");
  await expect(lineupRows.first()).toBeVisible();
  const selectedLineupPlayerId = await lineupRows.nth(0).locator('[data-gameplan-lineup-group="starting"]').getAttribute("data-gameplan-lineup-player");
  await lineupRows.nth(0).locator('[data-gameplan-lineup-group="starting"]').check();
  await lineupRows.nth(1).locator('[data-gameplan-lineup-group="bench"]').check();
  await page.locator("[data-gameplan-sync-week-focus]").click();
  await expect
    .poll(() => page.locator('[data-gameplan-mini-field="principle"]').evaluateAll((fields) => fields.map((field) => field.value).join(" | ")))
    .toContain("Find the Third");
  await page.locator('[data-gameplan-field="summary.objective"]').fill("Win territory early and keep the game connected.");
  await expect(page.locator(".gameplan-evidence-source-panel")).toBeVisible();
  await expect(page.locator(".gameplan-evidence-source-panel")).toContainText("Opponent build-up clip");
  await page.locator(".gameplan-evidence-source-row").filter({ hasText: "Opponent build-up clip" }).locator("[data-gameplan-link-evidence]").click();
  await expect(page.locator(".gameplan-evidence-chips")).toContainText("Opponent build-up clip");
  await page.locator('[data-gameplan-plan-mode="briefing"]').click();
  await expect(page.locator(".gameplan-lineup-overview")).toContainText("1/11");
  await expect(page.locator(".gameplan-lineup-overview")).toContainText("Bench");
  await expect(page.locator(".gameplan-week-focus-card")).toContainText("Find the Third");
  await expect(page.locator("#gameplanWorkspace")).toContainText("Win territory early");
  await expect(page.locator("#gameplanWorkspace")).toContainText("Opponent build-up clip");
  await expect(page.locator('[data-gameplan-field="summary.objective"]')).toHaveCount(0);
  await page.locator('[data-gameplan-tab="staff"]').click();
  await expect(page.locator(".gameplan-role-lens")).toBeVisible();
  await expect(page.locator(".gameplan-role-lens")).toContainText("My Responsibilities");
  await expect(page.locator(".gameplan-role-lens")).toContainText("Analyst Evidence");
  await expect(page.locator(".gameplan-role-lens")).toContainText("Opponent build-up clip");
  await expect(page.locator(".gameplan-role-lens")).toContainText("Keeper Brief");
  await expect(page.locator(".gameplan-role-lens")).toContainText("Player-Safe View");
  await page.locator('[data-gameplan-tab="matchday"]').click();
  await expect(page.locator("#gameplanWorkspace")).toContainText("Coach Mode");

  await page.locator('[data-gameplan-tab="player-brief"]').click();
  await expect(page.locator(".gameplan-player-layout")).toBeVisible();

  const playerInputs = page.locator('[data-gameplan-player-audience]');
  await expect(playerInputs.first()).toBeVisible();
  const selectedPlayerId = selectedLineupPlayerId || (await playerInputs.first().getAttribute("data-gameplan-player-audience"));
  const blockedPlayerId = await playerInputs.evaluateAll((inputs, selectedId) => {
    const ids = inputs.map((input) => input.getAttribute("data-gameplan-player-audience")).filter(Boolean);
    return ids.find((id) => id !== selectedId) || "";
  }, selectedPlayerId);
  expect(selectedPlayerId).toBeTruthy();
  expect(blockedPlayerId).toBeTruthy();

  await page.locator(`[data-gameplan-player-audience="${selectedPlayerId}"]`).check();
  await page.locator('[data-gameplan-field="playerBrief.headline"]').fill("Press together, finish the first action");
  await page.locator('[data-gameplan-field="playerBrief.message"]').fill("Player-facing only. Keep the distances compact.");
  await page.locator('[data-gameplan-field="playerBrief.focus"]').fill("Win second balls and protect the rest defence.");
  await page.locator('[data-gameplan-field^="playerBrief.individualNotes."]').first().fill("Your first scan opens the six.");
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
  await expect(portal.locator(".gameplan-player-portal-card")).toContainText("Find the Third");
  await expect(portal.locator(".gameplan-player-portal-card")).toContainText("Your first scan opens the six.");
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
