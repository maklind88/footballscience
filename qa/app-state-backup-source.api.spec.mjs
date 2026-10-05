import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const handler = require("../api/app-state-backup.js");
const { rateLimitBuckets } = require("../api/_lib/platform-security.js");
test.beforeEach(() => rateLimitBuckets.clear());
const key = "football-schedule-v1";
const envKeys = ["APP_STATE_DATABASE_MODE", "CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];

async function backup({ database = false, storageStatus = 200, storageBody, databaseStatus = 200, databaseRows } = {}) {
  const before = Object.fromEntries(envKeys.map(k => [k, process.env[k]])), originalFetch = global.fetch;
  const writes = [], reads = [], databaseWrites = [];
  for (const k of envKeys) delete process.env[k];
  Object.assign(process.env, { CRON_SECRET: "synthetic-cron", SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service", APP_STATE_DATABASE_MODE: database ? "database" : "" });
  global.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/bucket/footballscience-app-state")) return Response.json({ id: "footballscience-app-state" });
    if (u.pathname.endsWith("/rpc/snapshot_session_save_page")) return Response.json({ schema: "session-save-page-v1",
      organizationId: "global", entry: null, rows: [], receiptCount: 0, revision: 0, hash: "" });
    if (u.pathname.endsWith("/platform_app_state_records")) {
      if (options.method && options.method !== "GET") databaseWrites.push(options);
      expect(u.searchParams.get("organization_id")).toBe("eq.global");
      return Response.json(u.searchParams.get("state_key") === `eq.${key}` ? databaseRows ?? [] : [], { status: databaseStatus });
    }
    if (u.pathname.includes("/global/")) {
      reads.push(u.pathname);
      return u.pathname.endsWith(`${key}.json`)
        ? new Response(storageBody ?? JSON.stringify({ key, value: '{"events":[{"id":"storage"}]}', revision: 2 }), { status: storageStatus })
        : new Response("{}", { status: 404 });
    }
    if (u.pathname.includes("/backups/app-state/")) {
      writes.push({ path: u.pathname, value: JSON.parse(options.body) });
      return Response.json({ Key: "synthetic-backup" });
    }
    throw new Error(`Unexpected test request: ${u.pathname}`);
  };
  const res = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  try {
    await handler({ method: "POST", url: "/api/app-state-backup", headers: { authorization: "Bearer synthetic-cron" } }, res);
    return { status: res.statusCode, body: res.body, writes, reads, databaseWrites };
  } finally {
    global.fetch = originalFetch;
    for (const k of envKeys) before[k] === undefined ? delete process.env[k] : process.env[k] = before[k];
  }
}

for (const status of [400, 401, 403, 429, 500, 503]) test(`backup never publishes missing data after Storage HTTP ${status}`, async () => {
  const result = await backup({ storageStatus: status, storageBody: '{"message":"Synthetic failure"}' });
  expect(result.status).toBe(500);
  expect(result.writes).toEqual([]);
});
for (const body of ["invalid json", "null", "{}", JSON.stringify({ key: "other-key", value: "{}" }), JSON.stringify({ key, value: 123 })]) {
  test(`backup rejects invalid Storage record ${body}`, async () => {
    const result = await backup({ storageBody: body });
    expect(result.status).toBe(500);
    expect(result.writes).toEqual([]);
  });
}
test("confirmed absent Storage data remains a valid empty backup", async () => {
  const result = await backup({ storageStatus: 404 });
  expect(result.status).toBe(200);
  expect(result.body.entryCount).toBe(0);
  expect(result.writes.at(-1).path).toMatch(/latest.json$/);
});
test("valid Storage data is preserved with its revision and hash", async () => {
  const result = await backup();
  expect(result.status).toBe(200);
  expect(result.writes[0].value.entries[key]).toBe('{"events":[{"id":"storage"}]}');
  expect(result.writes[0].value.manifest[key]).toMatchObject({ revision: 2, present: true });
});
const row = { organization_id: "global", state_key: key, revision: 9, value: '{"events":[{"id":"database"}]}', removed: false };
test("database backup uses accepted database content instead of a stale mirror", async () => {
  const result = await backup({ database: true, databaseRows: [row], storageStatus: 503 });
  expect(result.status).toBe(200);
  expect(result.writes[0].value.entries[key]).toBe(row.value);
  expect(result.writes[0].value.manifest[key].revision).toBe(9);
  expect(result.reads.some(path => path.endsWith(`${key}.json`))).toBe(false);
  expect(result.databaseWrites).toEqual([]);
});
test("database tombstone cannot be replaced with an old active Storage copy", async () => {
  const result = await backup({ database: true, databaseRows: [{ ...row, removed: true }] });
  expect(result.status).toBe(200);
  expect(result.writes[0].value.entries[key]).toBeUndefined();
  expect(result.writes[0].value.manifest[key]).toEqual({ present: false });
});
test("missing database record retains the legacy Storage fallback without seeding", async () => {
  const result = await backup({ database: true, databaseRows: [] });
  expect(result.status).toBe(200);
  expect(result.writes[0].value.manifest[key].revision).toBe(2);
  expect(result.databaseWrites).toEqual([]);
});
test("database error cannot produce a successful backup from stale Storage", async () => {
  const result = await backup({ database: true, databaseStatus: 503 });
  expect(result.status).toBe(500);
  expect(result.writes).toEqual([]);
});

for (const [name, rows] of Object.entries({
  "non-array": {}, "duplicate": [row, row], "null row": [null],
  "wrong key": [{ ...row, state_key: "other" }],
  "wrong organization": [{ ...row, organization_id: "other" }],
  "invalid value": [{ ...row, value: {} }],
})) test(`invalid database response cannot fall back to Storage: ${name}`, async () => {
  const result = await backup({ database: true, databaseRows: rows });
  expect(result.status).toBe(500);
  expect(result.writes).toEqual([]);
});

test("precise wrapped Storage missing-object response remains an absent key", async () => {
  const result = await backup({ storageStatus: 400,
    storageBody: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }) });
  expect(result.status).toBe(200);
  expect(result.body.entryCount).toBe(0);
});
test("an unrelated Storage 404 error is not proof of an absent key", async () => {
  const result = await backup({ storageStatus: 404, storageBody: '{"code":"AccessDenied"}' });
  expect(result.status).toBe(500);
  expect(result.writes).toEqual([]);
});
