import { test, expect } from "@playwright/test";
import { installSessionStorageFixture, ready, edit, readJournal, refresh, day } from "./helpers/session-full-app-storage-fixture.mjs";
const panel = page => page.locator('[data-session-working-recovery]');
const status = page => page.locator('[data-platform-autosave-status]');
async function open(page) { await page.getByRole("button", { name: "Review local saves", exact: true }).click(); }
async function download(page) {
  const event = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: "Download unsaved work" }).click();
  const file = await event, stream = await file.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks));
}

test("full app exports exact latest unsaved work and retries unchanged text without claiming central saving", async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await page.evaluate(() => { window.__storageFault.journal = true; });
  await edit(page, "First memory version"); await expect(status(page)).toContainText("Not saved on this device");
  await edit(page, "Latest memory version"); await expect(status(page)).toContainText("Not saved on this device");
  const exact = await page.evaluate(() => window.footballScienceCentralState.getSessionWorkingCopy());
  expect(JSON.parse(exact.value).sessions[day].blocks[0].objective).toBe("Latest memory version");
  await open(page);
  await expect(panel(page)).toContainText("Unsaved work in this tab");
  await page.screenshot({ path: "/private/tmp/fs-session-working-desktop.png" });
  expect(await download(page)).toMatchObject({ schema: "football-science-session-working-copy-v1", ...exact });
  expect(server.writes).toEqual([]); expect(await readJournal(page)).toEqual([]);
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(panel(page)).toContainText("Unsaved work remains");
  expect(await download(page)).toMatchObject(exact);
  await page.evaluate(() => { window.__storageFault.journal = false; });
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(panel(page)).toContainText("Saved on this device");
  await expect.poll(() => readJournal(page)).toHaveLength(1);
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  expect(server.effects).toBe(0);
  await expect(status(page)).not.toHaveClass(/is-saved/);
  server.reject = false;
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => server.effects).toBe(1);
  await expect.poll(() => readJournal(page)).toEqual([]);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Latest memory version");
  await expect(status(page)).toHaveClass(/is-saved/);
});

test("retry retains peer conflict and export still works when review storage cannot be read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("footballscience-install-app-prefs-v1", JSON.stringify({ dismissedAt: "2026-10-14T12:00:00Z" })));
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await page.evaluate(() => { window.__storageFault.journal = true; });
  await edit(page, "Unsaved local choice"); await expect(status(page)).toContainText("Not saved on this device");
  const exact = await page.evaluate(() => window.footballScienceCentralState.getSessionWorkingCopy());
  server.value.sessions[day].blocks[0].objective = "Colleague's accepted choice"; server.revision++;
  await refresh(page);
  // The memory panel must not depend on reading the durable review store.
  await page.evaluate(() => {
    const getAll = IDBObjectStore.prototype.getAll;
    window.__restoreReviewReads = () => { IDBObjectStore.prototype.getAll = getAll; };
    IDBObjectStore.prototype.getAll = function(...args) {
      if (this.transaction.db.name === "football-science-data-safety-v1") throw new DOMException("Read denied", "SecurityError");
      return getAll.apply(this, args);
    };
  });
  await open(page);
  await expect.poll(() => page.locator("dialog.session-save-review").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: "/private/tmp/fs-session-working-mobile.png" });
  expect(await download(page)).toMatchObject(exact);
  expect(server.effects).toBe(0);
  await page.evaluate(() => { window.__restoreReviewReads(); window.__storageFault.journal = false; });
  server.reject = false;
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(["review"]);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Colleague's accepted choice");
  expect(server.effects).toBe(0);
  await expect(status(page)).not.toHaveClass(/is-saved/);
});

test("retrying newer volatile work does not resolve or remove an older review", async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await edit(page, "Older conflicting work");
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  server.value.sessions[day].blocks[0].objective = "Accepted peer"; server.revision++; server.reject = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(["review"]);
  const [older] = await readJournal(page);
  await refresh(page);
  await page.evaluate(() => { window.__storageFault.journal = true; });
  const title = page.locator('[data-session-field="title"]').first();
  await title.fill("Newer unsaved title"); await title.dispatchEvent("change");
  await expect(status(page)).toContainText("Not saved on this device");
  await open(page);
  const copy = await download(page);
  expect(JSON.parse(copy.value).sessions[day].blocks[0]).toMatchObject({ title: "Newer unsaved title", objective: "Accepted peer" });
  await page.evaluate(() => { window.__storageFault.journal = false; });
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(panel(page)).toContainText("Saved on this device");
  await expect.poll(async () => (await readJournal(page)).length).toBe(2);
  expect((await readJournal(page)).find(row => row.change.id === older.change.id)).toEqual(older);
  expect(server.effects).toBe(0);
  await expect(status(page)).not.toHaveClass(/is-saved/);
});

async function panelHarness(page) {
  await page.route("**/qa/session-working-panel", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("/qa/session-working-panel");
  await page.evaluate(async () => {
    const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
    window.__allowed = true; window.__retries = 0; window.__exports = 0;
    window.__working = { scope: "actor:team", owner: "actor:org:team:role", token: "generation-a", value: "Exact A" };
    const create = URL.createObjectURL;
    URL.createObjectURL = (...args) => { window.__exports++; return create(...args); };
    await openSessionSaveReview({ document, bridge: { hydrate: async () => false }, legacy: {},
      canReview: () => window.__allowed, working: { get: () => window.__working,
        retry: () => { window.__retries++; return new Promise(resolve => { window.__finishRetry = resolve; }); } } });
  });
}

test("user change closes recovery and stale controls cannot export or retry another owner's copy", async ({ page }) => {
  await panelHarness(page);
  await page.evaluate(() => {
    window.__staleButtons = [...document.querySelector('[data-session-working-recovery]').querySelectorAll("button")];
    window.__allowed = false;
    window.dispatchEvent(new Event("platform:user-change"));
    window.__staleButtons.forEach(button => button.click());
  });
  await expect(page.locator("dialog.session-save-review")).toHaveCount(0);
  expect(await page.evaluate(() => ({ retries: window.__retries, exports: window.__exports }))).toEqual({ retries: 0, exports: 0 });
});

test("late older retry keeps the newer working generation available for download", async ({ page }) => {
  await panelHarness(page);
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Retry saving", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    window.__working = { ...window.__working, token: "generation-b", value: "Exact B" };
    window.__finishRetry({ ok: true });
  });
  await expect(panel(page)).toContainText("Unsaved work remains");
  expect(await download(page)).toMatchObject({ token: "generation-b", value: "Exact B" });
  expect(await page.evaluate(() => window.__retries)).toBe(1);
});


test("a stalled local retry cannot block downloading the current working copy", async ({ page }) => {
  await panelHarness(page);
  await panel(page).getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Retry saving", exact: true })).toBeDisabled();
  expect(await download(page)).toMatchObject({ token: "generation-a", value: "Exact A" });
  expect(await page.evaluate(() => window.__retries)).toBe(1);
  await page.evaluate(() => { window.__working = { ...window.__working, token: "generation-b", value: "Exact B" }; });
  await panel(page).getByRole("button", { name: "Download unsaved work" }).click();
  await expect(panel(page)).toContainText("Work or access changed");
  expect(await page.evaluate(() => window.__exports)).toBe(1);
  expect(await download(page)).toMatchObject({ token: "generation-b", value: "Exact B" });
  await page.evaluate(() => { window.__finishRetry({ ok: false }); });
  await expect(panel(page)).toContainText("Unsaved work remains");
});


test("first recovery opening and exact download work after every network request is blocked", async ({ page, context }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await page.evaluate(() => { window.__storageFault.journal = true; });
  await edit(page, "Offline memory copy"); await expect(status(page)).toContainText("Not saved on this device");
  const exact = await page.evaluate(() => window.footballScienceCentralState.getSessionWorkingCopy());
  await page.route("**/*", route => route.abort("internetdisconnected"));
  await context.setOffline(true);
  await page.evaluate(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key === "football-session-planner-v3") throw new DOMException("Cache read denied", "SecurityError");
      return get.call(this, key);
    };
  });
  await open(page);
  await expect(panel(page)).toBeVisible();
  expect(await panel(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 248, 231)");
  expect(await download(page)).toMatchObject(exact);
  expect(await readJournal(page)).toEqual([]);
  expect(server.effects).toBe(0);
  await expect(status(page)).not.toHaveClass(/is-saved/);
});
