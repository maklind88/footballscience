import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";
const scoutingStorageKey = "football-scouting-v1";
const releaseQaLifecycleEvents = new Set(["qa", "qa:deploy"]);
const strictScoutingPerf = process.env.FOOTBALL_SCIENCE_STRICT_SCOUTING_PERF === "1";
const releaseQaBudgets =
  !strictScoutingPerf && (Boolean(process.env.CI) || releaseQaLifecycleEvents.has(process.env.npm_lifecycle_event || ""));

function interactionBudget(milliseconds) {
  return releaseQaBudgets ? Math.ceil(milliseconds * 3) : milliseconds;
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page
      .evaluate(() => {
        document
          .querySelector(
            "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close], [data-dashboard-news-dismiss]"
          )
          ?.click?.();
      })
      .catch(() => {});
    await page.waitForTimeout(80);
  }
}

async function seedScoutingAccess(page) {
  await page.addInitScript(
    ({ hubKey, scoutKey }) => {
      window.localStorage.removeItem(scoutKey);
      window.localStorage.setItem(
        hubKey,
        JSON.stringify({
          activeWorkspaceId: "home",
          workspaceAccess: {
            home: { view: ["admin", "coach"], edit: ["admin", "coach"] },
            scouting: { view: ["admin", "coach"], edit: ["admin", "coach"] },
          },
        })
      );
    },
    { hubKey: workspaceHubKey, scoutKey: scoutingStorageKey }
  );
}

async function bootApp(page, browserErrors) {
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !/favicon/i.test(text)) {
      browserErrors.push(text);
    }
  });
  page.on("dialog", async (dialog) => {
    await dialog.dismiss().catch(() => {});
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);
}

async function measure(page, results, label, budgetMs, action, ready = async () => {}) {
  const effectiveBudgetMs = interactionBudget(budgetMs);
  await nextPaint(page);
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  await ready();
  await nextPaint(page);
  const ms = Math.round(await page.evaluate((start) => performance.now() - start, startedAt));
  results.push({ label, ms, budgetMs: effectiveBudgetMs });
  console.log(`[scouting-interaction-audit] ${label}: ${ms}ms / ${effectiveBudgetMs}ms`);
  expect(ms, `${label} took ${ms}ms, budget ${effectiveBudgetMs}ms`).toBeLessThanOrEqual(effectiveBudgetMs);
}

async function openScouting(page, results) {
  await measure(
    page,
    results,
    "open scouting",
    1200,
    async () => {
      await page.locator('[data-open-workspace="scouting"]:visible').first().click();
    },
    async () => {
      await expect(page.locator('[data-workspace-view="scouting"].is-active')).toBeVisible({ timeout: 10_000 });
    }
  );
}

async function clickScoutingTab(page, results, tabId, budgetMs = 1000, options = {}) {
  const tab = page.locator(`.scouting-tab[data-scouting-tab="${tabId}"]`).first();
  if ((await tab.count()) === 0) {
    return;
  }
  const label = options.label || `${options.phase ? `${options.phase}:` : ""}tab:${tabId}`;
  await measure(
    page,
    results,
    label,
    budgetMs,
    async () => {
      await tab.click();
    },
    async () => {
      await expect(tab).toHaveClass(/is-active/, { timeout: 8000 });
    }
  );
}

function logScoutingTabTimingSummary(results) {
  const firstTabResults = results.filter((item) => item.label.startsWith("first:tab:"));
  const warmTabResults = results.filter((item) => item.label.startsWith("warm:tab:"));
  const slowest = (items) => [...items].sort((a, b) => b.ms - a.ms)[0];
  const slowestFirst = slowest(firstTabResults);
  const slowestWarm = slowest(warmTabResults);
  if (slowestFirst) {
    console.log(`[scouting-interaction-audit] slowest first tab: ${slowestFirst.label} ${slowestFirst.ms}ms`);
  }
  if (slowestWarm) {
    console.log(`[scouting-interaction-audit] slowest warm tab: ${slowestWarm.label} ${slowestWarm.ms}ms`);
  }
}

async function closeScoutingOverlays(page) {
  const selectors = [
    ".scouting-profile-close",
    "[data-close-scouting-role-models]",
    "[data-close-scouting-report-builder]",
    "[data-close-scouting-saved-views]",
    "[data-close-scouting-settings-panel]",
  ];
  for (const selector of selectors) {
    const trigger = page.locator(selector).first();
    if ((await trigger.count()) && (await trigger.isVisible().catch(() => false))) {
      await trigger.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(50);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await nextPaint(page);
}

async function waitForScoutingRows(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => {
      const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
      const grid = workspace?.querySelector("[data-scouting-record-grid]");
      if (!grid) {
        return false;
      }
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rows = Array.from(grid.querySelectorAll("[data-open-scouting-record]")).filter((node) => !node.disabled && isVisible(node));
      return rows.length > 0 && !workspace.querySelector(":is(.scouting-database-progress, .scouting-database-loader)") && !workspace.querySelector("[data-scouting-retry-database]");
    },
    null,
    { timeout }
  );
  await nextPaint(page);
  await expect(
    page.locator('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]:visible').first()
  ).toBeEnabled({ timeout: 15_000 });
}

async function readScoutingDatabaseLoadState(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
    const isVisible = (node) => {
      if (!node) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const hasRows = Array.from(workspace?.querySelectorAll("[data-open-scouting-record]") || []).some(
      (node) => !node.disabled && isVisible(node)
    );
    if (hasRows) {
      return "loaded";
    }
    if (isVisible(workspace?.querySelector(":is(.scouting-database-progress, .scouting-database-loader)"))) {
      return "loading";
    }
    const loadTrigger = Array.from(
      workspace?.querySelectorAll("[data-scouting-load-database], [data-scouting-retry-database]") || []
    ).find((node) => !node.disabled && isVisible(node));
    return loadTrigger ? "startable" : "waiting";
  });
}

async function startScoutingDatabaseLoad(page) {
  let state = "waiting";
  await expect
    .poll(
      async () => {
        state = await readScoutingDatabaseLoadState(page);
        return state;
      },
      {
        message: "Scouting database never became loaded, loading, or explicitly startable",
        timeout: interactionBudget(15_000),
      }
    )
    .toMatch(/^(loaded|loading|startable)$/);

  if (state !== "startable") {
    return;
  }

  const loadTrigger = page
    .locator(
      '[data-workspace-view="scouting"].is-active [data-scouting-load-database]:visible, [data-workspace-view="scouting"].is-active [data-scouting-retry-database]:visible'
    )
    .first();
  await expect(loadTrigger).toBeVisible();
  await expect(loadTrigger).toBeEnabled();
  await loadTrigger.click();

  await expect
    .poll(() => readScoutingDatabaseLoadState(page), {
      message: "Scouting database did not enter loading or loaded after the explicit load click",
      timeout: interactionBudget(5_000),
    })
    .toMatch(/^(loading|loaded)$/);
}

async function ensureDatabaseRows(page, results) {
  await clickScoutingTab(page, results, "database", 1000, { phase: "setup" });
  await measure(
    page,
    results,
    "load database",
    10_000,
    async () => {
      await startScoutingDatabaseLoad(page);
    },
    async () => {
      await waitForScoutingRows(page, { timeout: interactionBudget(45_000) });
    }
  );
}

test("Scouting interaction audit covers broad module clicks", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = [];
  const results = [];
  await seedScoutingAccess(page);
  await bootApp(page, browserErrors);
  await openScouting(page, results);

  for (const tabId of ["shadow-xi", "my-team", "database", "lists", "comparison", "reports", "opposition"]) {
    await clickScoutingTab(page, results, tabId, 1000, { phase: "first" });
  }

  await ensureDatabaseRows(page, results);
  await measure(
    page,
    results,
    "database advanced filters",
    800,
    async () => {
      await page.locator("[data-toggle-scouting-advanced-filters]").first().click();
    },
    async () => {
      await expect(page.locator(".scouting-database-advanced-filters").first()).toHaveClass(/is-open/);
    }
  );
  await measure(page, results, "database advanced mode", 900, async () => {
    await page.locator("[data-toggle-scouting-database-mode]:visible").first().click();
  });

  const firstRecord = page.locator('[data-workspace-view="scouting"].is-active [data-scouting-record-grid] [data-open-scouting-record]:visible').first();
  await measure(
    page,
    results,
    "profile open",
    1000,
    async () => {
      await firstRecord.click();
    },
    async () => {
      await expect(page.locator("[data-scouting-profile-modal]").first()).toBeVisible({ timeout: 10_000 });
    }
  );
  for (const profileTab of ["overview", "performance", "squad", "reports", "contacts", "history", "market"]) {
    const trigger = page.locator(`[data-scouting-profile-tab="${profileTab}"]`).first();
    if ((await trigger.count()) && (await trigger.isVisible().catch(() => false))) {
      await measure(page, results, `profile tab:${profileTab}`, 900, async () => trigger.click());
    }
  }
  await measure(
    page,
    results,
    "profile close",
    600,
    async () => {
      await page.locator(".scouting-profile-close").first().click();
    },
    async () => {
      await expect(page.locator("[data-scouting-profile-modal]").first()).toBeHidden({ timeout: 5000 });
    }
  );

  await clickScoutingTab(page, results, "shadow-xi", 1000, { phase: "warm" });
  const boardVisibility = page.locator("[data-scouting-shadow-board-visibility]:visible").first();
  if ((await boardVisibility.count()) && (await boardVisibility.isEnabled().catch(() => false))) {
    await measure(
      page,
      results,
      "shadow board visibility",
      800,
      async () => {
        await boardVisibility.selectOption("team");
      },
      async () => {
        await expect(boardVisibility).toHaveValue("team");
      }
    );
  }
  await measure(
    page,
    results,
    "shadow slot to database",
    900,
    async () => {
      await page.locator("[data-select-scouting-shadow-slot]").first().click();
    },
    async () => {
      await expect(page.locator('.scouting-tab[data-scouting-tab="database"]').first()).toHaveClass(/is-active/, { timeout: 8000 });
    }
  );

  await clickScoutingTab(page, results, "comparison", 1000, { phase: "warm" });
  await measure(
    page,
    results,
    "comparison metric search",
    900,
    async () => {
      await page.locator("[data-scouting-comparison-metric-summary]").first().click();
      await page.locator("[data-scouting-comparison-metric-search]:visible").first().fill("minutes");
    },
    async () => {
      await expect(page.locator("[data-scouting-comparison-metric-search]:visible").first()).toHaveValue("minutes");
    }
  );

  await clickScoutingTab(page, results, "my-team", 1000, { phase: "warm" });
  const myTeamFormation = page.locator("[data-scouting-my-team-formation]").first();
  if ((await myTeamFormation.count()) && (await myTeamFormation.isVisible().catch(() => false))) {
    await measure(
      page,
      results,
      "my-team formation",
      800,
      async () => {
        await myTeamFormation.selectOption("4-2-3-1");
      },
      async () => {
        await expect(myTeamFormation).toHaveValue("4-2-3-1");
      }
    );
  }
  const myTeamSpider = page.locator("[data-scouting-my-team-spider-shell] summary").first();
  if ((await myTeamSpider.count()) && (await myTeamSpider.isVisible().catch(() => false))) {
    await measure(
      page,
      results,
      "my-team spider",
      800,
      async () => {
        await myTeamSpider.click();
      },
      async () => {
        await expect(page.locator(".scouting-my-team-spider-panel").first()).toBeVisible({ timeout: 5000 });
      }
    );
  }

  await clickScoutingTab(page, results, "lists", 1000, { phase: "warm" });
  const listForm = page.locator("[data-scouting-list-form]").first();
  if ((await listForm.count()) && (await listForm.isVisible().catch(() => false))) {
    await measure(
      page,
      results,
      "lists create",
      900,
      async () => {
        await listForm.locator('input[name="name"]').fill(`Audit ${Date.now()}`);
        await listForm.locator('button[type="submit"]').click();
      },
      async () => {
        await expect(page.locator(".scouting-list-card").first()).toBeVisible({ timeout: 5000 });
      }
    );
  }

  await clickScoutingTab(page, results, "reports", 1000, { phase: "warm" });
  const reportBuilder = page.locator("[data-open-scouting-report-builder]").first();
  if ((await reportBuilder.count()) && (await reportBuilder.isVisible().catch(() => false))) {
    await measure(
      page,
      results,
      "report builder open",
      900,
      async () => {
        await reportBuilder.click();
      },
      async () => {
        await expect(page.locator("[data-scouting-report-builder-overlay]").first()).toBeVisible({ timeout: 5000 });
      }
    );
    await closeScoutingOverlays(page);
  }

  expect(browserErrors).toEqual([]);
  logScoutingTabTimingSummary(results);
  await test.info().attach("scouting-interaction-audit.json", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
});
