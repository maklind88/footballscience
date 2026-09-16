import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createSessionDateChanges, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const require = createRequire(import.meta.url);
const appState = require("../api/app-state.js");
const { createSessionSaveRpcTransport, createSessionSavePilot } = require("../api/_lib/session-save-pilot.js");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const date = "2026-09-16";
const state = { sessions: { [date]: { date, title: "Before", blocks: [{ id: "a", title: "Press", minutes: 15 }] } } };
const after = structuredClone(state); after.sessions[date].title = "After";
const change = createSessionDateChanges(state, after, () => "save-1")[0];
const args = () => ({ actorId: id(1), teamId: id(301), change: structuredClone(change) });
const context = () => ({ ok: true, scope: { actorId: id(1), organizationId: id(101), clubId: id(201), teamId: id(301) },
  roles: ["coach"], workspaceHub: "{}", authorizationToken: "a".repeat(64),
  entry: { key: "football-session-planner-v3", moduleId: "session-planner", organizationId: id(101),
    metadata: { teamId: id(301) }, removed: false, revision: 10, value: JSON.stringify(state), hash: hash(JSON.stringify(state)) },
  operation: { found: false, matches: false, receipt: null },
});
const receipt = (body) => ({ schema: "session-save-receipt-v1", id: body.p_change.id, date: body.p_change.date,
  key: "football-session-planner-v3", organizationId: body.p_organization_id, actorId: body.p_actor_id, teamId: body.p_team_id,
  revision: body.p_expected_revision + 1, hash: hash(body.p_value), updatedAt: "2026-09-16T12:00:00.000Z",
  value: sessionDateValue(JSON.parse(body.p_value), body.p_change.date),
});
function harness(options = {}) {
  const calls = [];
  const save = appState.createSessionSavePilot({ authorize: () => ({ ok: true }), request: async (name, body) => {
    calls.push({ name, body: structuredClone(body) });
    if (name === "read_session_save_context") return options.context?.(context()) ?? context();
    const result = { ok: true, replayed: false, receipt: receipt(body) };
    return options.commit ? options.commit(result, body) : result;
  } });
  return { save, calls, writes: () => calls.filter((call) => call.name === "commit_authorized_session_save") };
}

test("pilot policy cannot be overridden and the legacy export remains the HTTP handler", async () => {
  expect(typeof appState).toBe("function");
  expect(() => createSessionSavePilot()).toThrow("requires");
  const h = harness({ context: (c) => ({ ...c, roles: ["medical"] }) });
  expect(await h.save(args())).toMatchObject({ ok: false, status: 403 });
  expect(h.writes()).toEqual([]);
});

test("operation bytes are captured before the first await; browser identity claims are ignored", async () => {
  const h = harness(), input = args(), original = structuredClone(input.change);
  input.organizationId = id(999); input.role = "admin"; input.user_metadata = { teamId: id(999) };
  const pending = h.save(input);
  input.change.after.session.title = "Mutated while awaiting"; input.change.id = "later";
  expect(await pending).toMatchObject({ ok: true });
  expect(h.writes()[0].body.p_change).toEqual(original);
  expect(h.writes()[0].body.p_organization_id).toBe(id(101));
});

test("invalid principal, date and deletion envelope are rejected before database access", async () => {
  const invalid = [
    { ...args(), actorId: "global" }, { ...args(), teamId: "" },
    { ...args(), change: { ...change, date: "2026-02-30" } },
    { ...args(), change: { ...change, after: { session: { ...after.sessions[date], blocks: [] }, tombstones: {} } } },
  ];
  for (const input of invalid) {
    const h = harness(); expect(await h.save(input)).toMatchObject({ ok: false, status: 400 }); expect(h.calls).toEqual([]);
  }
});

for (const [name, mutate] of [
  ["actor", (c) => { c.scope.actorId = id(2); }],
  ["team", (c) => { c.scope.teamId = id(302); }],
  ["global organization", (c) => { c.scope.organizationId = "global"; }],
  ["unknown role", (c) => { c.roles = ["root"]; }],
  ["token", (c) => { c.authorizationToken = ""; }],
  ["workspace JSON", (c) => { c.workspaceHub = "not-json"; }],
  ["record team", (c) => { c.entry.metadata.teamId = id(302); }],
  ["record organization", (c) => { c.entry.organizationId = id(102); }],
  ["record key", (c) => { c.entry.key = "football-medical-team-v1"; }],
  ["deleted record", (c) => { c.entry.removed = true; }],
  ["unsafe revision", (c) => { c.entry.revision = Number.MAX_SAFE_INTEGER; }],
  ["value hash", (c) => { c.entry.value = "{}"; }],
]) {
  test(`unverified context ${name} cannot reach the write RPC`, async () => {
    const h = harness({ context: (c) => { mutate(c); return c; } });
    expect(await h.save(args())).toMatchObject({ ok: false, status: 502 }); expect(h.writes()).toEqual([]);
  });
}

for (const [name, mutate] of [
  ["missing key despite high revision", (r) => { delete r.key; r.revision = 999; }],
  ["wrong actor", (r) => { r.actorId = id(2); }],
  ["wrong organization", (r) => { r.organizationId = id(102); }],
  ["wrong operation", (r) => { r.id = "different"; }],
  ["missing revision", (r) => { delete r.revision; }],
  ["stale revision", (r) => { r.revision = 10; }],
  ["wrong hash", (r) => { r.hash = "b".repeat(64); }],
  ["wrong payload", (r) => { r.value.session.title = "Not saved"; }],
]) {
  test(`unverified receipt ${name} is never a successful save`, async () => {
    const h = harness({ commit: (r) => { mutate(r.receipt); return r; } });
    expect(await h.save(args())).toMatchObject({ ok: false, status: 502 }); expect(h.writes()).toHaveLength(1);
  });
}

test("two consecutive revision/authorization conflicts stop after one fresh authorized reconcile", async () => {
  for (const conflict of [{ ok: false, status: 409, currentRevision: 11 }, { ok: false, status: 409, contextChanged: true }]) {
    const h = harness({ commit: () => conflict });
    expect(await h.save(args())).toMatchObject({ ok: false, status: 409 });
    expect(h.calls.map((c) => c.name)).toEqual(["read_session_save_context", "commit_authorized_session_save",
      "read_session_save_context", "commit_authorized_session_save"]);
  }
});

test("failed commit transport is uncertain and never silently retried", async () => {
  const h = harness({ commit: () => { throw new Error("offline"); } });
  expect(await h.save(args())).toMatchObject({ ok: false, status: 503 }); expect(h.writes()).toHaveLength(1);
});

test("current security content filters still reject executable strings", async () => {
  const input = args(); input.change.after.session.blocks[0].objective = '<img onerror="alert(1)">';
  const h = harness(); expect(await h.save(input)).toMatchObject({ ok: false, status: 400 }); expect(h.writes()).toEqual([]);
});

test("transport uses a bounded server-only RPC request and sanitizes HTTP/body failures", async () => {
  const config = { url: "https://example.supabase.co", serviceRoleKey: "synthetic-service-key" };
  let count = 0;
  const rpc = createSessionSaveRpcTransport({ config, fetchImpl: async (url, options) => {
    count++; expect(url).toBe(`${config.url}/rest/v1/rpc/read_session_save_context`);
    expect(options.method).toBe("POST"); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.apikey).toBe(config.serviceRoleKey);
    return new Response('{"message":"must-not-leak-secret-or-training"}', { status: 500 });
  } });
  const result = await rpc("read_session_save_context", { p_actor_id: id(1), p_team_id: id(301), p_change: change });
  expect(result).toEqual({ ok: false, status: 500, reason: "Sessions database request failed." }); expect(count).toBe(1);
  await expect(rpc("arbitrary_function", {})).rejects.toThrow("Unsupported"); expect(count).toBe(1);
  for (const response of [() => { throw new Error("network"); }, () => ({ ok: true, json: async () => { throw new Error("body failed"); } })]) {
    let attempts = 0;
    const failing = createSessionSaveRpcTransport({ config, fetchImpl: async () => { attempts++; return response(); } });
    expect(await failing("commit_authorized_session_save", {})).toMatchObject({ ok: false, status: 503 }); expect(attempts).toBe(1);
  }
  const malformed = createSessionSaveRpcTransport({ config, fetchImpl: async () => new Response('{"ok":"true"}') });
  expect(await malformed("read_session_save_context", {})).toMatchObject({ ok: false, status: 502 });
});
