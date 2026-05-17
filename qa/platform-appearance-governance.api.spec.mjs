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
];
const appearancePath = `global/${PLATFORM_APPEARANCE_STORAGE_KEY}.json`;

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
    id: "actor-1",
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
  const fetchMock = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (requestUrl.endsWith("/auth/v1/user") || requestUrl.includes("/auth/v1/admin/users/actor-1")) {
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
