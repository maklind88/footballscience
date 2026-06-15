import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const clientConfigHandler = require("../api/client-config.js");
const appStateHandler = require("../api/app-state.js");
const appStateBackupHandler = require("../api/app-state-backup.js");
const sessionHistoryHandler = require("../api/session-history.js");
const { getCurrentActor } = require("../api/_lib/supabase-admin.js");
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");

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

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
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
const appStateSessionHistoryKey = "football-session-planner-history-v1";
const appStateSessionHistoryPath = `global/${appStateSessionHistoryKey}.json`;
const appStateChatKey = "football-dashboard-chat-v1";
const periodizationKey = "football-periodization-v2";
const periodizationPath = `global/${periodizationKey}.json`;
const workspaceHubKey = "football-workspace-hub-v3";
const workspaceHubPath = `global/${workspaceHubKey}.json`;
const playerProfilesKey = "football-player-profiles-v1";
const playerProfilesPath = `global/${playerProfilesKey}.json`;
const medicalTeamKey = "football-medical-team-v1";
const medicalTeamPath = `global/${medicalTeamKey}.json`;
const transferRoomKey = "football-transfer-room-v1";
const transferRoomPath = `global/${transferRoomKey}.json`;

function createAppStateStorageEntry(key, value, updatedAt = "2026-05-07T00:00:00.000Z") {
  return {
    schema: "footballscience-app-state-v1",
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    updatedAt,
    updatedBy: "coach-existing",
    revision: 1,
  };
}

function createSquadStatusRepairFixture() {
  const currentState = {
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "available",
        squadStatus: "depth",
        shirtNumber: 9,
      },
    ],
    changeLog: [
      {
        id: "change-status",
        playerId: "player-1",
        changes: [
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
        ],
        createdAt: "2026-06-08T12:00:00.000Z",
      },
    ],
  };
  const backupState = {
    ...currentState,
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "national-team",
        squadStatus: "development",
        shirtNumber: 9,
      },
    ],
  };
  const currentEntry = {
    ...createAppStateStorageEntry(playerProfilesKey, currentState),
    revision: 12,
    moduleId: "squad",
    organizationId: "global",
    mergePolicy: "server-merge",
    updatedAt: "2026-06-08T13:56:46.000Z",
  };
  const backupValue = JSON.stringify(backupState);
  const backupManifest = Object.fromEntries(
    dataSafetyRegistry.keys().map((key) => {
      const contract = dataSafetyRegistry.getByKey(key);
      return [
        key,
        {
          present: false,
          moduleId: contract.moduleId,
        },
      ];
    })
  );
  backupManifest[playerProfilesKey] = {
    present: true,
    moduleId: "squad",
    organizationId: "global",
    revision: 11,
    mergePolicy: "server-merge",
    updatedAt: "2026-06-08T08:00:00.000Z",
    updatedBy: "qa",
    bytes: Buffer.byteLength(backupValue, "utf8"),
    sha256: sha256(backupValue),
  };
  const backupCore = {
    schema: "footballscience-app-state-backup-v1",
    createdAt: "2026-06-08T08:00:00.000Z",
    source: "api/app-state-backup",
    actor: {
      id: "vercel-cron",
      role: "system",
      email: "",
    },
    entryCount: 1,
    manifest: backupManifest,
    entries: {
      [playerProfilesKey]: backupValue,
    },
  };
  const backupEnvelope = {
    ...backupCore,
    contentSha256: sha256(JSON.stringify(backupCore)),
  };
  const backupPath = `backups/app-state/2026-06-08/${backupEnvelope.contentSha256.slice(0, 12)}.json`;
  const latestPointer = {
    schema: "footballscience-app-state-backup-pointer-v1",
    createdAt: backupEnvelope.createdAt,
    path: backupPath,
    entryCount: backupEnvelope.entryCount,
    contentSha256: backupEnvelope.contentSha256,
  };

  return {
    currentState,
    backupState,
    currentEntry,
    backupEnvelope,
    backupPath,
    latestPointer,
    storageObjects: {
      [playerProfilesPath]: currentEntry,
      "backups/app-state/latest.json": latestPointer,
      [backupPath]: backupEnvelope,
    },
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

test("client-config login resolves usernames before Supabase password auth", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const tokenBodies = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/auth/v1/admin/users")) {
      return new Response(
        JSON.stringify({
          users: [
            {
              id: "user-jess",
              email: "jess.silva@nccourage.com",
              user_metadata: {
                firstName: "Jess",
                lastName: "Silva",
                username: "jess.silva",
                role: "scout",
                status: "active",
              },
              app_metadata: {
                role: "scout",
                status: "active",
              },
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (requestUrl.includes("/auth/v1/token")) {
      const body = JSON.parse(String(options.body || "{}"));
      tokenBodies.push(body);
      return new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          expires_at: 1770000000,
          token_type: "bearer",
          user: {
            id: "user-jess",
            email: body.email,
          },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(clientConfigHandler, {
      method: "POST",
      url: "/api/client-config",
      body: JSON.stringify({
        identifier: "jess.silva",
        password: "correct-password",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      session: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    });
    expect(tokenBodies).toEqual([
      {
        email: "jess.silva@nccourage.com",
        password: "correct-password",
      },
    ]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("client-config login retries transient Supabase auth failures once", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";

  let tokenCalls = 0;
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/auth/v1/token")) {
      tokenCalls += 1;
      if (tokenCalls === 1) {
        return new Response(JSON.stringify({ message: "context deadline exceeded" }), { status: 504 });
      }
      const body = JSON.parse(String(options.body || "{}"));
      return new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          expires_at: 1770000000,
          token_type: "bearer",
          user: {
            id: "qa-user",
            email: body.email,
          },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(clientConfigHandler, {
      method: "POST",
      url: "/api/client-config",
      body: JSON.stringify({
        email: "qa-live@example.com",
        password: "correct-password",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.session.access_token).toBe("access-token");
    expect(tokenCalls).toBe(2);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("client-config login keeps Supabase auth outages as service failures", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";

  let tokenCalls = 0;
  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/auth/v1/token")) {
      tokenCalls += 1;
      return new Response(JSON.stringify({ message: "context deadline exceeded" }), { status: 504 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(clientConfigHandler, {
      method: "POST",
      url: "/api/client-config",
      body: JSON.stringify({
        email: "qa-live@example.com",
        password: "correct-password",
      }),
    });

    expect(response.status).toBe(504);
    expect(response.payload.reason).toBe("Authentication took too long. Please try again.");
    expect(tokenCalls).toBe(2);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("login retries direct Supabase auth after server timeout", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const source = readFileSync(path.join(process.cwd(), "platform-auth-boot.js"), "utf8");

  expect(source).toContain("[0, 404, 405, 500, 502, 503, 504].includes(Number(loginResponse.status))");
  expect(source).toContain("timeoutMs:35000");
  expect(source).toContain("authState.supabase.auth.signInWithPassword({email,password:cleanPassword})");
});

test("platform auth boot throttles post-login auth-dependent hydration", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const source = readFileSync(path.join(process.cwd(), "platform-auth-boot.js"), "utf8");

  expect(source).toContain("let authRefreshTokenPromise = null;");
  expect(source).toContain("let authSessionReadPromise = null;");
  expect(source).toContain("let currentUserProfileRefreshPromise = null;");
  expect(source).toContain("let userCacheRefreshPromise = null;");
  expect(source).toContain("await refreshCurrentUserProfile(sessionUserId).catch(() => null);");
  expect(source).not.toMatch(/Promise\.allSettled\(\[\s*refreshCurrentUserProfile\(sessionUserId\),\s*hydrateCentralState\(\),\s*refreshUserCache\(\),\s*\]\)/);
  expect(source).not.toMatch(/await refreshAccessToken\(\)\.catch\(\(\) => null\);\s*let sessionResult;/);
});

test("current actor lookup reuses a brief validated token cache", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const token = `actor-cache-token-${Date.now()}`;
  let userCalls = 0;
  let adminUserCalls = 0;
  const rawUser = createMockPlatformUser("coach");

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/auth/v1/user")) {
      userCalls += 1;
      return new Response(JSON.stringify(rawUser), { status: 200 });
    }
    if (requestUrl.includes("/auth/v1/admin/users/coach-1")) {
      adminUserCalls += 1;
      return new Response(JSON.stringify(rawUser), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const first = await getCurrentActor(`Bearer ${token}`);
    const second = await getCurrentActor(`Bearer ${token}`);

    expect(first?.id).toBe("coach-1");
    expect(second?.id).toBe("coach-1");
    expect(userCalls).toBe(1);
    expect(adminUserCalls).toBe(1);
  } finally {
    global.fetch = originalFetch;
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

test("app-state accepts Session Planner saves above the shared small JSON limit", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock({});
  global.fetch = storage.fetchMock;

  const largeNotes = "Possession principles. ".repeat(16000);
  const largeSessionPlannerState = {
    selectedDate: "2026-05-18",
    sessions: {
      "2026-05-18": {
        date: "2026-05-18",
        selectedBlockId: "block-large",
        blocks: [
          {
            id: "block-large",
            title: "Large live training state",
            organization: largeNotes,
            principles: "Keep the ball, protect the middle, finish the action.",
            fieldUpdatedAt: {
              organization: "2026-05-18T11:45:00.000Z",
              principles: "2026-05-18T11:45:00.000Z",
            },
          },
        ],
      },
    },
  };
  const body = JSON.stringify({
    key: appStateSessionPlannerKey,
    value: JSON.stringify(largeSessionPlannerState),
    metadata: { baseRevision: 0 },
  });
  expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(256 * 1024);

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key: appStateSessionPlannerKey,
    });
    expect(storage.objects.has(appStateSessionPlannerPath)).toBe(true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("session history is admin-only for coaches", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock({}, "coach");
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(sessionHistoryHandler, {
      method: "GET",
      url: "/api/session-history?date=2026-05-05",
      headers: {
        authorization: "Bearer test-access-token",
      },
    });

    expect(response.status).toBe(403);
    expect(response.payload).toMatchObject({ ok: false });
    expect(response.payload.reason).toContain("Session Planner history");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps required team data visible to coaches even when workspace access is too narrow", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin"], edit: ["admin"] },
          "medical-team": { view: ["admin"], edit: ["admin"] },
          "team-identity": { view: ["admin"], edit: ["admin"] },
        },
      }),
      [playerProfilesPath]: createAppStateStorageEntry(playerProfilesKey, {
        players: [{ id: "player-1", name: "QA Player", squadStatus: "Important" }],
      }),
      [medicalTeamPath]: createAppStateStorageEntry(medicalTeamKey, {
        players: [{ id: "player-1", name: "QA Player" }],
      }),
    },
    "coach"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload.entries[playerProfilesKey]).toContain("QA Player");
    expect(response.payload.entries[medicalTeamKey]).toContain("QA Player");
    const hubState = JSON.parse(response.payload.entries[workspaceHubKey]);
    expect(hubState.workspaceAccess["player-profiles"].view).toContain("coach");
    expect(hubState.workspaceAccess["medical-team"].view).toContain("coach");
    expect(hubState.workspaceAccess["team-identity"].view).toContain("coach");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state hides Transfer Room from non-selected staff", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock(
    {
      [transferRoomPath]: createAppStateStorageEntry(transferRoomKey, {
        activeTeamId: "team-ncc-first",
        teams: [{ id: "team-ncc-first", name: "North Carolina Courage" }],
        accessByTeam: { "team-ncc-first": { userIds: ["sporting-director-1"] } },
        targetPlans: {
          "target-1": { recordId: "target-1", wage: 100000 },
        },
      }),
    },
    "coach"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload.entries[transferRoomKey]).toBeUndefined();
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state lets selected Transfer Room staff edit content without changing access grants", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingTransferRoomState = {
    activeTeamId: "team-ncc-first",
    teams: [{ id: "team-ncc-first", name: "North Carolina Courage" }],
    accessByTeam: { "team-ncc-first": { userIds: ["coach-1"] } },
    targetPlans: {},
  };
  const storage = createAppStateFetchMock(
    {
      [transferRoomPath]: createAppStateStorageEntry(transferRoomKey, existingTransferRoomState),
    },
    "coach"
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
        key: transferRoomKey,
        metadata: { revision: 1 },
        value: JSON.stringify({
          ...existingTransferRoomState,
          accessByTeam: { "team-ncc-first": { userIds: [] } },
          targetPlans: { "target-1": { recordId: "target-1", wage: 100000 } },
        }),
      }),
    });

    expect(response.status).toBe(200);
    const savedEntry = storage.writes.find((write) => write.objectPath === transferRoomPath)?.entry;
    const savedValue = JSON.parse(savedEntry.value);
    expect(savedValue.targetPlans["target-1"].wage).toBe(100000);
    expect(savedValue.accessByTeam["team-ncc-first"].userIds).toEqual(["coach-1"]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state blocks staff from granting themselves new Transfer Room access", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock({}, "coach");
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: transferRoomKey,
        value: JSON.stringify({
          activeTeamId: "team-ncc-first",
          teams: [{ id: "team-ncc-first", name: "North Carolina Courage" }],
          accessByTeam: { "team-ncc-first": { userIds: ["coach-1"] } },
        }),
      }),
    });

    expect(response.status).toBe(403);
    expect(response.payload.reason).toContain("Transfer Room");
    expect(storage.writes).toHaveLength(0);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state does not return persisted active workspace as shared hub state", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        activeWorkspaceId: "game-simulator",
        workspaceAccess: {
          "game-simulator": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
    },
    "admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
    });

    expect(response.status).toBe(200);
    const hubState = JSON.parse(response.payload.entries[workspaceHubKey]);
    expect(hubState.activeWorkspaceId).toBeUndefined();
    expect(hubState.workspaceAccess["game-simulator"].view).toContain("coach");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state strips active workspace from hub writes before saving centrally", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock({}, "admin");
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: workspaceHubKey,
        value: JSON.stringify({
          activeWorkspaceId: "game-simulator",
          workspaceAccess: {
            "game-simulator": { view: ["admin", "coach"], edit: ["admin", "coach"] },
          },
        }),
      }),
    });

    expect(response.status).toBe(200);
    const savedHubState = JSON.parse(storage.writes.find((entry) => entry.objectPath === workspaceHubPath).entry.value);
    expect(savedHubState.activeWorkspaceId).toBeUndefined();
    expect(JSON.parse(response.payload.value).activeWorkspaceId).toBeUndefined();
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state returns coach-safe medical data to coaches", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock(
    {
      [medicalTeamPath]: createAppStateStorageEntry(medicalTeamKey, {
        selectedDate: "2026-05-07",
        players: [{ id: "player-1", name: "QA Player", squadStatus: "private-squad-note" }],
        records: [
          {
            id: "record-1",
            playerId: "player-1",
            date: "2026-05-07",
            status: "modified",
            participation: 75,
            actualParticipation: 50,
            comment: "Private diagnosis note",
            coachNote: "Modified team only",
            shareWithCoach: true,
            rtpPhase: "modified-team",
            clearance: { doctor: true },
            gates: { strength: "pass" },
            createdBy: "medical-user",
          },
          {
            id: "record-2",
            playerId: "player-1",
            date: "2026-05-08",
            status: "rehab",
            participation: 25,
            coachNote: "Not approved",
            shareWithCoach: false,
          },
        ],
        injuryPlans: [
          {
            id: "plan-1",
            playerId: "player-1",
            injuryType: "ACL injury",
            bodyArea: "Knee",
            startDate: "2026-05-07",
            endDate: "2026-07-07",
            status: "unavailable",
            participation: 0,
            reviewDate: "2026-05-14",
            rtpPhase: "medical-restriction",
            phase: "Protected rehab",
            comment: "Private plan note",
            coachNote: "Unavailable this block",
            shareWithCoach: true,
            clearance: { doctor: true },
            gates: { strength: "fail" },
            createdBy: "medical-user",
          },
        ],
        policy: {
          dataLevel: "private-medical",
          retentionMonths: 24,
          consentRequired: true,
          policyOwner: "Medical Lead",
          incidentContact: "private-medical@example.com",
          lastReviewed: "2026-05-07",
        },
      }),
    },
    "coach"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "GET",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
    });

    expect(response.status).toBe(200);
    const rawMedicalValue = response.payload.entries[medicalTeamKey];
    const medicalState = JSON.parse(rawMedicalValue);
    expect(medicalState.records[0]).toMatchObject({
      comment: "",
      coachNote: "Modified team only",
      actualParticipation: "not-logged",
      createdBy: "",
      clearance: {},
      gates: {},
    });
    expect(medicalState.records[1].coachNote).toBe("");
    expect(medicalState.injuryPlans[0]).toMatchObject({
      injuryType: "Availability plan",
      bodyArea: "",
      reviewDate: "",
      comment: "",
      coachNote: "Unavailable this block",
      clearance: {},
      gates: {},
      createdBy: "",
    });
    expect(medicalState.players[0].squadStatus).toBeUndefined();
    expect(medicalState.policy).toBeUndefined();
    expect(rawMedicalValue).not.toContain("ACL injury");
    expect(rawMedicalValue).not.toContain("Private diagnosis note");
    expect(rawMedicalValue).not.toContain("private-squad-note");
    expect(rawMedicalValue).not.toContain("private-medical@example.com");
    expect(response.payload.metadata[medicalTeamKey].size).toBe(Buffer.byteLength(rawMedicalValue, "utf8"));
    expect(response.payload.metadata[medicalTeamKey]).toMatchObject({
      revision: 1,
      moduleId: "medical-team",
      mergePolicy: "record-timestamp-merge",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state syncs Squad role changes for coach editors", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
    },
    "coach"
  );
  global.fetch = storage.fetchMock;

  try {
    const nextSquadState = {
      selectedPlayerId: "player-1",
      players: [
        {
          id: "player-1",
          name: "QA Player",
          primaryRole: "8",
          secondaryRoles: ["10"],
          roleGroup: "midfielder",
          updatedAt: "2026-05-07T12:00:00.000Z",
        },
      ],
      updatedAt: "2026-05-07T12:00:00.000Z",
    };
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: playerProfilesKey,
        value: JSON.stringify(nextSquadState),
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key: playerProfilesKey,
    });
    const write = storage.writes.find((entry) => entry.objectPath === playerProfilesPath);
    expect(JSON.parse(write.entry.value).players[0]).toMatchObject({
      id: "player-1",
      primaryRole: "8",
      roleGroup: "midfielder",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state preserves newer Squad role edits when a stale client syncs later", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        primaryRole: "8",
        secondaryRoles: ["10"],
        roleGroup: "midfielder",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
      {
        id: "player-2",
        name: "Newer Player",
        primaryRole: "ST",
        roleGroup: "forward",
        updatedAt: "2026-05-07T12:09:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-new",
        type: "profile-updated",
        playerId: "player-1",
        summary: "QA Player role changed to 8",
        changes: [
          { field: "Primary role", from: "CB", to: "8" },
          { field: "Role group", from: "Defender", to: "Midfielder" },
        ],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const staleSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        primaryRole: "CB",
        secondaryRoles: [],
        roleGroup: "defender",
        updatedAt: "2026-05-07T12:00:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-old",
        type: "profile-updated",
        playerId: "player-1",
        summary: "QA Player role changed to CB",
        changes: [
          { field: "Primary role", from: "8", to: "CB" },
          { field: "Role group", from: "Midfielder", to: "Defender" },
        ],
        createdAt: "2026-05-07T12:00:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:00:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(staleSquadState),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedState = JSON.parse(response.payload.value);
    expect(syncedState.players).toHaveLength(2);
    expect(syncedState.players.find((player) => player.id === "player-1")).toMatchObject({
      primaryRole: "8",
      roleGroup: "midfielder",
    });
    expect(syncedState.players.find((player) => player.id === "player-2")).toMatchObject({
      name: "Newer Player",
      primaryRole: "ST",
    });
    expect(syncedState.changeLog.map((entry) => entry.id)).toEqual(["change-new", "change-old"]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps removed Squad players hidden when a stale client syncs later", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-kept",
    removedPlayerIds: ["player-removed"],
    players: [
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-remove",
        type: "player-removed",
        playerId: "player-removed",
        summary: "Removed Player removed from Squad",
        changes: [{ field: "Squad status", from: "Squad depth", to: "Removed" }],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const staleSquadState = {
    selectedPlayerId: "player-removed",
    players: [
      {
        id: "player-removed",
        name: "Removed Player",
        primaryRole: "ST",
        roleGroup: "forward",
        updatedAt: "2026-05-07T12:00:00.000Z",
      },
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-05-07T12:00:00.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:00:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(staleSquadState),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedState = JSON.parse(response.payload.value);
    expect(syncedState.players.map((player) => player.id)).toEqual(["player-kept"]);
    expect(syncedState.removedPlayerIds).toContain("player-removed");
    expect(syncedState.selectedPlayerId).toBe("player-kept");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps removed Squad players hidden when a fresh client tries to resurrect them", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-kept",
    removedPlayerIds: ["player-removed"],
    players: [
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-remove",
        type: "player-removed",
        playerId: "player-removed",
        summary: "Removed Player removed from Squad",
        changes: [{ field: "Squad status", from: "Squad depth", to: "Removed" }],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const freshSquadState = {
    selectedPlayerId: "player-removed",
    removedPlayerIds: [],
    players: [
      {
        id: "player-removed",
        name: "Removed Player",
        primaryRole: "ST",
        roleGroup: "forward",
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
    ],
    changeLog: existingSquadState.changeLog,
    updatedAt: "2026-05-07T12:20:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(freshSquadState),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedState = JSON.parse(response.payload.value);
    expect(syncedState.players.map((player) => player.id)).toEqual(["player-kept"]);
    expect(syncedState.removedPlayerIds).toContain("player-removed");
    expect(syncedState.selectedPlayerId).toBe("player-kept");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps guest roster classification when availability status changes", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "erin-guest",
    players: [
      {
        id: "erin-guest",
        name: "Erin Guest",
        primaryRole: "ST",
        roleGroup: "forward",
        status: "available",
        rosterType: "guest",
        countsInSquad: false,
        temporaryGroup: "Training guest",
        temporaryFrom: "2026-06-10",
        temporaryTo: "2026-06-14",
        updatedAt: "2026-06-10T12:00:00.000Z",
      },
    ],
    changeLog: [],
    updatedAt: "2026-06-10T12:00:00.000Z",
  };
  const statusSaveWithDefaultRoster = {
    selectedPlayerId: "erin-guest",
    players: [
      {
        id: "erin-guest",
        name: "Erin Guest",
        primaryRole: "ST",
        roleGroup: "forward",
        status: "vacation",
        rosterType: "squad",
        countsInSquad: true,
        temporaryGroup: "",
        temporaryFrom: "",
        temporaryTo: "",
        updatedAt: "2026-06-10T12:05:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-vacation",
        type: "profile-updated",
        playerId: "erin-guest",
        playerName: "Erin Guest",
        summary: "Erin Guest updated: Availability status",
        changes: [{ field: "Availability status", from: "Available", to: "Vacation" }],
        createdAt: "2026-06-10T12:05:01.000Z",
      },
    ],
    updatedAt: "2026-06-10T12:05:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(statusSaveWithDefaultRoster),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedPlayer = JSON.parse(response.payload.value).players[0];
    expect(syncedPlayer).toMatchObject({
      status: "vacation",
      rosterType: "guest",
      countsInSquad: false,
      temporaryGroup: "Training guest",
      temporaryFrom: "2026-06-10",
      temporaryTo: "2026-06-14",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps removed Squad players hidden when later snapshots use a different id", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-kept",
    removedPlayerIds: ["cortnee-vine-old"],
    players: [
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-06-10T12:00:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-remove-cortnee",
        type: "player-removed",
        playerId: "cortnee-vine-old",
        playerName: "Cortnee Vine",
        summary: "Cortnee Vine removed from Squad",
        changes: [{ field: "Squad status", from: "Squad depth", to: "Removed" }],
        createdAt: "2026-06-10T12:00:01.000Z",
      },
    ],
    updatedAt: "2026-06-10T12:00:00.000Z",
  };
  const incomingDefaultSnapshot = {
    selectedPlayerId: "cortnee-vine-new",
    removedPlayerIds: [],
    players: [
      {
        id: "cortnee-vine-new",
        name: "Cortnee Vine",
        primaryRole: "RW",
        roleGroup: "forward",
        updatedAt: "2026-06-10T12:05:00.000Z",
      },
      {
        id: "player-kept",
        name: "Kept Player",
        primaryRole: "GK",
        roleGroup: "goalkeeper",
        updatedAt: "2026-06-10T12:05:00.000Z",
      },
    ],
    updatedAt: "2026-06-10T12:05:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(incomingDefaultSnapshot),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedState = JSON.parse(response.payload.value);
    expect(syncedState.players.map((player) => player.name)).toEqual(["Kept Player"]);
    expect(syncedState.removedPlayerIds).toContain("cortnee-vine-old");
    expect(syncedState.selectedPlayerId).toBe("player-kept");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state preserves Squad position when a stale role save carries older player fields", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        number: "2",
        position: "Right Back",
        primaryRole: "CB",
        secondaryRoles: ["RB"],
        roleGroup: "defender",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-position",
        type: "profile-updated",
        playerId: "player-1",
        summary: "QA Player position changed to Right Back",
        changes: [{ field: "Position", from: "Defender", to: "Right Back" }],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const staleRoleSave = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        number: "2",
        position: "Defender",
        primaryRole: "8",
        secondaryRoles: ["10"],
        roleGroup: "midfielder",
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-role",
        type: "profile-updated",
        playerId: "player-1",
        summary: "QA Player role changed to 8",
        changes: [
          { field: "Primary role", from: "CB", to: "8" },
          { field: "Secondary roles", from: "RB", to: "10" },
          { field: "Role group", from: "Defender", to: "Midfielder" },
        ],
        createdAt: "2026-05-07T12:20:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:20:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(staleRoleSave),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedPlayer = JSON.parse(response.payload.value).players[0];
    expect(syncedPlayer).toMatchObject({
      id: "player-1",
      position: "Right Back",
      primaryRole: "8",
      secondaryRoles: ["10"],
      roleGroup: "midfielder",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state preserves Squad profile fields from newer default snapshots without explicit field changes", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Protected Player",
        number: "14",
        position: "Left Wing",
        birthDate: "1998-04-12",
        status: "national-team",
        squadStatus: "development",
        careerPhase: "experienced",
        primaryRole: "LW",
        secondaryRoles: ["RW"],
        preferredSide: "Left",
        roleGroup: "forward",
        rosterType: "squad",
        countsInSquad: true,
        idp: {
          status: "review",
          primaryFocus: "Wide isolation and final action",
          nextAction: "Video review",
          reviewDate: "2026-06-20",
        },
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-status",
        type: "profile-updated",
        playerId: "player-1",
        summary: "Protected Player Squad fields updated",
        changes: [
          { field: "Position", from: "Forward", to: "Left Wing" },
          { field: "Birth date", from: "", to: "1998-04-12" },
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
          { field: "Career phase", from: "Developing", to: "Experienced" },
          { field: "Primary role", from: "ST", to: "LW" },
          { field: "Secondary roles", from: "", to: "RW" },
          { field: "Preferred side", from: "Center", to: "Left" },
          { field: "Role group", from: "Forward", to: "Forward" },
          { field: "IDP status", from: "Active IDP", to: "Review" },
          { field: "IDP focus", from: "", to: "Wide isolation and final action" },
          { field: "IDP next action", from: "", to: "Video review" },
          { field: "IDP review date", from: "", to: "2026-06-20" },
        ],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const defaultSnapshotState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Protected Player",
        number: "",
        position: "Forward",
        birthDate: "",
        status: "available",
        squadStatus: "squad-depth",
        careerPhase: "developing",
        primaryRole: "ST",
        secondaryRoles: [],
        preferredSide: "Center",
        roleGroup: "forward",
        rosterType: "squad",
        countsInSquad: true,
        idp: {
          status: "active",
          primaryFocus: "",
          nextAction: "",
          reviewDate: "",
        },
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
    ],
    changeLog: existingSquadState.changeLog,
    updatedAt: "2026-05-07T12:20:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(defaultSnapshotState),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedPlayer = JSON.parse(response.payload.value).players[0];
    expect(syncedPlayer).toMatchObject({
      number: "14",
      position: "Left Wing",
      birthDate: "1998-04-12",
      status: "national-team",
      squadStatus: "development",
      careerPhase: "experienced",
      primaryRole: "LW",
      secondaryRoles: ["RW"],
      preferredSide: "Left",
      roleGroup: "forward",
      rosterType: "squad",
      countsInSquad: true,
      idp: {
        status: "review",
        primaryFocus: "Wide isolation and final action",
        nextAction: "Video review",
        reviewDate: "2026-06-20",
      },
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state restores explicit Squad status fields from changeLog when stored values already drifted", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const driftedSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Protected Player",
        status: "available",
        squadStatus: "depth",
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-status",
        type: "profile-updated",
        playerId: "player-1",
        summary: "Protected Player Squad fields updated",
        changes: [
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
        ],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:20:00.000Z",
  };
  const noOpIncomingState = {
    ...driftedSquadState,
    updatedAt: "2026-05-07T12:25:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, driftedSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(noOpIncomingState),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    expect(JSON.parse(response.payload.value).players[0]).toMatchObject({
      status: "national-team",
      squadStatus: "development",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state allows explicit newer Squad profile field changes back to default values", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Protected Player",
        status: "national-team",
        squadStatus: "development",
        careerPhase: "experienced",
        primaryRole: "LW",
        secondaryRoles: ["RW"],
        roleGroup: "forward",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-old-status",
        type: "profile-updated",
        playerId: "player-1",
        summary: "Protected Player availability changed to international duty",
        changes: [
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
          { field: "Career phase", from: "Developing", to: "Experienced" },
          { field: "Primary role", from: "ST", to: "LW" },
          { field: "Secondary roles", from: "", to: "RW" },
        ],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const explicitStatusState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Protected Player",
        status: "available",
        squadStatus: "squad-depth",
        careerPhase: "developing",
        primaryRole: "ST",
        secondaryRoles: [],
        roleGroup: "forward",
        updatedAt: "2026-05-07T12:20:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-new-status",
        type: "profile-updated",
        playerId: "player-1",
        summary: "Protected Player availability changed to available",
        changes: [{ field: "Availability status", from: "International duty", to: "Available" }],
        createdAt: "2026-05-07T12:20:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:20:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(explicitStatusState),
        metadata: { baseRevision: 2 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    const syncedPlayer = JSON.parse(response.payload.value).players[0];
    expect(syncedPlayer).toMatchObject({
      status: "available",
      squadStatus: "development",
      careerPhase: "experienced",
      primaryRole: "LW",
      secondaryRoles: ["RW"],
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state keeps temporary Squad player flags during stale profile saves", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Academy Player",
        primaryRole: "ST",
        roleGroup: "forward",
        rosterType: "squad",
        countsInSquad: true,
        temporaryGroup: "",
        updatedAt: "2026-05-07T12:00:00.000Z",
      },
    ],
    changeLog: [],
    updatedAt: "2026-05-07T12:00:00.000Z",
  };
  const staleTemporarySave = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "Academy Player",
        primaryRole: "ST",
        roleGroup: "forward",
        rosterType: "academy",
        countsInSquad: false,
        temporaryGroup: "Academy Training Group",
        temporaryFrom: "2026-05-08",
        temporaryTo: "2026-05-12",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    changeLog: [
      {
        id: "change-temporary",
        type: "profile-updated",
        playerId: "player-1",
        summary: "Academy Player updated: Roster type",
        changes: [
          { field: "Roster type", from: "First team squad", to: "Academy call-up" },
          { field: "Temporary group", from: "-", to: "Academy Training Group" },
          { field: "Temporary from", from: "-", to: "2026-05-08" },
          { field: "Temporary to", from: "-", to: "2026-05-12" },
        ],
        createdAt: "2026-05-07T12:10:01.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: {
        ...createAppStateStorageEntry(playerProfilesKey, existingSquadState),
        revision: 2,
      },
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(staleTemporarySave),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload.merged).toBe(true);
    expect(JSON.parse(response.payload.value).players[0]).toMatchObject({
      rosterType: "academy",
      countsInSquad: false,
      temporaryGroup: "Academy Training Group",
      temporaryFrom: "2026-05-08",
      temporaryTo: "2026-05-12",
    });
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state preserves existing Squad player images when newer saves omit media fields", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        primaryRole: "CB",
        roleGroup: "defender",
        photoUrl: "https://example.com/player-1.jpg",
        sourceUrl: "https://example.com/source/player-1",
        updatedAt: "2026-05-07T12:00:00.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:00:00.000Z",
  };
  const incomingSquadState = {
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        primaryRole: "8",
        roleGroup: "midfielder",
        updatedAt: "2026-05-07T12:10:00.000Z",
      },
    ],
    updatedAt: "2026-05-07T12:10:00.000Z",
  };
  const storage = createAppStateFetchMock(
    {
      [workspaceHubPath]: createAppStateStorageEntry(workspaceHubKey, {
        workspaceAccess: {
          "player-profiles": { view: ["admin", "coach"], edit: ["admin", "coach"] },
        },
      }),
      [playerProfilesPath]: createAppStateStorageEntry(playerProfilesKey, existingSquadState),
    },
    "coach"
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
        key: playerProfilesKey,
        value: JSON.stringify(incomingSquadState),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    const syncedPlayer = JSON.parse(response.payload.value).players[0];
    expect(syncedPlayer).toMatchObject({
      primaryRole: "8",
      roleGroup: "midfielder",
      photoUrl: "https://example.com/player-1.jpg",
      sourceUrl: "https://example.com/source/player-1",
    });
  } finally {
    global.fetch = originalFetch;
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
    [appStateSessionPlannerPath]: {
      ...createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
      revision: 1,
    },
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
        metadata: { baseRevision: 1 },
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

test("app-state preserves newest Session Planner tactical frame state during stale saves", async () => {
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
            organization: "Old organization",
            tacticalElements: [{ id: "current-line", type: "line" }],
            tacticalFrames: [
              {
                id: "frame-current",
                label: "Current board",
                elements: [{ id: "current-cone", type: "cone" }],
              },
            ],
            tacticalActiveFrameId: "frame-current",
            fieldUpdatedAt: {
              organization: "2026-05-07T13:00:00.000Z",
              tacticalElements: "2026-05-07T16:00:00.000Z",
              tacticalFrames: "2026-05-07T16:00:00.000Z",
              tacticalActiveFrameId: "2026-05-07T16:00:00.000Z",
            },
            updatedAt: "2026-05-07T16:00:00.000Z",
          },
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
          {
            id: "block-1",
            title: "Rondo",
            organization: "Fresh organization from another coach",
            tacticalElements: [{ id: "stale-line", type: "line" }],
            tacticalFrames: [
              {
                id: "frame-stale",
                label: "Stale board",
                elements: [{ id: "stale-cone", type: "cone" }],
              },
            ],
            tacticalActiveFrameId: "frame-stale",
            fieldUpdatedAt: {
              organization: "2026-05-07T17:00:00.000Z",
              tacticalElements: "2026-05-07T15:00:00.000Z",
              tacticalFrames: "2026-05-07T15:00:00.000Z",
              tacticalActiveFrameId: "2026-05-07T15:00:00.000Z",
            },
            updatedAt: "2026-05-07T17:00:00.000Z",
          },
        ],
      },
    },
  };
  const storage = createAppStateFetchMock({
    [appStateSessionPlannerPath]: {
      ...createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
      revision: 2,
    },
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
        metadata: { baseRevision: 1 },
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
    expect(storedBlock.organization).toBe("Fresh organization from another coach");
    expect(storedBlock.tacticalElements).toEqual([{ id: "current-line", type: "line" }]);
    expect(storedBlock.tacticalFrames).toEqual([
      {
        id: "frame-current",
        label: "Current board",
        elements: [{ id: "current-cone", type: "cone" }],
      },
    ]);
    expect(storedBlock.tacticalActiveFrameId).toBe("frame-current");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state merges stale Periodization day edits by field timestamps", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const existingState = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-09",
    importVersion: "ncc-2026-periodization-v1",
    days: {
      "2026-05-09": {
        seasonPhase: "Competition",
        daySchedule: "Training",
        physicalLoad: "High",
        sessionNotes: "Central note",
        fieldUpdatedAt: {
          physicalLoad: "2026-05-07T15:00:00.000Z",
          sessionNotes: "2026-05-07T13:00:00.000Z",
        },
      },
      "2026-05-10": {
        seasonPhase: "Competition",
        daySchedule: "Recovery",
        sessionNotes: "Existing recovery",
      },
    },
  };
  const staleIncomingState = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-09",
    importVersion: "ncc-2026-periodization-v1",
    days: {
      "2026-05-09": {
        seasonPhase: "Competition",
        daySchedule: "Training",
        physicalLoad: "Low",
        sessionNotes: "Fresh coach edit",
        fieldUpdatedAt: {
          physicalLoad: "2026-05-07T14:00:00.000Z",
          sessionNotes: "2026-05-07T16:00:00.000Z",
        },
      },
    },
  };
  const storage = createAppStateFetchMock({
    [periodizationPath]: {
      ...createAppStateStorageEntry(periodizationKey, existingState),
      revision: 2,
    },
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
        key: periodizationKey,
        value: JSON.stringify(staleIncomingState),
        metadata: { baseRevision: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      key: periodizationKey,
      merged: true,
    });

    const storedState = JSON.parse(storage.objects.get(periodizationPath).value);
    expect(storedState.days["2026-05-09"].physicalLoad).toBe("High");
    expect(storedState.days["2026-05-09"].sessionNotes).toBe("Fresh coach edit");
    expect(storedState.days["2026-05-10"].sessionNotes).toBe("Existing recovery");
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
    [appStateSessionPlannerPath]: {
      ...createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
      revision: 1,
    },
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
        metadata: { baseRevision: 1 },
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

test("app-state prevents stale Session Planner saves from resurrecting deleted blocks", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const dateValue = "2026-05-05";
  const freshTimestamp = new Date().toISOString();
  const existingState = {
    selectedDate: dateValue,
    sessions: {
      [dateValue]: {
        date: dateValue,
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Keep", fieldUpdatedAt: { title: "2026-05-07T12:00:00.000Z" } },
          { id: "block-2", title: "Delete me", fieldUpdatedAt: { title: "2026-05-07T12:05:00.000Z" } },
        ],
      },
    },
  };
  const deleteIncomingState = {
    selectedDate: dateValue,
    blockReductionGuard: {
      [dateValue]: freshTimestamp,
    },
    blockDeletionTombstones: {
      [dateValue]: {
        "block-2": freshTimestamp,
      },
    },
    sessions: {
      [dateValue]: {
        date: dateValue,
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Keep after delete", fieldUpdatedAt: { title: "2026-05-07T12:10:00.000Z" } },
        ],
      },
    },
  };
  const staleIncomingState = {
    selectedDate: dateValue,
    sessions: {
      [dateValue]: {
        date: dateValue,
        selectedBlockId: "block-2",
        blocks: [
          { id: "block-1", title: "Keep from stale tab", fieldUpdatedAt: { title: "2026-05-07T12:11:00.000Z" } },
          { id: "block-2", title: "Delete me from stale tab", fieldUpdatedAt: { title: "2026-05-07T12:12:00.000Z" } },
        ],
      },
    },
  };
  const storage = createAppStateFetchMock({
    [appStateSessionPlannerPath]: {
      ...createAppStateStorageEntry(appStateSessionPlannerKey, existingState),
      revision: 1,
    },
  });
  global.fetch = storage.fetchMock;

  try {
    const deleteResponse = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: appStateSessionPlannerKey,
        value: JSON.stringify(deleteIncomingState),
        metadata: { baseRevision: 1 },
      }),
    });
    expect(deleteResponse.status).toBe(200);
    expect(JSON.parse(storage.objects.get(appStateSessionPlannerPath).value).sessions[dateValue].blocks.map((block) => block.id)).toEqual(["block-1"]);

    const staleResponse = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: appStateSessionPlannerKey,
        value: JSON.stringify(staleIncomingState),
        metadata: { baseRevision: 1 },
      }),
    });
    expect(staleResponse.status).toBe(200);
    expect(staleResponse.payload).toMatchObject({
      ok: true,
      merged: true,
    });

    const storedState = JSON.parse(storage.objects.get(appStateSessionPlannerPath).value);
    expect(storedState.sessions[dateValue].selectedBlockId).toBe("block-1");
    expect(storedState.sessions[dateValue].blocks.map((block) => block.id)).toEqual(["block-1"]);
    expect(storedState.sessions[dateValue].blocks[0].title).toBe("Keep from stale tab");
    expect(storedState.blockDeletionTombstones[dateValue]["block-2"]).toBeTruthy();
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("session history restore clears deletion tombstones for restored blocks", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const dateValue = "2026-05-05";
  const previousSession = {
    date: dateValue,
    selectedBlockId: "block-1",
    blocks: [
      { id: "block-1", title: "Keep" },
      { id: "block-2", title: "Restored block" },
    ],
  };
  const currentState = {
    selectedDate: dateValue,
    blockDeletionTombstones: {
      [dateValue]: {
        "block-2": "2026-05-07T12:10:00.000Z",
      },
    },
    sessions: {
      [dateValue]: {
        ...previousSession,
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Keep" },
        ],
      },
    },
  };
  const historyLog = {
    schema: "footballscience-session-history-v1",
    entries: [
      {
        id: "restore-block-2",
        date: dateValue,
        action: "session.blocks_reduced",
        createdAt: "2026-05-07T12:15:00.000Z",
        updatedAt: "2026-05-07T12:15:00.000Z",
        actor: { id: "coach-1", role: "admin" },
        beforeBlockCount: 2,
        afterBlockCount: 1,
        beforeSession: previousSession,
        afterSession: currentState.sessions[dateValue],
      },
    ],
  };
  const storage = createAppStateFetchMock(
    {
      [appStateSessionPlannerPath]: createAppStateStorageEntry(appStateSessionPlannerKey, currentState),
      [appStateSessionHistoryPath]: createAppStateStorageEntry(appStateSessionHistoryKey, historyLog),
    },
    "admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(sessionHistoryHandler, {
      method: "POST",
      url: "/api/session-history",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        action: "restore",
        entryId: "restore-block-2",
        mode: "before",
      }),
    });

    expect(response.status).toBe(200);
    const storedState = JSON.parse(storage.objects.get(appStateSessionPlannerPath).value);
    expect(storedState.sessions[dateValue].blocks.map((block) => block.id)).toEqual(["block-1", "block-2"]);
    expect(storedState.blockDeletionTombstones?.[dateValue]?.["block-2"]).toBeUndefined();
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state blocks guest writes to staff chat", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

  const storage = createAppStateFetchMock({}, "guest");
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: {
        authorization: "Bearer test-access-token",
      },
      body: JSON.stringify({
        key: appStateChatKey,
        value: JSON.stringify([{ id: "guest-message", text: "No access" }]),
      }),
    });

    expect(response.status).toBe(403);
    expect(response.payload).toMatchObject({ ok: false });
    expect(response.payload.reason).toContain("chat");
    expect(storage.writes).toEqual([]);
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

test("app-state backup status verifies latest pointer without exposing backup entries", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const scheduleValue = JSON.stringify({ privateFixture: "must stay out of status" });

  const backupManifest = Object.fromEntries(
    dataSafetyRegistry.keys().map((key) => {
      const contract = dataSafetyRegistry.getByKey(key);
      return [
        key,
        {
          present: false,
          moduleId: contract.moduleId,
        },
      ];
    })
  );
  backupManifest["football-schedule-v1"] = {
    present: true,
    moduleId: "schedule",
    organizationId: "global",
    revision: 2,
    mergePolicy: "server-merge",
    updatedAt: "2026-05-07T00:00:00.000Z",
    updatedBy: "qa",
    bytes: Buffer.byteLength(scheduleValue, "utf8"),
    sha256: sha256(scheduleValue),
  };

  const backupCore = {
    schema: "footballscience-app-state-backup-v1",
    createdAt: new Date().toISOString(),
    source: "api/app-state-backup",
    actor: {
      id: "vercel-cron",
      role: "system",
      email: "",
    },
    entryCount: 1,
    manifest: backupManifest,
    entries: {
      "football-schedule-v1": scheduleValue,
    },
  };
  const backupEnvelope = {
    ...backupCore,
    contentSha256: sha256(JSON.stringify(backupCore)),
  };
  const backupPath = `backups/app-state/2026-05-09/${backupEnvelope.contentSha256.slice(0, 12)}.json`;
  const latestPointer = {
    schema: "footballscience-app-state-backup-pointer-v1",
    createdAt: backupEnvelope.createdAt,
    path: backupPath,
    entryCount: backupEnvelope.entryCount,
    contentSha256: backupEnvelope.contentSha256,
  };

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/storage/v1/object/footballscience-app-state/backups/app-state/latest.json")) {
      return new Response(JSON.stringify(latestPointer), { status: 200 });
    }

    if (requestUrl.endsWith(`/storage/v1/object/footballscience-app-state/${backupPath}`)) {
      return new Response(JSON.stringify(backupEnvelope), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const anonymousResponse = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup-status",
      headers: {},
    });
    expect(anonymousResponse.status).toBe(401);
    expect(anonymousResponse.payload.reason).toContain("Admin");

    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup-status",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      backupMatchesPointer: true,
      latest: {
        path: backupPath,
        entryCount: 1,
        contentSha256: backupEnvelope.contentSha256,
      },
      backup: {
        contentSha256: backupEnvelope.contentSha256,
        computedSha256: backupEnvelope.contentSha256,
      },
      manifestCoverage: {
        keyCount: dataSafetyRegistry.keys().length,
        presentEntryCount: 1,
        missingKeys: [],
      },
      manifest: {
        "football-schedule-v1": {
          present: true,
          moduleId: "schedule",
          organizationId: "global",
          revision: 2,
          mergePolicy: "server-merge",
          updatedAt: "2026-05-07T00:00:00.000Z",
          bytes: Buffer.byteLength(scheduleValue, "utf8"),
          sha256: sha256(scheduleValue),
        },
      },
    });
    expect(JSON.stringify(response.payload)).not.toContain("privateFixture");
    expect(JSON.stringify(response.payload)).not.toContain('"entries"');
    expect(JSON.stringify(response.payload)).not.toContain("service-role-test-key");
    expect(JSON.stringify(response.payload)).not.toContain('"updatedBy"');
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state restore drill parses latest backup without restoring or exposing entries", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const scheduleValue = JSON.stringify({ privateFixture: "must stay out of restore drill" });

  const backupManifest = Object.fromEntries(
    dataSafetyRegistry.keys().map((key) => {
      const contract = dataSafetyRegistry.getByKey(key);
      return [
        key,
        {
          present: false,
          moduleId: contract.moduleId,
        },
      ];
    })
  );
  backupManifest["football-schedule-v1"] = {
    present: true,
    moduleId: "schedule",
    organizationId: "global",
    revision: 4,
    mergePolicy: "server-merge",
    updatedAt: "2026-05-07T00:00:00.000Z",
    updatedBy: "qa",
    bytes: Buffer.byteLength(scheduleValue, "utf8"),
    sha256: sha256(scheduleValue),
  };

  const backupCore = {
    schema: "footballscience-app-state-backup-v1",
    createdAt: new Date().toISOString(),
    source: "api/app-state-backup",
    actor: {
      id: "vercel-cron",
      role: "system",
      email: "",
    },
    entryCount: 1,
    manifest: backupManifest,
    entries: {
      "football-schedule-v1": scheduleValue,
    },
  };
  const backupEnvelope = {
    ...backupCore,
    contentSha256: sha256(JSON.stringify(backupCore)),
  };
  const backupPath = `backups/app-state/2026-05-09/${backupEnvelope.contentSha256.slice(0, 12)}.json`;
  const latestPointer = {
    schema: "footballscience-app-state-backup-pointer-v1",
    createdAt: backupEnvelope.createdAt,
    path: backupPath,
    entryCount: backupEnvelope.entryCount,
    contentSha256: backupEnvelope.contentSha256,
  };

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/storage/v1/object/footballscience-app-state/backups/app-state/latest.json")) {
      return new Response(JSON.stringify(latestPointer), { status: 200 });
    }

    if (requestUrl.endsWith(`/storage/v1/object/footballscience-app-state/${backupPath}`)) {
      return new Response(JSON.stringify(backupEnvelope), { status: 200 });
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup?mode=restore-drill",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });
    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      manifestCoverage: {
        keyCount: dataSafetyRegistry.keys().length,
        presentEntryCount: 1,
        missingKeys: [],
      },
      restoreDrill: {
        dryRun: true,
        restored: false,
        restorable: true,
        keyCount: dataSafetyRegistry.keys().length,
        entryCount: 1,
        declaredEntryCount: 1,
        pointerEntryCount: 1,
        parsedEntryCount: 1,
        unknownEntryKeys: [],
        missingEntryKeys: [],
        unexpectedEntryKeys: [],
        invalidEntries: [],
        modules: {
          schedule: {
            presentEntryCount: 1,
            parsedEntryCount: 1,
          },
        },
      },
    });
    expect(JSON.stringify(response.payload)).not.toContain("privateFixture");
    expect(JSON.stringify(response.payload)).not.toContain('"entries"');
    expect(JSON.stringify(response.payload)).not.toContain('"manifest"');
    expect(JSON.stringify(response.payload)).not.toContain('"updatedBy"');
    expect(JSON.stringify(response.payload)).not.toContain("service-role-test-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state Squad status audit reports only sanitized drift metadata", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const currentState = {
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "available",
        squadStatus: "depth",
      },
    ],
    changeLog: [
      {
        id: "change-status",
        playerId: "player-1",
        changes: [
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
        ],
        createdAt: "2026-06-08T12:00:00.000Z",
      },
    ],
  };
  const backupState = {
    ...currentState,
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "national-team",
        squadStatus: "development",
      },
    ],
  };
  const currentEntry = {
    ...createAppStateStorageEntry(playerProfilesKey, currentState),
    revision: 12,
    moduleId: "squad",
    updatedAt: "2026-06-08T13:56:46.000Z",
  };
  const backupValue = JSON.stringify(backupState);
  const backupManifest = Object.fromEntries(
    dataSafetyRegistry.keys().map((key) => {
      const contract = dataSafetyRegistry.getByKey(key);
      return [
        key,
        {
          present: false,
          moduleId: contract.moduleId,
        },
      ];
    })
  );
  backupManifest[playerProfilesKey] = {
    present: true,
    moduleId: "squad",
    organizationId: "global",
    revision: 11,
    mergePolicy: "server-merge",
    updatedAt: "2026-06-08T08:00:00.000Z",
    updatedBy: "qa",
    bytes: Buffer.byteLength(backupValue, "utf8"),
    sha256: sha256(backupValue),
  };
  const backupCore = {
    schema: "footballscience-app-state-backup-v1",
    createdAt: "2026-06-08T08:00:00.000Z",
    source: "api/app-state-backup",
    actor: {
      id: "vercel-cron",
      role: "system",
      email: "",
    },
    entryCount: 1,
    manifest: backupManifest,
    entries: {
      [playerProfilesKey]: backupValue,
    },
  };
  const backupEnvelope = {
    ...backupCore,
    contentSha256: sha256(JSON.stringify(backupCore)),
  };
  const backupPath = `backups/app-state/2026-06-08/${backupEnvelope.contentSha256.slice(0, 12)}.json`;
  const latestPointer = {
    schema: "footballscience-app-state-backup-pointer-v1",
    createdAt: backupEnvelope.createdAt,
    path: backupPath,
    entryCount: backupEnvelope.entryCount,
    contentSha256: backupEnvelope.contentSha256,
  };
  const storage = createAppStateFetchMock(
    {
      [playerProfilesPath]: currentEntry,
      "backups/app-state/latest.json": latestPointer,
      [backupPath]: backupEnvelope,
    },
    "admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup?mode=squad-status-audit",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      schema: "footballscience-squad-status-audit-v1",
      dryRun: true,
      writes: false,
      current: {
        key: playerProfilesKey,
        present: true,
        playerCount: 1,
        changeLogCount: 1,
        explicitStatusChangeCount: 1,
        explicitSquadStatusChangeCount: 1,
        statusSelfHealCandidateCount: 1,
        squadStatusSelfHealCandidateCount: 1,
        playersWithSelfHealCandidates: 1,
      },
      latestBackup: {
        present: true,
        hasPlayerProfilesEntry: true,
        backupMatchesPointer: true,
        playerCount: 1,
        changeLogCount: 1,
      },
      backupComparison: {
        comparablePlayers: 1,
        statusDifferenceCount: 1,
        squadStatusDifferenceCount: 1,
      },
      codeReleaseLikelyEnough: false,
      dataRepairLikelyRequired: true,
    });
    const payloadText = JSON.stringify(response.payload);
    expect(payloadText).not.toContain("Private Player Name");
    expect(payloadText).not.toContain("national-team");
    expect(payloadText).not.toContain("development");
    expect(payloadText).not.toContain('"entries"');
    expect(payloadText).not.toContain('"players"');
    expect(payloadText).not.toContain('"changeLog"');
    expect(payloadText).not.toContain("service-role-test-key");
    expect(storage.writes).toEqual([]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state Squad status repair dry-run reports only sanitized repair metadata", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const currentState = {
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "available",
        squadStatus: "depth",
      },
    ],
    changeLog: [
      {
        id: "change-status",
        playerId: "player-1",
        changes: [
          { field: "Availability status", from: "Available", to: "International duty" },
          { field: "Squad status", from: "Squad depth", to: "Development" },
        ],
        createdAt: "2026-06-08T12:00:00.000Z",
      },
    ],
  };
  const backupState = {
    ...currentState,
    players: [
      {
        id: "player-1",
        name: "Private Player Name",
        status: "national-team",
        squadStatus: "development",
      },
    ],
  };
  const currentEntry = {
    ...createAppStateStorageEntry(playerProfilesKey, currentState),
    revision: 12,
    moduleId: "squad",
    updatedAt: "2026-06-08T13:56:46.000Z",
  };
  const backupValue = JSON.stringify(backupState);
  const backupManifest = Object.fromEntries(
    dataSafetyRegistry.keys().map((key) => {
      const contract = dataSafetyRegistry.getByKey(key);
      return [
        key,
        {
          present: false,
          moduleId: contract.moduleId,
        },
      ];
    })
  );
  backupManifest[playerProfilesKey] = {
    present: true,
    moduleId: "squad",
    organizationId: "global",
    revision: 11,
    mergePolicy: "server-merge",
    updatedAt: "2026-06-08T08:00:00.000Z",
    updatedBy: "qa",
    bytes: Buffer.byteLength(backupValue, "utf8"),
    sha256: sha256(backupValue),
  };
  const backupCore = {
    schema: "footballscience-app-state-backup-v1",
    createdAt: "2026-06-08T08:00:00.000Z",
    source: "api/app-state-backup",
    actor: {
      id: "vercel-cron",
      role: "system",
      email: "",
    },
    entryCount: 1,
    manifest: backupManifest,
    entries: {
      [playerProfilesKey]: backupValue,
    },
  };
  const backupEnvelope = {
    ...backupCore,
    contentSha256: sha256(JSON.stringify(backupCore)),
  };
  const backupPath = `backups/app-state/2026-06-08/${backupEnvelope.contentSha256.slice(0, 12)}.json`;
  const latestPointer = {
    schema: "footballscience-app-state-backup-pointer-v1",
    createdAt: backupEnvelope.createdAt,
    path: backupPath,
    entryCount: backupEnvelope.entryCount,
    contentSha256: backupEnvelope.contentSha256,
  };
  const storage = createAppStateFetchMock(
    {
      [playerProfilesPath]: currentEntry,
      "backups/app-state/latest.json": latestPointer,
      [backupPath]: backupEnvelope,
    },
    "admin"
  );
  global.fetch = storage.fetchMock;

  try {
    const response = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup?mode=squad-status-repair-dry-run",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      schema: "footballscience-squad-status-repair-dry-run-v1",
      dryRun: true,
      writes: false,
      current: {
        key: playerProfilesKey,
        present: true,
        revision: 12,
        playerCount: 1,
        statusSelfHealCandidateCount: 1,
        squadStatusSelfHealCandidateCount: 1,
      },
      latestBackup: {
        present: true,
        hasPlayerProfilesEntry: true,
        backupMatchesPointer: true,
      },
      repairDryRun: {
        candidateCount: 1,
        fieldCounts: {
          status: 1,
          squadStatus: 1,
        },
        totalFieldCount: 2,
        candidatesWithBothFields: 1,
        candidateFieldsWithBackupSupport: 2,
        allowedFields: ["status", "squadStatus"],
        allCandidatesRestorableFromTrustedSource: true,
        allCandidateFieldsAllowed: true,
        snapshotGuardReady: true,
        backupGuardReady: true,
        safeToExecuteAsSeparateRepair: true,
        writePlan: {
          writes: false,
          targetKey: playerProfilesKey,
          fieldsOnly: ["status", "squadStatus"],
          preWriteSnapshotRequired: true,
          revisionGuardRequired: true,
          maxCandidateCount: 1,
          maxFieldWriteCount: 2,
        },
      },
      rollbackPlan: {
        available: true,
        restoreKey: playerProfilesKey,
        restoreRequiresSeparateApproval: true,
        rawBackupExposed: false,
      },
    });
    expect(response.payload.repairDryRun.candidates).toHaveLength(1);
    expect(response.payload.repairDryRun.candidates[0].fields.map((field) => field.field)).toEqual([
      "status",
      "squadStatus",
    ]);
    const payloadText = JSON.stringify(response.payload);
    expect(payloadText).not.toContain("Private Player Name");
    expect(payloadText).not.toContain("national-team");
    expect(payloadText).not.toContain("development");
    expect(payloadText).not.toContain('"entries"');
    expect(payloadText).not.toContain('"players"');
    expect(payloadText).not.toContain('"changeLog"');
    expect(payloadText).not.toContain("service-role-test-key");
    expect(storage.writes).toEqual([]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state Squad status repair execute refuses guard mismatch without writes", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const fixture = createSquadStatusRepairFixture();
  const storage = createAppStateFetchMock(fixture.storageObjects, "admin");
  global.fetch = storage.fetchMock;

  try {
    const dryRun = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup?mode=squad-status-repair-dry-run",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });

    const response = await callHandler(appStateBackupHandler, {
      method: "POST",
      url: "/api/app-state-backup?mode=squad-status-repair-execute",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
      body: JSON.stringify({
        expectedCurrentRevision: 999,
        expectedCurrentSha256: dryRun.payload.current.valueSha256,
        expectedBackupSha256: dryRun.payload.latestBackup.pointerContentSha256,
        expectedPlanSha256: dryRun.payload.repairDryRun.planSha256,
        expectedDryRunSha256: dryRun.payload.dryRunSha256,
        expectedCandidateCount: 1,
        expectedFieldWriteCount: 2,
        expectedStatusFieldCount: 1,
        expectedSquadStatusFieldCount: 1,
        allowedFields: ["status", "squadStatus"],
      }),
    });

    expect(response.status).toBe(409);
    expect(response.payload).toMatchObject({
      ok: false,
      schema: "footballscience-squad-status-repair-execution-v1",
      writes: false,
      executed: false,
    });
    expect(response.payload.guardFailures).toContain("current-revision-mismatch");
    const payloadText = JSON.stringify(response.payload);
    expect(payloadText).not.toContain("Private Player Name");
    expect(payloadText).not.toContain("national-team");
    expect(payloadText).not.toContain("development");
    expect(payloadText).not.toContain('"entries"');
    expect(payloadText).not.toContain('"players"');
    expect(payloadText).not.toContain('"changeLog"');
    expect(payloadText).not.toContain("service-role-test-key");
    expect(storage.writes).toEqual([]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("app-state Squad status repair execute writes only guarded status fields with sanitized response", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const fixture = createSquadStatusRepairFixture();
  const storage = createAppStateFetchMock(fixture.storageObjects, "admin");
  global.fetch = storage.fetchMock;

  try {
    const dryRun = await callHandler(appStateBackupHandler, {
      method: "GET",
      url: "/api/app-state-backup?mode=squad-status-repair-dry-run",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
    });

    const response = await callHandler(appStateBackupHandler, {
      method: "POST",
      url: "/api/app-state-backup?mode=squad-status-repair-execute",
      headers: {
        authorization: "Bearer cron-test-secret",
      },
      body: JSON.stringify({
        expectedCurrentRevision: dryRun.payload.current.revision,
        expectedCurrentSha256: dryRun.payload.current.valueSha256,
        expectedBackupSha256: dryRun.payload.latestBackup.pointerContentSha256,
        expectedPlanSha256: dryRun.payload.repairDryRun.planSha256,
        expectedDryRunSha256: dryRun.payload.dryRunSha256,
        expectedCandidateCount: 1,
        expectedFieldWriteCount: 2,
        expectedStatusFieldCount: 1,
        expectedSquadStatusFieldCount: 1,
        allowedFields: ["status", "squadStatus"],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      ok: true,
      schema: "footballscience-squad-status-repair-execution-v1",
      dryRun: false,
      writes: true,
      executed: true,
      targetKey: playerProfilesKey,
      fieldsOnly: ["status", "squadStatus"],
      repairedCandidateCount: 1,
      repairedFieldCounts: {
        status: 1,
        squadStatus: 1,
      },
      repairedTotalFieldCount: 2,
      before: {
        revision: 12,
        valueSha256: dryRun.payload.current.valueSha256,
        planSha256: dryRun.payload.repairDryRun.planSha256,
        dryRunSha256: dryRun.payload.dryRunSha256,
        backupSha256: dryRun.payload.latestBackup.pointerContentSha256,
      },
      after: {
        revision: 13,
      },
      postWriteAudit: {
        candidateCount: 0,
        fieldCounts: {
          status: 0,
          squadStatus: 0,
        },
        totalFieldCount: 0,
        cleared: true,
      },
      rollbackPlan: {
        available: true,
        restoreKey: playerProfilesKey,
        restoreRequiresSeparateApproval: true,
        rawBackupExposed: false,
      },
    });
    expect(response.payload.preWriteSnapshot.path).toContain("backups/app-state/repair-snapshots/squad-status/");
    expect(response.payload.preWriteSnapshot.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.payload.after.valueSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.payload.after.valueSha256).not.toBe(response.payload.before.valueSha256);
    expect(response.payload.postWriteAudit.dryRunSha256).toMatch(/^[a-f0-9]{64}$/);

    const payloadText = JSON.stringify(response.payload);
    expect(payloadText).not.toContain("Private Player Name");
    expect(payloadText).not.toContain("national-team");
    expect(payloadText).not.toContain("development");
    expect(payloadText).not.toContain('"entries"');
    expect(payloadText).not.toContain('"players"');
    expect(payloadText).not.toContain('"changeLog"');
    expect(payloadText).not.toContain("service-role-test-key");

    const stateWrite = storage.writes.find((write) => write.objectPath === playerProfilesPath);
    const snapshotWrite = storage.writes.find((write) =>
      write.objectPath.startsWith("backups/app-state/repair-snapshots/squad-status/")
    );
    expect(stateWrite).toBeTruthy();
    expect(snapshotWrite).toBeTruthy();
    expect(storage.writes).toHaveLength(2);

    const savedState = JSON.parse(stateWrite.entry.value);
    expect(savedState.players[0]).toMatchObject({
      id: "player-1",
      name: "Private Player Name",
      status: "national-team",
      squadStatus: "development",
      shirtNumber: 9,
    });
    expect(savedState.changeLog).toEqual(fixture.currentState.changeLog);
    expect(stateWrite.entry.revision).toBe(13);
    expect(stateWrite.entry.key).toBe(playerProfilesKey);
    expect(snapshotWrite.entry.entries[playerProfilesKey]).toBe(JSON.stringify(fixture.currentState));
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
