import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const platformSecurity = require("../api/_lib/platform-security.js");
const trafficSafety = require("../src/core/traffic-safety-contracts.cjs");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createRequest({ method = "GET", url = "/api/client-config", ip = "198.51.100.10" } = {}) {
  return {
    method,
    url,
    headers: {
      "x-forwarded-for": ip,
      "user-agent": "platform-security-test",
      "x-vercel-id": `test-${method}-${url}`,
    },
    socket: { remoteAddress: ip },
  };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = String(value || "");
    },
  };
}

test("permission matrix covers every module action with conservative roles", () => {
  const moduleIds = permissionMatrix.platformPermissionMatrix.map((entry) => entry.moduleId);
  expect(moduleIds).toEqual(expect.arrayContaining([
    "app-state",
    "audit-log",
    "auth",
    "chat",
    "football-science-db",
    "home",
    "medical-team",
    "platform-appearance",
    "player-profiles",
    "schedule",
    "scouting",
    "session-planner",
  ]));

  for (const module of permissionMatrix.platformPermissionMatrix) {
    for (const action of permissionMatrix.permissionActions) {
      expect(module.permissions[action], `${module.moduleId}.${action}`).toEqual(expect.any(Array));
      expect(module.permissions[action].length, `${module.moduleId}.${action}`).toBeGreaterThan(0);
    }
  }

  expect(permissionMatrix.hasModulePermission({ role: "guest" }, "chat", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "chat", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "medical-team", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "medical" }, "medical-team", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "football-science-db", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "football-science-db", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "scout" }, "football-science-db", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "app-state", "restore")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "admin" }, "app-state", "restore")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "platform-appearance", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "admin" }, "platform-appearance", "write")).toBe(true);
});

test("all public API routes are registered and guarded", () => {
  const apiFiles = fs
    .readdirSync(path.join(rootDir, "api"))
    .filter((entry) => entry.endsWith(".js"))
    .map((entry) => `/api/${entry.replace(/\.js$/, "")}`)
    .sort();

  for (const route of apiFiles) {
    expect(permissionMatrix.apiRouteSecurity[route], `${route} must be registered`).toBeTruthy();
    const routeFile = readProjectFile(`${route.slice(1)}.js`);
    expect(routeFile, `${route} must call guardApiRequest`).toContain("guardApiRequest");
  }

  for (const [route, config] of Object.entries(permissionMatrix.apiRouteSecurity)) {
    expect(permissionMatrix.getModulePermissionContract(config.moduleId), `${route} module`).toBeTruthy();
    for (const action of Object.values(config.actions)) {
      expect(config.rateLimits[action], `${route}.${action} rate limit`).toBeGreaterThan(0);
    }
  }
});

test("API guard rate limits abusive public requests before route work", () => {
  platformSecurity.rateLimitBuckets.clear();

  let latestResponse = null;
  for (let index = 0; index < 13; index += 1) {
    latestResponse = createResponse();
    platformSecurity.guardApiRequest(
      createRequest({ method: "POST", url: "/api/client-config", ip: "203.0.113.44" }),
      latestResponse,
      { route: "/api/client-config", moduleId: "auth", action: "write" }
    );
  }

  expect(latestResponse.statusCode).toBe(429);
  expect(latestResponse.headers["retry-after"]).toBeTruthy();
  expect(JSON.parse(latestResponse.body)).toEqual(expect.objectContaining({ ok: false }));
});

test("chat and presence API budgets stay conservative during traffic spikes", () => {
  const chatConfig = permissionMatrix.apiRouteSecurity["/api/chat"];
  const presenceConfig = permissionMatrix.apiRouteSecurity["/api/presence"];

  expect(chatConfig.rateLimits.read).toBeLessThanOrEqual(60);
  expect(chatConfig.rateLimits.write).toBeLessThanOrEqual(60);
  expect(presenceConfig.rateLimits.read).toBeLessThanOrEqual(30);
  expect(presenceConfig.rateLimits.write).toBeLessThanOrEqual(20);

  platformSecurity.rateLimitBuckets.clear();
  let latestResponse = null;
  for (let index = 0; index < 31; index += 1) {
    latestResponse = createResponse();
    platformSecurity.guardApiRequest(
      createRequest({ method: "GET", url: "/api/presence", ip: "203.0.113.91" }),
      latestResponse,
      {
        route: "/api/presence",
        moduleId: "presence",
        action: "read",
        actor: { id: "coach-presence-spike", role: "coach" },
        enforcePermission: true,
      }
    );
  }

  expect(latestResponse.statusCode).toBe(429);
  expect(latestResponse.headers["x-ratelimit-limit"]).toBe("30");
  expect(latestResponse.headers["retry-after"]).toBeTruthy();

  platformSecurity.rateLimitBuckets.clear();
  latestResponse = null;
  for (let index = 0; index < 61; index += 1) {
    latestResponse = createResponse();
    platformSecurity.guardApiRequest(
      createRequest({ method: "GET", url: "/api/chat", ip: "203.0.113.92" }),
      latestResponse,
      {
        route: "/api/chat",
        moduleId: "chat",
        action: "read",
        actor: { id: "coach-chat-spike", role: "coach" },
        enforcePermission: true,
      }
    );
  }

  expect(latestResponse.statusCode).toBe(429);
  expect(latestResponse.headers["x-ratelimit-limit"]).toBe("60");
  expect(latestResponse.headers["retry-after"]).toBeTruthy();
});

test("traffic safety contracts bind high-churn endpoints to backend, edge and client-loop guards", () => {
  const routes = trafficSafety.trafficSafetyContracts.map((contract) => contract.route);
  expect(routes).toEqual(expect.arrayContaining([
    "/api/app-state",
    "/api/chat",
    "/api/client-config",
    "/api/presence",
    "/api/push-subscriptions",
  ]));

  const failures = trafficSafety.validateTrafficSafetyContracts({
    apiRouteSecurity: permissionMatrix.apiRouteSecurity,
    readFile: readProjectFile,
  });
  expect(failures).toEqual([]);

  const edgeControl = trafficSafety.trafficSafetyEdgeControls["chat-presence-rate-limit"];
  expect(edgeControl.name).toBe("Rate limit chat presence APIs");
  expect(edgeControl.rateLimit).toMatchObject({ windowSeconds: 60, limit: 80, key: "ip", action: "deny" });
  for (const route of ["/api/chat", "/api/presence", "/api/push-subscriptions"]) {
    expect(trafficSafety.edgeControlMatchesRoute(edgeControl, route), `${route} edge control`).toBe(true);
  }

  const platformSecurityVerifier = readProjectFile("scripts/verify-platform-security.mjs");
  expect(platformSecurityVerifier).toContain("validateTrafficSafetyContracts");
});

test("API guard blocks module actions outside the backend permission matrix", () => {
  platformSecurity.rateLimitBuckets.clear();
  const response = createResponse();
  const result = platformSecurity.guardApiRequest(
    createRequest({ method: "POST", url: "/api/medical", ip: "203.0.113.50" }),
    response,
    {
      route: "/api/medical",
      moduleId: "medical-team",
      action: "write",
      actor: { id: "coach-1", role: "coach" },
      enforcePermission: true,
    }
  );

  expect(result.ok).toBe(false);
  expect(response.statusCode).toBe(403);
  expect(JSON.parse(response.body).reason).toContain("permission");
});

test("tenant isolation and permission matrix are enforced at migration-contract level", () => {
  const migration = readProjectFile("supabase/migrations/20260510030705_platform_security_control_plane.sql");
  expect(migration).toContain("public.platform_permission_matrix");
  expect(migration).toContain("public.platform_security_events");
  expect(migration).toContain("action text not null check (char_length(action) between 2 and 120)");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("app_private.has_platform_permission");
  expect(migration).toContain("app_private.is_platform_org_member");
  expect(migration).toContain("app_private.is_platform_team_member");

  const allMigrations = fs
    .readdirSync(path.join(rootDir, "supabase", "migrations"))
    .filter((entry) => entry.endsWith(".sql"))
    .map((entry) => readProjectFile(`supabase/migrations/${entry}`))
    .join("\n");

  for (const tableName of ["chat_messages", "squad_roster_memberships", "medical_cases", "schedule_events"]) {
    expect(allMigrations).toContain(`alter table public.${tableName} enable row level security`);
    expect(allMigrations).toContain(`revoke all on public.${tableName} from anon, authenticated`);
  }

  expect(allMigrations).toContain("app_private.is_chat_team_member(thread.team_id)");
  expect(allMigrations).toContain("app_private.is_squad_team_member(team_id)");
  expect(allMigrations).toContain("app_private.can_view_private_medical_team(team_id)");
  expect(allMigrations).toContain("app_private.is_schedule_staff()");
});
