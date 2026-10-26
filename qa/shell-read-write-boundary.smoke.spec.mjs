import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";

const hubKey = "football-workspace-hub-v3";
const lastActiveKey = "football-workspace-last-active-local-v1";
const centralHub = { sidebarCollapsed: false, profile: { name: "Synthetic central profile" },
  workspaceAccess: { home: { view: ["admin", "coach"], edit: ["admin"] } } };

async function fixture(page, { absent = false, deny = false } = {}) {
  await installSetPiecesCentralFixture(page);
  const server = { value: absent ? null : JSON.stringify(centralHub), revision: absent ? 0 : 10, writes: [], deny };
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true,
      entries: server.value === null ? {} : { [hubKey]: server.value },
      metadata: server.value === null ? {} : { [hubKey]: { revision: server.revision } },
      absentKeys: server.value === null ? [hubKey] : [],
    } });
    const body = route.request().postDataJSON();
    if (body.key !== hubKey) return route.fulfill({ json: { ok: true } });
    server.writes.push(body);
    if (server.deny) return route.abort("failed");
    if (body.baseRevision !== server.revision) return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision } });
    server.value = body.value; server.revision++;
    return route.fulfill({ json: { ok: true, key: hubKey, value: server.value, metadata: { revision: server.revision } } });
  });
  return server;
}
async function ready(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
}
async function drain(page) {
  // Observe the 120 ms central write debounce and deferred render timers.
  await page.waitForTimeout(500);
}

for (const absent of [false, true]) {
test(`shell boot, navigation, history and reload never save normalized settings (central absent: ${absent})`, async ({ page }) => {
  const server = await fixture(page, { absent });
  const original = server.value;
  await page.goto("/?workspace=home", { waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "home");
  await drain(page);
  expect(server.writes).toEqual([]);
  await page.locator('[data-open-workspace="schedule"]').first().click();
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  expect(await page.evaluate(key => sessionStorage.getItem(key), lastActiveKey)).toBe("schedule");
  await page.goBack();
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "home");
  await page.goForward();
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await page.reload({ waitUntil: "domcontentloaded" }); await ready(page);
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
  await drain(page);
  expect(server.writes).toEqual([]);
  expect(server.value).toBe(original);
  expect(await page.evaluate(key => localStorage.getItem(key), hubKey)).toBe(original);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync === true, hubKey)).toBe(false);
});
}

for (const absent of [false, true]) {
for (const failFirstSave of [false, true]) {
test(`existing sidebar setting handler still saves across reload (failed request: ${failFirstSave}, initial absent: ${absent})`, async ({ page }) => {
  const server = await fixture(page, { absent, deny: failFirstSave });
  await page.goto("/?workspace=home", { waitUntil: "domcontentloaded" }); await ready(page);
  // The compatibility control is hidden in the current layout; exercise its real handler.
  await page.locator("#sidebarToggle").dispatchEvent("click");
  await expect(page.locator("#hubShell")).toHaveClass(/is-sidebar-collapsed/);
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  if (failFirstSave) {
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync, hubKey)).toBe(true);
    expect(Boolean(JSON.parse(server.value || "{}").sidebarCollapsed)).toBe(false);
    server.deny = false;
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(page);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
  }
  await expect.poll(() => Boolean(JSON.parse(server.value || "{}").sidebarCollapsed)).toBe(true);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync, hubKey)).toBe(false);
  const count = server.writes.length;
  await page.reload({ waitUntil: "domcontentloaded" }); await ready(page); await drain(page);
  await expect(page.locator("#hubShell")).toHaveClass(/is-sidebar-collapsed/);
  expect(server.writes).toHaveLength(count);
});
}
}
