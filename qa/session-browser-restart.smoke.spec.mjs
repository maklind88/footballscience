import { test, expect } from "@playwright/test";
import { createRestartHarness, initial, day, rows, stage, replay, view } from "./helpers/session-restart-harness.mjs";

let harness;
test.beforeEach(async ({ baseURL, browserName }) => { harness = await createRestartHarness(baseURL, browserName); });
test.afterEach(async () => { await harness?.dispose(); harness = null; });

for (const conflict of [false, true]) {
  test(`browser restart retains exact journal and isolates owners with ${conflict ? "conflicting" : "independent"} peer edit`, async () => {
    let page = await harness.open();
    const edited = initial(); edited.sessions[day].blocks[0].objective = "Offline coaching";
    expect(await stage(page, edited, initial())).toEqual({ ok: true });
    expect(await replay(page)).toMatchObject({ ok: false, durablePending: true });
    const original = await rows(page);
    expect(original).toHaveLength(1);
    await harness.close();
    harness.state.value.sessions[day].blocks[0][conflict ? "objective" : "minutes"] = conflict ? "Accepted peer" : 35;
    harness.state.revision++;
    // Separate launches for account, team and organization boundaries. Looking
    // at the baseline under another principal must neither expose nor send A.
    for (const scope of ["other:org:team", "coach:org:other-team", "coach:other-org:team"]) {
      page = await harness.open(scope);
      expect(await view(page)).toMatchObject({ value: harness.state.value, pending: false });
      const calls = harness.state.calls.length;
      expect(await replay(page)).toMatchObject({ ok: true });
      expect(harness.state.calls).toHaveLength(calls);
      expect(await rows(page)).toEqual(original);
      await harness.close();
    }
    page = await harness.open();
    expect(await rows(page)).toEqual(original);
    const projected = await view(page);
    expect(projected.pending).toBe(true);
    expect(projected.value.sessions[day].blocks[0]).toMatchObject(conflict
      ? { objective: "Accepted peer" } : { objective: "Offline coaching", minutes: 35 });
    harness.state.mode = "online";
    const result = await replay(page);
    if (conflict) {
      expect(result).toMatchObject({ ok: false, reviewRequired: true });
      const reviewed = await rows(page);
      expect(reviewed[0]).toMatchObject({ ...original[0], status: "review" });
      expect(harness.state.effects).toBe(0);
      expect(harness.state.value.sessions[day].blocks[0].objective).toBe("Accepted peer");
      await harness.close(); page = await harness.open();
      expect(await rows(page)).toEqual(reviewed);
      expect((await page.evaluate(() => window.saveClient.reviews()))[0].change).toEqual(original[0].change);
    } else {
      expect(result).toMatchObject({ ok: true });
      expect(harness.state.value.sessions[day].blocks[0]).toMatchObject({ objective: "Offline coaching", minutes: 35 });
      expect(await rows(page)).toEqual([]);
      expect(harness.state.effects).toBe(1);
      await harness.close(); page = await harness.open();
      expect((await view(page)).value).toEqual(harness.state.value);
      expect(await rows(page)).toEqual([]);
    }
  });
}

test("lost receipt plus full restart retries exact operation and retains later generation", async () => {
  let page = await harness.open();
  const a = initial(); a.sessions[day].blocks[0].objective = "Accepted A";
  expect(await stage(page, a, initial())).toEqual({ ok: true });
  const [rowA] = await rows(page);
  harness.state.mode = "lost-reply";
  expect(await replay(page)).toMatchObject({ ok: false, durablePending: true });
  expect(harness.state.effects).toBe(1);
  expect(await rows(page)).toEqual([rowA]);
  const b = structuredClone(a); b.sessions[day].blocks[0].minutes = 45;
  expect(await stage(page, b, a)).toEqual({ ok: true });
  const pending = await rows(page);
  expect(pending).toHaveLength(2);
  await harness.close(); page = await harness.open();
  expect(await rows(page)).toEqual(pending);
  expect((await view(page)).value.sessions[day].blocks[0]).toMatchObject({ objective: "Accepted A", minutes: 45 });
  // Return A's receipt, then deny B: A must not clear or acknowledge B.
  harness.state.mode = "online";
  await page.route("**/qa/session-restart-api", async route => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON().change.id === pending[1].change.id) return route.abort("internetdisconnected");
    return route.fallback();
  });
  expect(await replay(page)).toMatchObject({ ok: false, durablePending: true });
  expect(await rows(page)).toEqual([pending[1]]);
  expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(false);
  expect(harness.state.calls[1].change).toEqual(rowA.change);
  expect(harness.state.effects).toBe(1);
  await harness.close(); page = await harness.open();
  expect(await rows(page)).toEqual([pending[1]]);
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(harness.state.effects).toBe(2);
  expect(harness.state.value.sessions[day].blocks[0]).toMatchObject({ objective: "Accepted A", minutes: 45 });
  expect(await rows(page)).toEqual([]);
});

test("IDB request success followed by transaction abort is not durable success across restart", async () => {
  let page = await harness.open();
  const a = initial(); a.sessions[day].blocks[0].objective = "Durable A";
  expect(await stage(page, a, initial())).toEqual({ ok: true });
  const original = await rows(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.abortedJournalRequestSucceeded = false;
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args);
      if (this.name === "latest" && value.id?.startsWith("session-save:")) request.addEventListener("success", () => {
        window.abortedJournalRequestSucceeded = true; this.transaction.abort();
      });
      return request;
    };
  });
  const b = structuredClone(a); b.sessions[day].blocks[0].minutes = 45;
  expect(await stage(page, b, a)).toMatchObject({ ok: false });
  expect(await page.evaluate(() => window.abortedJournalRequestSucceeded)).toBe(true);
  expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(false);
  expect(harness.state.calls).toEqual([]);
  expect(await rows(page)).toEqual(original);
  await harness.close(); page = await harness.open();
  expect(await rows(page)).toEqual(original);
  expect((await view(page)).value.sessions[day].blocks[0]).toMatchObject({ objective: "Durable A", minutes: 20 });
});
