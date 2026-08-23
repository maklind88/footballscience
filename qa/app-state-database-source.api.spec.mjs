import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const appStateHandler = require("../api/app-state.js");
const databaseAdapter = require("../api/_lib/app-state-records-database.js");
const migrationUrl = new URL(
  "../supabase/migrations/20260721153039_platform_app_state_database_source_v1.sql",
  import.meta.url
);
const rpcFixMigrationUrl = new URL(
  "../supabase/migrations/20260721153918_platform_app_state_write_rpc_v2.sql",
  import.meta.url
);

const scheduleKey = "football-schedule-v1";
const coachId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000101";
const membershipId = "00000000-0000-4000-8000-000000000201";
const schedulePath = `organizations/${organizationId}/${scheduleKey}.json`;
const envKeys = [
  "APP_STATE_DATABASE_MODE",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE",
];

test.describe.configure({ mode: "serial" });

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  envKeys.forEach((key) => {
    if (snapshot[key] === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = snapshot[key];
  });
}

function configureDatabaseMode() {
  envKeys.forEach((key) => delete process.env[key]);
  process.env.APP_STATE_DATABASE_MODE = "database";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = "") {
      this.body += chunk;
    },
  };
}

async function callHandler(req) {
  const res = createResponse();
  const body = req.body;
  const request = {
    method: "GET",
    url: "/api/app-state",
    headers: { authorization: "Bearer test-access-token" },
    ...req,
  };
  request[Symbol.asyncIterator] = async function* requestBodyIterator() {
    if (body !== undefined) {
      yield Buffer.from(String(body));
    }
  };
  await appStateHandler(request, res);
  return {
    status: res.statusCode,
    payload: res.body ? JSON.parse(res.body) : {},
  };
}

function toDatabaseRow(entry, applied) {
  return {
    ...(applied === undefined ? {} : { applied }),
    organization_id: entry.organizationId,
    state_key: entry.key,
    module_id: entry.moduleId,
    merge_policy: entry.mergePolicy,
    revision: entry.revision,
    value: entry.value,
    removed: entry.removed,
    updated_by: entry.updatedBy,
    updated_at: entry.updatedAt,
    value_hash: entry.hash,
    metadata: entry.metadata || {},
  };
}

function createConsistencyFetchMock(initialEntry) {
  let databaseEntry = structuredClone(initialEntry);
  const staleStorageEntry = structuredClone(initialEntry);
  const rpcWrites = [];
  const storageWrites = [];
  const databaseReads = [];

  const fetchMock = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user") || requestUrl.includes(`/auth/v1/admin/users/${coachId}`)) {
      return new Response(JSON.stringify({
        id: coachId,
        email: "coach@example.com",
        user_metadata: { firstName: "QA", lastName: "Coach" },
        app_metadata: { role: "coach", status: "active" },
      }), { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_memberships?")) {
      return new Response(JSON.stringify([{
        id: membershipId,
        organization_id: organizationId,
        club_id: null,
        team_id: null,
        user_id: coachId,
        role: "coach",
        scope: "organization",
        status: "active",
        relationship: "staff",
        accepted_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      }]), { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_user_profiles?")) {
      return new Response(JSON.stringify([{
        user_id: coachId,
        primary_organization_id: organizationId,
        primary_club_id: null,
        primary_team_id: null,
        email: "coach@example.com",
        status: "active",
      }]), { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_module_migration_checkpoints?")) {
      return new Response("[]", { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_organizations?")) {
      return new Response(JSON.stringify([{
        id: organizationId,
        slug: "qa-club",
        name: "QA Club",
        status: "active",
      }]), { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_app_state_tenant_migrations?")) {
      return new Response(JSON.stringify([{
        id: "00000000-0000-4000-8000-000000000301",
        status: "completed",
        plan_sha256: "a".repeat(64),
        completed_at: "2026-08-01T00:00:00.000Z",
      }]), { status: 200 });
    }

    if (requestUrl.includes("/rest/v1/platform_app_state_records?")) {
      databaseReads.push(requestUrl);
      const rows = requestUrl.includes("state_key=")
        ? (requestUrl.includes(encodeURIComponent(scheduleKey)) ? [toDatabaseRow(databaseEntry)] : [])
        : [toDatabaseRow(databaseEntry)];
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (requestUrl.endsWith("/rest/v1/rpc/write_platform_app_state_record") && method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      rpcWrites.push(body);
      if (body.p_expected_revision !== databaseEntry.revision) {
        return new Response(JSON.stringify([toDatabaseRow(databaseEntry, false)]), { status: 200 });
      }
      databaseEntry = {
        organizationId: body.p_organization_id,
        key: body.p_state_key,
        moduleId: body.p_module_id,
        mergePolicy: body.p_merge_policy,
        revision: databaseEntry.revision + 1,
        value: body.p_value,
        removed: body.p_removed,
        updatedBy: body.p_updated_by,
        updatedAt: "2026-07-21T16:01:00.000Z",
        hash: body.p_value_hash,
        metadata: body.p_metadata,
      };
      return new Response(JSON.stringify([toDatabaseRow(databaseEntry, true)]), { status: 200 });
    }

    if (requestUrl.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return new Response(JSON.stringify({ id: "footballscience-app-state" }), { status: 200 });
    }

    const storageMarker = "/storage/v1/object/footballscience-app-state/";
    if (requestUrl.includes(storageMarker)) {
      const objectPath = decodeURIComponent(requestUrl.split(storageMarker)[1].split("?", 1)[0]);
      if (method === "GET") {
        return objectPath === schedulePath
          ? new Response(JSON.stringify(staleStorageEntry), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      if (method === "PUT" || method === "POST") {
        storageWrites.push({ objectPath, body: JSON.parse(String(options.body || "{}")) });
        return new Response(JSON.stringify({ Key: objectPath }), { status: 200 });
      }
    }

    if (requestUrl.endsWith("/storage/v1/object/footballscience-app-state") && method === "DELETE") {
      return new Response(JSON.stringify({ deleted: 1 }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/bucket/") || requestUrl.includes("/storage/v1/object/")) {
      return method === "GET"
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  return {
    fetchMock,
    getDatabaseEntry: () => structuredClone(databaseEntry),
    getStaleStorageEntry: () => structuredClone(staleStorageEntry),
    rpcWrites,
    storageWrites,
    databaseReads,
  };
}

test("database source migration enforces atomic revisions and server-only access", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const rpcFixSql = await readFile(rpcFixMigrationUrl, "utf8");

  expect(sql).toContain("primary key (organization_id, state_key)");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("revoke all on public.platform_app_state_records from anon, authenticated");
  expect(sql).toContain("for update");
  expect(sql).toContain("current_record.revision <> coalesce(p_expected_revision, -1)");
  expect(sql).toContain("on conflict (organization_id, state_key) do nothing");
  expect(sql).toContain("security invoker");
  expect(sql).not.toContain("security definer");
  expect(sql).toContain("from public, anon, authenticated");
  expect(sql).toContain("to service_role");
  expect(rpcFixSql).toContain("on conflict on constraint platform_app_state_records_pkey do nothing");
  expect(rpcFixSql).toContain("security invoker");
  expect(rpcFixSql).not.toContain("security definer");
});

test("database adapter stays disabled unless explicitly enabled", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  let fetchCount = 0;
  envKeys.forEach((key) => delete process.env[key]);
  global.fetch = async () => {
    fetchCount += 1;
    return new Response("[]", { status: 200 });
  };

  try {
    expect(databaseAdapter.isAppStateDatabaseEnabled()).toBe(false);
    expect(await databaseAdapter.readAppStateRecord(scheduleKey)).toMatchObject({ ok: false, enabled: false });
    expect(fetchCount).toBe(0);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("successful database write is immediately visible even when Storage still serves stale content", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureDatabaseMode();

  const oldValue = JSON.stringify({ events: [{ id: "old", title: "Old training" }] });
  const initialEntry = {
    organizationId,
    key: scheduleKey,
    moduleId: "schedule",
    mergePolicy: "replace",
    revision: 7,
    value: oldValue,
    removed: false,
    updatedBy: "coach-existing",
    updatedAt: "2026-07-21T16:00:00.000Z",
    hash: sha256(oldValue),
    metadata: {},
  };
  const mock = createConsistencyFetchMock(initialEntry);
  global.fetch = mock.fetchMock;

  try {
    const nextValue = JSON.stringify({ events: [{ id: "new", title: "Updated team training" }] });
    const write = await callHandler({
      method: "POST",
      body: JSON.stringify({
        key: scheduleKey,
        value: nextValue,
        metadata: { baseRevision: 7 },
      }),
    });
    expect(write.status).toBe(200);
    expect(write.payload).toMatchObject({ ok: true, key: scheduleKey, revision: 8, value: nextValue });
    expect(mock.rpcWrites).toHaveLength(1);
    expect(mock.rpcWrites[0]).toMatchObject({ p_expected_revision: 7, p_next_revision: 8 });

    const freshRead = await callHandler({ method: "GET", url: "/api/app-state?fresh=1" });
    expect(freshRead.status).toBe(200);
    expect(freshRead.payload.entries[scheduleKey]).toBe(nextValue);
    expect(freshRead.payload.metadata[scheduleKey].revision).toBe(8);
    expect(mock.getDatabaseEntry().value).toBe(nextValue);
    expect(mock.getStaleStorageEntry().value).toBe(oldValue);
    expect(mock.storageWrites.some((entry) => entry.objectPath === schedulePath)).toBe(true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("database reads can be restricted to approved central state keys", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureDatabaseMode();

  const value = JSON.stringify({ events: [{ id: "current", title: "Current team training" }] });
  const mock = createConsistencyFetchMock({
    organizationId,
    key: scheduleKey,
    moduleId: "schedule",
    mergePolicy: "replace",
    revision: 11,
    value,
    removed: false,
    updatedBy: "coach-existing",
    updatedAt: "2026-07-21T16:10:00.000Z",
    hash: sha256(value),
    metadata: {},
  });
  global.fetch = mock.fetchMock;

  try {
    const response = await callHandler({
      method: "GET",
      url: `/api/app-state?fresh=1&keys=${encodeURIComponent(scheduleKey)}`,
    });

    expect(response.status).toBe(200);
    expect(response.payload.entries).toEqual({ [scheduleKey]: value });
    expect(response.payload.metadata[scheduleKey].revision).toBe(11);
    expect(mock.databaseReads).toHaveLength(3);
    const readStateKeyFilters = mock.databaseReads.map((url) => (
      new URL(url).searchParams.get("state_key")
    ));
    expect(readStateKeyFilters[0]).toContain(scheduleKey);
    expect(readStateKeyFilters[0]).toContain("football-workspace-hub-v3");
    expect(readStateKeyFilters.slice(1)).toEqual(expect.arrayContaining([
      "eq.football-workspace-hub-v3",
      "eq.football-transfer-room-v1",
    ]));

    const unrelatedResponse = await callHandler({
      method: "GET",
      url: "/api/app-state?fresh=1&keys=football-medical-team-v1,not-an-approved-key",
    });
    expect(unrelatedResponse.status).toBe(200);
    expect(unrelatedResponse.payload.entries).toEqual({});
    expect(unrelatedResponse.payload.metadata).toEqual({});
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
