import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";

const key = "football-medical-team-v1";
const draft = { players: [{ id: "synthetic", name: "Synthetic Player" }],
  records: [{ id: "r1", playerId: "synthetic", date: "2026-10-09", participation: 50, comment: "Rescue exact draft" }], injuryPlans: [] };
async function install(page, options = {}) {
  await page.evaluate(async options => {
    const { createMedicalDraftStore } = await import("/src/modules/medical/medical-draft-store.mjs");
    const { createMedicalDraftRecovery } = await import("/src/modules/medical/medical-draft-recovery.mjs");
    window.__scope = options.scope ?? "owner-team-a"; window.__canEdit = true; window.__issues = [];
    window.footballScienceCentralState = { getReadScope: () => window.__scope, canAutoSyncKey: () => window.__canEdit,
      isKeyHydrated: () => true, getStatus: () => ({ metadata: { "football-medical-team-v1": { revision: 7 } } }) };
    window.footballScienceDataSafety = { reportSaveIssue: (_, message) => window.__issues.push(message) };
    window.__store = createMedicalDraftStore({ indexedDB, ...options });
    window.__recovery = createMedicalDraftRecovery({ win: window, canEdit: () => window.__canEdit, store: window.__store });
    const host = document.createElement("section"); host.id = "recovery"; document.body.append(host);
    window.__recovery.mount(host);
  }, options);
}
const retain = (page, value = draft) => page.evaluate(value => window.__recovery.retain(JSON.stringify(value), '{"records":[]}'), value);
const list = page => page.evaluate(async () => Promise.all((await window.__store.list(window.__scope)).map(row => window.__store.read(window.__scope, row.id))));

test("committed exact draft and previous value survive reload, are reviewable and downloadable without central writes", async ({ page }) => {
  let writes = 0; page.on("request", request => { if (request.method() !== "GET") writes++; });
  await page.goto("/medical-merge.js"); await install(page);
  expect(await retain(page)).toBe(true);
  await expect(page.locator("#recovery")).toContainText("saved on this device");
  const rows = await list(page);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ value: JSON.stringify(draft), previousValue: '{"records":[]}', baseRevision: 7, scope: "owner-team-a" });
  await page.reload(); await install(page);
  await page.getByText(/^Copy from /).click();
  await expect(page.locator("#recovery")).toContainText("Rescue exact draft");
  await page.getByText("All retained content", { exact: true }).click();
  await expect(page.locator("#recovery pre")).toContainText('"injuryPlans": []');
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download this recovery copy" }).click();
  const download = await downloading; expect(download.suggestedFilename()).toBe(`medical-recovery-${rows[0].id}.json`);
  const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks))).toEqual({ type: "medical-recovery-copy", ...rows[0] });
  expect(writes).toBe(0);
});

test("repeated identical rescue is deduplicated; concurrent divergent tabs retain both generations", async ({ page, context }) => {
  await page.goto("/medical-merge.js"); await install(page);
  const other = await context.newPage(); await other.goto("/medical-merge.js"); await install(other);
  const second = { ...draft, records: [{ ...draft.records[0], comment: "Concurrent variant" }] };
  expect(await Promise.all([retain(page), retain(other, second)])).toEqual([true, true]);
  expect(await retain(page)).toBe(true);
  const rows = await list(page); expect(rows).toHaveLength(2);
  expect(new Set(rows.map(row => row.id)).size).toBe(2);
  expect(rows.map(row => row.value)).toEqual(expect.arrayContaining([JSON.stringify(draft), JSON.stringify(second)]));
  await other.close();
});

for (const changed of ["account", "team", "logout", "permission"]) {
  test(`changing ${changed} hides retained clinical work; original scope can recover it again`, async ({ page }) => {
    await page.goto("/medical-merge.js"); await install(page); await retain(page);
    await page.getByText(/^Copy from /).click(); await expect(page.locator("#recovery")).toContainText("Rescue exact draft");
    await page.evaluate(changed => {
      if (changed === "permission") window.__canEdit = false;
      else window.__scope = changed === "logout" ? "" : `other-${changed}`;
      window.dispatchEvent(new Event("platform:user-change"));
    }, changed);
    await expect(page.locator("#recovery")).not.toContainText("Rescue exact draft");
    await expect(page.getByText(/^Copy from /)).toHaveCount(0);
    await page.evaluate(() => { window.__canEdit = true; window.__scope = "owner-team-a"; window.dispatchEvent(new Event("platform:user-change")); });
    await page.getByText(/^Copy from /).click(); await expect(page.locator("#recovery")).toContainText("Rescue exact draft");
    expect(await list(page)).toHaveLength(1);
  });
}

test("late commit after account switch keeps original ownership without reporting success to the new account", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(value => {
    const original = window.__store.retain;
    window.__store.retain = args => new Promise(resolve => { window.__finish = async () => resolve(await original(args)); });
    window.__saving = window.__recovery.retain(JSON.stringify(value));
    window.__scope = "owner-team-b"; window.dispatchEvent(new Event("platform:user-change"));
  }, draft);
  expect(await page.evaluate(async () => { await window.__finish(); return window.__saving; })).toBe(true);
  await expect(page.locator("#recovery")).not.toContainText("saved on this device");
  expect(await list(page)).toEqual([]);
  expect(await page.evaluate(() => window.__store.list("owner-team-a"))).toHaveLength(1);
  expect(await page.evaluate(() => window.__issues)).toHaveLength(1);
});

for (const limit of [{ maxCopies: 1 }, { maxBytes: 1800 }]) {
  test(`rescue capacity ${JSON.stringify(limit)} fails visibly and preserves earlier copies`, async ({ page }) => {
    await page.goto("/medical-merge.js"); await install(page, limit); expect(await retain(page)).toBe(true);
    const first = await list(page);
    const next = { ...draft, note: "x".repeat(600) };
    expect(await retain(page, next)).toBe(false);
    await expect(page.locator("#recovery")).toContainText("could not be saved on this device");
    expect(await list(page)).toEqual(first);
    expect(await retain(page)).toBe(true); // Identical retry does not consume another slot.
  });
}

test("request success followed by aborted transaction never claims durable saving", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value) {
      const request = add.call(this, value);
      if (this.name === "drafts") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
  });
  expect(await retain(page)).toBe(false);
  expect(await list(page)).toEqual([]);
  expect(await page.evaluate(() => window.__issues.some(message => message.startsWith("A Medical recovery copy is saved")))).toBe(false);
});

test("IndexedDB denied preserves memory and reports unconfirmed saving without private error details", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => { window.__store.retain = () => Promise.reject(new Error("private database detail")); });
  expect(await retain(page)).toBe(false);
  await expect(page.locator("#recovery")).toContainText("could not be saved on this device");
  expect(await page.evaluate(() => window.__issues.join(" "))).not.toContain("private database detail");
});

test("the storage inventory counts rescue copies without clinical content or deletion", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page); await retain(page);
  const report = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    return collectIndexedDbStorageHealth({ indexedDB });
  });
  expect(report.databases.find(row => row.label === "Medical recovery")).toMatchObject({ status: "complete", records: 2,
    groups: expect.arrayContaining([{ label: "Medical retained drafts", records: 1, approximateJsonUtf16Bytes: expect.any(Number) },
      { label: "Medical recovery metadata", records: 1, approximateJsonUtf16Bytes: expect.any(Number) }]) });
  expect(JSON.stringify(report)).not.toContain("Rescue exact draft"); expect(await list(page)).toHaveLength(1);
});

for (const rescueUnavailable of [false, true]) {
test(`full Medical app quota failure (rescue unavailable: ${rescueUnavailable}) preserves honest recovery and central state`, async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  const day = "2026-10-09", marker = "Synthetic full-app rescue";
  const player = { id: "rescue-player", name: "Synthetic Rescue Player", rosterType: "squad", status: "available" };
  const medical = { rosterVersion: "rescue", selectedDate: day, selectedPlayerId: player.id, players: [player], injuryPlans: [],
    records: [{ id: "rescue-record", playerId: player.id, date: day, participation: 50, comment: "Central baseline", createdAt: `${day}T08:00:00Z` }] };
  const entries = { [key]: JSON.stringify(medical), "football-player-profiles-v1": JSON.stringify({ players: [player], rosterVersion: "rescue" }) };
  await page.addInitScript(({ key, marker }) => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && String(value).includes(marker)) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return native.call(this, name, value);
    };
  }, { key, marker });
  if (rescueUnavailable) await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === "football-science-medical-drafts-v1") throw new DOMException("Rescue unavailable", "SecurityError");
      return open.call(this, name, ...args);
    };
  });
  let posts = 0;
  await page.route("**/api/app-state**", route => {
    if (route.request().method() !== "GET") { posts++; return route.fulfill({ status: 503, json: { ok: false } }); }
    const keys = new URL(route.request().url()).searchParams.get("keys")?.split(",") || Object.keys(entries);
    return route.fulfill({ json: { ok: true, entries: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, entries[k]])),
      metadata: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, { revision: 10 }])), absentKeys: keys.filter(k => !(k in entries)) } });
  });
  const ready = async () => {
    await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector("#loginScreen")?.hidden);
    await page.evaluate(() => document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click());
    await page.getByRole("button", { name: "Medical", exact: true }).click();
    await page.waitForFunction(async () => (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState().records.some(row => row.id === "rescue-record"));
  };
  await page.goto("/?workspace=medical-team"); await ready();
  await page.evaluate(async marker => {
    const access = await import("/src/modules/medical/medical-runtime-accessors.mjs");
    access.ensureMedicalState().records.find(row => row.id === "rescue-record").comment = marker;
    access.writeMedicalState();
  }, marker);
  if (rescueUnavailable) {
    await expect(page.locator("[data-medical-draft-recovery]")).toContainText("could not be saved on this device");
    expect(await page.evaluate(async () => (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState().records.find(row => row.id === "rescue-record").comment)).toBe(marker);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).not.toContain(marker);
    await expect(page.locator("[data-medical-draft-recovery] summary")).toHaveCount(0);
    return;
  }
  await expect(page.locator("[data-medical-draft-recovery]")).toContainText("saved on this device");
  await page.reload(); await ready();
  await page.locator("[data-medical-draft-recovery] summary").first().click();
  await expect(page.locator("[data-medical-draft-recovery]")).toContainText(marker);
  expect(await page.evaluate(async () => (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState().records.find(row => row.id === "rescue-record").comment)).toBe("Central baseline");
  expect(posts).toBeGreaterThan(0);
  await page.locator("[data-medical-draft-recovery]").screenshot({ path: "/private/tmp/fs-medical-recovery-panel.png" });
});
}


test("a newer failed generation cannot be hidden by an older late successful commit", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(value => {
    window.__store.retain = () => new Promise(resolve => { window.__oldCommit = resolve; });
    window.__oldSave = window.__recovery.retain(JSON.stringify(value));
    window.__store.retain = () => Promise.reject(new Error("Full"));
  }, draft);
  expect(await retain(page, { ...draft, note: "Newer" })).toBe(false);
  await page.evaluate(async () => { window.__oldCommit({}); await window.__oldSave; });
  await expect(page.locator("#recovery")).toContainText("could not be saved on this device");
  expect(await page.evaluate(() => window.__issues.at(-1))).toContain("could not be saved");
});

test("unknown ownership and denied Medical access never retain clinical drafts", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page, { scope: "" });
  expect(await retain(page)).toBe(false);
  await page.evaluate(() => { window.__scope = "owner-team-a"; window.__canEdit = false; });
  expect(await retain(page)).toBe(false);
  expect(await list(page)).toEqual([]);
});

test("a lost server receipt does not trigger replay or retire the retained variant", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page); await retain(page);
  const before = await list(page);
  await page.evaluate(() => {
    // A later hydration/revision is not a generation-specific acknowledgement.
    window.footballScienceCentralState.getStatus = () => ({ metadata: { "football-medical-team-v1": { revision: 9 } } });
    window.dispatchEvent(new Event("footballscience:central-state-ready"));
  });
  expect(await list(page)).toEqual(before);
  await page.getByText(/^Copy from /).click(); await expect(page.locator("#recovery")).toContainText("Rescue exact draft");
});

test("a stalled database open fails without claiming durable saving", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async value => {
    const { createMedicalDraftStore } = await import("/src/modules/medical/medical-draft-store.mjs");
    let pending;
    const store = createMedicalDraftStore({ timeoutMs: 10, indexedDB: { open: () => (pending = {}) } });
    const saved = await store.retain({ scope: "owner", value: JSON.stringify(value) }).then(() => true, () => false);
    return { saved, hasPendingOpen: Boolean(pending) };
  }, draft);
  expect(result).toEqual({ saved: false, hasPendingOpen: true });
});


test("normal listing reads only small metadata; selected copy requires matching ownership", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page); await retain(page);
  const result = await page.evaluate(async () => {
    const tx = IDBDatabase.prototype.transaction; let payloadTransactions = 0;
    IDBDatabase.prototype.transaction = function(names, ...args) {
      if (names === "drafts" || (Array.isArray(names) && names.includes("drafts"))) payloadTransactions++;
      return tx.call(this, names, ...args);
    };
    const summaries = await window.__store.list(window.__scope);
    const listingReads = payloadTransactions;
    const denied = await window.__store.read("other-owner", summaries[0].id);
    return { summaries, listingReads, denied };
  });
  expect(result.listingReads).toBe(0); expect(result.denied).toBe(null);
  expect(JSON.stringify(result.summaries)).not.toContain("Rescue exact draft");
});


test("access change during payload read prevents late rendering or export", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page); await retain(page);
  await page.evaluate(() => {
    const read = window.__store.read;
    window.__store.read = (...args) => new Promise(resolve => { window.__finishRead = async () => resolve(await read(...args)); });
  });
  await page.getByText(/^Copy from /).click();
  await page.waitForFunction(() => typeof window.__finishRead === "function");
  await page.evaluate(async () => {
    window.__scope = "other-owner"; window.dispatchEvent(new Event("platform:user-change"));
    await window.__finishRead();
  });
  await expect(page.locator("#recovery")).not.toContainText("Rescue exact draft");
  await expect(page.getByRole("button", { name: "Download this recovery copy" })).toHaveCount(0);
});

test("retained text cannot inject active markup into the review panel", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  const malicious = '<img src=x onerror="window.__injected=true">';
  await retain(page, { ...draft, records: [{ ...draft.records[0], comment: malicious }] });
  await page.getByText(/^Copy from /).click();
  await expect(page.locator("#recovery")).toContainText(malicious);
  await expect(page.locator("#recovery img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});

for (const outcome of ["success", "failure"]) {
  test(`an older rescue callback cannot reissue a warning after a newer normal save (${outcome})`, async ({ page }) => {
    await page.goto("/medical-merge.js"); await install(page);
    await page.evaluate(value => {
      window.__store.retain = () => new Promise((resolve, reject) => {
        window.__oldSuccess = resolve; window.__oldFailure = reject;
      });
      window.__oldSave = window.__recovery.retain(JSON.stringify(value));
    }, draft);
    await page.evaluate(() => {
      window.__recovery.beginWrite?.(); // The normal Medical write boundary runs this too.
      window.__issues.length = 0; // The successful protected write acknowledges prior issues.
    });
    await page.evaluate(async outcome => {
      if (outcome === "success") window.__oldSuccess({}); else window.__oldFailure(new Error("Delayed failure"));
      await window.__oldSave;
    }, outcome);
    expect(await page.evaluate(() => window.__issues)).toEqual([]);
    await expect(page.locator("#recovery")).not.toContainText("Creating a recovery copy");
  });
}


test("an old in-memory state cannot be relabeled as the newly active owner's rescue copy", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page, { scope: "new-owner" });
  expect(await page.evaluate(value => window.__recovery.retain(JSON.stringify(value), null, "original-owner"), draft)).toBe(false);
  expect(await page.evaluate(value => window.__recovery.retain(JSON.stringify(value), null, ""), draft)).toBe(false);
  expect(await list(page)).toEqual([]);
});
