import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createSessionSavePilotClient } from "../src/modules/session-planner/session-save-pilot-client.mjs";
import { date, initial, principal, invoke, syntheticAuth } from "./helpers/session-save-pilot-harness.mjs";

const require = createRequire(import.meta.url);
const { createSessionSavePilotHandler } = require("../api/_lib/session-save-pilot-http.js");
const { createSessionSavePilot } = require("../api/app-state.js");
const clone = (value) => structuredClone(value);
const key = "football-session-planner-v3";

test("unwired HTTP boundary requires verified auth, POST, valid body and preserves the rate guard", async () => {
  const auth = syntheticAuth(); let rpcCalls = 0;
  const handler = createSessionSavePilotHandler({ request: async () => { rpcCalls++; throw new Error("Unexpected RPC"); } });
  try {
    expect((await invoke(handler, {})).status).toBe(401);
    expect((await invoke(handler, { token: "forged" })).status).toBe(401);
    expect((await invoke(handler, { method: "OPTIONS" })).status).toBe(204);
    expect((await invoke(handler, { token: auth.token, method: "GET" })).status).toBe(405);
    for (const body of [{}, { key: "football-medical-team-v1" }, { key, removed: true }, { key, value: "{}" },
      { key, sessionChange: "broken JSON" }, { key, sessionChange: { encoding: "gzip-base64-v1", data: "invalid" } }]) {
      expect((await invoke(handler, { token: auth.token, body })).status).toBe(400);
    }
    expect((await invoke(handler, { token: auth.token, raw: "x".repeat(4 * 1024 * 1024 + 1) })).status).toBe(413);
    let response;
    for (let i = 0; i < 65; i++) response = await invoke(handler, { token: auth.token, body: {} });
    expect(response.status).toBe(429); expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    expect(response.headers["cache-control"]).toBe("no-store"); expect(rpcCalls).toBe(0);
  } finally { auth.close(); }
});

function harness(mutate = () => {}) {
  const rows = new Map(), calls = [];
  const context = clone(principal);
  const store = {
    list: async (scope) => [...rows.values()].filter((r) => r.scope === scope).map(clone),
    putMany: async (records) => records.forEach((r) => rows.set(r.change.id, clone(r))),
    remove: async (expected) => {
      if (JSON.stringify(rows.get(expected.change.id)) !== JSON.stringify(expected)) return false;
      rows.delete(expected.change.id); return true;
    },
  };
  let n = 0;
  const client = createSessionSavePilotClient({ getContext: () => context, store, makeId: () => `op-${++n}`, request: async (options) => {
    calls.push(options); const body = JSON.parse(options.body), change = JSON.parse(body.sessionChange);
    const receipt = { schema: "session-save-receipt-v1", key, actorId: principal.actorId, organizationId: principal.organizationId,
      teamId: principal.teamId, id: change.id, date: change.date, revision: 11, hash: "a".repeat(64), updatedAt: "2026-09-16T00:00:00Z", value: change.after };
    const response = { ok: true, status: 200, payload: { ok: true, replayed: false, receipt: JSON.stringify(receipt) } };
    mutate(receipt, response, context); if (response.payload.receipt !== null) response.payload.receipt = JSON.stringify(receipt);
    return response;
  } });
  client.observe(JSON.stringify(initial), { revision: 10 });
  const changed = clone(initial); changed.sessions[date].title = "Pending";
  return { client, rows, calls, context, changed };
}

for (const [name, mutate] of [
  ["key", (r) => { delete r.key; }], ["actor", (r) => { r.actorId = "other"; }],
  ["organization", (r) => { r.organizationId = "global"; }], ["team", (r) => { r.teamId = "other"; }],
  ["operation", (r) => { r.id = "other"; }], ["date", (r) => { r.date = "2026-09-17"; }],
  ["revision", (r) => { delete r.revision; }], ["stale new revision", (r) => { r.revision = 10; }],
  ["fractional revision", (r) => { r.revision = 10.5; }], ["hash", (r) => { r.hash = ""; }],
  ["coerced hash", (r) => { r.hash = [r.hash]; }], ["non-boolean success", (_r, res) => { res.ok = "true"; }],
  ["coerced timestamp", (r) => { r.updatedAt = [r.updatedAt]; }],
  ["timestamp", (r) => { r.updatedAt = "invalid"; }], ["payload date", (r) => { r.value.session.date = "2026-09-17"; }],
  ["duplicate exercise", (r) => { r.value.session.blocks.push(clone(r.value.session.blocks[0])); }],
  ["missing replay marker", (_r, res) => { delete res.payload.replayed; }],
  ["missing receipt", (_r, res) => { res.payload.receipt = null; }],
  ["auth epoch", (_r, _res, ctx) => { ctx.epoch = "new-auth-session"; }],
]) {
  test(`unverified pilot ${name} never removes a durable operation`, async () => {
    const h = harness(mutate);
    expect((await h.client.save(JSON.stringify(h.changed))).ok).toBe(false);
    expect(h.rows.size).toBe(1); expect(h.calls).toHaveLength(1);
  });
}

test("missing canonical organization never adopts a legacy journal namespace or sends", async () => {
  const h = harness(); delete h.context.organizationId;
  expect((await h.client.save(JSON.stringify(h.changed))).ok).toBe(false); expect(h.calls).toEqual([]);
});

test("a transport conflict already reconciled server-side is not multiplied by the client", async () => {
  const h = harness((_r, response) => { response.ok = false; response.status = 409; response.payload = { reason: "Keep pending", receipt: null }; });
  expect((await h.client.save(JSON.stringify(h.changed))).ok).toBe(false); expect(h.calls).toHaveLength(1); expect(h.rows.size).toBe(1);
});

test("receipt preflight failure prevents even the first database commit", async () => {
  const raw = JSON.stringify(initial);
  const { createHash } = await import("node:crypto");
  const { createSessionDateChanges } = await import("../src/modules/session-planner/session-save-protocol.mjs");
  const after = clone(initial); after.sessions[date].title = "Saved";
  let commits = 0;
  const save = createSessionSavePilot({ prepareReceipt: async () => { throw new Error("too large"); }, request: async (name) => {
    if (name !== "read_session_save_context") { commits++; throw new Error("Must not commit"); }
    return { ok: true, scope: principal, roles: ["coach"], authorizationToken: "a".repeat(64), workspaceHub: "{}",
      entry: { key, moduleId: "session-planner", organizationId: principal.organizationId, metadata: { teamId: principal.teamId },
        removed: false, revision: 10, value: raw, hash: createHash("sha256").update(raw).digest("hex") },
      operation: { found: false, matches: false, receipt: null } };
  } });
  expect(await save({ actorId: principal.actorId, teamId: principal.teamId, change: createSessionDateChanges(initial, after)[0] })).toMatchObject({ ok: false, status: 413 });
  expect(commits).toBe(0);
});
