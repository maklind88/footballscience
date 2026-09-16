import { expect, test } from "@playwright/test";
import { date, initial, principal, hash, invoke, sessionPilotDatabase, syntheticAuth } from "./helpers/session-save-pilot-harness.mjs";
import { createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";

let db, auth;
test.beforeEach(async () => { db = await sessionPilotDatabase(); auth = syntheticAuth(); });
test.afterEach(async () => { auth?.close(); await db?.close(); });

async function boot(page, intercept) {
  await page.route("**/qa/save-pilot-page", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Saving proof</title>" }));
  await page.route("**/api/qa-save-pilot", async (route) => {
    const response = await invoke(db.handler, { raw: route.request().postData(), token: route.request().headers().authorization?.replace(/^Bearer /, "") });
    if (await intercept?.(route, response)) return;
    await route.fulfill({ status: response.status, headers: response.headers, body: JSON.stringify(response.payload) });
  });
  await page.goto("/qa/save-pilot-page");
  await page.evaluate(async ({ principal, initial, hash, token }) => {
    const { createSessionSavePilotClient } = await import("/src/modules/session-planner/session-save-pilot-client.mjs");
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    window.context = principal; window.store = createSessionSaveStore();
    window.scope = JSON.stringify(["sessions-receipts-v1", principal.actorId, principal.organizationId, principal.clubId, principal.teamId]);
    window.posts = 0;
    window.client = createSessionSavePilotClient({ getContext: () => window.context, store: window.store, request: async (options) => {
      window.posts++;
      const res = await fetch("/api/qa-save-pilot", { method: options.method, body: options.body, headers: { Authorization: `Bearer ${token}` } });
      return { ok: res.ok, status: res.status, payload: await res.json() };
    } });
    window.client.observe(JSON.stringify(initial), { revision: 10, hash, organizationId: principal.organizationId, teamId: principal.teamId });
  }, { principal, initial, hash: hash(JSON.stringify(initial)), token: auth.token });
}
async function stage(page, title) {
  return page.evaluate(async ({ initial, date, title }) => {
    const next = structuredClone(initial); next.sessions[date].title = title;
    return window.client.stage(JSON.stringify(next), { previousValue: JSON.stringify(initial) });
  }, { initial, date, title });
}
const rows = (page) => page.evaluate(() => window.store.list(window.scope));
const commits = () => db.calls.filter((call) => call.name === "commit_authorized_session_save");
function barrier() { let release, entered; return { wait: new Promise((r) => { release = r; }), ready: new Promise((r) => { entered = r; }), release: () => release(), enter: () => entered() }; }

test("delayed A acknowledgement preserves newer durable B; B then commits once", async ({ page }) => {
  const held = barrier();
  await boot(page, async (_route, response) => { if (response.payload.ok && response.payload.replayed === false && commits().length === 1) { held.enter(); await held.wait; } });
  await stage(page, "A");
  await page.evaluate(() => { window.saving = window.client.replay(); });
  await held.ready;
  const a = structuredClone(initial); a.sessions[date].title = "A";
  const b = structuredClone(a); b.sessions[date].blocks[0].minutes = 25;
  try {
    expect(await page.evaluate(({ a, b }) => window.client.stage(JSON.stringify(b), { previousValue: JSON.stringify(a) }), { a, b })).toMatchObject({ ok: true });
    expect(await rows(page)).toHaveLength(2);
  } finally { held.release(); }
  expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: true });
  expect(await rows(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.client.isSettled())).toBe(false);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await rows(page)).toEqual([]);
  expect((await db.state()).value.sessions[date]).toMatchObject({ title: "A", blocks: [expect.objectContaining({ minutes: 25 })] });
  expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 }); expect(commits()).toHaveLength(2);
});

test("server commit with lost HTTP response survives reload and replays the same operation", async ({ page }) => {
  let lose = true;
  await boot(page, async (route) => { if (lose) { lose = false; await route.abort("failed"); return true; } });
  await stage(page, "Retained");
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false });
  const pending = await rows(page); expect(pending).toHaveLength(1);
  expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
  await page.unroute("**/api/qa-save-pilot"); await boot(page);
  const fresh = await db.state();
  await page.evaluate((state) => window.client.observe(JSON.stringify(state.value), state), fresh);
  expect(await rows(page)).toEqual(pending);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
  expect(commits().map((call) => call.body.p_change.id)).toEqual([pending[0].change.id, pending[0].change.id]);
});

test("late old receipt cannot replace a newer observed value, hash or revision", async ({ page, browser }) => {
  const held = barrier();
  await boot(page, async () => { held.enter(); await held.wait; });
  await stage(page, "A"); await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  const device = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const peer = await device.newPage();
  try {
    await boot(peer);
    const a = await db.state(), b = structuredClone(a.value); b.sessions[date].title = "Newer colleague";
    await peer.evaluate((a) => window.client.observe(JSON.stringify(a.value), a), a);
    expect(await peer.evaluate(({ a, b }) => window.client.save(JSON.stringify(b), { previousValue: JSON.stringify(a.value) }), { a, b })).toMatchObject({ ok: true });
    const latest = await db.state();
    await page.evaluate((latest) => window.client.observe(JSON.stringify(latest.value), latest), latest);
    held.release();
    const settled = await page.evaluate(() => window.saving);
    expect(settled.ok).toBe(true);
    expect(JSON.parse(settled.value)).toEqual(latest.value); expect(settled.metadata).toMatchObject({ revision: latest.revision, hash: latest.hash });
    expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 });
  } finally { held.release(); await device.close(); }
});

test("another tab can move A to review while its receipt waits without losing that generation", async ({ page, context }) => {
  const held = barrier(); await boot(page, async () => { held.enter(); await held.wait; });
  await stage(page, "A"); await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  const peer = await context.newPage();
  try {
    await boot(peer); const [sent] = await rows(peer), review = { ...sent, status: "review", conflicts: ["Peer review"] };
    expect(await peer.evaluate(({ sent, review }) => window.store.update(sent, review), { sent, review })).toBe(true);
    held.release(); expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: false });
    expect(await rows(peer)).toEqual([review]); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
  } finally { held.release(); await peer.close(); }
});

test("journal delete transaction abort retains committed operation for reload replay", async ({ page }) => {
  await boot(page); await stage(page, "Saved once");
  const pending = await rows(page);
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      const request = remove.apply(this, args); request.addEventListener("success", () => this.transaction.abort()); return request;
    };
  });
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false }); expect(await rows(page)).toEqual(pending);
  await page.unroute("**/api/qa-save-pilot"); await boot(page);
  await page.evaluate((fresh) => window.client.observe(JSON.stringify(fresh.value), fresh), await db.state());
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("A to B to A with a different auth epoch cannot consume A's delayed receipt", async ({ page }) => {
  const held = barrier(); await boot(page, async () => { held.enter(); await held.wait; });
  await stage(page, "Account A"); await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  const pending = await rows(page);
  try {
    await page.evaluate(() => { const previous = structuredClone(window.context); window.context = null; window.context = { ...previous, epoch: "login-a-again" }; });
  } finally { held.release(); }
  expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: false }); expect(await rows(page)).toEqual(pending);
  await page.evaluate((fresh) => window.client.observe(JSON.stringify(fresh.value), fresh), await db.state());
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true }); expect(await rows(page)).toEqual([]);
  expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("canonical permission denial after reload keeps the durable operation without automatic retry", async ({ page }) => {
  await boot(page); await stage(page, "Keep denied draft"); const pending = await rows(page);
  await db.sql("UPDATE platform_memberships SET role='medical'");
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false, status: 403 });
  expect(await rows(page)).toEqual(pending); expect(commits()).toHaveLength(0); expect(await db.evidence()).toEqual({ receipts: 0, effects: 0 });
  expect(await page.evaluate(() => window.posts)).toBe(1);
});

test("compressed request and receipt cross the real HTTP boundary without losing training content", async ({ page }) => {
  let compressedReceipt = false;
  await boot(page, async (_route, response) => { compressedReceipt = response.payload.receipt?.encoding === "gzip-base64-v1"; });
  const objective = "Ball retention and coordinated pressure. ".repeat(9000);
  const result = await page.evaluate(async ({ initial, date, objective }) => {
    const desired = structuredClone(initial); desired.sessions[date].blocks[0].objective = objective;
    return window.client.save(JSON.stringify(desired));
  }, { initial, date, objective });
  expect(result.ok).toBe(true); expect(compressedReceipt).toBe(true);
  expect((await db.state()).value.sessions[date].blocks[0].objective).toBe(objective);
  expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("a calendar revision gap requires fresh hydration before clearing the date receipt", async ({ page }) => {
  await boot(page); await stage(page, "Local day"); const pending = await rows(page);
  const peer = structuredClone(initial), peerDate = "2026-09-17";
  peer.sessions[peerDate] = { date: peerDate, title: "Colleague day", blocks: [] };
  const change = createSessionDateChanges(initial, peer)[0];
  expect((await invoke(db.handler, { token: auth.token, body: { key: "football-session-planner-v3",
    teamId: principal.teamId, sessionChange: JSON.stringify(change) } })).status).toBe(200);
  const result = await page.evaluate(() => window.client.replay());
  expect(result).toMatchObject({ ok: false, reconcileRequired: true, durablePending: true });
  expect(await rows(page)).toEqual(pending); expect((await db.state()).revision).toBe(12);
  await page.evaluate((fresh) => window.client.observe(JSON.stringify(fresh.value), fresh), await db.state());
  const replayed = await page.evaluate(() => window.client.replay());
  expect(replayed.ok).toBe(true); expect(JSON.parse(replayed.value).sessions[peerDate].title).toBe("Colleague day");
  expect(await rows(page)).toEqual([]); expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 });
});
