import { expect, test } from "@playwright/test";
import { date, initial, principal, hash, invoke, sessionPilotDatabase, syntheticAuth } from "./helpers/session-save-pilot-harness.mjs";

let db, auth;
test.beforeEach(async () => { db = await sessionPilotDatabase(); auth = syntheticAuth(); });
test.afterEach(async () => { auth?.close(); await db?.close(); });
const commits = () => db.calls.filter((call) => call.name === "commit_authorized_session_save");
const rows = (page) => page.evaluate(() => window.store.list(window.scope));
function barrier() { let release, enter; return { wait: new Promise((r) => { release = r; }), ready: new Promise((r) => { enter = r; }), release: () => release(), enter: () => enter() }; }
async function boot(page, intercept) {
  await page.route("**/qa/queue-pilot", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Queued saving proof</title>" }));
  await page.route("**/api/qa-queue-pilot", async (route) => {
    const response = await invoke(db.handler, { raw: route.request().postData(), token: route.request().headers().authorization?.replace(/^Bearer /, "") });
    if (await intercept?.(route, response)) return;
    if (!page.isClosed()) await route.fulfill({ status: response.status, headers: response.headers, body: JSON.stringify(response.payload) });
  });
  await page.goto("/qa/queue-pilot");
  await page.evaluate(async ({ principal, initial, date, hash, token }) => {
    const { createSessionSaveQueuedPilot } = await import("/src/modules/session-planner/session-save-queued-pilot.mjs");
    const { createSessionSaveQueueStore } = await import("/src/modules/session-planner/session-save-queue-store.mjs");
    window.context = principal; window.store = createSessionSaveQueueStore(); window.posts = [];
    window.scope = JSON.stringify(["sessions-receipts-v1", principal.actorId, principal.organizationId, principal.clubId, principal.teamId]);
    window.client = createSessionSaveQueuedPilot({ getContext: () => window.context, store: window.store,
      request: async (options) => {
        window.posts.push(JSON.parse(options.body));
        const response = await fetch("/api/qa-queue-pilot", { method: options.method, body: options.body, headers: { Authorization: `Bearer ${token}` } });
        return { ok: response.ok, status: response.status, payload: await response.json() };
      } });
    window.client.observe(JSON.stringify(initial), { revision: 10, hash, organizationId: principal.organizationId, teamId: principal.teamId });
    window.local = structuredClone(initial); window.jobs = [];
    window.edit = (title, save = false) => {
      const before = JSON.stringify(window.local); window.local.sessions[date].title = title;
      const job = window.client[save ? "save" : "stage"](JSON.stringify(window.local), { previousValue: before });
      if (save) { window.jobs.push(job); return; } return job;
    };
  }, { principal, initial, date, hash: hash(JSON.stringify(initial)), token: auth.token });
}

test("quiet-period typing stages 18 edits durably but commits one final operation", async ({ page }) => {
  await boot(page);
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.evaluate(() => { for (let i = 0; i < 18; i++) window.edit(`Text ${i}`, true); });
  await expect.poll(async () => (await rows(page)).at(-1)?.change.after.session.title).toBe("Text 17");
  expect(await rows(page)).toHaveLength(1); expect(commits()).toHaveLength(0);
  await page.clock.runFor(251);
  const results = await page.evaluate(() => Promise.all(window.jobs));
  expect(results).toHaveLength(18); expect(results.every((result) => result.ok)).toBe(true);
  expect(commits()).toHaveLength(1); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
  expect((await db.state()).value.sessions[date].title).toBe("Text 17"); expect(await rows(page)).toEqual([]);
});

test("continuous typing has bounded network wait without postponing durable stage", async ({ page }) => {
  await boot(page); await page.clock.install(); await page.clock.pauseAt(new Date());
  for (let i = 0; i < 6; i++) {
    await page.evaluate((i) => { window.edit(`Text ${i}`, true); }, i);
    await expect.poll(async () => (await rows(page)).at(-1)?.change.after.session.title).toBe(`Text ${i}`);
    if (i < 5) await page.clock.runFor(190);
  }
  expect(commits()).toHaveLength(0);
  await page.clock.runFor(51);
  expect((await page.evaluate(() => Promise.all(window.jobs))).every((result) => result.ok)).toBe(true);
  expect(commits()).toHaveLength(1); expect((await db.state()).value.sessions[date].title).toBe("Text 5");
});

test("two pages replay one shared claimed row without a second HTTP write", async ({ page, context }) => {
  const held = barrier(); await boot(page, async () => { held.enter(); await held.wait; });
  const peer = await context.newPage(); await boot(peer);
  await page.evaluate(() => window.edit("One shared operation"));
  await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  try {
    await peer.evaluate(() => { window.saving = window.client.replay(); });
    await expect.poll(() => peer.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
    expect(await peer.evaluate(() => window.posts.length)).toBe(0);
    expect((await rows(peer))[0].attempted).toBe(true);
  } finally { held.release(); }
  expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: true });
  const peerResult = await peer.evaluate(() => window.saving);
  expect(peerResult).toMatchObject({ ok: false, reconcileRequired: true }); expect(peerResult.value).toBeUndefined();
  expect(await peer.evaluate(() => window.client.isSettled())).toBe(false);
  expect(commits()).toHaveLength(1); expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
  expect(await rows(peer)).toEqual([]);
  await peer.evaluate((fresh) => window.client.observe(JSON.stringify(fresh.value), fresh), await db.state());
  expect(await peer.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await peer.evaluate(() => window.client.isSettled())).toBe(true);
  expect(commits()).toHaveLength(1); await peer.close();
});

test("A in flight stays immutable while B and C compact; same drain delivers C once", async ({ page }) => {
  const held = barrier();
  await boot(page, async () => { if (commits().length === 1) { held.enter(); await held.wait; } });
  await page.evaluate(() => window.edit("A")); await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  const [a] = await rows(page);
  try {
    await page.evaluate(async () => { await window.edit("B"); await window.edit("C"); });
    const pending = await rows(page);
    expect(pending).toHaveLength(2); expect(pending[0]).toEqual(a);
    expect(pending[1]).toMatchObject({ attempted: false, change: { before: { session: { title: "A" } }, after: { session: { title: "C" } } } });
  } finally { held.release(); }
  expect(await page.evaluate(() => window.saving)).toMatchObject({ ok: true });
  expect(commits().map((call) => call.body.p_change.after.session.title)).toEqual(["A", "C"]);
  expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 }); expect(await rows(page)).toEqual([]);
  expect((await db.state()).value.sessions[date].title).toBe("C");
});

test("one tab drains a second real tab's edit without either caller publishing an older calendar", async ({ page, context }) => {
  const held = barrier(); await boot(page, async () => { if (commits().length === 1) { held.enter(); await held.wait; } });
  const peer = await context.newPage(); await boot(peer);
  await page.evaluate(() => window.edit("Title from A")); await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  try {
    expect(await peer.evaluate(async ({ initial, date }) => {
      const next = structuredClone(initial); next.sessions[date].blocks[0].title = "Exercise from B";
      return window.client.stage(JSON.stringify(next), { previousValue: JSON.stringify(initial) });
    }, { initial, date })).toMatchObject({ ok: true });
    await peer.evaluate(() => { window.saving = window.client.replay(); });
    await expect.poll(() => peer.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
    expect(await rows(peer)).toHaveLength(2);
  } finally { held.release(); }
  const a = await page.evaluate(() => window.saving), b = await peer.evaluate(() => window.saving);
  expect(a.ok).toBe(true); expect(b).toMatchObject({ ok: false, reconcileRequired: true }); expect(b.value).toBeUndefined();
  expect(JSON.parse(a.value).sessions[date]).toMatchObject({ title: "Title from A", blocks: [{ title: "Exercise from B" }] });
  expect((await db.state()).value.sessions[date]).toMatchObject({ title: "Title from A", blocks: [{ title: "Exercise from B" }] });
  expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 }); expect(await rows(peer)).toEqual([]); await peer.close();
});

test("closed sending tab releases ownership and another tab replays its committed operation once", async ({ page, context }) => {
  const held = barrier(); await boot(page, async () => { held.enter(); await held.wait; });
  const peer = await context.newPage(); await boot(peer);
  await page.evaluate(() => window.edit("Closed tab's training"));
  await page.evaluate(() => { window.saving = window.client.replay(); }); await held.ready;
  const [pending] = await rows(peer);
  try {
    await page.close();
    expect(await peer.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
    expect(commits().map((call) => call.body.p_change.id)).toEqual([pending.change.id, pending.change.id]);
    expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 }); expect(await rows(peer)).toEqual([]);
  } finally { held.release(); await peer.close(); }
});

test("lost response freezes operation across reload; later B commits after exact receipt replay", async ({ page }) => {
  let lose = true;
  await boot(page, async (route) => { if (lose) { lose = false; await route.abort("failed"); return true; } });
  await page.evaluate(() => window.edit("A"));
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false });
  const [a] = await rows(page); expect(a.attempted).toBe(true);
  await page.evaluate(() => window.edit("B")); expect(await rows(page)).toHaveLength(2);
  const pending = await rows(page);
  await page.unroute("**/api/qa-queue-pilot"); await boot(page);
  expect(await rows(page)).toEqual(pending);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(commits().map((call) => call.body.p_change.id)).toEqual([a.change.id, a.change.id, pending[1].change.id]);
  expect(await db.evidence()).toEqual({ receipts: 2, effects: 2 });
  expect((await db.state()).value.sessions[date].title).toBe("B"); expect(await rows(page)).toEqual([]);
});

test("aborted durable claim makes zero HTTP requests and allows later exact recovery", async ({ page }) => {
  await boot(page); await page.evaluate(() => window.edit("Durable first")); const pending = await rows(page);
  const result = await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === "operations") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    try { return await window.client.replay(); } finally { IDBObjectStore.prototype.put = put; }
  });
  expect(result).toMatchObject({ ok: false }); expect(commits()).toHaveLength(0);
  expect(await page.evaluate(() => window.posts.length)).toBe(0); expect(await rows(page)).toEqual(pending);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: true });
  expect(await db.evidence()).toEqual({ receipts: 1, effects: 1 });
});

test("account change during quiet period leaves private draft durable without posting it", async ({ page }) => {
  await boot(page); await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.evaluate(() => { window.edit("Private A", true); });
  await expect.poll(async () => (await rows(page)).length).toBe(1); const pending = await rows(page);
  await page.evaluate(() => { window.context = { ...window.context, actorId: "00000000-0000-4000-8000-000000000003", epoch: "login-b" }; });
  await page.clock.runFor(251);
  expect(await page.evaluate(() => window.jobs[0])).toMatchObject({ ok: false, durablePending: true });
  expect(commits()).toHaveLength(0); expect(await page.evaluate(() => window.posts.length)).toBe(0);
  expect(await rows(page)).toEqual(pending);
});

test("real HTTP rate limit retains the claimed draft and causes no retry loop", async ({ page }) => {
  await boot(page); await page.evaluate(() => window.edit("Keep rate-limited draft"));
  const [pending] = await rows(page);
  const rejected = () => invoke(db.handler, { token: auth.token, body: { action: "invalid" } });
  const first = await rejected(); expect(first.status).toBe(400);
  const limit = Number(first.headers["x-ratelimit-limit"]);
  expect(Number.isSafeInteger(limit) && limit > 0 && limit < 1000).toBe(true);
  for (let i = 1; i < limit; i++) expect((await rejected()).status).toBe(400);
  expect(await page.evaluate(() => window.client.replay())).toMatchObject({ ok: false, status: 429, durablePending: true });
  expect(await rows(page)).toEqual([{ ...pending, attempted: true }]);
  await page.clock.install(); await page.clock.runFor(16000);
  expect(await page.evaluate(() => window.posts.length)).toBe(1);
  expect(commits()).toHaveLength(0); expect(await db.evidence()).toEqual({ receipts: 0, effects: 0 });
});
