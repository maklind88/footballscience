import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import {
  CENTRAL_APP_STATE_ENDPOINT,
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

const supabaseEnvKeys = [
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
    organizationId: "org-existing",
    mergePolicy: dataSafetyRegistry.getByKey(key)?.mergePolicy || "",
    value: typeof value === "string" ? value : JSON.stringify(value),
    updatedAt: "2026-05-07T00:00:00.000Z",
    updatedBy: "coach-existing",
    revision: 1,
    ...overrides,
  };
}

function createMockPlatformUser(role = "coach") {
  return {
    id: "coach-1",
    email: "coach@example.com",
    user_metadata: {
      firstName: "QA",
      lastName: "Coach",
      username: "qa.coach",
    },
    app_metadata: {
      role,
      status: "active",
    },
    created_at: "2026-05-07T00:00:00.000Z",
  };
}

function createAppStateFetchMock(initialObjects = {}, role = "coach") {
  const objects = new Map(Object.entries(initialObjects));
  const writes = [];
  const user = createMockPlatformUser(role);

  const fetchMock = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(user), { status: 200 });
    }

    if (requestUrl.includes("/auth/v1/admin/users/coach-1")) {
      return new Response(JSON.stringify(user), { status: 200 });
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

test("central app-state increments revision and stamps module safety metadata", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const key = "football-schedule-v1";
  const path = `global/${key}.json`;
  const storage = createAppStateFetchMock({
    [path]: createAppStateStorageEntry(key, { events: [{ id: "existing", title: "Existing" }] }, { revision: 2 }),
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
      organizationId: "org-existing",
      moduleId: "schedule",
    });
    expect(response.payload.metadata).toMatchObject({
      revision: 3,
      organizationId: "org-existing",
      moduleId: "schedule",
      mergePolicy: "revision-guarded-last-write",
    });
    const scheduleWrite = storage.writes.find((write) => write.objectPath === path);
    expect(scheduleWrite.entry).toMatchObject({
      key,
      revision: 3,
      organizationId: "org-existing",
      moduleId: "schedule",
      sourceOfTruth: SERVER_SOURCE_OF_TRUTH,
      localPersistence: LOCAL_CACHE_ONLY,
      savePipeline: "central-app-state",
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
  const path = `global/${key}.json`;
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
