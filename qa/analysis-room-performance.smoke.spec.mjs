import { test, expect } from "@playwright/test";
import { performanceSnapshot } from "./helpers/analysis-performance-snapshot.mjs";

async function openRoom(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1");
  await expect(page.locator("[data-video-analysis-library]")).toBeVisible();
  await page.evaluate((snapshot) => {
    const previous = window.fetch;
    window.performanceQaRequests = [];
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(url, location.origin);
      if (parsed.pathname !== "/api/analysis-room") return previous(url, options);
      window.performanceQaRequests.push({ query: parsed.search, method: options.method });
      return Response.json(snapshot);
    };
  }, performanceSnapshot());
  await page.getByRole("button", { name: "Team Performance", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team Performance", exact: true })).toBeVisible();
  await expect(page.locator(".team-performance")).toHaveAttribute("aria-busy", "false");
  return errors;
}
test("Analysis Room navigation reaches native statistics and returns to FS Player/Presentation", async ({ page }) => {
  const errors = await openRoom(page);
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByRole("region", { name: "Player involvement statistics" })).toContainText("Example Player A");
  await page.getByLabel("Period", { exact: true }).selectOption("2nd Half");
  await expect.poll(() => page.evaluate(() => window.performanceQaRequests.at(-1).query)).toContain("period=2nd+Half");
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.locator(".team-performance tbody tr")).toHaveCount(50);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.performanceQaRequests.at(-1).query)).toContain("offset=50");
  await page.getByRole("button", { name: "FS Player", exact: true }).click();
  await expect(page.locator(".team-performance")).toHaveCount(0);
  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await expect(page.locator("[data-video-analysis-presentation-module]")).toBeVisible();
  await page.getByRole("button", { name: "Team Performance", exact: true }).click();
  await expect(page.locator(".team-performance")).toBeVisible();
  expect(errors).toEqual([]);
});
for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`Team Performance layout and import review at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/analysis-room-performance-preview.html");
    await expect(page.locator(".team-performance-metrics")).toContainText("120");
    await expect(page.getByRole("navigation", { name: "Analysis Room sections" })).toHaveJSProperty("scrollLeft", 0);
    await page.getByLabel("Match", { exact: true }).selectOption("1");
    await expect(page.locator(".team-performance-metrics")).toContainText("60");
    await expect(page.getByLabel("Match", { exact: true })).toBeFocused();
    for (const name of ["Players", "Zones & corridors", "Events", "Overview"]) {
      await page.getByRole("navigation", { name: "Performance views" }).getByRole("button", { name, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
    await page.getByLabel("Version", { exact: true }).selectOption("55555555-5555-4555-8555-555555555555");
    await expect(page.getByText("Viewing an earlier saved version.")).toBeVisible();
    await page.getByRole("button", { name: "Check source update", exact: true }).click();
    await expect(page.getByRole("region", { name: "Import review" })).toBeVisible();
    await page.getByRole("button", { name: "Import version", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Version 3 imported");
    await expect(page.locator(".team-performance-source")).toContainText("Version 3");
    await expect(page.locator(".team-performance-metrics")).toContainText("126");
    await page.screenshot({ path: testInfo.outputPath(`team-performance-${viewport.width}.png`), fullPage: true });
  });
}
test("escaping protects imported labels", async ({ page }) => {
  await page.goto("/qa/analysis-room-performance-preview.html");
  const safe = await page.evaluate(async () => {
    const { renderTeamPerformance } = await import("/src/modules/analysis-room/team-performance-renderer.mjs");
    const { performanceSnapshot } = await import("/qa/helpers/analysis-performance-snapshot.mjs");
    const snapshot = performanceSnapshot(); snapshot.matches[0].opponent = '<img src=x onerror="alert(1)">';
    const host = document.createElement("div"); host.innerHTML = renderTeamPerformance({ snapshot, filters: {}, view: "matches" });
    return { images: host.querySelectorAll("img").length, text: host.textContent };
  });
  expect(safe.images).toBe(0); expect(safe.text).toContain("<img");
});
test("changing users clears saved state and rejects late responses from the previous user", async ({ page }) => {
  await page.goto("/qa/analysis-room-performance-preview.html");
  const result = await page.evaluate(async () => {
    const { createTeamPerformanceController } = await import("/src/modules/analysis-room/team-performance-controller.mjs");
    const { performanceSnapshot } = await import("/qa/helpers/analysis-performance-snapshot.mjs");
    const host = document.createElement("div");
    let userId = "first";
    const pending = [];
    const controller = createTeamPerformanceController(() => ({ currentUser: { id: userId } }), {
      request: (filters, command, signal) => new Promise((resolve) => pending.push({ resolve, signal })),
    });
    controller.mount(host);
    userId = "second"; controller.mount(host);
    const cleared = controller.getState().snapshot === null;
    pending[1].resolve({ ...performanceSnapshot(), owner: "second" });
    await Promise.resolve(); await Promise.resolve();
    pending[0].resolve({ ...performanceSnapshot(), owner: "first" });
    await Promise.resolve(); await Promise.resolve();
    const owner = controller.getState().snapshot.owner;
    controller.unmount();
    return { cleared, owner, aborted: pending[0].signal.aborted, unmounted: controller.getState().snapshot === null };
  });
  expect(result).toEqual({ cleared: true, owner: "second", aborted: true, unmounted: true });
});
