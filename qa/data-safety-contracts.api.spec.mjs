import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import {
  CENTRAL_APP_STATE_ENDPOINT,
  DEFAULT_CONTENT_SAFETY,
  LOCAL_CACHE_ONLY,
  REQUIRED_RECORD_FIELDS,
  SERVER_SOURCE_OF_TRUTH,
  dataSafetyContracts,
  dataSafetyRegistry,
  platformModuleRegistry,
  platformModules,
  protectedStorageKeys,
} from "../src/core/index.mjs";

const require = createRequire(import.meta.url);
const appStateHandler = require("../api/app-state.js");
const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000101";
const TEST_CLUB_ID = "00000000-0000-4000-8000-000000000201";
const TEST_TEAM_ID = "00000000-0000-4000-8000-000000000301";

const supabaseEnvKeys = [
  "APP_STATE_DATABASE_MODE",
  "APP_STATE_LEGACY_GLOBAL_ORGANIZATION_ID",
  "APP_STATE_LEGACY_READ_FALLBACK_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE",
];

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}

function clearEnv(keys) {
  keys.forEach((key) => {
    delete process.env[key];
  });
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
    },
    end(chunk = "") {
      response.body += chunk;
    },
  };
  return response;
}

async function callHandler(handler, req = {}) {
  const res = createMockResponse();
  const body = req.body;
  const request = {
    method: "GET",
    url: "/",
    headers: {},
    ...req,
  };
  if (!request[Symbol.asyncIterator]) {
    request[Symbol.asyncIterator] = async function* requestBodyIterator() {
      if (body !== undefined) {
        yield Buffer.from(String(body));
      }
    };
  }
  await handler(request, res);

  return {
    status: res.statusCode,
    headers: res.headers,
    payload: res.body ? JSON.parse(res.body) : {},
  };
}

function createAppStateStorageEntry(key, value, overrides = {}) {
  return {
    schema: "footballscience-app-state-v1",
    key,
    moduleId: dataSafetyRegistry.getByKey(key)?.moduleId || "",
    organizationId: TEST_ORGANIZATION_ID,
    mergePolicy: dataSafetyRegistry.getByKey(key)?.mergePolicy || "",
    value: typeof value === "string" ? value : JSON.stringify(value),
    updatedAt: "2026-05-07T00:00:00.000Z",
    updatedBy: TEST_USER_ID,
    revision: 1,
    ...overrides,
  };
}

function createMockPlatformUser(role = "coach") {
  return {
    id: TEST_USER_ID,
    email: "coach@example.com",
    user_metadata: {
      firstName: "QA",
      lastName: "Coach",
      username: "qa.coach",
    },
    app_metadata: {
      organizationId: TEST_ORGANIZATION_ID,
      role,
      status: "active",
    },
    created_at: "2026-05-07T00:00:00.000Z",
  };
}

function appStatePath(key) {
  return `organizations/${TEST_ORGANIZATION_ID}/${key}.json`;
}

function configureAppStateDatabaseEnv() {
  process.env.APP_STATE_DATABASE_MODE = "database";
  process.env.APP_STATE_LEGACY_GLOBAL_ORGANIZATION_ID = TEST_ORGANIZATION_ID;
}

function toDatabaseRow(entry = {}, applied) {
  const row = {
    organization_id: entry.organizationId,
    state_key: entry.key,
    module_id: entry.moduleId,
    merge_policy: entry.mergePolicy,
    revision: entry.revision,
    value: entry.value,
    removed: Boolean(entry.removed),
    updated_by: entry.updatedBy,
    updated_at: entry.updatedAt,
    value_hash: entry.hash || "a".repeat(64),
    metadata: entry.metadata || {},
  };
  return applied === undefined ? row : { ...row, applied };
}

function createAppStateFetchMock(initialObjects = {}, role = "coach") {
  configureAppStateDatabaseEnv();
  const objects = new Map(Object.entries(initialObjects));
  const writes = [];
  const user = createMockPlatformUser(role);

  const fetchMock = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(user), { status: 200 });
    }

    if (requestUrl.includes(`/auth/v1/admin/users/${TEST_USER_ID}`)) {
      return new Response(JSON.stringify(user), { status: 200 });
    }

    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.pathname === "/rest/v1/platform_user_profiles") {
      return new Response(JSON.stringify([{
        user_id: TEST_USER_ID,
        primary_organization_id: TEST_ORGANIZATION_ID,
        primary_club_id: TEST_CLUB_ID,
        primary_team_id: TEST_TEAM_ID,
        email: user.email,
        status: "active",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_memberships") {
      return new Response(JSON.stringify([{
        id: "00000000-0000-4000-8000-000000000401",
        organization_id: TEST_ORGANIZATION_ID,
        club_id: TEST_CLUB_ID,
        team_id: TEST_TEAM_ID,
        user_id: TEST_USER_ID,
        role,
        scope: "team",
        status: "active",
        relationship: "staff",
        accepted_at: "2026-05-07T00:00:00.000Z",
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-07T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_module_migration_checkpoints") {
      return new Response("[]", { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{
        id: TEST_ORGANIZATION_ID,
        slug: "qa-club",
        name: "QA Club",
        status: "active",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_clubs") {
      return new Response(JSON.stringify([{
        id: TEST_CLUB_ID,
        organization_id: TEST_ORGANIZATION_ID,
        slug: "qa-club",
        name: "QA Club",
        status: "active",
        updated_at: "2026-05-07T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_teams") {
      return new Response(JSON.stringify([{
        id: TEST_TEAM_ID,
        organization_id: TEST_ORGANIZATION_ID,
        club_id: TEST_CLUB_ID,
        slug: "qa-first-team",
        name: "QA First Team",
        status: "active",
        updated_at: "2026-05-07T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations") {
      return new Response(JSON.stringify([{
        id: "00000000-0000-4000-8000-000000000501",
        status: "completed",
        plan_sha256: "a".repeat(64),
        completed_at: "2026-05-07T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_app_state_records" && method === "GET") {
      const stateKeyFilter = String(parsedUrl.searchParams.get("state_key") || "");
      const keys = stateKeyFilter.startsWith("in.(") && stateKeyFilter.endsWith(")")
        ? stateKeyFilter.slice(4, -1).split(",").map((key) => key.trim()).filter(Boolean)
        : [stateKeyFilter.replace(/^eq\./, "")].filter(Boolean);
      const entries = keys
        .map((key) => objects.get(appStatePath(key)))
        .filter(Boolean)
        .map((entry) => toDatabaseRow(entry));
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/rpc/write_platform_app_state_record" && method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const objectPath = appStatePath(body.p_state_key);
      const current = objects.get(objectPath);
      if (Number(body.p_expected_revision || 0) !== Number(current?.revision || 0)) {
        return new Response(JSON.stringify(current ? [toDatabaseRow(current, false)] : []), { status: 200 });
      }
      const entry = {
        schema: "footballscience-app-state-v1",
        key: body.p_state_key,
        moduleId: body.p_module_id,
        organizationId: body.p_organization_id,
        mergePolicy: body.p_merge_policy,
        revision: Number(body.p_next_revision),
        value: body.p_value,
        removed: Boolean(body.p_removed),
        updatedBy: body.p_updated_by,
        updatedAt: "2026-05-07T00:01:00.000Z",
        hash: body.p_value_hash,
        metadata: body.p_metadata || {},
      };
      objects.set(objectPath, entry);
      writes.push({ method: entry.removed ? "DELETE" : "POST", objectPath, entry });
      return new Response(JSON.stringify([toDatabaseRow(entry, true)]), { status: 200 });
    }

    if (requestUrl.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return new Response(JSON.stringify({ id: "footballscience-app-state" }), { status: 200 });
    }

    const objectMarker = "/storage/v1/object/footballscience-app-state/";
    const objectMarkerIndex = requestUrl.indexOf(objectMarker);
    if (objectMarkerIndex >= 0) {
      const objectPath = decodeURIComponent(requestUrl.slice(objectMarkerIndex + objectMarker.length).split("?", 1)[0]);
      if (method === "GET") {
        if (!objects.has(objectPath)) {
          return new Response("{}", { status: 404 });
        }
        return new Response(JSON.stringify(objects.get(objectPath)), { status: 200 });
      }

      if (method === "PUT" || method === "POST") {
        const entry = JSON.parse(String(options.body || "{}"));
        objects.set(objectPath, entry);
        writes.push({ method, objectPath, entry });
        return new Response(JSON.stringify({ Key: objectPath }), { status: 200 });
      }

      if (method === "DELETE") {
        objects.delete(objectPath);
        writes.push({ method, objectPath, entry: null });
        return new Response(JSON.stringify({ Key: objectPath }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  return { fetchMock, objects, writes };
}

test("data safety registry covers every protected module storage key", () => {
  expect(dataSafetyRegistry.assertStorageKeyCoverage(protectedStorageKeys)).toBe(true);
  expect(dataSafetyRegistry.assertModuleCoverage(platformModules)).toBe(true);
  expect(dataSafetyRegistry.assertRequiredContractFields()).toBe(true);
  expect(platformModuleRegistry.assertDataSafetyCoverage()).toBe(true);
});

test("every module contract uses the central save pipeline and cache-only browser storage", () => {
  const seenKeys = new Set();

  for (const contract of dataSafetyContracts) {
    expect(seenKeys.has(contract.key), `${contract.key} should have one owner`).toBe(false);
    seenKeys.add(contract.key);
    expect(contract.saveEndpoint).toBe(CENTRAL_APP_STATE_ENDPOINT);
    expect(contract.sourceOfTruth).toBe(SERVER_SOURCE_OF_TRUTH);
    expect(contract.localPersistence).toBe(LOCAL_CACHE_ONLY);
    expect(contract.contentSafety).toMatchObject(DEFAULT_CONTENT_SAFETY);
    expect(contract.requiresOrganizationId).toBe(true);
    expect(contract.scope.tenancy).toBe("organization");
    expect(contract.mergePolicy).toBeTruthy();
    expect(contract.revision).toMatchObject({
      required: true,
      strategy: "server-increment",
    });
    for (const field of REQUIRED_RECORD_FIELDS) {
      expect(contract.requiredFields).toContain(field);
    }
  }
});

test("central app-state rejects executable user content before writing module state", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock();
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify({
          events: [{ id: "unsafe", title: "<img src=x onerror=alert(1)>Match" }],
        }),
      }),
    });

    expect(response.status).toBe(400);
    expect(response.payload.reason).toContain("blocked executable content");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state rejects prototype pollution keys before writing module state", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock();
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: '{"events":[],"__proto__":{"polluted":true}}',
      }),
    });

    expect(response.status).toBe(400);
    expect(response.payload.reason).toContain("not allowed in central state");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state increments revision and stamps module safety metadata", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock({
    [path]: createAppStateStorageEntry(key, { events: [{ id: "existing", title: "Existing" }] }, { revision: 2 }),
  }, "admin");
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify({ events: [{ id: "new", title: "New" }] }),
        metadata: {
          baseRevision: 2,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key,
      revision: 3,
      organizationId: TEST_ORGANIZATION_ID,
      moduleId: "schedule",
    });
    expect(response.payload.metadata).toMatchObject({
      revision: 3,
      organizationId: TEST_ORGANIZATION_ID,
      moduleId: "schedule",
      mergePolicy: "revision-guarded-last-write",
    });
    const scheduleWrite = storage.writes.find((write) => write.objectPath === path);
    expect(scheduleWrite.entry).toMatchObject({
      key,
      revision: 3,
      organizationId: TEST_ORGANIZATION_ID,
      moduleId: "schedule",
      mergePolicy: "revision-guarded-last-write",
      updatedBy: TEST_USER_ID,
    });
    expect(scheduleWrite.entry.hash).toMatch(/^[a-f0-9]{64}$/);

    const freshRead = await callHandler(appStateHandler, {
      method: "GET",
      url: `/api/app-state?fresh=1&keys=${encodeURIComponent(key)}`,
      headers: {
        authorization: "Bearer test-access-token",
      },
    });
    expect(freshRead.status).toBe(200);
    expect(freshRead.payload.entries[key]).toBe(JSON.stringify({ events: [{ id: "new", title: "New" }] }));
    expect(freshRead.payload.metadata[key]).toMatchObject({
      revision: 3,
      organizationId: TEST_ORGANIZATION_ID,
      moduleId: "schedule",
      mergePolicy: "revision-guarded-last-write",
      hash: scheduleWrite.entry.hash,
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state rejects stale versioned writes before overwriting newer module data", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock({
    [path]: createAppStateStorageEntry(key, { events: [{ id: "newer", title: "Newer central value" }] }, { revision: 5 }),
  });
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify({ events: [{ id: "stale", title: "Old tab value" }] }),
        metadata: {
          baseRevision: 4,
        },
      }),
    });

    expect(response.status).toBe(409);
    expect(response.payload).toMatchObject({
      ok: false,
      currentRevision: 5,
    });
    expect(response.payload.reason).toContain("central state is already newer");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
    expect(JSON.parse(storage.objects.get(path).value).events[0].title).toBe("Newer central value");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state rejects unversioned writes once module data exists", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock({
    [path]: createAppStateStorageEntry(key, { events: [{ id: "safe", title: "Central value" }] }, { revision: 5 }),
  });
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify({ events: [{ id: "old", title: "Old client value" }] }),
      }),
    });

    expect(response.status).toBe(409);
    expect(response.payload).toMatchObject({
      ok: false,
      currentRevision: 5,
      missingBaseRevision: true,
    });
    expect(response.payload.reason).toContain("current central revision");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
    expect(JSON.parse(storage.objects.get(path).value).events[0].title).toBe("Central value");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state lets Player Profiles editors update only their own team logo", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-platform-structure-v1";
  const path = appStatePath(key);
  const previousStructure = {
    version: 1,
    activeClubId: TEST_CLUB_ID,
    activeTeamId: TEST_TEAM_ID,
    clubs: [{ id: TEST_CLUB_ID, name: "QA Club", shortName: "QA", status: "active" }],
    teams: [
      {
        id: TEST_TEAM_ID,
        clubId: TEST_CLUB_ID,
        name: "QA First Team",
        shortName: "QA",
        logoUrl: "data:image/webp;base64,b2xk",
        level: "First Team",
        season: "2026",
        status: "active",
      },
    ],
    memberships: [],
  };
  const svgLogo =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#123" d="M0 0h10v10H0z"/></svg>');
  const nextStructure = {
    ...previousStructure,
    teams: previousStructure.teams.map((team) => ({ ...team, logoUrl: svgLogo })),
  };
  const storage = createAppStateFetchMock(
    {
      [path]: createAppStateStorageEntry(key, previousStructure, { revision: 2 }),
    },
    "team-admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer logo-update-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify(nextStructure),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key,
      revision: 3,
      merged: true,
    });
    const structureWrite = storage.writes.find((write) => write.objectPath === path);
    const writtenStructure = JSON.parse(structureWrite.entry.value);
    expect(writtenStructure.teams[0].logoUrl).toBe(svgLogo);
    expect(writtenStructure.teams[0].name).toBe("QA First Team");
    expect(writtenStructure.clubs).toEqual(previousStructure.clubs);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state rejects delegated platform structure changes beyond team logo", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-platform-structure-v1";
  const path = appStatePath(key);
  const previousStructure = {
    version: 1,
    activeClubId: TEST_CLUB_ID,
    activeTeamId: TEST_TEAM_ID,
    clubs: [{ id: TEST_CLUB_ID, name: "QA Club", shortName: "QA", status: "active" }],
    teams: [
      {
        id: TEST_TEAM_ID,
        clubId: TEST_CLUB_ID,
        name: "QA First Team",
        shortName: "QA",
        logoUrl: "data:image/webp;base64,b2xk",
        level: "First Team",
        season: "2026",
        status: "active",
      },
    ],
    memberships: [],
  };
  const nextStructure = {
    ...previousStructure,
    teams: previousStructure.teams.map((team) => ({ ...team, name: "Changed Team Name" })),
  };
  const storage = createAppStateFetchMock(
    {
      [path]: createAppStateStorageEntry(key, previousStructure, { revision: 2 }),
    },
    "team-admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer structure-change-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify(nextStructure),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(403);
    expect(response.payload.reason).toContain("Only the active team logo");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state rejects unversioned deletes once module data exists", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = appStatePath(key);
  const storage = createAppStateFetchMock({
    [path]: createAppStateStorageEntry(key, { events: [{ id: "safe", title: "Central value" }] }, { revision: 5 }),
  });
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "DELETE",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({ key }),
    });

    expect(response.status).toBe(409);
    expect(response.payload).toMatchObject({
      ok: false,
      currentRevision: 5,
      missingBaseRevision: true,
    });
    expect(storage.writes.some((write) => write.objectPath === path && write.method === "DELETE")).toBe(false);
    expect(JSON.parse(storage.objects.get(path).value).events[0].title).toBe("Central value");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state blocks empty Medical saves from wiping clinical history", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-medical-team-v1";
  const path = appStatePath(key);
  const existingMedicalState = {
    selectedDate: "2026-05-15",
    players: [{ id: "player-1", name: "Protected Player" }],
    records: [{ id: "record-1", playerId: "player-1", date: "2026-05-15", participation: 25 }],
    injuryPlans: [{ id: "plan-1", playerId: "player-1", startDate: "2026-05-01", endDate: "2026-06-01" }],
  };
  const storage = createAppStateFetchMock(
    {
      [path]: createAppStateStorageEntry(key, existingMedicalState, { revision: 0 }),
    },
    "admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify({
          selectedDate: "2026-05-15",
          players: [{ id: "player-1", name: "Protected Player" }],
          records: [],
          injuryPlans: [],
        }),
        metadata: {
          baseRevision: 0,
        },
      }),
    });

    expect(response.status).toBe(409);
    expect(response.payload).toMatchObject({
      ok: false,
      clinicalReductionBlocked: true,
    });
    expect(response.payload.reason).toContain("remove all clinical records");
    expect(storage.writes.some((write) => write.objectPath === path)).toBe(false);
    expect(JSON.parse(storage.objects.get(path).value).records).toHaveLength(1);
    expect(JSON.parse(storage.objects.get(path).value).injuryPlans).toHaveLength(1);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("central app-state merges stale Medical saves without dropping availability plans", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-medical-team-v1";
  const path = appStatePath(key);
  const existingMedicalState = {
    selectedDate: "2026-05-16",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "Protected Player", updatedAt: "2026-05-07T12:05:00.000Z" }],
    records: [
      {
        id: "record-central",
        playerId: "player-1",
        date: "2026-05-16",
        participation: 75,
        updatedAt: "2026-05-07T12:05:00.000Z",
      },
    ],
    injuryPlans: [
      {
        id: "plan-central",
        playerId: "player-1",
        injuryType: "Central protected plan",
        startDate: "2026-05-01",
        endDate: "2026-05-21",
        updatedAt: "2026-05-07T12:05:00.000Z",
      },
    ],
  };
  const staleIncomingMedicalState = {
    selectedDate: "2026-05-17",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "Protected Player", updatedAt: "2026-05-07T12:00:00.000Z" }],
    records: [
      {
        id: "record-new",
        playerId: "player-1",
        date: "2026-05-17",
        participation: 50,
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    injuryPlans: [
      {
        id: "plan-new",
        playerId: "player-1",
        injuryType: "New medical plan from stale tab",
        startDate: "2026-05-17",
        endDate: "2026-06-14",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
  };
  const storage = createAppStateFetchMock(
    {
      [path]: createAppStateStorageEntry(key, existingMedicalState, { revision: 3 }),
    },
    "medical"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key,
        value: JSON.stringify(staleIncomingMedicalState),
        metadata: {
          baseRevision: 2,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key,
      merged: true,
    });
    expect(response.payload.metadata).toMatchObject({
      revision: 4,
      mergePolicy: "record-timestamp-merge",
    });

    const storedState = JSON.parse(storage.objects.get(path).value);
    expect(storedState.records.map((record) => record.id).sort()).toEqual(["record-central", "record-new"]);
    expect(storedState.injuryPlans.map((plan) => plan.id).sort()).toEqual(["plan-central", "plan-new"]);
    expect(storedState.selectedDate).toBe("2026-05-17");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
