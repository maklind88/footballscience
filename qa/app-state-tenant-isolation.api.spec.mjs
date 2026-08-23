import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const appStateHandler = require("../api/app-state.js");
const scheduleKey = "football-schedule-v1";
const orgA = "00000000-0000-4000-8000-000000000101";
const orgB = "00000000-0000-4000-8000-000000000102";
const actorA = "00000000-0000-4000-8000-000000000001";
const actorB = "00000000-0000-4000-8000-000000000002";
const envKeys = [
  "APP_STATE_DATABASE_MODE",
  "APP_STATE_LEGACY_GLOBAL_ORGANIZATION_ID",
  "APP_STATE_LEGACY_READ_FALLBACK_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

test.describe.configure({ mode: "serial" });

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function stateRow(organizationId, value, revision) {
  return {
    organization_id: organizationId,
    state_key: scheduleKey,
    module_id: "schedule",
    merge_policy: "entity-aware",
    revision,
    value,
    removed: false,
    updated_by: organizationId === orgA ? actorA : actorB,
    updated_at: "2026-08-23T10:00:00.000Z",
    value_hash: hash(value),
    metadata: {},
  };
}

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  envKeys.forEach((key) => {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  });
}

function configureEnv() {
  envKeys.forEach((key) => delete process.env[key]);
  process.env.APP_STATE_DATABASE_MODE = "database";
  process.env.APP_STATE_LEGACY_GLOBAL_ORGANIZATION_ID = orgA;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(chunk = "") { this.body += chunk; },
  };
}

async function callHandler(token, request = {}) {
  const res = createResponse();
  const body = request.body;
  const req = {
    method: "GET",
    url: "/api/app-state?fresh=1",
    ...request,
    headers: { authorization: `Bearer ${token}`, ...(request.headers || {}) },
  };
  req[Symbol.asyncIterator] = async function* bodyIterator() {
    if (body !== undefined) yield Buffer.from(String(body));
  };
  await appStateHandler(req, res);
  return { status: res.statusCode, payload: res.body ? JSON.parse(res.body) : {} };
}

function getHeader(options, name) {
  const entries = options?.headers instanceof Headers
    ? Array.from(options.headers.entries())
    : Object.entries(options?.headers || {});
  return String(entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "");
}

function createTenantFetchMock({ migrationCompleted = true } = {}) {
  const valueA = JSON.stringify({ events: [{ id: "a-training", title: "Club A private" }] });
  const valueB = JSON.stringify({ events: [{ id: "b-training", title: "Club B private" }] });
  const store = new Map([
    [orgA, stateRow(orgA, valueA, 2)],
    [orgB, stateRow(orgB, valueB, 9)],
    ["global", stateRow("global", JSON.stringify({ events: [{ id: "legacy", title: "Legacy private" }] }), 5)],
  ]);
  const recordReadOrganizations = [];
  const rpcWrites = [];

  const fetchMock = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const method = String(options.method || "GET").toUpperCase();
    const bearer = getHeader(options, "authorization");
    const requestedUser = `${requestUrl.pathname} ${requestUrl.search}`;
    const isB = bearer.includes("token-b") || requestedUser.includes(actorB);
    const userId = isB ? actorB : actorA;
    const canonicalOrg = isB ? orgB : orgA;

    if (requestUrl.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({
        id: userId,
        email: `${isB ? "b" : "a"}@example.com`,
        user_metadata: { organizationId: isB ? orgA : orgB },
        app_metadata: { role: "admin", status: "active" },
      }), { status: 200 });
    }
    if (requestUrl.pathname.startsWith("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify({
        id: userId,
        email: `${isB ? "b" : "a"}@example.com`,
        app_metadata: { role: "admin", status: "active" },
      }), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_memberships") {
      return new Response(JSON.stringify([{
        id: isB ? "00000000-0000-4000-8000-000000000202" : "00000000-0000-4000-8000-000000000201",
        organization_id: canonicalOrg,
        club_id: null,
        team_id: null,
        user_id: userId,
        role: "admin",
        scope: "organization",
        status: "active",
        relationship: "staff",
        accepted_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_user_profiles") {
      return new Response(JSON.stringify([{
        user_id: userId,
        primary_organization_id: canonicalOrg,
        primary_club_id: null,
        primary_team_id: null,
        email: `${isB ? "b" : "a"}@example.com`,
        status: "active",
      }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_module_migration_checkpoints") {
      return new Response("[]", { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{ id: canonicalOrg, slug: `club-${isB ? "b" : "a"}`, name: "Club", status: "active" }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations") {
      return new Response(JSON.stringify([{
        id: "00000000-0000-4000-8000-000000000301",
        status: migrationCompleted ? "completed" : "applying",
        plan_sha256: "a".repeat(64),
        completed_at: migrationCompleted ? "2026-08-01T00:00:00.000Z" : null,
      }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_records") {
      const tenantFilter = String(requestUrl.searchParams.get("organization_id") || "").replace(/^eq\./, "");
      recordReadOrganizations.push(tenantFilter);
      const keyFilter = String(requestUrl.searchParams.get("state_key") || "");
      const current = store.get(tenantFilter);
      const include = current && (!keyFilter || keyFilter.includes(scheduleKey));
      return new Response(JSON.stringify(include ? [current] : []), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/rpc/write_platform_app_state_record") {
      const body = JSON.parse(String(options.body || "{}"));
      rpcWrites.push(body);
      const current = store.get(body.p_organization_id);
      const currentRevision = Number(current?.revision || 0);
      if (Number(body.p_expected_revision || 0) !== currentRevision) {
        return new Response(JSON.stringify(current ? [{ ...current, applied: false }] : []), { status: 200 });
      }
      const next = {
        organization_id: body.p_organization_id,
        state_key: body.p_state_key,
        module_id: body.p_module_id,
        merge_policy: body.p_merge_policy,
        revision: Number(body.p_next_revision),
        value: body.p_value,
        removed: Boolean(body.p_removed),
        updated_by: body.p_updated_by,
        updated_at: "2026-08-23T11:00:00.000Z",
        value_hash: body.p_value_hash,
        metadata: body.p_metadata,
      };
      store.set(body.p_organization_id, next);
      return new Response(JSON.stringify([{ ...next, applied: true }]), { status: 200 });
    }
    if (requestUrl.pathname === "/storage/v1/bucket/footballscience-app-state") {
      return new Response(JSON.stringify({ id: "footballscience-app-state", public: false }), { status: 200 });
    }
    if (requestUrl.pathname === "/storage/v1/object/footballscience-app-state" && method === "DELETE") {
      return new Response(JSON.stringify({ deleted: 1 }), { status: 200 });
    }
    if (requestUrl.pathname.startsWith("/storage/v1/object/footballscience-app-state/")) {
      return method === "GET"
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  return { fetchMock, recordReadOrganizations, rpcWrites, store, valueA, valueB };
}

test("canonical tenant scope ignores spoofed user metadata and isolates reads", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureEnv();
  const mock = createTenantFetchMock();
  global.fetch = mock.fetchMock;
  try {
    const a = await callHandler("token-a");
    expect(a.status).toBe(200);
    expect(a.payload.organizationId).toBe(orgA);
    expect(a.payload.entries[scheduleKey]).toBe(mock.valueA);
    expect(JSON.stringify(a.payload)).not.toContain("Club B private");
    expect(mock.recordReadOrganizations).not.toContain(orgB);
    expect(mock.recordReadOrganizations).not.toContain("global");

    mock.recordReadOrganizations.length = 0;
    const b = await callHandler("token-b");
    expect(b.status).toBe(200);
    expect(b.payload.organizationId).toBe(orgB);
    expect(b.payload.entries[scheduleKey]).toBe(mock.valueB);
    expect(JSON.stringify(b.payload)).not.toContain("Club A private");
    expect(mock.recordReadOrganizations).not.toContain(orgA);
    expect(mock.recordReadOrganizations).not.toContain("global");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("temporary legacy fallback is read-only and available only to the explicitly designated organization", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureEnv();
  process.env.APP_STATE_LEGACY_READ_FALLBACK_ENABLED = "true";
  const mock = createTenantFetchMock({ migrationCompleted: false });
  mock.store.delete(orgA);
  global.fetch = mock.fetchMock;
  try {
    const legacyRead = await callHandler("token-a", {
      url: `/api/app-state?fresh=1&access=fresh&keys=${scheduleKey}`,
    });
    expect(legacyRead.status).toBe(200);
    expect(legacyRead.payload.entries[scheduleKey]).toContain("Legacy private");
    expect(legacyRead.payload.migrationRequiredKeys).toContain(scheduleKey);
    expect(legacyRead.payload.writeAccess[scheduleKey]).toBe(false);
    expect(legacyRead.payload.seedAccess[scheduleKey]).toBe(false);
    expect(mock.recordReadOrganizations).toContain("global");

    const blockedWrite = await callHandler("token-a", {
      method: "POST",
      body: JSON.stringify({ key: scheduleKey, value: "{}", metadata: { baseRevision: 5 } }),
    });
    expect(blockedWrite.status).toBe(503);
    expect(blockedWrite.payload.reason).toContain("read-only");
    expect(mock.rpcWrites).toHaveLength(0);

    mock.recordReadOrganizations.length = 0;
    const otherTenant = await callHandler("token-b");
    expect(otherTenant.status).toBe(200);
    expect(otherTenant.payload.entries[scheduleKey]).toBe(mock.valueB);
    expect(mock.recordReadOrganizations).not.toContain("global");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("incomplete legacy migration fails closed when temporary fallback is not explicitly enabled", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureEnv();
  const mock = createTenantFetchMock({ migrationCompleted: false });
  global.fetch = mock.fetchMock;
  try {
    const response = await callHandler("token-a");
    expect(response.status).toBe(503);
    expect(response.payload.reason).toContain("migration is incomplete");
    expect(mock.recordReadOrganizations).toEqual([]);
    expect(mock.rpcWrites).toEqual([]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("seed, update, conflict, and delete never cross canonical tenant boundaries", async () => {
  const env = snapshotEnv();
  const originalFetch = global.fetch;
  configureEnv();
  const mock = createTenantFetchMock();
  global.fetch = mock.fetchMock;
  try {
    mock.store.delete(orgA);
    const seededValue = JSON.stringify({ events: [{ id: "a-new", title: "A seed" }] });
    const seed = await callHandler("token-a", {
      method: "POST",
      body: JSON.stringify({ key: scheduleKey, value: seededValue, metadata: { baseRevision: 0 } }),
    });
    expect(seed.status).toBe(200);
    expect(seed.payload.organizationId).toBe(orgA);
    expect(mock.rpcWrites.at(-1).p_organization_id).toBe(orgA);
    expect(mock.store.get(orgB).value).toBe(mock.valueB);

    const conflict = await callHandler("token-a", {
      method: "POST",
      body: JSON.stringify({ key: scheduleKey, value: "{}", metadata: { baseRevision: 0 } }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.payload.currentRevision).toBe(1);
    expect(JSON.stringify(conflict.payload)).not.toContain("Club B private");
    expect(mock.store.get(orgB).value).toBe(mock.valueB);

    const updatedValue = JSON.stringify({ events: [{ id: "a-new", title: "A update" }] });
    const update = await callHandler("token-a", {
      method: "POST",
      body: JSON.stringify({ key: scheduleKey, value: updatedValue, metadata: { baseRevision: 1 } }),
    });
    expect(update.status).toBe(200);
    expect(mock.store.get(orgA).value).toBe(updatedValue);
    expect(mock.store.get(orgB).value).toBe(mock.valueB);

    const removed = await callHandler("token-a", {
      method: "DELETE",
      url: `/api/app-state?key=${scheduleKey}`,
      body: JSON.stringify({ key: scheduleKey, metadata: { baseRevision: 2 } }),
    });
    expect(removed.status).toBe(200);
    expect(mock.store.get(orgA).removed).toBe(true);
    expect(mock.store.get(orgB).removed).toBe(false);
    expect(mock.rpcWrites.every((write) => write.p_organization_id === orgA)).toBe(true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
