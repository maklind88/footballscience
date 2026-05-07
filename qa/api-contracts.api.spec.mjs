import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const clientConfigHandler = require("../api/client-config.js");
const appStateHandler = require("../api/app-state.js");
const appStateBackupHandler = require("../api/app-state-backup.js");

const supabaseEnvKeys = [
  "CRON_SECRET",
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
  await handler(
    request,
    res
  );

  const payload = res.body ? JSON.parse(res.body) : {};
  return {
    status: res.statusCode,
    headers: res.headers,
    payload,
  };
}

const appStateSessionPlannerKey = "football-session-planner-v3";
const appStateSessionPlannerPath = `global/${appStateSessionPlannerKey}.json`;

function createAppStateStorageEntry(key, value, updatedAt = "2026-05-07T00:00:00.000Z") {
  return {
    schema: "footballscience-app-state-v1",
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    updatedAt,
    updatedBy: "coach-existing",
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

      if (method === "DELETE") {
        const body = JSON.parse(String(options.body || "{}"));
        const prefixes = Array.isArray(body?.prefixes) ? body.prefixes : [];
        prefixes.forEach((prefix) => objects.delete(prefix));
        return new Response(JSON.stringify({ deleted: prefixes.length }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  return { fetchMock, objects, writes };
}

test("client-config fails loudly when Supabase browser config is missing", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(clientConfigHandler);
    expect(response.status).toBe(500);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("SUPABASE_URL");
  } finally {
    restoreEnv(env);
  }
});

test("client-config exposes only browser-safe config when configured", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  try {
    const response = await callHandler(clientConfigHandler);
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      url: "https://example.supabase.co",
      anonKey: "anon-test-key",
      hasServiceRoleKey: true,
    });
    expect(JSON.stringify(response.payload)).not.toContain("service-role-test-key");
  } finally {
    restoreEnv(env);
  }
});

test("app-state rejects unauthenticated requests before touching Supabase storage", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {},
    });
    expect(response.status).toBe(401);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("signed in");
  } finally {
    restoreEnv(env);
  }
});

test("app-state merges concurrent Session Planner edits by field timestamps", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingState = {
    selectedDate: "2026-05-05",
    sessions: {
      "2026-05-05": {
        date: "2026-05-05",
        selectedBlockId: "block-1",
        blocks: [
          {
            id: "block-1",
            title: "Rondo",
            objective: "Central objective",
            organization: "Old organization",
            fieldUpdatedAt: {
              objective: "2026-05-07T15:00:00.000Z",
              organization: "2026-05-07T13:00:00.000Z",
            },
            updatedAt: "2026-05-07T15:00:00.000Z",
          },
        ],
      },
    },
  };
  const incomingState = {
    selectedDate: "2026-05-05",
    sessions: {
      "2026-05-05": {
        date: "2026-05-05",
        selectedBlockId: "block-1",
        blocks: [
          {
            id: "block-1",
            title: "Rondo",
            objective: "Stale local objective",
            organization: "New organization from another tab",
            fieldUpdatedAt: {
              objective: "2026-05-07T14:00:00.000Z",
              organization: "2026-05-07T16:00:00.000Z",
            },
            updatedAt: "2026-05-07T16:00:00.000Z",
          },
        ],
      },
    },
  };
  const storage = createAppStateFetchMock({
    [appStateSessionPlannerPath]: createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
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
        key: appStateSessionPlannerKey,
        value: JSON.stringify(incomingState),
      }),
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key: appStateSessionPlannerKey,
      merged: true,
    });

    const storedState = JSON.parse(storage.objects.get(appStateSessionPlannerPath).value);
    const storedBlock = storedState.sessions["2026-05-05"].blocks[0];
    expect(storedBlock.objective).toBe("Central objective");
    expect(storedBlock.organization).toBe("New organization from another tab");
    expect(response.payload.metadata.hash).toHaveLength(64);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state preserves Session Planner blocks during stale single-user saves", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingState = {
    selectedDate: "2026-05-05",
    sessions: {
      "2026-05-05": {
        date: "2026-05-05",
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Block one", fieldUpdatedAt: { title: "2026-05-07T12:00:00.000Z" } },
          { id: "block-2", title: "Block two", fieldUpdatedAt: { title: "2026-05-07T12:05:00.000Z" } },
        ],
      },
    },
  };
  const staleIncomingState = {
    selectedDate: "2026-05-05",
    sessions: {
      "2026-05-05": {
        date: "2026-05-05",
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Block one edited", fieldUpdatedAt: { title: "2026-05-07T12:10:00.000Z" } },
        ],
      },
    },
  };
  const storage = createAppStateFetchMock({
    [appStateSessionPlannerPath]: createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
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
        key: appStateSessionPlannerKey,
        value: JSON.stringify(staleIncomingState),
      }),
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      merged: true,
    });

    const storedState = JSON.parse(storage.objects.get(appStateSessionPlannerPath).value);
    const storedBlocks = storedState.sessions["2026-05-05"].blocks;
    expect(storedBlocks.map((block) => block.id)).toEqual(["block-1", "block-2"]);
    expect(storedBlocks[0].title).toBe("Block one edited");
    expect(storedBlocks[1].title).toBe("Block two");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state backup rejects requests without admin auth or cron secret", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  clearEnv(supabaseEnvKeys);

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup",
      headers: {},
    });
    expect(response.status).toBe(401);
    expect(response.payload).toMatchObject({
      ok: false,
    });
    expect(response.payload.reason).toContain("Admin");
  } finally {
    restoreEnv(env);
  }
});

test("app-state backup accepts Vercel cron secret and writes a backup pointer", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const writes = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return new Response(JSON.stringify({ id: "footballscience-app-state" }), { status: 200 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/global/football-schedule-v1.json")) {
      return new Response(
        JSON.stringify({
          key: "football-schedule-v1",
          value: JSON.stringify({ events: [{ title: "QA backup fixture" }] }),
          updatedAt: "2026-05-07T00:00:00.000Z",
        }),
        { status: 200 }
      );
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/global/")) {
      return new Response("{}", { status: 404 });
    }

    if (requestUrl.includes("/storage/v1/object/footballscience-app-state/backups/app-state/")) {
      writes.push({
        url: requestUrl,
        method: options.method,
        body: String(options.body || ""),
      });
      return new Response(JSON.stringify({ Key: "backup" }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      entryCount: 1,
    });
    expect(response.payload.path).toContain("backups/app-state/");
    expect(writes.some((write) => write.url.endsWith("/backups/app-state/latest.json"))).toBe(true);
    expect(writes.some((write) => write.body.includes("QA backup fixture"))).toBe(true);
    expect(JSON.stringify(writes)).not.toContain("service-role-test-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
