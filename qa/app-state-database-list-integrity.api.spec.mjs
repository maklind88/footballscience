import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const adapter = require("../api/_lib/app-state-records-database.js");
const handler = require("../api/app-state.js");
const { rateLimitBuckets } = require("../api/_lib/platform-security.js");
const key = "football-schedule-v1";
const row = { organization_id: "global", state_key: key, revision: 9, value: '{"events":[{"id":"accepted"}]}', removed: false };
const envKeys = ["APP_STATE_DATABASE_MODE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"];

async function withSource(payload, run) {
  const originalFetch = global.fetch;
  const previous = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  envKeys.forEach(k => delete process.env[k]);
  Object.assign(process.env, { APP_STATE_DATABASE_MODE: "database", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key", SUPABASE_ANON_KEY: "synthetic-anon" });
  rateLimitBuckets.clear();
  const storageReads = [], writes = [];
  global.fetch = async (url, options = {}) => {
    const u = new URL(url), method = options.method || "GET";
    if (method !== "GET") writes.push(u.pathname);
    if (u.pathname === "/auth/v1/user") return Response.json({ id: "list-integrity-admin", app_metadata: { role: "admin", status: "active" } });
    if (u.pathname === "/rest/v1/platform_app_state_records") return Response.json(payload);
    if (u.pathname === "/storage/v1/bucket/footballscience-app-state") return Response.json({ id: "footballscience-app-state" });
    if (u.pathname.startsWith("/storage/v1/object/")) {
      storageReads.push(u.pathname);
      return new Response("{}", { status: 404 });
    }
    throw new Error(`Unexpected synthetic request ${u.pathname}`);
  };
  try { return await run({ storageReads, writes }); }
  finally {
    global.fetch = originalFetch;
    envKeys.forEach(k => previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k]);
  }
}

const invalid = {
  object: {}, null: null, string: "not a record list", "null row": [null],
  "missing key": [{}], "non-string key": [{ ...row, state_key: 7 }],
  "wrong organization": [{ ...row, organization_id: "another-organization" }],
  "missing organization": [{ ...row, organization_id: undefined }],
  "invalid value": [{ ...row, value: {} }],
  "invalid tombstone flag": [{ ...row, removed: "false" }],
  "mixed valid and invalid": [row, null],
  "duplicate key": [row, { ...row, revision: 8, value: "stale" }],
};
for (const [name, payload] of Object.entries(invalid)) {
  test(`database list rejects ${name} before normalization`, async () => {
    await withSource(payload, async () => {
      const result = await adapter.listAppStateRecords("global", [key]);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(502);
      expect(result.entries).toBeUndefined();
    });
  });
  test(`central read rejects ${name} without absence, fallback or bootstrap writes`, async () => {
    await withSource(payload, async ({ storageReads, writes }) => {
      for (const url of [`/api/app-state?fresh=1&keys=${key}`, "/api/app-state?fresh=1"]) {
        const res = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
        await handler({ method: "GET", url, headers: { authorization: "Bearer synthetic-access" } }, res);
        expect(res.statusCode).toBe(500);
        expect(res.body.entries).toBeUndefined();
        expect(res.body.absentKeys).toBeUndefined();
      }
      expect(storageReads).toEqual([]);
      expect(writes).toEqual([]);
    });
  });
}

test("confirmed empty database list remains valid", async () => {
  await withSource([], async () => expect(await adapter.listAppStateRecords()).toMatchObject({ ok: true, entries: [] }));
});
test("valid rows and authoritative tombstones retain their values and revisions", async () => {
  const tombstone = { ...row, state_key: "football-medical-team-v1", revision: 10, removed: true, value: null };
  await withSource([row, tombstone], async () => {
    const result = await adapter.listAppStateRecords();
    expect(result.ok).toBe(true);
    expect(result.entries).toMatchObject([{ key, revision: 9, value: row.value }, { key: tombstone.state_key, revision: 10, removed: true }]);
  });
});
