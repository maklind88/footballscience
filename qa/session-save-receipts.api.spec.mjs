import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { canonicalSessionValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const require = createRequire(import.meta.url);
const { operationIdentity, findSessionReceipt, commitSessionReceipt, readSessionSaveEffects } = require("../api/_lib/session-save-receipts.js");
const { readSessionPlannerStateEntry, writeSessionPlannerStateValue } = require("../api/_lib/session-history.js");
const key = "football-session-planner-v3";
const entry = { key, organizationId: "org-a", value: "{}", revision: 3, hash: "a".repeat(64), updatedBy: "coach-a" };
const change = { id: "op-a", date: "2026-09-25", before: { a: 1, b: 2 }, after: { b: 3, a: 1 } };
const identity = operationIdentity({ id: "coach-a" }, entry, change, canonicalSessionValue);
const row = { state_key: key, organization_id: "org-a", revision: 3, value: "{}", value_hash: entry.hash, updated_by: "coach-a" };
let fetchBefore, envBefore;
const env = { APP_STATE_DATABASE_MODE: "database", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only", SUPABASE_ANON_KEY: "test-only" };
test.beforeEach(() => { fetchBefore = global.fetch; envBefore = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]])); Object.assign(process.env, env); });
test.afterEach(() => { global.fetch = fetchBefore; for (const [k, v] of Object.entries(envBefore)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("receipt identity is stable across object order but binds all shared content", () => {
  expect(operationIdentity({ id: "coach-a" }, entry, { after: { a: 1, b: 3 }, before: { b: 2, a: 1 }, date: change.date, id: change.id }, canonicalSessionValue)).toEqual(identity);
  expect(operationIdentity({ id: "coach-a" }, entry, { ...change, after: { a: 9 } }, canonicalSessionValue).hash).not.toBe(identity.hash);
  expect(() => operationIdentity({}, entry, change, canonicalSessionValue)).toThrow();
});

test("receipt lookup is scoped and reads current state after accepted proof", async () => {
  const paths = [];
  global.fetch = async (url) => {
    const parsed = new URL(url); paths.push(parsed.pathname);
    expect(parsed.searchParams.get("organization_id")).toBe("eq.org-a");
    expect(parsed.searchParams.get("state_key")).toBe(`eq.${key}`);
    if (parsed.pathname.endsWith("session_save_receipts")) {
      expect(parsed.searchParams.get("actor_id")).toBe("eq.coach-a");
      expect(parsed.searchParams.get("operation_id")).toBe("eq.op-a");
      return response([{ operation_hash: identity.hash, session_date: change.date, accepted_revision: 2 }]);
    }
    return response([{ ...row, value: "newer B" }]);
  };
  expect(await findSessionReceipt(identity)).toMatchObject({ ok: true, found: true, acceptedRevision: 2, entry: { revision: 3, value: "newer B" } });
  expect(paths).toEqual(["/rest/v1/session_save_receipts", "/rest/v1/platform_app_state_records"]);
});

for (const bad of ["wrong hash", "missing table", "read failure", "older revision", "wrong scope", "wrong key", "removed", "invalid revision"]) {
  test(`receipt lookup fails closed for ${bad}`, async () => {
    global.fetch = async (url) => {
      if (String(url).includes("session_save_receipts")) return response([{ operation_hash: bad === "wrong hash" ? "b".repeat(64) : identity.hash,
        session_date: change.date, accepted_revision: 2 }], bad === "missing table" ? 404 : 200);
      return response([{ ...row, ...(bad === "older revision" ? { revision: 1 } : {}), ...(bad === "wrong scope" ? { organization_id: "org-b" } : {}),
        ...(bad === "wrong key" ? { state_key: "another-key" } : {}), ...(bad === "removed" ? { removed: true } : {}),
        ...(bad === "invalid revision" ? { revision: 2.5 } : {}) }], bad === "read failure" ? 500 : 200);
    };
    expect((await findSessionReceipt(identity)).ok).toBe(false);
  });
}

for (const bad of ["missing key", "wrong key", "wrong scope", "stale revision", "missing accepted revision", "wrong content", "wrong actor", "invalid revision", "missing RPC"]) {
  test(`commit acknowledgement fails closed for ${bad} without Storage fallback`, async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(String(url));
      return response({ status: "committed", acceptedRevision: bad === "missing accepted revision" ? null : 3, entry: { ...row,
        ...(bad === "missing key" ? { state_key: null } : {}), ...(bad === "wrong key" ? { state_key: "other" } : {}),
        ...(bad === "wrong scope" ? { organization_id: "org-b" } : {}), ...(bad === "stale revision" ? { revision: 2 } : {}),
        ...(bad === "wrong content" ? { value: "unacknowledged" } : {}), ...(bad === "wrong actor" ? { updated_by: "coach-b" } : {}),
        ...(bad === "invalid revision" ? { revision: 3.5 } : {}) } }, bad === "missing RPC" ? 404 : 200);
    };
    expect((await commitSessionReceipt(entry, identity, {})).ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/rpc/commit_session_save");
  });
}

test("history read failure is not disguised as empty or delivered history", async () => {
  global.fetch = async () => response({}, 503);
  await expect(readSessionSaveEffects("org-a", 10)).rejects.toThrow("unavailable");
});

test("restore uses the verified database revision and never falls back after conflict", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes("/rpc/")) {
      const body = JSON.parse(options.body);
      expect(body.p_expected_revision).toBe(3);
      expect(body.p_organization_id).toBe("global");
      return response([{ ...row, organization_id: "global", applied: false, revision: 4, value: "newer B" }]);
    }
    expect(new URL(url).searchParams.get("organization_id")).toBe("eq.global");
    return response([{ ...row, organization_id: "global" }]);
  };
  const baseline = await readSessionPlannerStateEntry();
  expect(await writeSessionPlannerStateValue("restore A", { id: "coach-a" }, baseline)).toMatchObject({ ok: false, status: 409, currentRevision: 4 });
  expect(calls.some((url) => url.includes("/storage/"))).toBe(false);
});
