import { expect, test } from "@playwright/test";
import { createSessionSaveClient } from "../src/modules/session-planner/session-save-client.mjs";
import { applySessionDateChange, createSessionDateChanges, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const date = "2026-09-14";
const copy = (value) => structuredClone(value);
const initial = () => ({ sessions: { [date]: { date, title: "Training", blocks: [{ id: "a", title: "Press" }] } } });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const rows = new Map();
  const state = { value: initial(), revision: 10, scope: "coach:org:team", calls: [], respond: null };
  let id = 0;
  const store = {
    list: async (scope) => [...rows.values()].filter((row) => row.scope === scope).map(copy),
    putMany: async (batch) => { for (const row of batch) rows.set(row.change.id, copy(row)); },
    update: async (expected, next) => {
      if (JSON.stringify(rows.get(expected.change.id)) !== JSON.stringify(expected)) return false;
      rows.set(next.change.id, copy(next)); return true;
    },
    remove: async (expected) => {
      if (JSON.stringify(rows.get(expected.change.id)) !== JSON.stringify(expected)) return false;
      rows.delete(expected.change.id); return true;
    },
    resolveReview: async (expected, replacement) => {
      if (JSON.stringify(rows.get(expected.change.id)) !== JSON.stringify(expected)) return false;
      if (replacement) rows.set(replacement.change.id, copy(replacement));
      rows.set(expected.change.id, { ...copy(expected), status: "archived" }); return true;
    },
  };
  const client = createSessionSaveClient({ store, getScope: () => state.scope, makeId: () => `op-${++id}`,
    send: async (change, baseRevision, scope) => {
      state.calls.push({ change: copy(change), baseRevision, scope });
      const override = await state.respond?.(change, baseRevision);
      if (override) return override;
      if (baseRevision !== state.revision) return { ok: false, status: 409, payload: { currentRevision: state.revision } };
      const merged = applySessionDateChange(state.value, change);
      if (!merged.ok) return { ok: false, status: 409, payload: { currentRevision: state.revision, conflicts: merged.conflicts } };
      state.value = merged.state;
      return { ok: true, payload: { metadata: { revision: ++state.revision, hash: `hash-${state.revision}` },
        sessionChange: { id: change.id, date: change.date, value: sessionDateValue(state.value, change.date) } } };
    },
  });
  const observe = () => client.observe(JSON.stringify(state.value), { revision: state.revision });
  observe();
  async function stage(title, before = initial()) {
    const after = copy(before); after.sessions[date].title = title;
    expect(await client.stage(JSON.stringify(after), { previousValue: JSON.stringify(before) })).toEqual({ ok: true });
    return after;
  }
  return { client, rows, state, stage, observe };
}

for (const status of [0, 403, 503]) {
  test(`concurrent replay triggers share one failed attempt (${status}) and retain immutable rows`, async () => {
    const h = harness();
    await h.stage("Retain my edit");
    const original = copy([...h.rows.values()]);
    h.state.respond = () => ({ ok: false, status, payload: { reason: "Not confirmed" } });
    const results = await Promise.all(Array.from({ length: 18 }, () => h.client.replay()));
    expect(h.state.calls).toHaveLength(1);
    for (const result of results) expect(result).toMatchObject({ ok: false, status, durablePending: true });
    expect([...h.rows.values()]).toEqual(original);
    expect(await h.client.isSettled()).toBe(false);
    h.state.respond = null;
    expect(await h.client.replay()).toMatchObject({ ok: true });
    expect(h.state.calls).toHaveLength(2);
    expect(h.state.calls[1].change).toEqual(h.state.calls[0].change);
    expect(h.rows.size).toBe(0);
  });
}

test("a thrown network error shares one attempt, releases the flight and permits external recovery", async () => {
  const h = harness(); await h.stage("Offline edit");
  h.state.respond = () => { throw new Error("Network disconnected"); };
  const results = await Promise.all(Array.from({ length: 6 }, () => h.client.replay()));
  expect(h.state.calls).toHaveLength(1);
  expect(results.every((result) => !result.ok && result.durablePending)).toBe(true);
  h.state.respond = null;
  expect((await h.client.replay()).ok).toBe(true);
  expect(h.state.calls).toHaveLength(2);
});

test("concurrent replay does not multiply the existing single CAS retry", async () => {
  const h = harness(); await h.stage("CAS edit");
  h.state.respond = () => ({ ok: false, status: 409, payload: { currentRevision: 11 } });
  const results = await Promise.all(Array.from({ length: 18 }, () => h.client.replay()));
  expect(h.state.calls.map((call) => call.baseRevision)).toEqual([10, 11]);
  expect(h.state.calls[0].change).toEqual(h.state.calls[1].change);
  expect(results.every((result) => !result.ok && result.durablePending)).toBe(true);
  expect(h.rows.size).toBe(1);
});

test("mismatched receipts remain pending with no repeated automatic POST", async () => {
  const h = harness(); await h.stage("Needs exact receipt");
  h.state.respond = () => ({ ok: true, payload: { metadata: { revision: 11 },
    sessionChange: { id: "different-operation", date, value: sessionDateValue(h.state.value, date) } } });
  const results = await Promise.all(Array.from({ length: 6 }, () => h.client.replay()));
  expect(h.state.calls).toHaveLength(1);
  expect(results.every((result) => !result.ok && result.durablePending)).toBe(true);
  expect(h.rows.size).toBe(1);
});

test("a new durable B gets its own drain and only its own receipt clears it", async () => {
  const h = harness(), enteredA = deferred(), releaseA = deferred(), enteredB = deferred(), releaseB = deferred();
  const a = await h.stage("A");
  h.state.respond = async (change) => {
    const isA = change.after.session.title === "A";
    (isA ? enteredA : enteredB).resolve();
    await (isA ? releaseA : releaseB).promise;
  };
  const first = h.client.replay();
  await enteredA.promise;
  let second;
  try {
    await h.stage("B", a);
    second = h.client.replay();
    const duplicateB = h.client.replay();
    releaseA.resolve();
    expect((await first).ok).toBe(true);
    await enteredB.promise;
    expect(h.state.calls.map((call) => call.change.after.session.title)).toEqual(["A", "B"]);
    expect(h.state.calls.map((call) => call.baseRevision)).toEqual([10, 11]);
    expect([...h.rows.values()].map((row) => row.change.after.session.title)).toEqual(["B"]);
    expect(await h.client.isSettled()).toBe(false);
    releaseB.resolve();
    expect((await second).ok).toBe(true);
    expect((await duplicateB).ok).toBe(true);
    expect(h.rows.size).toBe(0);
    expect(h.state.value.sessions[date].title).toBe("B");
    expect(h.state.calls).toHaveLength(2);
  } finally { releaseA.resolve(); releaseB.resolve(); await first; await second; }
});

test("a staging request not yet persisted cannot share the older replay result", async () => {
  const h = harness(), entered = deferred(), release = deferred();
  const a = await h.stage("A");
  h.state.respond = async () => { entered.resolve(); await release.promise; };
  const first = h.client.replay(); await entered.promise;
  const b = copy(a); b.sessions[date].title = "B";
  const stagingB = h.client.stage(JSON.stringify(b), { previousValue: JSON.stringify(a) });
  const second = h.client.replay();
  release.resolve();
  expect((await stagingB).ok).toBe(true);
  expect((await first).ok).toBe(true);
  expect((await second).ok).toBe(true);
  expect(h.state.value.sessions[date].title).toBe("B");
  expect(h.rows.size).toBe(0);
});

test("a fresh observation may recover access without sharing the stale attempt", async () => {
  const h = harness(), entered = deferred(), release = deferred();
  await h.stage("A");
  h.state.respond = async () => {
    if (h.state.calls.length === 1) { entered.resolve(); await release.promise; return { ok: false, status: 403 }; }
  };
  const first = h.client.replay(); await entered.promise;
  h.observe();
  const recovery = h.client.replay(); release.resolve();
  expect((await first).ok).toBe(false);
  expect((await recovery).ok).toBe(true);
  expect(h.state.calls).toHaveLength(2);
});

test("a changed account cannot share or send the previous account's journal", async () => {
  const h = harness(), entered = deferred(), release = deferred();
  await h.stage("A private edit");
  h.state.respond = async () => { entered.resolve(); await release.promise; return { ok: false, status: 403 }; };
  const first = h.client.replay(); await entered.promise;
  h.state.scope = "other:org:team"; h.observe();
  const other = h.client.replay(); release.resolve();
  expect((await first).ok).toBe(false);
  expect((await other).ok).toBe(true);
  expect(h.state.calls.map((call) => call.scope)).toEqual(["coach:org:team"]);
  expect([...h.rows.values()][0].scope).toBe("coach:org:team");
});

test("an explicit review resolution remains a serialization barrier", async () => {
  const h = harness(); await h.stage("Local draft");
  h.state.value.sessions[date].title = "Colleague";
  expect((await h.client.replay()).reviewRequired).toBe(true);
  h.observe();
  const [row] = await h.client.reviews();
  const first = h.client.replay();
  const resolution = h.client.resolve(row.change.id, true, row.central);
  const afterResolution = h.client.replay();
  expect((await first).reviewRequired).toBe(true);
  expect((await resolution).ok).toBe(true);
  expect((await afterResolution).ok).toBe(true);
  expect(h.state.value.sessions[date].title).toBe("Local draft");
  expect(await h.client.isSettled()).toBe(true);
});

test("a replay arriving during a send rereads peer journal rows before reporting success", async () => {
  const h = harness(), entered = deferred(), release = deferred();
  await h.stage("A");
  h.state.respond = async () => { entered.resolve(); await release.promise; };
  const first = h.client.replay(); await entered.promise;
  const b = initial(); b.sessions[date].blocks[0].title = "Peer B";
  const change = createSessionDateChanges(initial(), b, () => "peer-b")[0];
  h.rows.set(change.id, { change, scope: h.state.scope, writer: "peer", status: "pending", createdAt: Date.now() });
  const peerTrigger = h.client.replay(); release.resolve();
  expect((await first).ok).toBe(true);
  expect((await peerTrigger).ok).toBe(true);
  expect(h.state.calls.map((call) => call.change.id)).toEqual(["op-2", "peer-b"]);
  expect(h.rows.size).toBe(0);
  expect(h.state.value.sessions[date]).toMatchObject({ title: "A", blocks: [{ title: "Peer B" }] });
});

test("shared delivery does not share mutable receipt objects between callers", async () => {
  const h = harness(); await h.stage("A");
  const [a, b] = await Promise.all([h.client.replay(), h.client.replay()]);
  expect(a.ok).toBe(true); expect(b.ok).toBe(true);
  a.value = "caller-specific local view";
  a.metadata.revision = -1;
  expect(JSON.parse(b.value).sessions[date].title).toBe("A");
  expect(b.metadata.revision).toBe(11);
  expect(h.state.calls).toHaveLength(1);
});

test("an empty journal recheck retains metadata from the exact confirmed revision", async () => {
  const h = harness(), entered = deferred(), release = deferred();
  await h.stage("A");
  h.state.respond = async () => { entered.resolve(); await release.promise; };
  const first = h.client.replay(); await entered.promise;
  const duplicate = h.client.replay(); release.resolve();
  expect((await first).metadata).toEqual({ revision: 11, hash: "hash-11" });
  expect((await duplicate).metadata).toEqual({ revision: 11, hash: "hash-11" });
  expect(h.state.calls).toHaveLength(1);
});
