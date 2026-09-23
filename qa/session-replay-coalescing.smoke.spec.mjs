import { expect, test } from "@playwright/test";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const date = "2026-09-14";
const initial = () => ({ sessions: { [date]: { date, title: "Training", blocks: [{ id: "a", title: "Press",
  tacticalFrames: [{ id: "frame", elements: [{ id: "player", x: 12, y: 34 }] }],
}] } } });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function server(context) {
  const state = { value: initial(), revision: 10, calls: [], respond: null };
  await context.route("**/qa/session-replay-harness", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Save test</title>" }));
  await context.route("**/qa/session-replay-api", async (route) => {
    const { change, baseRevision, scope } = route.request().postDataJSON();
    state.calls.push({ change, baseRevision, scope });
    const override = await state.respond?.(change);
    if (override) return route.fulfill({ status: override, json: { reason: "Unconfirmed" } });
    if (baseRevision !== state.revision) return route.fulfill({ status: 409, json: { currentRevision: state.revision } });
    const merged = applySessionDateChange(state.value, change);
    if (!merged.ok) return route.fulfill({ status: 409, json: { currentRevision: state.revision, conflicts: merged.conflicts } });
    state.value = merged.state;
    return route.fulfill({ json: { metadata: { revision: ++state.revision }, sessionChange: { id: change.id, date,
      value: sessionDateValue(state.value, date) } } });
  });
  return state;
}

async function boot(page, state) {
  await page.goto("/qa/session-replay-harness");
  await page.evaluate(async ({ value, revision }) => {
    const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    window.saveStore = createSessionSaveStore();
    window.saveClient = createSessionSaveClient({ getScope: () => "coach:org:team", store: window.saveStore,
      send: async (change, baseRevision, scope) => {
        const response = await fetch("/qa/session-replay-api", { method: "POST", body: JSON.stringify({ change, baseRevision, scope }) });
        return { ok: response.ok, status: response.status, payload: await response.json() };
      },
    });
    window.saveClient.observe(JSON.stringify(value), { revision });
  }, { value: state.value, revision: state.revision });
}

async function stage(page, after, before) {
  expect(await page.evaluate(({ after, before }) => window.saveClient.stage(JSON.stringify(after), { previousValue: JSON.stringify(before) }), { after, before })).toEqual({ ok: true });
}

test("real IndexedDB retains the exact edit through a retry burst and page reload", async ({ page, context }) => {
  const state = await server(context); await boot(page, state);
  const after = initial(); after.sessions[date].title = "Offline instruction";
  await stage(page, after, initial());
  const before = await page.evaluate(() => window.saveStore.list("coach:org:team"));
  state.respond = () => 503;
  const failures = await page.evaluate(() => Promise.all(Array.from({ length: 18 }, () => window.saveClient.replay())));
  expect(state.calls).toHaveLength(1);
  expect(failures.every((result) => !result.ok && result.durablePending)).toBe(true);
  expect(await page.evaluate(() => window.saveStore.list("coach:org:team"))).toEqual(before);
  await page.reload();
  await boot(page, state);
  expect(await page.evaluate(() => window.saveStore.list("coach:org:team"))).toEqual(before);
  state.respond = null;
  expect(await page.evaluate(() => window.saveClient.replay())).toMatchObject({ ok: true, revision: 11 });
  expect(state.calls).toHaveLength(2);
  expect(state.calls[1].change).toEqual(state.calls[0].change);
  expect(state.value).toMatchObject(after);
  expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(true);
  expect(await page.evaluate(() => window.saveStore.list("coach:org:team"))).toEqual([]);
});

test("a second real page can persist B during A and a joined retry drains B with its own receipt", async ({ page, context }) => {
  const state = await server(context), peer = await context.newPage();
  await boot(page, state); await boot(peer, state);
  const enteredA = deferred(), releaseA = deferred(), enteredB = deferred(), releaseB = deferred();
  state.respond = async (change) => {
    const isA = change.after.session.title === "A";
    (isA ? enteredA : enteredB).resolve();
    await (isA ? releaseA : releaseB).promise;
  };
  const a = initial(); a.sessions[date].title = "A";
  await stage(page, a, initial());
  await page.evaluate(() => { window.firstReplay = window.saveClient.replay(); });
  try {
    await enteredA.promise;
    const b = initial(); b.sessions[date].blocks[0].title = "Peer B";
    await stage(peer, b, initial());
    const rows = await peer.evaluate(() => window.saveStore.list("coach:org:team"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.writer)).size).toBe(2);
    const bRow = rows.find((row) => row.change.after.session.blocks[0].title === "Peer B");
    await page.evaluate(() => { window.peerReplay = window.saveClient.replay(); });
    releaseA.resolve();
    await enteredB.promise;
    expect(await peer.evaluate(() => window.saveStore.list("coach:org:team"))).toEqual([bRow]);
    expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(false);
    expect(state.calls.map((call) => call.baseRevision)).toEqual([10, 11]);
    releaseB.resolve();
    expect(await page.evaluate(() => window.firstReplay)).toMatchObject({ ok: true, revision: 12 });
    expect(await page.evaluate(() => window.peerReplay)).toMatchObject({ ok: true, revision: 12 });
    expect(state.calls).toHaveLength(2);
    expect(state.value.sessions[date]).toMatchObject({ title: "A", blocks: [{ title: "Peer B", tacticalFrames: b.sessions[date].blocks[0].tacticalFrames }] });
    expect(await peer.evaluate(() => window.saveStore.list("coach:org:team"))).toEqual([]);
  } finally { releaseA.resolve(); releaseB.resolve(); await peer.close(); }
});
