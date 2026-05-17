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
    const user = {
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
    window.platformAuthStore?.writeUsers?.([user]);
    window.platformAuthStore?.setCurrentUser?.(user.id);
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
              stage: "shortlist",
              fee: 125000,
              wage: 95000,
              wagePeriod: "year",
              source: "scouting",
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
          },
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
  await expect(page.locator(".transfer-room-target-card").first()).toContainText("Maya Snapshot");
  await page.locator('[data-transfer-open-target-profile="qa-target-snapshot-1"]').click();

  const dialog = page.locator(".transfer-room-target-profile-dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Maya Snapshot");
  await expect(dialog).toContainText("Snapshot United");
  await expect(dialog).toContainText("Progressive passes per 90");
  await expect(dialog).toContainText("Snapshot kept in Transfer Room");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "transfer-room");
  await expect(page.locator('[data-workspace-view="scouting"].is-active')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), scoutingDatabaseKey)).toBeNull();
});
