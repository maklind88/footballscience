import { test, expect } from "@playwright/test";
import { createRestartHarness, initial, day, owner, rows, stage, replay, view } from "./helpers/session-restart-harness.mjs";
import { historicalSources } from "./helpers/session-historical-sources.mjs";

const older = historicalSources("review-aware-20260930");
let harness;
test.beforeEach(async ({ baseURL, browserName }) => { harness = await createRestartHarness(baseURL, browserName); });
test.afterEach(async () => { await harness?.dispose(); harness = null; });
async function open(version) {
  const page = await harness.open(owner, version === "older" ? older : new Map());
  expect(await page.evaluate(() => typeof window.saveClient.isReady)).toBe(version === "older" ? "undefined" : "function");
  if (version === "older") expect(harness.loadedSources()).toEqual([...older.keys()].sort());
  return page;
}
async function upgradeSharedDatabase(page) {
  return page.evaluate(async () => {
    const before = await new Promise((resolve, reject) => {
      const request = indexedDB.open("football-science-data-safety-v1");
      request.onsuccess = () => { const db = request.result; const version = db.version; db.close(); resolve(version); };
      request.onerror = () => reject(request.error);
    });
    if (before !== 1) throw new Error("The fixture must start with database version 1");
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    const journal = createOfflineOperationJournal();
    await journal.put({ id: "unrelated-pending", scope: "other:org:team", moduleId: "periodization",
      key: "football-periodization-v2", type: "day.patch", payload: { title: "Retain unrelated work" }, baseRevision: 7 });
    return { version: (await journal.open()).version, unrelated: await journal.list("other:org:team") };
  });
}

for (const from of ["older", "current"]) {
  const to = from === "older" ? "current" : "older";
  test(`${from} to ${to} and back preserves pending and review rows across schema upgrade`, async () => {
    let page = await open(from);
    const a = initial(); a.sessions[day].blocks[0].objective = "Local conflict";
    expect(await stage(page, a, initial())).toEqual({ ok: true });
    harness.state.value.sessions[day].blocks[0].objective = "Accepted peer";
    harness.state.revision++;
    harness.state.mode = "online";
    expect(await replay(page)).toMatchObject({ ok: false, reviewRequired: true });
    const accepted = structuredClone(harness.state.value), b = structuredClone(accepted);
    b.sessions[day].blocks[0].minutes = 45;
    expect(await stage(page, b, accepted)).toEqual({ ok: true });
    const before = await rows(page);
    expect(before.map(row => row.status)).toEqual(["review", "pending"]);
    await harness.close();
    // The schema owner, using current source, performs the real v1 -> v2
    // upgrade. The historical consumer must later preserve unfamiliar stores.
    page = await open("current");
    const schema = await upgradeSharedDatabase(page);
    expect(schema.version).toBe(2);
    expect(await rows(page)).toEqual(before);
    await harness.close(); page = await open(to);
    expect(await rows(page)).toEqual(before);
    expect((await view(page)).value.sessions[day].blocks[0]).toMatchObject({ objective: "Accepted peer", minutes: 45 });
    expect(await replay(page)).toMatchObject({ ok: false, reviewRequired: true });
    const after = await rows(page);
    expect(after).toEqual([before[0]]);
    expect(harness.state.effects).toBe(1);
    expect(harness.state.calls.at(-1).change).toEqual(before[1].change);
    await harness.close(); page = await open(from);
    expect(await rows(page)).toEqual(after);
    expect((await page.evaluate(() => window.saveClient.reviews()))[0].change).toEqual(before[0].change);
    const calls = harness.state.calls.length;
    expect(await page.evaluate(async () => {
      const review = (await window.saveClient.reviews())[0];
      return window.saveClient.resolve(review.change.id, false, review.central);
    })).toMatchObject({ ok: true });
    expect(harness.state.calls).toHaveLength(calls);
    const archived = await rows(page);
    expect(archived[0]).toMatchObject({ ...before[0], status: "archived" });
    await harness.close(); page = await open("current");
    expect(await rows(page)).toEqual(archived);
    const preserved = await page.evaluate(async () => {
      const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
      const journal = createOfflineOperationJournal();
      return { version: (await journal.open()).version, unrelated: await journal.list("other:org:team") };
    });
    expect(preserved).toEqual(schema);
    expect(harness.state.value.sessions[day].blocks[0]).toMatchObject({ objective: "Accepted peer", minutes: 45 });
  });
}

test("pre-compatibility rollback loses access after v2 but forward recovery preserves exact work", async () => {
  let page = await open("current");
  const edit = initial(); edit.sessions[day].blocks[0].objective = "Never delete this pending work";
  expect(await stage(page, edit, initial())).toEqual({ ok: true });
  const before = await rows(page), schema = await upgradeSharedDatabase(page);
  expect(schema.version).toBe(2);
  await harness.close();
  const legacy = historicalSources("fixed-version-reader-20260923");
  // Probe the real old reader in isolation, without calling a current client's
  // write methods against a substituted store. It is an incompatibility test.
  page = await harness.open(owner, new Map([["/qa/legacy-session-store.mjs", [...legacy.values()][0]]]));
  expect(await page.evaluate(async scope => {
    const { createSessionSaveStore } = await import("/qa/legacy-session-store.mjs");
    try { await createSessionSaveStore().list(scope); return "unexpected success"; }
    catch (error) { return error.name; }
  }, owner)).toBe("VersionError");
  expect(harness.state.calls).toEqual([]);
  await harness.close(); page = await open("current");
  expect(await rows(page)).toEqual(before);
  expect((await view(page)).value).toEqual({ ...edit, blockDeletionTombstones: { [day]: {} } });
  harness.state.mode = "online";
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(await rows(page)).toEqual([]);
});


test("historical and current tabs keep working through the shared database upgrade", async () => {
  const current = await open("current"), peer = await harness.peer(owner, older);
  expect(await peer.evaluate(() => typeof window.saveClient.isReady)).toBe("undefined");
  expect(harness.loadedSources()).toEqual([...older.keys()].sort());
  const a = initial(); a.sessions[day].blocks[0].objective = "Current tab edit";
  expect(await stage(current, a, initial())).toEqual({ ok: true });
  const original = await rows(peer); // Open the old connection before upgrade.
  const schema = await upgradeSharedDatabase(current);
  expect(schema.version).toBe(2);
  expect(await rows(peer)).toEqual(original);
  const b = initial(); b.sessions[day].blocks[0].minutes = 45;
  expect(await stage(peer, b, initial())).toEqual({ ok: true });
  const both = await rows(current);
  expect(both).toHaveLength(2);
  expect(new Set(both.map(row => row.writer)).size).toBe(2);
  harness.state.mode = "online";
  expect(await replay(current)).toMatchObject({ ok: true });
  expect(harness.state.calls.map(call => call.change)).toEqual(both.map(row => row.change));
  expect(harness.state.effects).toBe(2);
  expect(await rows(peer)).toEqual([]);
  expect(harness.state.value.sessions[day].blocks[0]).toMatchObject({ objective: "Current tab edit", minutes: 45 });
  // A fresh baseline is explicitly supplied; no claim of auth/Realtime coverage.
  await peer.evaluate(({ value, revision }) => window.saveClient.observe(JSON.stringify(value), { revision }), { value: harness.state.value, revision: harness.state.revision });
  expect((await view(peer)).value).toEqual(harness.state.value);
});
