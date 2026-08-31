import { expect } from "@playwright/test";

const activeScoutingWorkspaceSelector = '[data-workspace-view="scouting"].is-active';

/**
 * Resolve the current state and activate the current load trigger in one browser
 * task. Do not split this into a readiness check followed by locator.click():
 * Scouting legitimately replaces the load panel while its async state settles.
 */
export async function startScoutingDatabaseLoad(
  page,
  { startTimeout = 15_000 } = {}
) {
  let observedState = "waiting";
  await expect
    .poll(
      async () => {
        observedState = await page.evaluate((workspaceSelector) => {
          const workspace = document.querySelector(workspaceSelector);
          const isVisible = (node) => {
            if (!node) return false;
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          };
          const hasRows = Array.from(workspace?.querySelectorAll("[data-open-scouting-record]") || []).some(
            (node) => !node.disabled && isVisible(node)
          );
          if (hasRows) return "loaded";
          if (isVisible(workspace?.querySelector(":is(.scouting-database-progress, .scouting-database-loader)"))) {
            return "loading";
          }
          const loadTrigger = Array.from(
            workspace?.querySelectorAll("[data-scouting-load-database], [data-scouting-retry-database]") || []
          ).find((node) => !node.disabled && isVisible(node));
          if (!loadTrigger) return "waiting";
          loadTrigger.click();
          return "clicked";
        }, activeScoutingWorkspaceSelector);
        return observedState;
      },
      {
        message: "Scouting database never became loaded, loading, or explicitly startable",
        timeout: startTimeout,
      }
    )
    .toMatch(/^(clicked|loading|loaded)$/);

  return observedState;
}

export async function waitForScoutingRows(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    (workspaceSelector) => {
      const workspace = document.querySelector(workspaceSelector);
      const grid = workspace?.querySelector("[data-scouting-record-grid]");
      if (!grid) return false;
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const rows = Array.from(grid.querySelectorAll("[data-open-scouting-record]")).filter(
        (node) => !node.disabled && isVisible(node)
      );
      return (
        rows.length > 0 &&
        !workspace.querySelector(":is(.scouting-database-progress, .scouting-database-loader)") &&
        !workspace.querySelector("[data-scouting-retry-database]")
      );
    },
    activeScoutingWorkspaceSelector,
    { timeout }
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const firstRow = page
    .locator(`${activeScoutingWorkspaceSelector} [data-scouting-record-grid] [data-open-scouting-record]:visible`)
    .first();
  await expect(firstRow).toBeEnabled({ timeout: 15_000 });
  return firstRow;
}
