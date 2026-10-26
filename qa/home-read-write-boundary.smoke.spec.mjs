import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture, qaCoach } from "./helpers/set-pieces-central-fixture.mjs";

const seenKey = "football-dashboard-notification-seen-v1";
const tasksKey = "football-dashboard-tasks-v1";

for (const quotaFull of [false, true]) {
test(`Home boot, central refresh, storage events and reload do not write an unchanged notification cursor (Home cache full: ${quotaFull})`, async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  if (quotaFull) await page.addInitScript(key => {
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (this === localStorage && name === key) throw new DOMException("Synthetic full cache", "QuotaExceededError");
      return nativeSet.call(this, name, value);
    };
  }, seenKey);
  const seen = JSON.stringify({ [qaCoach.id]: "2026-10-20T10:00:00.000Z" });
  const writes = [];
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true,
      entries: { [seenKey]: seen, [tasksKey]: "[]" },
      metadata: { [seenKey]: { revision: 10 }, [tasksKey]: { revision: 10 } }, absentKeys: [],
    } });
    const body = route.request().postDataJSON();
    if (body.key === seenKey) {
      writes.push(body);
      return route.fulfill({ status: 409, json: { ok: false, currentRevision: 11, reason: "Synthetic newer central notification cursor" } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  for (const reload of [false, true]) {
    if (reload) await page.reload({ waitUntil: "domcontentloaded" });
    else await page.goto("/?workspace=home", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
    await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "home");
    await page.evaluate(async () => {
      await window.footballScienceCentralState.hydrate({ fresh: true });
      for (let i = 0; i < 4; i++) window.dispatchEvent(new StorageEvent("storage", { key: "football-dashboard-tasks-v1" }));
    });
    // Drain the production 120 ms write debounce and render reload timers.
    await page.waitForTimeout(500);
    expect(writes).toEqual([]);
    expect(await page.evaluate(key => localStorage.getItem(key), seenKey)).toBe(seen);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync === true, seenKey)).toBe(false);
  }
});

}

for (const failFirstSave of [false, true]) {
test(`new Home notifications still save and survive reload (failed first request: ${failFirstSave})`, async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  let seen = { [qaCoach.id]: "2026-10-20T10:00:00.000Z", colleague: "2026-10-20T09:00:00.000Z" };
  let tasks = [], taskRevision = 20, revision = 10, deny = failFirstSave;
  const writes = [];
  const latest = "2026-10-20T11:00:00.000Z";
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true,
      entries: { [seenKey]: JSON.stringify(seen), [tasksKey]: JSON.stringify(tasks) },
      metadata: { [seenKey]: { revision }, [tasksKey]: { revision: taskRevision } }, absentKeys: [],
    } });
    const body = route.request().postDataJSON();
    if (body.key !== seenKey) return route.fulfill({ json: { ok: true } });
    writes.push(body);
    if (deny) return route.abort("failed");
    if (body.baseRevision !== revision) return route.fulfill({ status: 409, json: { ok: false, currentRevision: revision } });
    seen = JSON.parse(body.value); revision++;
    return route.fulfill({ json: { ok: true, key: seenKey, value: body.value, metadata: { revision } } });
  });
  await page.goto("/?workspace=home", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  taskRevision++;
  tasks = [{ id: "new-task", title: "Synthetic new assignment", status: "open", scope: "team",
    assignedTo: qaCoach.id, createdBy: "colleague", createdAt: latest }];
  await page.evaluate(async () => {
    await window.footballScienceCentralState.hydrate({ fresh: true });
    window.dispatchEvent(new StorageEvent("storage", { key: "football-dashboard-tasks-v1" }));
  });
  expect(await page.evaluate(key => localStorage.getItem(key), tasksKey)).toContain("Synthetic new assignment");
  await expect.poll(() => writes.length).toBeGreaterThan(0);
  if (failFirstSave) {
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync, seenKey)).toBe(true);
    expect(seen[qaCoach.id]).not.toBe(latest);
    deny = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
  }
  await expect.poll(() => seen[qaCoach.id]).toBe(latest);
  expect(seen.colleague).toBe("2026-10-20T09:00:00.000Z");
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync, seenKey)).toBe(false);
  const acceptedWrites = writes.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  await page.waitForTimeout(500);
  expect(writes).toHaveLength(acceptedWrites);
});
}
