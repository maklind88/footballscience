import { test, expect } from "@playwright/test";
import { key, draft, install, retain, list } from "./helpers/medical-draft-fixture.mjs";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";

async function setup(page, options = {}) {
  await page.goto("/medical-merge.js"); await install(page, options); await retain(page);
  await page.evaluate(value => {
    window.__reads = 0;
    window.__proof = { ok: true, private: true, scope: window.__scope, value: JSON.stringify(value), revision: 12 };
    window.footballScienceCentralState.readMedicalRecoveryState = async scope => {
      window.__reads++; if (scope !== window.__scope) throw new Error("Unexpected scope"); return window.__proof;
    };
    localStorage.setItem("synthetic-active-editor", "newer unsaved work");
  }, draft);
  await page.getByText(/^Copy from /).first().click();
}
const check = page => page.getByRole("button", { name: "Check against central copy", exact: true }).click();
const remove = page => page.getByRole("button", { name: "Remove this verified local copy", exact: true }).click();

test("explicit removal checks twice, commits both rows and frees capacity without changing the editor", async ({ page }) => {
  await setup(page, { maxCopies: 1 });
  await check(page); await expect(page.locator("#recovery")).toContainText("matches central version 12");
  expect(await list(page)).toHaveLength(1); // A read/check never retires work.
  await remove(page); await expect(page.locator("#recovery")).toContainText("One verified local recovery copy was removed");
  expect(await list(page)).toEqual([]);
  expect(await page.evaluate(() => window.__reads)).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("synthetic-active-editor"))).toBe("newer unsaved work");
  expect(await retain(page, { ...draft, note: "Next distinct copy" })).toBe(true);
  await page.reload(); await install(page);
  expect(await list(page)).toHaveLength(1);
});

for (const reason of ["different value", "older revision", "coach view", "wrong scope", "unavailable"]) {
  test(`a ${reason} does not permit removal`, async ({ page }) => {
    await setup(page); const before = await list(page);
    await page.evaluate(reason => {
      if (reason === "different value") window.__proof.value += " ";
      if (reason === "older revision") window.__proof.revision = 6;
      if (reason === "coach view") window.__proof.private = false;
      if (reason === "wrong scope") window.__proof.scope = "other-owner";
      if (reason === "unavailable") window.__proof = { ok: false };
    }, reason);
    await check(page);
    await expect(page.locator("#recovery")).toContainText(/kept.*review|kept; reconnect/);
    await expect(page.getByRole("button", { name: "Remove this verified local copy" })).toBeHidden();
    expect(await list(page)).toEqual(before);
  });
}

test("central changes after verification are discovered by the second read and keep the copy", async ({ page }) => {
  await setup(page); const before = await list(page); await check(page);
  await expect(page.locator("#recovery")).toContainText("matches central version 12");
  await page.evaluate(() => { window.__proof = { ...window.__proof, value: '{"records":[]}', revision: 13 }; });
  await remove(page); await expect(page.locator("#recovery")).toContainText("central copy differs");
  expect(await list(page)).toEqual(before); expect(await page.evaluate(() => window.__reads)).toBe(2);
});

for (const change of ["account", "permission", "new edit"]) {
  test(`${change} during the verification request prevents retirement`, async ({ page }) => {
    await setup(page); const before = await list(page); await check(page);
    await expect(page.locator("#recovery")).toContainText("matches central version 12");
    await page.evaluate(() => { window.footballScienceCentralState.readMedicalRecoveryState = () => new Promise(resolve => { window.__finish = () => resolve(window.__proof); }); });
    await remove(page); await page.waitForFunction(() => typeof window.__finish === "function");
    await page.evaluate(change => {
      if (change === "account") window.__scope = "another-owner";
      if (change === "permission") window.__canEdit = false;
      if (change === "new edit") window.__recovery.beginWrite();
      else window.dispatchEvent(new Event("platform:user-change"));
      window.__finish();
    }, change);
    expect(await page.evaluate(async () => Promise.all((await window.__store.list("owner-team-a")).map(row => window.__store.read("owner-team-a", row.id))))).toEqual(before);
    await expect(page.locator("#recovery")).not.toContainText("copy was removed");
  });
}

test("aborted deletion keeps both the payload and catalog and never reports successful removal", async ({ page }) => {
  await setup(page); const before = await list(page); await check(page);
  await expect(page.locator("#recovery")).toContainText("matches central version 12");
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(id) {
      const request = remove.call(this, id);
      if (this.name === "drafts") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
  });
  await remove(page); await expect(page.locator("#recovery")).toContainText("not confirmed removed");
  expect(await list(page)).toEqual(before);
});

test("retiring one copy preserves a newer variant concurrently retained by another tab", async ({ page, context }) => {
  await setup(page); await check(page); await expect(page.locator("#recovery")).toContainText("matches central version 12");
  const other = await context.newPage(); await other.goto("/medical-merge.js"); await install(other);
  const newer = { ...draft, note: "Other tab unresolved work" };
  await Promise.all([retain(other, newer), remove(page)]);
  await expect(page.locator("#recovery")).toContainText("One verified local recovery copy was removed");
  const remaining = await list(other); expect(remaining).toHaveLength(1); expect(remaining[0].value).toBe(JSON.stringify(newer));
  await other.close();
});

test("transaction rejects a changed selected envelope and wrong ownership without touching either row", async ({ page }) => {
  await setup(page); const before = await list(page);
  expect(await page.evaluate(async () => {
    const entry = (await window.__store.list(window.__scope))[0], copy = await window.__store.read(window.__scope, entry.id);
    return Promise.all([
      window.__store.removeVerified({ ...copy, previousValue: "different previous generation" }, window.__proof, () => true),
      window.__store.removeVerified({ ...copy, scope: "other" }, window.__proof, () => true),
      window.__store.removeVerified(copy, window.__proof, () => false),
    ]);
  })).toEqual([false, false, false]);
  expect(await list(page)).toEqual(before);
});

test("full auth bridge verifies via a fresh private GET without hydrating or writing Medical state", async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  let writes = 0; const reads = [];
  await page.route("**/api/app-state**", route => {
    const req = route.request();
    if (req.method() !== "GET") { writes++; return route.fulfill({ status: 503, json: { ok: false } }); }
    reads.push({ url: req.url(), headers: req.headers() });
    const keys = new URL(req.url()).searchParams.get("keys")?.split(",") || [key];
    return route.fulfill({ json: { ok: true, entries: keys.includes(key) ? { [key]: JSON.stringify(draft) } : {},
      metadata: keys.includes(key) ? { [key]: { revision: 12 } } : {}, absentKeys: keys.filter(k => k !== key),
      medicalRecoveryRead: { private: keys.includes(key) } } });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.getReadScope?.()
    && !window.footballScienceCentralState.getStatus().hydrating);
  const beforeWrites = writes, beforeReads = reads.length;
  const result = await page.evaluate(async key => {
    const bridge = window.footballScienceCentralState;
    const before = { value: bridge.getCachedValue(key), metadata: bridge.getStatus().metadata[key], stored: localStorage.getItem(key) };
    const proof = await bridge.readMedicalRecoveryState(bridge.getReadScope());
    const after = { value: bridge.getCachedValue(key), metadata: bridge.getStatus().metadata[key], stored: localStorage.getItem(key) };
    return { before, after, proof };
  }, key);
  expect(result.before).toEqual(result.after);
  expect(result.proof).toMatchObject({ ok: true, private: true, value: JSON.stringify(draft), revision: 12 });
  expect(writes).toBe(beforeWrites);
  const call = reads.slice(beforeReads).find(r => new URL(r.url).searchParams.get("keys") === key);
  expect(call).toBeTruthy(); expect(new URL(call.url).searchParams.get("fresh")).toBe("1");
  expect(call.headers["x-footballscience-fresh-state"]).toBe("1");
  await page.evaluate(() => document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click());
  await page.getByRole("button", { name: "Medical", exact: true }).click();
  await page.evaluate(async draft => {
    const { createMedicalDraftStore } = await import("/src/modules/medical/medical-draft-store.mjs");
    const store = createMedicalDraftStore({ indexedDB });
    await store.retain({ scope: window.footballScienceCentralState.getReadScope(), value: JSON.stringify(draft), previousValue: null, baseRevision: 11 });
    await store.close();
    (await import("/src/modules/medical/medical-runtime-accessors.mjs")).renderMedicalTeamWorkspace();
  }, draft);
  const panel = page.locator("[data-medical-draft-recovery]");
  await panel.getByText(/^Copy from /).click();
  await panel.getByRole("button", { name: "Check against central copy" }).click();
  await expect(panel).toContainText("matches central version 12");
  await panel.screenshot({ path: "/private/tmp/fs-medical-verified-copy-panel.png" });
  await panel.getByRole("button", { name: "Remove this verified local copy" }).click();
  await expect(panel).toContainText("One verified local recovery copy was removed");
});


test("permission loss after delete request success aborts both row deletions", async ({ page }) => {
  await setup(page); const before = await list(page); await check(page);
  await expect(page.locator("#recovery")).toContainText("matches central version 12");
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(id) {
      const request = remove.call(this, id);
      if (this.name === "drafts") request.addEventListener("success", () => { window.__canEdit = false; });
      return request;
    };
  });
  await remove(page);
  await expect.poll(() => page.evaluate(() => window.__canEdit)).toBe(false);
  expect(await list(page)).toEqual(before);
});

test("two authorized tabs retiring the same copy commit only one removal", async ({ page, context }) => {
  await setup(page);
  const other = await context.newPage(); await setup(other);
  // Both users selected the immutable copy before either pressed removal.
  // Listing after the other removal is already committed would have no selection.
  const selected = (await list(page))[0];
  const removeCopy = tab => tab.evaluate(copy => window.__store.removeVerified(copy, window.__proof, () => true), selected);
  expect((await Promise.all([removeCopy(page), removeCopy(other)])).sort()).toEqual([false, true]);
  expect(await list(page)).toEqual([]); await other.close();
});
