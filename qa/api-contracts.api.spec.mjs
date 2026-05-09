import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const clientConfigHandler = require("../api/client-config.js");
const appStateHandler = require("../api/app-state.js");
const appStateBackupHandler = require("../api/app-state-backup.js");
const appStateBackupStatusHandler = require("../api/app-state-backup-status.js");
const sessionHistoryHandler = require("../api/session-history.js");

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
      mergePolicy: "server-sanitized",
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
    manifest: {
      "football-schedule-v1": {
        present: true,
        moduleId: "schedule",
        organizationId: "global",
        revision: 2,
        mergePolicy: "server-merge",
        updatedAt: "2026-05-07T00:00:00.000Z",
        updatedBy: "qa",
        bytes: 34,
        sha256: "entry-hash",
      },
    },
    entries: {
      "football-schedule-v1": JSON.stringify({ privateFixture: "must stay out of status" }),
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
    const anonymousResponse = await callHandler(appStateBackupStatusHandler, {
      method: "GET",
      url: "/api/app-state-backup-status",
      headers: {},
    });
    expect(anonymousResponse.status).toBe(401);
    expect(anonymousResponse.payload.reason).toContain("Admin");

    const response = await callHandler(appStateBackupStatusHandler, {
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
    });
    expect(JSON.stringify(response.payload)).not.toContain("privateFixture");
    expect(JSON.stringify(response.payload)).not.toContain("service-role-test-key");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
