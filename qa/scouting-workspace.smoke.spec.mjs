import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const workspaceHubKey = "football-workspace-hub-v3";
const playerProfilesKey = "football-player-profiles-v1";
const scoutingAccessRoles = ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"];
const qaDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(qaDir);

function getFallbackCompareRecordOutsideFirstPage() {
  const importSource = fs.readFileSync(path.join(projectRoot, "scouting-import-data.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(importSource, context);
  const database = context.window.__footballScienceBundledScoutingDatabase;
  const records = Array.isArray(database.records) ? database.records : [];
  const sortedRecords = [...records].sort((a, b) => (Number(b?.[9]) || 0) - (Number(a?.[9]) || 0) || String(a?.[1] || "").localeCompare(String(b?.[1] || "")));
  const record = sortedRecords[120] || sortedRecords[records.length - 1];
  return {
    id: String(record?.[0] || ""),
    name: String(record?.[1] || ""),
  };
}

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isOpen = await page.evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      return Boolean(modalRoot && !modalRoot.hidden);
    });

    if (isOpen) {
      const closeButton = page
        .locator(
          "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close], [data-dashboard-news-dismiss]"
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

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    await page.evaluate((targetWorkspaceId) => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
    }, workspaceId);
  }
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function seedScoutingAccess(page, scoutingState = null) {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.removeItem("football-scouting-v1");
      if (state) {
        window.localStorage.setItem("football-scouting-v1", JSON.stringify(state));
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          activeWorkspaceId: "home",
          workspaceAccess: {
            home: { view: ["admin", "coach"], edit: ["admin", "coach"] },
            scouting: { view: ["admin", "coach"], edit: ["admin", "coach"] },
          },
        })
      );
    },
    { key: workspaceHubKey, state: scoutingState }
  );
}

async function seedScoutingAccessForRoles(page, roles = scoutingAccessRoles, scoutingState = null) {
  await page.addInitScript(
    ({ key, accessRoles, state }) => {
      window.localStorage.removeItem("football-scouting-v1");
      if (state) {
        window.localStorage.setItem("football-scouting-v1", JSON.stringify(state));
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          activeWorkspaceId: "home",
          workspaceAccess: {
            home: { view: accessRoles, edit: accessRoles },
            scouting: { view: accessRoles, edit: accessRoles },
          },
        })
      );
    },
    { key: workspaceHubKey, accessRoles: roles, state: scoutingState }
  );
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

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForScoutingRows(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => {
      const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
      if (!workspace) {
        return false;
      }
      const grid = workspace.querySelector("[data-scouting-record-grid]");
      if (!grid) {
        return false;
      }
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rows = Array.from(grid.querySelectorAll("[data-open-scouting-record]")).filter((node) => !node.disabled && isVisible(node));
      const retry = workspace.querySelector("[data-scouting-retry-database]");
      const loader = workspace.querySelector(":is(.scouting-database-progress, .scouting-database-loader)");
      return rows.length > 0 && !retry && !loader;
    },
    null,
    { timeout }
  );
  await nextPaint(page);
  const firstRow = page.locator('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]:visible').first();
  await expect(firstRow).toBeEnabled({ timeout: 15_000 });
  return firstRow;
}

async function loadScoutingDatabase(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existingRow = page
      .locator('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]:visible')
      .first();
    if ((await existingRow.count()) > 0) {
      break;
    }

    const loadButton = page
      .locator(
        '[data-workspace-view="scouting"].is-active [data-scouting-load-database]:visible, [data-workspace-view="scouting"].is-active [data-scouting-retry-database]:visible'
      )
      .first();
    if ((await loadButton.count()) === 0) {
      await nextPaint(page);
      continue;
    }

    try {
      await expect(loadButton).toBeEnabled({ timeout: 5_000 });
      await loadButton.click({ timeout: 5_000 });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("detached") || message.includes("Timeout")) {
        await nextPaint(page);
        continue;
      }
      throw error;
    }
  }
  return waitForScoutingRows(page, { timeout: 75_000 });
}

async function prepareScoutingDatabase(page) {
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);

  await openWorkspace(page, "scouting");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "scouting");
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Shadow XI");

  await page.locator('.scouting-tab[data-scouting-tab="database"]').click();
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");
  await expect(page.locator("#dashboardModalRoot")).toBeHidden();

  return loadScoutingDatabase(page);
}

async function getStableSearchTerm(firstRow) {
  const rowText = await firstRow.innerText();
  return rowText
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/gi, ""))
    .find((part) => part.length >= 3)
    ?.slice(0, 4)
    .toLowerCase() || "a";
}

async function selectMatchingPositionFilter(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
    const select = workspace?.querySelector('[data-scouting-filter="position"]');
    const row = workspace?.querySelector("[data-scouting-record-row]");
    const positionText = row?.querySelector(".scouting-record-position")?.textContent?.trim() || "";
    if (!select || !positionText) {
      return "";
    }
    const option = Array.from(select.options).find((entry) => {
      const value = entry.value?.trim();
      return value && value !== "all" && (positionText === value || positionText.includes(value) || value.includes(positionText));
    });
    return option?.value || "";
  });
}

async function openFirstScoutingProfile(page) {
  const firstRow = await waitForScoutingRows(page);
  const recordId = await firstRow.getAttribute("data-open-scouting-record");
  await firstRow.click();
  const profileModal = page.locator("[data-scouting-profile-modal]").first();
  await expect(profileModal).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    (targetRecordId) => {
      const modal = document.querySelector("[data-scouting-profile-modal]");
      if (!modal) {
        return false;
      }
      const rect = modal.getBoundingClientRect();
      const controls = Array.from(modal.querySelectorAll("[data-toggle-scouting-favorite], [data-add-scouting-record-to-shadow]"));
      const expectedControls = targetRecordId
        ? controls.filter((control) => control.getAttribute("data-toggle-scouting-favorite") === targetRecordId || control.getAttribute("data-add-scouting-record-to-shadow") === targetRecordId)
        : controls;
      return rect.width > 0 && rect.height > 0 && expectedControls.length >= 2 && expectedControls.every((control) => !control.disabled);
    },
    recordId,
    { timeout: 30_000 }
  );
  await expect(profileModal).toHaveAttribute("tabindex", "-1");
  return { profileModal, recordId };
}

async function expectScoutingDatabasePayloadNotLoaded(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          hasDatabase: Boolean(window.__footballScienceScoutingDatabase),
          hasScript: Array.from(document.scripts).some((script) => /scouting-import-data\.js/.test(script.src || "")),
          hasRows: Boolean(document.querySelector('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]')),
          hasLoader: Boolean(document.querySelector('[data-workspace-view="scouting"].is-active :is(.scouting-database-progress, .scouting-database-loader)')),
        })),
      { timeout: 5_000 }
    )
    .toEqual({ hasDatabase: false, hasScript: false, hasRows: false, hasLoader: false });
}

test("Scouting non-database tabs do not load the player database payload", async ({ page }) => {
  test.setTimeout(60_000);
  await seedScoutingAccess(page, { activeTab: "shadow-xi" });
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);

  await openWorkspace(page, "scouting");
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Shadow XI");
  await expectScoutingDatabasePayloadNotLoaded(page);

  for (const tabId of ["my-team", "lists", "reports", "shadow-xi"]) {
    const tab = page.locator(`.scouting-tab[data-scouting-tab="${tabId}"]`).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    await expect(tab).toHaveClass(/is-active/);
    await page.waitForTimeout(350);
    await expectScoutingDatabasePayloadNotLoaded(page);
  }
});

test("Scouting primary tabs expose keyboard and screen-reader navigation", async ({ page }) => {
  await seedScoutingAccess(page, { activeTab: "shadow-xi" });
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);
  await openWorkspace(page, "scouting");

  const tablist = page.getByRole("tablist", { name: "Scouting views" });
  const shadowTab = tablist.getByRole("tab", { name: "Shadow XI" });
  const databaseTab = tablist.getByRole("tab", { name: "Database" });
  const reportsTab = tablist.getByRole("tab", { name: "Reports" });
  const panel = page.getByRole("tabpanel");

  await expect(shadowTab).toHaveAttribute("aria-selected", "true");
  await expect(shadowTab).toHaveAttribute("tabindex", "0");
  await shadowTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(databaseTab).toBeFocused();
  await expect(databaseTab).toHaveAttribute("aria-selected", "true");
  await expect(shadowTab).toHaveAttribute("tabindex", "-1");
  await expect(panel).toHaveAttribute("aria-labelledby", "scouting-tab-database");

  await page.keyboard.press("End");
  await expect(reportsTab).toBeFocused();
  await expect(reportsTab).toHaveAttribute("aria-selected", "true");
  await expect(panel).toHaveAttribute("aria-labelledby", "scouting-tab-reports");
});

test("Scouting database load, search and position filter stay stable", async ({ page }) => {
  test.setTimeout(180_000);
  await seedScoutingAccess(page);
  const firstRow = await prepareScoutingDatabase(page);
  const searchTerm = await getStableSearchTerm(firstRow);
  const queryInput = page.locator('[data-scouting-database-search-form] input[name="query"]').first();
  await expect(queryInput).toBeEnabled({ timeout: 15_000 });
  await queryInput.fill(searchTerm);
  await queryInput.press("Enter");
  await expect(queryInput).toHaveValue(searchTerm);
  await waitForScoutingRows(page, { timeout: 45_000 });
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");

  const positionSelect = page.locator('[data-scouting-filter="position"]').first();
  const matchingPosition = await selectMatchingPositionFilter(page);
  if ((await positionSelect.count()) > 0 && matchingPosition) {
    await expect(positionSelect).toBeEnabled({ timeout: 15_000 });
    await positionSelect.selectOption(matchingPosition);
    await waitForScoutingRows(page, { timeout: 45_000 });
  }
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");
});

async function expectScoutingDatabaseReachableForRole(page, role) {
  await setQaCurrentRole(page, role);
  await openWorkspace(page, "scouting");
  const databaseTab = page.locator('.scouting-tab[data-scouting-tab="database"]').first();
  await expect(databaseTab).toBeVisible({ timeout: 15_000 });
  await databaseTab.click();
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");
  await expect(page.locator("[data-scouting-load-fsdb]"), role).toHaveCount(0);
  const reachabilityHandle = await page.waitForFunction(
    () => {
      const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
      const isVisible = (node) => Boolean(node && (node.offsetParent || node.getClientRects().length));
      const loadButton = workspace?.querySelector("[data-scouting-load-database]");
      if (isVisible(loadButton)) {
        return !loadButton.disabled && /(Load scouting player database|Open player database)/i.test(loadButton.textContent || "")
          ? "load-ready"
          : "";
      }
      if (isVisible(workspace?.querySelector(":is(.scouting-database-progress, .scouting-database-loader)"))) return "loading";
      if (isVisible(workspace?.querySelector("[data-scouting-record-grid] [data-open-scouting-record], [data-scouting-record-row]"))) {
        return "loaded";
      }
      return "";
    },
    null,
    { timeout: 15_000 }
  );
  await expect(await reachabilityHandle.jsonValue(), role).toMatch(/^(load-ready|loading|loaded)$/);
}

for (const role of scoutingAccessRoles) {
  test(`Scouting access role ${role} can visually reach the unified scouting database`, async ({ page }) => {
    test.setTimeout(75_000);
    await seedScoutingAccessForRoles(page, scoutingAccessRoles, {
      activeTab: "database",
      databaseFilters: {
        source: "fsdb",
        fsdbGenderSegment: "women",
      },
    });
    const boot = await bootApp(page);
    expect(boot.pageErrors).toEqual([]);
    await expectScoutingDatabaseReachableForRole(page, role);
  });
}

test("Scouting profile favorite and Shadow XI actions stay stable", async ({ page }) => {
  test.setTimeout(180_000);
  await seedScoutingAccess(page);
  await prepareScoutingDatabase(page);
  const { profileModal } = await openFirstScoutingProfile(page);
  const favoriteButton = profileModal.locator("[data-toggle-scouting-favorite]").first();
  await expect(favoriteButton).toBeEnabled({ timeout: 15_000 });
  if (!/Favorited/i.test(await favoriteButton.innerText())) {
    await favoriteButton.click();
    await expect(favoriteButton).toContainText("Favorited");
  }

  const playerActionsSummary = profileModal.locator(".scouting-profile-action-menu > summary").first();
  await expect(playerActionsSummary).toBeVisible({ timeout: 15_000 });
  await playerActionsSummary.click();
  const addToShadowButton = profileModal.locator("[data-add-scouting-record-to-shadow]").first();
  const roleStack = profileModal.locator("[data-scouting-profile-role-stack]").first();
  await expect(addToShadowButton).toBeEnabled({ timeout: 15_000 });
  const currentRoleCount = Number((await roleStack.innerText()).trim()) || 0;
  if (currentRoleCount < 1) {
    await addToShadowButton.click();
  }
  await expect
    .poll(async () => Number((await roleStack.innerText()).trim()) || 0, { timeout: 45_000 })
    .toBeGreaterThan(0);
  await profileModal.locator(".scouting-profile-close").click();
  await expect(page.locator("[data-scouting-profile-modal]")).toBeHidden();
  const shadowTab = page.locator('.scouting-tab[data-scouting-tab="shadow-xi"]').first();
  await expect(shadowTab).toBeVisible();
  await shadowTab.click();
  await expect(shadowTab).toHaveClass(/is-active/);
  await expect(page.locator(".scouting-shadow-player").first()).toBeVisible({ timeout: 30_000 });
});

test("Scouting compare set hydrates saved players outside the current worker page", async ({ page }) => {
  test.setTimeout(180_000);
  const offPageRecord = getFallbackCompareRecordOutsideFirstPage();
  expect(offPageRecord.id).toBeTruthy();
  expect(offPageRecord.name).toBeTruthy();
  await seedScoutingAccess(page, {
    activeTab: "shadow-xi",
    compareRecordIds: [offPageRecord.id],
    databaseFilters: {
      offset: 0,
      sortMetricId: "minutes",
    },
  });
  await prepareScoutingDatabase(page);

  const advancedFiltersToggle = page.locator("[data-toggle-scouting-advanced-filters]").first();
  await expect(advancedFiltersToggle).toBeEnabled({ timeout: 15_000 });
  await advancedFiltersToggle.click();
  const modeToggle = page.locator(".scouting-database-advanced-filters [data-toggle-scouting-database-mode]").first();
  await expect(modeToggle).toBeEnabled({ timeout: 15_000 });
  await modeToggle.click();
  await expect(page.locator(".scouting-compare-set").first()).toContainText(offPageRecord.name, { timeout: 30_000 });
});

test("Scouting My Team formation and squad placement stay stable", async ({ page }) => {
  test.setTimeout(120_000);
  await seedScoutingAccess(page);
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          selectedPlayerId: "",
          removedPlayerIds: [],
          players: [
            {
              id: "qa-my-team-gk",
              name: "QA My Team Keeper",
              position: "Goalkeeper",
              rosterType: "squad",
              status: "Available",
              rosterOrder: 1,
            },
            {
              id: "qa-my-team-defender",
              name: "QA My Team Defender",
              position: "Defender",
              rosterType: "squad",
              status: "Available",
              rosterOrder: 2,
            },
          ],
        })
      );
    },
    { key: playerProfilesKey }
  );
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);

  await openWorkspace(page, "scouting");
  const myTeamTab = page.locator('.scouting-tab[data-scouting-tab="my-team"]').first();
  await expect(myTeamTab).toBeVisible();
  await myTeamTab.click();
  await expect(myTeamTab).toHaveClass(/is-active/);

  const formationSelect = page.locator("[data-scouting-my-team-formation]").first();
  await expect(formationSelect).toBeEnabled({ timeout: 15_000 });
  await formationSelect.selectOption("3-5-2");
  await expect(formationSelect).toHaveValue("3-5-2");
  await expect(page.locator(".scouting-my-team-pitch").first()).toHaveAttribute("aria-label", /3-5-2/);

  const benchPlayer = page.locator(".scouting-my-team-player:not(.is-compact)").first();
  await expect(benchPlayer).toBeVisible({ timeout: 15_000 });
  const playerName = (await benchPlayer.locator("strong").first().innerText()).trim();
  await benchPlayer.click();
  await expect(benchPlayer).toHaveClass(/is-selected/);

  const gkSlot = page.locator('[data-scouting-my-team-drop-slot="gk"]').first();
  await gkSlot.click();
  await expect(gkSlot.locator(".scouting-my-team-player.is-compact")).toContainText(playerName);

  const nextBenchPlayer = page.locator(".scouting-my-team-player:not(.is-compact)").first();
  await expect(nextBenchPlayer).toBeVisible({ timeout: 15_000 });
  const draggedPlayerName = (await nextBenchPlayer.locator("strong").first().innerText()).trim();
  const rbSlot = page.locator('[data-scouting-my-team-drop-slot="rb"]').first();
  await nextBenchPlayer.dragTo(rbSlot);
  await expect(rbSlot.locator(".scouting-my-team-player.is-compact")).toContainText(draggedPlayerName);

  await page.locator('.scouting-tab[data-scouting-tab="shadow-xi"]').first().click();
  await myTeamTab.click();
  await expect(page.locator("[data-scouting-my-team-formation]").first()).toHaveValue("3-5-2");
});

test("Scouting mobile squad boards stack without visual overflow", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedScoutingAccess(page, { activeTab: "my-team" });
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);
  await openWorkspace(page, "scouting");

  const navigationGeometry = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[data-workspace-view="scouting"].is-active .scouting-tab'));
    const tablist = document.querySelector('[data-workspace-view="scouting"].is-active .scouting-tabs');
    const activeContent = document.querySelector('[data-workspace-view="scouting"].is-active [data-scouting-active-content]');
    const tablistRect = tablist?.getBoundingClientRect();
    const contentRect = activeContent?.getBoundingClientRect();
    const rects = tabs.map((tab) => tab.getBoundingClientRect());
    return {
      count: tabs.length,
      rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
      clipped: rects.filter((rect) => !tablistRect || rect.left < tablistRect.left - 1 || rect.right > tablistRect.right + 1).length,
      hidden: rects.filter((rect) => rect.width <= 0 || rect.height <= 0).length,
      overlapsContent: Boolean(tablistRect && contentRect && tablistRect.bottom > contentRect.top + 1),
    };
  });
  expect(navigationGeometry).toEqual({ count: 6, rows: 2, clipped: 0, hidden: 0, overlapsContent: false });

  const expectMobileBoardGeometry = async ({ tabId, pitchSelector, sideSelector }) => {
    const tab = page.locator(`.scouting-tab[data-scouting-tab="${tabId}"]`).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    await expect(tab).toHaveClass(/is-active/);
    await expect(page.locator(pitchSelector).first()).toBeVisible({ timeout: 15_000 });

    const geometry = await page.evaluate(
      ({ pitchQuery, sideQuery }) => {
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const pitch = document.querySelector(pitchQuery);
        const side = document.querySelector(sideQuery);
        const slots = Array.from(pitch?.querySelectorAll(".scouting-shadow-slot") || []);
        const slotRects = slots.map((slot) => slot.getBoundingClientRect());
        const cardRects = slots.map((slot) => slot.querySelector(".scouting-my-team-slot-card")?.getBoundingClientRect());
        const collisions = [];
        for (let index = 0; index < slotRects.length; index += 1) {
          for (let candidate = index + 1; candidate < slotRects.length; candidate += 1) {
            if (overlaps(slotRects[index], slotRects[candidate])) collisions.push([index, candidate]);
          }
        }
        const pitchRect = pitch?.getBoundingClientRect();
        const sideRect = side?.getBoundingClientRect();
        return {
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pitchSideOverlap: pitchRect && sideRect ? overlaps(pitchRect, sideRect) : true,
          slots: slots.length,
          columns: new Set(slotRects.map((rect) => Math.round(rect.left))).size,
          positions: slots.map((slot) => getComputedStyle(slot).position),
          collisions,
          clippedCards: slotRects.filter((rect, index) => cardRects[index] && rect.height + 1 < cardRects[index].height).length,
          minLeft: slotRects.length ? Math.min(...slotRects.map((rect) => rect.left)) : -1,
          maxRight: slotRects.length ? Math.max(...slotRects.map((rect) => rect.right)) : innerWidth + 1,
          viewportWidth: innerWidth,
        };
      },
      { pitchQuery: pitchSelector, sideQuery: sideSelector }
    );

    expect(geometry).toMatchObject({
      documentOverflow: 0,
      pitchSideOverlap: false,
      slots: 11,
      columns: 2,
      collisions: [],
      clippedCards: 0,
    });
    expect(new Set(geometry.positions)).toEqual(new Set(["relative"]));
    expect(geometry.minLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.maxRight).toBeLessThanOrEqual(geometry.viewportWidth);
  };

  await expectMobileBoardGeometry({
    tabId: "my-team",
    pitchSelector: ".scouting-my-team-layout .scouting-my-team-pitch",
    sideSelector: ".scouting-my-team-side",
  });
  await expectMobileBoardGeometry({
    tabId: "shadow-xi",
    pitchSelector: ".scouting-shadow-layout:not(.scouting-my-team-layout) .scouting-shadow-pitch",
    sideSelector: ".scouting-shadow-layout:not(.scouting-my-team-layout) .scouting-shadow-side",
  });
});

test("Scouting mobile database, Lists action, and profile remain unobstructed", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedScoutingAccess(page, { activeTab: "database" });
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);
  await openWorkspace(page, "scouting");

  await page.locator('.scouting-tab[data-scouting-tab="database"]').click();
  const firstPlayer = await loadScoutingDatabase(page);
  const playerCard = firstPlayer.locator("xpath=ancestor::article[contains(@class, 'scouting-record-card')]");
  const rowGeometry = await playerCard.evaluate((card) => {
    const role = card.querySelector(".scouting-record-best-role")?.getBoundingClientRect();
    const recommendation = card.querySelector(".scouting-record-card-recommendation")?.getBoundingClientRect();
    const popover = card.querySelector(".scouting-record-mini-radar-popover");
    return {
      roleRight: role?.right || 0,
      recommendationLeft: recommendation?.left || 0,
      popoverPointerEvents: popover ? getComputedStyle(popover).pointerEvents : "missing",
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(rowGeometry.documentOverflow).toBe(0);
  expect(rowGeometry.roleRight).toBeLessThanOrEqual(rowGeometry.recommendationLeft + 1);
  expect(rowGeometry.popoverPointerEvents).toBe("none");

  await firstPlayer.click();
  const profile = page.locator("[data-scouting-profile-modal]:visible");
  await expect(profile).toBeVisible();
  const profileGeometry = await profile.evaluate((modal) => {
    const tablist = modal.querySelector(".scouting-profile-tabs");
    const tablistRect = tablist?.getBoundingClientRect();
    const tabs = Array.from(tablist?.querySelectorAll("button") || []);
    const rects = tabs.map((tab) => tab.getBoundingClientRect());
    return {
      count: tabs.length,
      rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
      clipped: rects.filter((rect) => !tablistRect || rect.left < tablistRect.left - 1 || rect.right > tablistRect.right + 1).length,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(profileGeometry).toEqual({ count: 7, rows: 2, clipped: 0, documentOverflow: 0 });

  await page.locator(".scouting-profile-close").click();
  await page.locator('.scouting-tab[data-scouting-tab="lists"]').click();
  const openDatabase = page.locator("[data-scouting-open-database]:visible").first();
  await expect(openDatabase).toBeVisible();
  await openDatabase.click();
  await expect(page.locator('.scouting-tab[data-scouting-tab="database"]')).toHaveClass(/is-active/);
});

test("Scouting dark profile keeps analysis surfaces readable", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.localStorage.setItem("football-platform-theme-mode-v1", "dark");
  });
  await seedScoutingAccess(page, { activeTab: "database" });
  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);
  await expect(page.locator("body")).toHaveClass(/is-dark-mode/);
  await openWorkspace(page, "scouting");

  await page.locator('.scouting-tab[data-scouting-tab="database"]').click();
  const firstPlayer = await loadScoutingDatabase(page);
  await firstPlayer.click();
  const profile = page.locator("[data-scouting-profile-modal]:visible");
  await expect(profile).toBeVisible();

  const surfaces = await profile.evaluate((modal) => {
    const luminance = (value) => {
      const channels = (String(value).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      if (channels.length !== 3) return 1;
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    return [".scouting-radar-head", ".scouting-profile-spider-context"].map((selector) => {
      const element = modal.querySelector(selector);
      const style = element ? getComputedStyle(element) : null;
      return {
        selector,
        backgroundLuminance: luminance(style?.backgroundColor),
        textLuminance: luminance(style?.color),
      };
    });
  });

  for (const surface of surfaces) {
    expect(surface.backgroundLuminance, `${surface.selector} leaked a light surface`).toBeLessThan(0.2);
    expect(surface.textLuminance, `${surface.selector} text is too dark`).toBeGreaterThan(0.35);
  }
});
