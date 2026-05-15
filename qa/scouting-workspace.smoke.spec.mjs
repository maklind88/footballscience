import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceHubKey = "football-workspace-hub-v3";
const qaDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(qaDir);

function getFallbackCompareRecordOutsideFirstPage() {
  const importSource = fs.readFileSync(path.join(projectRoot, "scouting-import-data.js"), "utf8");
  const jsonText = importSource.trim().replace(/^window\.__footballScienceScoutingDatabase=/, "").replace(/;$/, "");
  const database = JSON.parse(jsonText);
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
      const loader = workspace.querySelector(".scouting-database-loader");
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
  const loadButton = page.locator("[data-scouting-load-database], [data-scouting-retry-database]").first();
  if ((await loadButton.count()) > 0) {
    await expect(loadButton).toBeEnabled({ timeout: 15_000 });
    await loadButton.click();
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

  const modeToggle = page.locator("[data-toggle-scouting-database-mode]").first();
  await expect(modeToggle).toBeEnabled({ timeout: 15_000 });
  await modeToggle.click();
  await expect(page.locator(".scouting-compare-set").first()).toContainText(offPageRecord.name, { timeout: 30_000 });
});

test("Scouting My Team formation and squad placement stay stable", async ({ page }) => {
  test.setTimeout(120_000);
  await seedScoutingAccess(page);
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
