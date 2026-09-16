import { test, expect } from "@playwright/test";
import { createSessionSavePilotClient } from "../src/modules/session-planner/session-save-pilot-client.mjs";
import { initial, date, principal, hash } from "./helpers/session-save-pilot-harness.mjs";

const key = "football-session-planner-v3";
const copy = (value) => structuredClone(value);

function harness(mutate = () => {}) {
  const rows = new Map(), calls = [], context = copy(principal);
  const store = {
    list: async (scope) => [...rows.values()].filter((row) => row.scope === scope).map(copy),
    putMany: async (records) => records.forEach((row) => rows.set(row.change.id, copy(row))),
    remove: async (row) => { if (JSON.stringify(rows.get(row.change.id)) !== JSON.stringify(row)) return false; rows.delete(row.change.id); return true; },
  };
  const central = copy(initial); central.sessions[date].title = "Local A";
  central.sessions["2026-09-17"] = { date: "2026-09-17", title: "Colleague", blocks: [] };
  const raw = JSON.stringify(central);
  let n = 0;
  const client = createSessionSavePilotClient({ getContext: () => context, store, makeId: () => `op-${++n}`, request: async (options) => {
    const body = JSON.parse(options.body), change = JSON.parse(body.sessionChange); calls.push(body);
    if (body.action === "reconcile") {
      const snapshot = { schema: "session-save-snapshot-v1", key, actorId: context.actorId, organizationId: context.organizationId,
        clubId: context.clubId, teamId: context.teamId, operationId: change.id, date: change.date, revision: 12, hash: hash(raw), value: raw };
      const response = { ok: true, status: 200, payload: { ok: true, snapshot } };
      await mutate(snapshot, response, context); return response;
    }
    return { ok: true, status: 200, payload: { ok: true, replayed: false, receipt: JSON.stringify({ schema: "session-save-receipt-v1", key,
      actorId: context.actorId, organizationId: context.organizationId, teamId: context.teamId,
      id: change.id, date: change.date, revision: 12, hash: hash(raw), updatedAt: "2026-09-16T12:00:00Z", value: change.after }) } };
  } });
  client.observe(JSON.stringify(initial), { revision: 10, hash: hash(JSON.stringify(initial)) });
  const desired = copy(initial); desired.sessions[date].title = "Local A";
  return { client, rows, calls, desired, central };
}

test("one verified read fills a calendar gap and removes only the acknowledged immutable operation", async () => {
  const h = harness();
  const result = await h.client.save(JSON.stringify(h.desired));
  expect(result.ok).toBe(true); expect(JSON.parse(result.value)).toMatchObject(h.central);
  expect(result.metadata).toMatchObject({ revision: 12, hash: hash(JSON.stringify(h.central)) });
  expect(h.rows.size).toBe(0); expect(h.calls.map((body) => body.action || "write")).toEqual(["write", "reconcile"]);
  expect(h.calls[0].sessionChange).toBe(h.calls[1].sessionChange);
});

for (const [name, mutate] of [
  ["schema", (s) => { s.schema = "unknown"; }], ["key", (s) => { s.key = "football-medical-team-v1"; }],
  ["actor", (s) => { s.actorId = "other"; }], ["organization", (s) => { s.organizationId = "global"; }],
  ["club", (s) => { s.clubId = null; }], ["team", (s) => { s.teamId = "other"; }],
  ["operation", (s) => { s.operationId = "other"; }], ["date", (s) => { s.date = "2026-09-18"; }],
  ["stale revision", (s) => { s.revision = 11; }], ["fractional revision", (s) => { s.revision = 12.5; }],
  ["missing revision", (s) => { delete s.revision; }], ["hash mismatch", (s) => { s.hash = "0".repeat(64); }],
  ["coerced hash", (s) => { s.hash = [s.hash]; }], ["bad compression", (s) => { s.value = { encoding: "gzip-base64-v1", data: "AAAA" }; }],
  ["oversize decoded snapshot", (s) => { s.value = "x".repeat(12 * 1024 * 1024 + 1); }],
  ["same-revision different calendar", (s) => { s.value = JSON.stringify(initial); s.hash = hash(s.value); }],
  ["missing calendar", (s) => { s.value = "{}"; s.hash = hash(s.value); s.revision = 13; }],
  ["unsafe field", (s) => { s.value = '{"sessions":{},"__proto__":{}}'; s.hash = hash(s.value); s.revision = 13; }],
  ["invalid date", (s) => { s.value = JSON.stringify({ sessions: { "2026-09-16": { date: "2026-09-17", blocks: [] } } }); s.hash = hash(s.value); s.revision = 13; }],
  ["invalid status", (_s, r) => { r.ok = "true"; }], ["failed response", (_s, r) => { r.ok = false; r.status = 503; }],
  ["missing snapshot", (_s, r) => { delete r.payload.snapshot; }], ["auth epoch", (_s, _r, c) => { c.epoch = "new-epoch"; }],
  ["network failure", () => { throw new Error("Network unavailable"); }],
]) {
  test(`reconcile ${name} preserves the pending row and baseline without automatic loops`, async () => {
    const h = harness(mutate);
    expect((await h.client.stage(JSON.stringify(h.desired))).ok).toBe(true);
    const pending = [...h.rows.values()].map(copy);
    expect(await h.client.replay()).toMatchObject({ ok: false, reconcileRequired: true, durablePending: true });
    expect([...h.rows.values()]).toEqual(pending); expect(JSON.parse(h.client.centralValue())).toEqual(initial);
    expect(h.calls).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 5)); expect(h.calls).toHaveLength(2);
  });
}
