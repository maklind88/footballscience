import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";

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

test("Scouting database search, profile, favorite and Shadow XI flow stays stable", async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.removeItem("football-scouting-v1");
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
    { key: workspaceHubKey }
  );

  const boot = await bootApp(page);
  expect(boot.pageErrors).toEqual([]);

  await openWorkspace(page, "scouting");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "scouting");
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Shadow XI");

  await page.locator('.scouting-tab[data-scouting-tab="database"]').click();
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");
  await expect(page.locator("#dashboardModalRoot")).toBeHidden();

  await page.locator("[data-scouting-load-database]").click();
  await expect(page.locator("[data-scouting-record-grid] [data-open-scouting-record]").first()).toBeVisible({
    timeout: 45_000,
  });

  const queryInput = page.locator('[data-scouting-database-search-form] input[name="query"]').first();
  await queryInput.fill("sam");
  await queryInput.press("Enter");
  await expect(queryInput).toHaveValue("sam");
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");

  const positionSelect = page.locator('[data-scouting-filter="position"]').first();
  if ((await positionSelect.count()) > 0) {
    await positionSelect.selectOption({ index: 1 }).catch(() => {});
    await expect(page.locator("[data-scouting-record-grid] [data-open-scouting-record]").first()).toBeVisible({
      timeout: 45_000,
    });
  }
  await expect(page.locator(".scouting-tab.is-active")).toContainText("Database");

  await page.locator("[data-scouting-record-grid] [data-open-scouting-record]").first().click();
  const profileModal = page.locator("[data-scouting-profile-modal]").first();
  await expect(profileModal).toBeVisible();
  await expect(profileModal).toHaveAttribute("tabindex", "-1");
  const favoriteButton = profileModal.locator("[data-toggle-scouting-favorite]").first();
  await favoriteButton.click();
  await expect(favoriteButton).toContainText(/Favorited|Favorite/);

  await profileModal.locator("[data-add-scouting-record-to-shadow]").first().click();
  await expect(profileModal.locator("[data-scouting-profile-role-stack]")).toContainText("1", { timeout: 45_000 });
  await profileModal.locator(".scouting-profile-close").click();
  await expect(page.locator("[data-scouting-profile-modal]")).toBeHidden();
  const shadowTab = page.locator('.scouting-tab[data-scouting-tab="shadow-xi"]').first();
  await expect(shadowTab).toBeVisible();
  await shadowTab.click();
  await expect(shadowTab).toHaveClass(/is-active/);
  await expect(page.locator(".scouting-shadow-player").first()).toBeVisible({ timeout: 30_000 });
});
