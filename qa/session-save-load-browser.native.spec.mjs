import { expect, test } from "@playwright/test";
import { date, initial, principal, invoke, sessionPilotDatabase, syntheticAuth } from "./helpers/session-save-pilot-harness.mjs";

let db, auth;
test.beforeEach(async () => { db = await sessionPilotDatabase(); auth = syntheticAuth(); });
test.afterEach(async () => { auth?.close(); await db?.close(); });
const commits = () => db.calls.filter((call) => call.name === "commit_authorized_session_save");
const rows = (page) => page.evaluate(() => window.store.list(window.scope));
function barrier() { let release, enter; return { wait: new Promise((r) => { release = r; }), ready: new Promise((r) => { enter = r; }), release: () => release(), enter: () => enter() }; }
async function boot(page, intercept) {
  await page.unroute("**/api/qa-load-pilot");
  await page.route("**/qa/load-pilot", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Authenticated reload proof</title>" }));
  await page.route("**/api/qa-load-pilot", async (route) => {
    const body = JSON.parse(route.request().postData());
    const response = await invoke(db.handler, { body, token: route.request().headers().authorization?.replace(/^Bearer /, "") });
    if (await intercept?.(route, response, body)) return;
    if (!page.isClosed()) await route.fulfill({ status: response.status, headers: response.headers, body: JSON.stringify(response.payload) });
  });
  await page.goto("/qa/load-pilot");
  await page.evaluate(async ({ principal, token }) => {
    const { createSessionSaveLoadedPilot } = await import("/src/modules/session-planner/session-save-loaded-pilot.mjs");
    const { createSessionSaveQueueStore } = await import("/src/modules/session-planner/session-save-queue-store.mjs");
    window.context = principal; window.store = createSessionSaveQueueStore(); window.calls = [];
    window.scope = JSON.stringify(["sessions-receipts-v1", principal.actorId, principal.organizationId, principal.clubId, principal.teamId]);
    window.client = createSessionSaveLoadedPilot({ getContext: () => window.context, store: window.store,
      request: async (options) => {
        window.calls.push(JSON.parse(options.body));
        const response = await fetch("/api/qa-load-pilot", { method: options.method, body: options.body, headers: { Authorization: `Bearer ${token}` } });
        return { ok: response.ok, status: response.status, payload: await response.json() };
      } });
  }, { principal, token: auth.token });
}
const refresh = (page) => page.evaluate(() => window.client.refresh());
async function edit(page, title) {
  return page.evaluate(async ({ title, date }) => {
    const view = await window.client.view(), next = JSON.parse(view.value);
    next.sessions[date].title = title;
    return window.client.stage(JSON.stringify(next), { previousValue: view.value });
  }, { title, date });
}

test("authenticated initial load is read-only and cannot stage before verified context", async ({ page }) => {
  await boot(page);
  expect(await page.evaluate((value) => window.client.stage(JSON.stringify(value)), initial)).toMatchObject({ ok: false });
  expect(await page.evaluate(() => window.client.isSettled())).toBe(false);
  const result = await refresh(page);
  expect(result).toMatchObject({ ok: true, metadata: { revision: 10 }, pendingOperations: [], reviewRequired: false });
  expect(JSON.parse(result.value)).toEqual(initial);
  expect(await page.evaluate(() => window.client.isSettled())).toBe(true);
  expect(db.calls.map((call) => [call.name, call.body.p_change])).toEqual([["read_session_save_context", null]]);
  expect(await db.evidence()).toEqual({ receipts: 0, effects: 0 });
});

test("reload preserves exact durable edits and projects them over fresh central data without sending", async ({ page }) => {
  await boot(page); await refresh(page); expect(await edit(page, "Offline draft")).toMatchObject({ ok: true });
  const pending = await rows(page);
  await boot(page);
  const result = await refresh(page);
  expect(JSON.parse(result.value).sessions[date].title).toBe("Offline draft");
  expect(result.pendingOperations).toEqual(pending); expect(await rows(page)).toEqual(pending);
  expect(commits()).toHaveLength(0); expect(await page.evaluate(() => window.client.isSettled())).toBe(false);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect((await db.state()).value.sessions[date].title).toBe("Offline draft");
  expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("passive real tab refreshes after peer acknowledgement without a duplicate write", async ({ page, context }) => {
  await boot(page); await refresh(page);
  const peer = await context.newPage(); await boot(peer); await refresh(peer);
  await edit(page, "Peer saved"); expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await peer.evaluate(() => window.client.isSettled())).toBe(false);
  expect(await peer.evaluate(() => window.client.view())).toMatchObject({ ok: false });
  const result = await refresh(peer);
  expect(result).toMatchObject({ ok: true, metadata: { revision: 11 }, pendingOperations: [] });
  expect(JSON.parse(result.value).sessions[date].title).toBe("Peer saved");
  expect(await peer.evaluate(() => window.client.isSettled())).toBe(true);
  expect(commits()).toHaveLength(1); await peer.close();
});

test("a conflicting reload withholds a renderable value and never overwrites or clears the draft", async ({ page }) => {
  await boot(page); await refresh(page); await edit(page, "Local A"); const pending = await rows(page);
  const { createSessionDateChanges } = await import("../src/modules/session-planner/session-save-protocol.mjs");
  const next = structuredClone(initial); next.sessions[date].title = "Colleague B";
  expect((await invoke(db.handler, { token: auth.token, body: { key: "football-session-planner-v3", teamId: principal.teamId,
    sessionChange: JSON.stringify(createSessionDateChanges(initial, next)[0]) } })).status).toBe(200);
  await boot(page); const result = await refresh(page);
  expect(result).toMatchObject({ ok: true, value: null, reviewRequired: true });
  expect(result.conflicts).toHaveLength(1); expect(await rows(page)).toEqual(pending);
  expect((await db.state()).value.sessions[date].title).toBe("Colleague B"); expect(commits()).toHaveLength(1);
});

test("overlapping H1/H2 discards H1 and publishes only H2", async ({ page }) => {
  const held = barrier(); let reads = 0;
  await boot(page, async (_route, _response, body) => { if (body.action === "snapshot" && ++reads === 1) { held.enter(); await held.wait; } });
  await page.evaluate(() => { window.h1 = window.client.refresh(); }); await held.ready;
  try { await page.evaluate(() => { window.h2 = window.client.refresh(); }); }
  finally { held.release(); }
  expect(await page.evaluate(() => window.h1)).toMatchObject({ ok: false });
  expect(await page.evaluate(() => window.h2)).toMatchObject({ ok: true });
  expect(reads).toBe(2); expect(commits()).toHaveLength(0);
});

test("A to B to A with new epochs rejects the late authenticated A response", async ({ page }) => {
  const held = barrier(); let once = true;
  await boot(page, async () => { if (once) { once = false; held.enter(); await held.wait; } });
  await page.evaluate(() => { window.loading = window.client.refresh(); }); await held.ready;
  try {
    await page.evaluate(() => {
      const a = window.context;
      window.context = { ...a, actorId: "00000000-0000-4000-8000-000000000003", epoch: "b" };
      window.context = { ...a, epoch: "a-returned" };
    });
  } finally { held.release(); }
  expect(await page.evaluate(() => window.loading)).toMatchObject({ ok: false });
  expect(await page.evaluate(() => window.client.view())).toMatchObject({ ok: false });
  expect(await refresh(page)).toMatchObject({ ok: true }); expect(commits()).toHaveLength(0);
});

test("failed or offline reload keeps the journal exact and blocks automatic delivery", async ({ page }) => {
  await boot(page); await refresh(page); await edit(page, "Keep after network failure"); const pending = await rows(page);
  await boot(page, async (route) => { await route.abort("failed"); return true; });
  expect(await refresh(page)).toMatchObject({ ok: false });
  expect(await rows(page)).toEqual(pending);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false });
  expect(commits()).toHaveLength(0);
  await boot(page); expect(await refresh(page)).toMatchObject({ ok: true }); expect(await rows(page)).toEqual(pending);
});

test("read queued behind an in-flight commit never publishes the pre-commit calendar", async ({ page }) => {
  const held = barrier();
  await boot(page, async (_route, _response, body) => { if (!body.action) { held.enter(); await held.wait; } });
  await refresh(page); await edit(page, "A committed during refresh");
  await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  try { await page.evaluate(() => { window.loading = window.client.refresh(); }); }
  finally { held.release(); }
  expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: false });
  const result = await page.evaluate(() => window.loading);
  expect(result).toMatchObject({ ok: true, metadata: { revision: 11 }, reviewRequired: false });
  expect(JSON.parse(result.value).sessions[date].title).toBe("A committed during refresh");
  expect(await rows(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("new local B staged while the read is deferred remains durable and visible", async ({ page }) => {
  const held = barrier(); let reads = 0;
  await boot(page, async (_r, _s, body) => { if (body.action === "snapshot" && ++reads === 2) { held.enter(); await held.wait; } });
  await refresh(page); await edit(page, "A");
  await page.evaluate(() => { window.loading = window.client.refresh(); }); await held.ready;
  const before = await rows(page);
  try {
    // Reads suspend this adapter, but a real peer can still durably stage.
    await page.evaluate(async () => {
      const [a] = await window.store.list(window.scope);
      const b = structuredClone(a); delete b.id; delete b.ordinal;
      b.change.id = crypto.randomUUID(); b.change.before = structuredClone(a.change.after);
      b.change.after.session.title = "B"; b.writer = "peer"; b.createdAt++;
      await window.store.putMany([b]);
    });
  } finally { held.release(); }
  const result = await page.evaluate(() => window.loading);
  expect(JSON.parse(result.value).sessions[date].title).toBe("B");
  expect((await rows(page))[0]).toEqual(before[0]); expect(await rows(page)).toHaveLength(2); expect(commits()).toHaveLength(0);
});
