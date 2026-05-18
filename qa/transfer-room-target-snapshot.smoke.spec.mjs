import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";
const transferRoomKey = "football-transfer-room-v1";
const scoutingKey = "football-scouting-v1";
const scoutingDatabaseKey = "football-scouting-imported-database-v1";

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isOpen = await page.evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      return Boolean(modalRoot && !modalRoot.hidden);
    });
    if (isOpen) {
      const closeButton = page
        .locator(
          "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
        )
        .first();
      if ((await closeButton.count()) > 0) {
        await closeButton.click({ force: true }).catch(() => {});
      }
    }
    await page.waitForTimeout(150);
  }
}

async function bootApp(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await page.waitForTimeout(450);
  await dismissDashboardModal(page);
  return { pageErrors };
}

async function setQaCurrentRole(page, role) {
  await page.evaluate((nextRole) => {
    const adminUser = {
      id: "qa-admin",
      email: "admin@footballscience.test",
      firstName: "QA",
      lastName: "Admin",
      username: "qa-admin",
      role: "admin",
      title: "QA",
      department: "Football",
      clubId: "club-ncc",
      clubName: "North Carolina Courage",
      teamId: "team-ncc-first",
      teamName: "North Carolina Courage",
      team: "North Carolina Courage",
      status: "active",
    };
    const scoutUser = {
      id: "qa-scout",
      email: "scout@footballscience.test",
      firstName: "QA",
      lastName: "Scout",
      username: "qa-scout",
      role: "scout",
      title: "Scout",
      department: "Scouting",
      clubId: "club-ncc",
      clubName: "North Carolina Courage",
      teamId: "team-ncc-first",
      teamName: "North Carolina Courage",
      team: "North Carolina Courage",
      status: "active",
    };
    const requestedUser = {
      id: `qa-${nextRole}`,
      email: `${nextRole}@footballscience.test`,
      firstName: "QA",
      lastName: nextRole,
      username: `qa-${nextRole}`,
      role: nextRole,
      title: "QA",
      department: "Football",
      clubId: "club-ncc",
      clubName: "North Carolina Courage",
      teamId: "team-ncc-first",
      teamName: "North Carolina Courage",
      team: "North Carolina Courage",
      status: "active",
    };
    const users = new Map([adminUser, scoutUser, requestedUser].map((user) => [user.id, user]));
    window.platformAuthStore?.writeUsers?.(Array.from(users.values()));
    window.platformAuthStore?.setCurrentUser?.(requestedUser.id);
  }, role);
  await expect.poll(() => page.evaluate(() => document.body.dataset.userRole || ""), { timeout: 10_000 }).toBe(role);
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  await page.evaluate((targetWorkspaceId) => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
  }, workspaceId);
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function seedTransferRoomTarget(page) {
  await page.addInitScript(
    ({ hubKey, roomKey, scoutKey, scoutDbKey }) => {
      window.localStorage.removeItem(scoutKey);
      window.localStorage.removeItem(scoutDbKey);
      window.localStorage.setItem(
        hubKey,
        JSON.stringify({
          workspaceAccess: {
            home: { view: ["admin"], edit: ["admin"] },
            "transfer-room": { view: ["admin"], edit: ["admin"] },
            scouting: { view: ["admin"], edit: ["admin"] },
          },
        })
      );
      window.localStorage.setItem(
        roomKey,
        JSON.stringify({
          activeTab: "targets",
          activeTeamId: "team-ncc-first",
          settings: {
            currency: "USD",
            wagePeriod: "year",
            leagueProfileId: "nwsl-2026",
            activeTeamId: "team-ncc-first",
            salaryCap: 3700000,
            capBuffer: 0,
          },
          teams: [
            {
              id: "team-ncc-first",
              clubId: "club-ncc",
              name: "North Carolina Courage",
              shortName: "NCC",
              season: "2026",
              country: "United States",
              league: "NWSL",
              leagueProfileId: "nwsl-2026",
            },
          ],
          accessByTeam: {
            "team-ncc-first": { userIds: ["qa-admin"] },
          },
          targetPlans: {
            "qa-target-snapshot-1": {
              recordId: "qa-target-snapshot-1",
              name: "Maya Snapshot",
              position: "CM",
              club: "Snapshot United",
              stage: "negotiation",
              dealType: "transfer",
              fee: 125000,
              wage: 95000,
              wagePeriod: "year",
              contractStatus: "Under contract through 2027",
              agent: "Snapshot Sports",
              riskLevel: "medium",
              valuationConfidence: "high",
              decisionOwner: "Sporting Director",
              plannedWindow: "Summer 2026",
              nextAction: "Confirm agent availability",
              nextActionDate: "2026-06-01",
              whyThisPlayer: "Progressive passer who fits the Courage midfield succession plan.",
              source: "scouting",
            },
            "qa-target-incomplete": {
              recordId: "qa-target-incomplete",
              name: "Incomplete Target",
              position: "FW",
              club: "Gate FC",
              stage: "shortlist",
              dealType: "transfer",
              fee: "",
              wage: "",
              wagePeriod: "year",
              riskLevel: "unknown",
              valuationConfidence: "unknown",
              source: "scouting",
            },
          },
          squadPlans: {
            "ncc-2026-madison-white": {
              playerId: "ncc-2026-madison-white",
              name: "Madison White",
              position: "Goalkeeper",
              status: "loan",
              salary: 50000,
              wagePeriod: "year",
              estimatedValue: "",
              contractEnd: "2026-12-31",
              notes: "Scenario outgoing value needs review",
            },
          },
          targetSnapshots: {
            "qa-target-snapshot-1": {
              recordId: "qa-target-snapshot-1",
              name: "Maya Snapshot",
              club: "Snapshot United",
              position: "CM",
              age: "24",
              minutes: "1,840",
              birthCountry: "United States",
              passportCountry: "United States",
              nationalityCode: "US",
              nationalityLabel: "United States",
              league: "NWSL",
              season: "2026",
              bestRole: "Box-to-box midfielder",
              fit: "P86",
              signalLabel: "Progressive passes per 90",
              signalPercentile: "91",
              summary: "Best role: Box-to-box midfielder. Role fit P86. Best signal: Progressive passes per 90 P91",
              facts: [
                { label: "Contract context", value: "Snapshot kept in Transfer Room" },
                { label: "Scouting note", value: "Can be opened without scouting database" },
              ],
              metrics: [
                { label: "Progressive passes per 90", value: "8.4", percentile: "91", quality: "trusted", group: "Best signal" },
                { label: "Received passes per 90", value: "42.1", percentile: "84", quality: "trusted", group: "Box-to-box midfielder" },
              ],
              updatedAt: "2026-05-17T12:00:00.000Z",
            },
            "qa-target-incomplete": {
              recordId: "qa-target-incomplete",
              name: "Incomplete Target",
              club: "Gate FC",
              position: "FW",
              age: "22",
              league: "NWSL",
              season: "2026",
              fit: "P72",
              signalLabel: "Shot volume",
              summary: "Incomplete target used for stage-gate checks",
              updatedAt: "2026-05-17T12:00:00.000Z",
            },
          },
          auditEvents: Array.from({ length: 12 }, (_, index) => ({
            id: `qa-audit-${index + 1}`,
            type: "qa-seeded",
            message: `Seeded audit activity ${index + 1}`,
            actorName: "QA Audit",
            actorRole: "admin",
            createdAt: new Date(Date.UTC(2026, 4, 17, 11, index)).toISOString(),
          })),
        })
      );
    },
    { hubKey: workspaceHubKey, roomKey: transferRoomKey, scoutKey: scoutingKey, scoutDbKey: scoutingDatabaseKey }
  );
}

test("Transfer Room opens a saved target profile without loading scouting database", async ({ page }) => {
  await seedTransferRoomTarget(page);
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);
  await setQaCurrentRole(page, "admin");
  await openWorkspace(page, "transfer-room");

  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "transfer-room");
  await expect(page.locator('.transfer-room-tabs [data-transfer-room-tab="access"]')).toHaveCount(0);
  await expect(page.locator(".transfer-room-pipeline")).toContainText("Negotiation");
  await expect(page.locator(".transfer-room-pipeline")).toContainText("2 active");
  await expect(page.locator(".transfer-room-target-card").first()).toContainText("Maya Snapshot");
  await expect(page.locator(".transfer-room-target-card").first()).toContainText("Confirm agent availability");

  const incompleteStage = page.locator('select[data-transfer-record-id="qa-target-incomplete"][data-transfer-target-field="stage"]');
  await incompleteStage.selectOption("approved");
  await expect(page.locator(".transfer-room-notice")).toContainText("Stage gate blocked");
  await expect(incompleteStage).toHaveValue("shortlist");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          stage: state.targetPlans?.["qa-target-incomplete"]?.stage,
          hasBlockedAudit: (state.auditEvents || []).some((event) => event.type === "stage-blocked"),
        };
      }, transferRoomKey)
    )
    .toEqual({ stage: "shortlist", hasBlockedAudit: true });

  await page.locator('[data-transfer-room-tab="overview"]').click();
  await expect(page.locator(".transfer-room-scenario")).toContainText("Scenario planner");
  await expect(page.locator(".transfer-room-scenario")).toContainText("Maya Snapshot");
  await expect(page.locator(".transfer-room-scenario")).toContainText("Confirm agent availability");
  await expect(page.locator(".transfer-room-rule-check")).toContainText("Rule check");
  await expect(page.locator(".transfer-room-rule-check")).toContainText("Deal data");
  const outgoingDecision = page.locator('[data-transfer-open-squad-plan-player="ncc-2026-madison-white"]');
  await expect(outgoingDecision).toContainText("Not set value");
  await outgoingDecision.click();
  await expect(page.locator('[data-transfer-room-tab="squad"]')).toHaveClass(/is-active/);
  const focusedSquadRow = page.locator('[data-transfer-squad-player-row="ncc-2026-madison-white"]');
  await expect(focusedSquadRow).toHaveClass(/is-focused/);
  await expect(focusedSquadRow.locator('[data-transfer-squad-field="estimatedValue"]')).toBeFocused();
  await page.locator('[data-transfer-room-tab="overview"]').click();
  const auditPanel = page.locator(".transfer-room-audit").first();
  await expect(auditPanel).toContainText("Latest activity");
  await expect(auditPanel).toHaveClass(/is-collapsed/);
  await expect(auditPanel.locator(".transfer-room-audit-list article")).toHaveCount(0);
  await auditPanel.locator("[data-transfer-audit-toggle]").click();
  await expect(auditPanel).toHaveClass(/is-expanded/);
  await expect(auditPanel.locator(".transfer-room-audit-list article")).toHaveCount(10);
  await expect(auditPanel.locator(".transfer-room-audit-pagination")).toContainText("1-10 of 13");
  await auditPanel.locator('[data-transfer-audit-page-direction="1"]').click();
  await expect(auditPanel.locator(".transfer-room-audit-list article")).toHaveCount(3);
  await expect(auditPanel.locator(".transfer-room-audit-pagination")).toContainText("11-13 of 13");

  await page.locator('[data-transfer-room-tab="targets"]').click();
  await page.locator('[data-transfer-open-target-profile="qa-target-snapshot-1"]').click();

  const dialog = page.locator(".transfer-room-target-profile-dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Maya Snapshot");
  await expect(dialog).toContainText("Snapshot United");
  await expect(dialog.locator(".transfer-room-deal-summary")).toContainText("Deal Summary");
  await expect(dialog.locator(".transfer-room-deal-summary")).toContainText("Total exposure");
  await expect(dialog.locator(".transfer-room-deal-summary")).toContainText("Confirm agent availability");
  await expect(dialog.locator('[data-transfer-target-field="stage"]')).toHaveValue("negotiation");
  await expect(dialog.locator('[data-transfer-target-field="agent"]')).toHaveValue("Snapshot Sports");
  await expect(dialog.locator('[data-transfer-target-field="contractStatus"]')).toHaveValue("Under contract through 2027");
  await expect(dialog.locator('[data-transfer-target-field="valuationConfidence"]')).toHaveValue("high");
  await expect(dialog).toContainText("Progressive passer who fits the Courage midfield succession plan.");
  await expect(dialog).toContainText("Progressive passes per 90");
  await expect(dialog).toContainText("Snapshot kept in Transfer Room");
  await expect(dialog).toContainText("Approvals");
  await dialog.locator('[data-transfer-approval-role="sportingDirector"][data-transfer-approval-action="approved"]').click();
  await dialog.locator('[data-transfer-approval-role="headOfScouting"][data-transfer-approval-action="approved"]').click();
  await dialog.locator('[data-transfer-approval-role="headCoach"][data-transfer-approval-action="approved"]').click();
  await expect(dialog).toContainText("3/3 approvals");
  await dialog.locator('[data-transfer-target-field="stage"]').selectOption("approved");
  await expect(dialog.locator('[data-transfer-target-field="stage"]')).toHaveValue("approved");
  await expect(page.locator(".transfer-room-notice")).toContainText("Maya Snapshot moved to approved");
  await expect(dialog).toContainText("Stage gate");
  await expect(dialog).toContainText("Target activity");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const target = state.targetPlans?.["qa-target-snapshot-1"] || {};
        return {
          stage: target.stage,
          approvals: Object.values(target.approvals || {}).filter((approval) => approval.status === "approved").length,
          hasApprovalAudit: (state.auditEvents || []).some((event) => event.type === "target-approval-updated"),
        };
      }, transferRoomKey)
    )
    .toEqual({ stage: "approved", approvals: 3, hasApprovalAudit: true });

  await page.locator('[data-transfer-close-target-profile]').click();
  await page.locator('[data-transfer-room-tab="scenarios"]').click();
  await expect(page.locator(".transfer-room-scenarios")).toContainText("Scenario versions");
  await expect(page.locator(".transfer-room-scenario-compare")).toContainText("Current plan");
  await expect(page.locator(".transfer-room-scenario-compare")).toContainText("Cap space");
  await page.locator('[data-transfer-scenario-field="name"]').fill("Summer approval plan");
  await page.locator('[data-transfer-scenario-field="notes"]').fill("Approved target scenario");
  await page.locator("[data-transfer-save-scenario]").click();
  await expect(page.locator(".transfer-room-scenario-version-grid")).toContainText("Summer approval plan");
  await expect(page.locator(".transfer-room-scenario-compare")).toContainText("Summer approval plan");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          count: (state.scenarios || []).length,
          activeName: (state.scenarios || []).find((scenario) => scenario.id === state.activeScenarioId)?.name || "",
        };
      }, transferRoomKey)
    )
    .toEqual({ count: 1, activeName: "Summer approval plan" });

  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "transfer-room");
  await expect(page.locator('[data-workspace-view="scouting"].is-active')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scoutingDatabaseKey)).toBeNull();

  await openWorkspace(page, "admin");
  const transferRoomAccessForm = page.locator("#adminTransferRoomAccessForm");
  await expect(transferRoomAccessForm).toContainText("Transfer Room Access");
  await expect(transferRoomAccessForm).toContainText("Selected people for North Carolina Courage");
  const scoutAccess = transferRoomAccessForm.locator('[data-admin-transfer-room-access-user="qa-scout"]');
  await expect(scoutAccess).not.toBeChecked();
  await scoutAccess.check();
  await transferRoomAccessForm.locator('button[type="submit"]').click();
  await expect(page.locator("#adminWorkspace")).toContainText("Transfer Room access saved.");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return state.accessByTeam?.["team-ncc-first"]?.userIds || [];
      }, transferRoomKey)
    )
    .toContain("qa-scout");
});
