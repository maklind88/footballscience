import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const appStateHandler = require("../api/app-state.js");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");
const {
  PLATFORM_APPEARANCE_STORAGE_KEY,
  getHomeAppearanceImpactSummary,
  normalizePlatformAppearanceConfig,
} = require("../src/core/appearance-governance.cjs");

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
  "APP_STATE_DATABASE_MODE",
];
const TEST_USER_ID = "00000000-0000-4000-8000-000000009901";
const TEST_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000101";
const TEST_CLUB_ID = "00000000-0000-4000-8000-000000000201";
const TEST_TEAM_ID = "00000000-0000-4000-8000-000000000301";
const appearancePath = `organizations/${TEST_ORGANIZATION_ID}/${PLATFORM_APPEARANCE_STORAGE_KEY}.json`;

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

function createMockPlatformUser(role = "coach") {
  return {
    id: TEST_USER_ID,
    email: `${role}@example.com`,
    user_metadata: {
      firstName: "QA",
      lastName: role,
      username: `qa.${role}`,
    },
    app_metadata: {
      role,
      status: "active",
    },
    created_at: "2026-05-17T00:00:00.000Z",
  };
}

function createAppStateFetchMock(initialObjects = {}, role = "coach") {
  const objects = new Map(Object.entries(initialObjects));
  const writes = [];
  const user = createMockPlatformUser(role);

  const toDatabaseRow = (entry = {}, applied) => {
    const row = {
      organization_id: String(entry.organizationId || TEST_ORGANIZATION_ID),
      state_key: String(entry.key || ""),
      module_id: String(entry.moduleId || dataSafetyRegistry.getByKey(entry.key)?.moduleId || ""),
      merge_policy: String(entry.mergePolicy || dataSafetyRegistry.getByKey(entry.key)?.mergePolicy || "replace"),
      revision: Number(entry.revision) || 0,
      value: String(entry.value ?? ""),
      removed: Boolean(entry.removed),
      updated_by: String(entry.updatedBy || TEST_USER_ID),
      updated_at: String(entry.updatedAt || "2026-05-17T00:00:00.000Z"),
      value_hash: String(entry.hash || "a".repeat(64)),
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
    };
    return applied === undefined ? row : { ...row, applied };
  };

  const seedDatabaseEntry = (key, source = {}) => {
    const objectPath = `organizations/${TEST_ORGANIZATION_ID}/${key}.json`;
    if (objects.has(objectPath)) return;
    objects.set(objectPath, {
      schema: "footballscience-app-state-v1",
      key,
      organizationId: TEST_ORGANIZATION_ID,
      moduleId: source.moduleId || dataSafetyRegistry.getByKey(key)?.moduleId || "",
      mergePolicy: source.mergePolicy || dataSafetyRegistry.getByKey(key)?.mergePolicy || "replace",
      revision: Number(source.revision) || 1,
      value: typeof source.value === "string" ? source.value : String(source ?? ""),
      removed: Boolean(source.removed),
      updatedBy: source.updatedBy || TEST_USER_ID,
      updatedAt: source.updatedAt || "2026-05-17T00:00:00.000Z",
      hash: source.hash || "a".repeat(64),
      metadata: source.metadata || {},
    });
  };

  Object.entries(initialObjects).forEach(([objectPath, source]) => {
    const match = /^organizations\/([^/]+)\/(.+)\.json$/.exec(objectPath);
    if (!match || decodeURIComponent(match[1]) !== TEST_ORGANIZATION_ID) return;
    seedDatabaseEntry(decodeURIComponent(match[2]), source);
  });

  const fetchMock = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user") || requestUrl.includes(`/auth/v1/admin/users/${TEST_USER_ID}`)) {
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
        accepted_at: "2026-05-17T00:00:00.000Z",
        created_at: "2026-05-17T00:00:00.000Z",
        updated_at: "2026-05-17T00:00:00.000Z",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{
        id: TEST_ORGANIZATION_ID,
        slug: "qa-org",
        name: "QA Organization",
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
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_teams") {
      return new Response(JSON.stringify([{
        id: TEST_TEAM_ID,
        organization_id: TEST_ORGANIZATION_ID,
        club_id: TEST_CLUB_ID,
        slug: "qa-team",
        name: "QA Team",
        status: "active",
      }]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_module_migration_checkpoints") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/platform_app_state_records" && method === "GET") {
      const organizationId = String(parsedUrl.searchParams.get("organization_id") || "").replace(/^eq\./, "");
      const keyFilter = String(parsedUrl.searchParams.get("state_key") || "");
      const keys = keyFilter.startsWith("in.(") && keyFilter.endsWith(")")
        ? keyFilter.slice(4, -1).split(",").map((key) => key.trim()).filter(Boolean)
        : [keyFilter.replace(/^eq\./, "")].filter(Boolean);
      const rows = Array.from(objects.values())
        .filter((entry) => String(entry.organizationId || "") === organizationId)
        .filter((entry) => !keys.length || keys.includes(entry.key))
        .map((entry) => toDatabaseRow(entry));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (parsedUrl.pathname === "/rest/v1/rpc/write_platform_app_state_record" && method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const key = String(body.p_state_key || "");
      const organizationId = String(body.p_organization_id || TEST_ORGANIZATION_ID);
      const objectPath = `organizations/${organizationId}/${key}.json`;
      const current = objects.get(objectPath);
      if (Number(body.p_expected_revision || 0) !== Number(current?.revision || 0)) {
        return new Response(JSON.stringify(current ? [toDatabaseRow(current, false)] : []), { status: 200 });
      }
      const entry = {
        schema: "footballscience-app-state-v1",
        key,
        organizationId,
        moduleId: String(body.p_module_id || dataSafetyRegistry.getByKey(key)?.moduleId || ""),
        mergePolicy: String(body.p_merge_policy || dataSafetyRegistry.getByKey(key)?.mergePolicy || "replace"),
        revision: Number(body.p_next_revision) || Number(current?.revision || 0) + 1,
        value: String(body.p_value ?? ""),
        removed: Boolean(body.p_removed),
        updatedBy: String(body.p_updated_by || TEST_USER_ID),
        updatedAt: "2026-05-17T00:01:00.000Z",
        hash: String(body.p_value_hash || "a".repeat(64)),
        metadata: body.p_metadata && typeof body.p_metadata === "object" ? body.p_metadata : {},
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
        return objects.has(objectPath)
          ? new Response(JSON.stringify(objects.get(objectPath)), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      if (method === "PUT" || method === "POST") {
        const entry = JSON.parse(String(options.body || "{}"));
        objects.set(objectPath, entry);
        writes.push({ method, objectPath, entry });
        return new Response(JSON.stringify({ Key: objectPath }), { status: 200 });
      }
      if (method === "DELETE") {
        return new Response(JSON.stringify({ deleted: 0 }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  return { fetchMock, objects, writes };
}

test("Platform Appearance is admin-only and covered by central safety contracts", () => {
  expect(dataSafetyRegistry.getByKey(PLATFORM_APPEARANCE_STORAGE_KEY)).toMatchObject({
    moduleId: "platform-appearance",
    mergePolicy: "server-sanitized",
  });
  expect(permissionMatrix.hasModulePermission({ role: "admin" }, "platform-appearance", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "club-admin" }, "platform-appearance", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "platform-appearance", "write")).toBe(false);
});

test("Platform Appearance normalizes same-type rules and rejects unsafe text", () => {
  const normalized = normalizePlatformAppearanceConfig({
    modules: {
      home: {
        density: "giant",
        componentTypes: {
          "home.task-panel": { density: "airy", tone: "contrast", css: "position:fixed" },
          "home.unknown-panel": { density: "compact" },
        },
        sections: {
          todo: { title: "<script>bad</script>", eyebrow: "Work", order: 200 },
          alerts: { enabled: false, order: 5 },
        },
      },
    },
  });

  expect(normalized.modules.home.density).toBe("normal");
  expect(normalized.modules.home.componentTypes["home.task-panel"]).toMatchObject({
    density: "airy",
    tone: "contrast",
  });
  expect(normalized.modules.home.componentTypes["home.unknown-panel"]).toBeUndefined();
  expect(normalized.modules.home.sections.todo.title).toBe("Work Queue");
  expect(normalized.modules.home.sections.todo.order).toBe(99);
  expect(normalized.modules.home.sections.alerts.enabled).toBe(false);
});

test("Platform Appearance reports affected Home components per same-type rule", () => {
  const normalized = normalizePlatformAppearanceConfig({
    modules: {
      home: {
        sections: {
          topTasks: { enabled: false, order: 30 },
          todo: { order: 20 },
          alerts: { order: 10 },
        },
      },
    },
  });
  const impactByType = Object.fromEntries(getHomeAppearanceImpactSummary(normalized).map((impact) => [impact.componentType, impact]));

  expect(impactByType["home.task-panel"]).toMatchObject({
    count: 1,
    enabledCount: 1,
    hiddenCount: 0,
  });
  expect(impactByType["home.task-panel"].sections[0]).toMatchObject({
    id: "todo",
    label: "Coach To-Do",
    enabled: true,
  });
  expect(impactByType["home.priority-panel"]).toMatchObject({
    count: 1,
    enabledCount: 0,
    hiddenCount: 1,
  });
  expect(impactByType["home.priority-panel"].sections[0]).toMatchObject({
    id: "topTasks",
    enabled: false,
  });
});

test("app-state blocks non-admin Platform Appearance writes and stores sanitized admin publishes", async () => {
  const env = snapshotEnv(supabaseEnvKeys);
  const originalFetch = global.fetch;
  clearEnv(supabaseEnvKeys);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.APP_STATE_DATABASE_MODE = "database";

  try {
    const coachStorage = createAppStateFetchMock({}, "coach");
    global.fetch = coachStorage.fetchMock;
    const denied = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: { authorization: "Bearer test-access-token" },
      body: JSON.stringify({
        key: PLATFORM_APPEARANCE_STORAGE_KEY,
        value: JSON.stringify({ modules: { home: { density: "compact" } } }),
      }),
    });
    expect(denied.status).toBe(403);
    expect(denied.payload.reason).toContain("Only admins");

    const adminStorage = createAppStateFetchMock({}, "admin");
    global.fetch = adminStorage.fetchMock;
    const published = await callHandler(appStateHandler, {
      method: "POST",
      url: "/api/app-state",
      headers: { authorization: "Bearer test-access-token" },
      body: JSON.stringify({
        key: PLATFORM_APPEARANCE_STORAGE_KEY,
        value: JSON.stringify({
          modules: {
            home: {
              density: "compact",
              componentTypes: {
                "home.task-panel": { density: "airy", tone: "contrast" },
              },
              sections: {
                todo: { title: "<img src=x onerror=alert(1)>", enabled: true },
                alerts: { enabled: false, order: 5 },
              },
            },
          },
        }),
      }),
    });

    expect(published.status).toBe(200);
    expect(published.payload).toMatchObject({ ok: true, key: PLATFORM_APPEARANCE_STORAGE_KEY });
    const stored = JSON.parse(adminStorage.objects.get(appearancePath).value);
    expect(stored.modules.home.density).toBe("compact");
    expect(stored.modules.home.componentTypes["home.task-panel"].density).toBe("airy");
    expect(stored.modules.home.sections.todo.title).toBe("Work Queue");
    expect(stored.modules.home.sections.alerts.enabled).toBe(false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(env);
  }
});
