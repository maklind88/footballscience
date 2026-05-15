import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";

const budgets = {
  openWorkspace: 1200,
  switchTab: 1000,
  loadDatabase: 5000,
  searchDatabase: 1000,
  filterDatabase: 1000,
  openProfile: 1000,
  favoriteToggle: 500,
  addToShadow: 1000,
  closeProfile: 500,
};

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

async function seedScoutingAccess(page) {
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
}

async function bootApp(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[scouting-favorite-performance]") || text.includes("[scouting-render-performance]")) {
      console.log(text);
    }
  });
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);
  expect(pageErrors).toEqual([]);
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measureInteraction(page, results, label, budgetMs, action, ready) {
  await nextPaint(page);
  const startedAt = await page.evaluate(() => performance.now());
  const actionStartedAt = await page.evaluate(() => performance.now());
  await action();
  const actionEndedAt = await page.evaluate(() => performance.now());
  await ready();
  await nextPaint(page);
  const durationMs = await page.evaluate((start) => performance.now() - start, startedAt);
  const actionMs = Math.round(actionEndedAt - actionStartedAt);
  const rounded = Math.round(durationMs);
  results.push({ label, ms: rounded, actionMs, budgetMs });
  console.log(`[scouting-click-performance] ${label}: ${rounded}ms / ${budgetMs}ms (action ${actionMs}ms)`);
  expect(durationMs, `${label} took ${rounded}ms, budget ${budgetMs}ms`).toBeLessThanOrEqual(budgetMs);
}

async function getVisibleCenter(locator) {
  const box = await locator.boundingBox();
  expect(box, "Expected a visible clickable bounding box.").toBeTruthy();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function clickElementAtPoint(page, point, selector) {
  return page.evaluate(
    ({ x, y, targetSelector }) => {
      const target = document.elementFromPoint(x, y)?.closest(targetSelector);
      if (!target) {
        throw new Error(`No clickable ${targetSelector} at measured point.`);
      }
      const result = {
        text: target.textContent.trim(),
        inProfile: Boolean(target.closest("[data-scouting-profile-modal]")),
      };
      target.click();
      return result;
    },
    { x: point.x, y: point.y, targetSelector: selector }
  );
}

async function waitForActiveScoutingTab(page, tabId) {
  await expect(page.locator(`.scouting-tab[data-scouting-tab="${tabId}"]`).first()).toHaveClass(/is-active/);
  await expect(page.locator('[data-workspace-view="scouting"].is-active')).toBeVisible();
}

async function waitForScoutingRows(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => {
      const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
      const grid = workspace?.querySelector("[data-scouting-record-grid]");
      if (!grid) {
        return false;
      }
      const rows = Array.from(grid.querySelectorAll("[data-open-scouting-record]")).filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return !node.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
      return rows.length > 0 && !workspace.querySelector(".scouting-database-loader") && !workspace.querySelector("[data-scouting-retry-database]");
    },
    null,
    { timeout }
  );
  await nextPaint(page);
  const firstRow = page.locator('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]:visible').first();
  await expect(firstRow).toBeEnabled({ timeout: 15_000 });
  return firstRow;
}

async function getStableSearchTerm(row) {
  const rowText = await row.innerText();
  return (
    rowText
      .split(/\s+/)
      .map((part) => part.replace(/[^a-z0-9]/gi, ""))
      .find((part) => part.length >= 3)
      ?.slice(0, 4)
      .toLowerCase() || "a"
  );
}

async function getMatchingPositionFilter(page) {
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

async function waitForProfileReady(page, recordId) {
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
        ? controls.filter(
            (control) =>
              control.getAttribute("data-toggle-scouting-favorite") === targetRecordId ||
              control.getAttribute("data-add-scouting-record-to-shadow") === targetRecordId
          )
        : controls;
      const hasFavorite = expectedControls.some((control) => control.hasAttribute("data-toggle-scouting-favorite"));
      const hasShadowAction = expectedControls.some((control) => control.hasAttribute("data-add-scouting-record-to-shadow"));
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        hasFavorite &&
        hasShadowAction &&
        expectedControls.every((control) => !control.disabled)
      );
    },
    recordId,
    { timeout: 30_000 }
  );
  return profileModal;
}

async function clickScoutingTab(page, results, tabId) {
  const tab = page.locator(`.scouting-tab[data-scouting-tab="${tabId}"]`).first();
  if ((await tab.count()) === 0) {
    return;
  }
  await measureInteraction(
    page,
    results,
    `scouting tab: ${tabId}`,
    budgets.switchTab,
    async () => {
      await tab.click();
    },
    async () => {
      await waitForActiveScoutingTab(page, tabId);
    }
  );
}

test("Scouting critical clicks stay within interaction budgets", async ({ page }) => {
  test.setTimeout(240_000);
  await seedScoutingAccess(page);
  await bootApp(page);

  const results = [];
  await measureInteraction(
    page,
    results,
    "open scouting workspace",
    budgets.openWorkspace,
    async () => {
      await page.locator('[data-open-workspace="scouting"]:visible').first().click();
    },
    async () => {
      await expect(page.locator('[data-workspace-view="scouting"].is-active')).toBeVisible();
      await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "scouting");
    }
  );

  await clickScoutingTab(page, results, "database");

  const loadButton = page.locator("[data-scouting-load-database], [data-scouting-retry-database]").first();
  await measureInteraction(
    page,
    results,
    "load scouting database",
    budgets.loadDatabase,
    async () => {
      if ((await loadButton.count()) > 0) {
        await expect(loadButton).toBeEnabled({ timeout: 15_000 });
        await loadButton.click();
      }
    },
    async () => {
      await waitForScoutingRows(page, { timeout: budgets.loadDatabase });
    }
  );
  const fallbackDatabase = await page.evaluate(() => {
    const database = window.__footballScienceScoutingDatabase || {};
    return {
      source: database.source || "",
      records: Array.isArray(database.records) ? database.records.length : 0,
      total: Number(database.page?.total) || 0,
    };
  });
  expect(fallbackDatabase.source).toBe("worker");
  expect(fallbackDatabase.records).toBeLessThanOrEqual(50);
  expect(fallbackDatabase.total).toBeGreaterThan(fallbackDatabase.records);

  const firstRow = await waitForScoutingRows(page);
  const searchTerm = await getStableSearchTerm(firstRow);
  const queryInput = page.locator('[data-scouting-database-search-form] input[name="query"]').first();
  await expect(queryInput).toBeEnabled({ timeout: 15_000 });
  await queryInput.fill(searchTerm);
  await measureInteraction(
    page,
    results,
    "database search submit",
    budgets.searchDatabase,
    async () => {
      await queryInput.press("Enter");
    },
    async () => {
      await expect(queryInput).toHaveValue(searchTerm);
      await waitForScoutingRows(page, { timeout: budgets.searchDatabase });
    }
  );

  const positionSelect = page.locator('[data-scouting-filter="position"]').first();
  const matchingPosition = await getMatchingPositionFilter(page);
  if ((await positionSelect.count()) > 0 && matchingPosition) {
    await measureInteraction(
      page,
      results,
      "database position filter",
      budgets.filterDatabase,
      async () => {
        await positionSelect.selectOption(matchingPosition);
      },
      async () => {
        await waitForScoutingRows(page, { timeout: budgets.filterDatabase });
      }
    );
  }

  const profileRow = await waitForScoutingRows(page);
  const recordId = await profileRow.getAttribute("data-open-scouting-record");
  await measureInteraction(
    page,
    results,
    "open scouting profile",
    budgets.openProfile,
    async () => {
      await profileRow.click();
    },
    async () => {
      await waitForProfileReady(page, recordId);
    }
  );

  const profileModal = page.locator("[data-scouting-profile-modal]").first();
  const favoriteButton = profileModal.locator("[data-toggle-scouting-favorite]").first();
  const favoriteRecordId = await favoriteButton.getAttribute("data-toggle-scouting-favorite");
  const favoriteBefore = (await favoriteButton.innerText()).trim();
  const favoritePoint = await getVisibleCenter(favoriteButton);
  await page.evaluate(() => {
    window.__footballScienceScoutingPerfDebug = true;
  });
  await measureInteraction(
    page,
    results,
    "toggle scouting favorite",
    budgets.favoriteToggle,
    async () => {
      const clickTarget = await clickElementAtPoint(page, favoritePoint, `[data-toggle-scouting-favorite="${favoriteRecordId}"]`);
      console.log(`[scouting-click-performance] favorite target: ${JSON.stringify(clickTarget)}`);
    },
    async () => {
      await page.waitForFunction(
        ({ recordId: targetRecordId, previousText }) => {
          const modal = document.querySelector("[data-scouting-profile-modal]");
          const button = modal?.querySelector(`[data-toggle-scouting-favorite="${CSS.escape(targetRecordId)}"]`);
          return Boolean(button && !button.disabled && button.textContent.trim() !== previousText);
        },
        { recordId: favoriteRecordId, previousText: favoriteBefore },
        { timeout: budgets.favoriteToggle }
      );
    }
  );

  const addToShadowButton = profileModal.locator("[data-add-scouting-record-to-shadow]").first();
  const roleStack = profileModal.locator("[data-scouting-profile-role-stack]").first();
  const roleCountBefore = Number((await roleStack.innerText()).trim()) || 0;
  const addToShadowPoint = await getVisibleCenter(addToShadowButton);
  await measureInteraction(
    page,
    results,
    "add profile to Shadow XI",
    budgets.addToShadow,
    async () => {
      await clickElementAtPoint(page, addToShadowPoint, "[data-add-scouting-record-to-shadow]");
    },
    async () => {
      await expect
        .poll(async () => Number((await roleStack.innerText()).trim()) || 0, { timeout: budgets.addToShadow })
        .toBeGreaterThan(roleCountBefore);
    }
  );

  const closeProfilePoint = await getVisibleCenter(profileModal.locator(".scouting-profile-close"));
  await measureInteraction(
    page,
    results,
    "close scouting profile",
    budgets.closeProfile,
    async () => {
      await clickElementAtPoint(page, closeProfilePoint, ".scouting-profile-close");
    },
    async () => {
      await expect(page.locator("[data-scouting-profile-modal]")).toBeHidden();
    }
  );

  await clickScoutingTab(page, results, "shadow-xi");
  await expect(page.locator(".scouting-shadow-player").first()).toBeVisible({ timeout: 30_000 });
  await clickScoutingTab(page, results, "lists");
  await clickScoutingTab(page, results, "reports");
  await clickScoutingTab(page, results, "database");

  console.table(results);
  await test.info().attach("scouting-click-performance.json", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
});
