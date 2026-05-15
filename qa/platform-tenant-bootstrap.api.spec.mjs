import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const tenantBootstrap = require("../api/_lib/platform-tenant-bootstrap.js");

const actorId = "11111111-1111-4111-8111-111111111111";
const targetUserId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const clubId = "44444444-4444-4444-8444-444444444444";
const teamId = "55555555-5555-4555-8555-555555555555";
const membershipId = "66666666-6666-4666-8666-666666666666";
const tenantLinkId = "77777777-7777-4777-8777-777777777777";
const moduleRecordId = "88888888-8888-4888-8888-888888888888";

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const testConfig = {
  url: "https://project.supabase.co",
  serviceRoleKey: "service-role-test-key",
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function tableNameFromUrl(url) {
  return new URL(url).pathname.split("/").pop();
}

test("platform tenant bootstrap API is admin-only, guarded, and write-only", () => {
  expect(permissionMatrix.apiRouteSecurity["/api/platform-tenant-bootstrap"]).toMatchObject({
    moduleId: "platform-identity",
    enforcePermission: true,
  });
  expect(permissionMatrix.getApiActionForMethod("/api/platform-tenant-bootstrap", "POST")).toBe("admin");
  expect(permissionMatrix.getApiActionForMethod("/api/platform-tenant-bootstrap", "GET")).toBe("read");
  expect(permissionMatrix.platformPermissionMatrixByModule["platform-identity"].routes).toEqual(
    expect.arrayContaining(["/api/platform-identity", "/api/platform-tenant-bootstrap"])
  );

  const routeSource = readProjectFile("api/platform-tenant-bootstrap.js");
  expect(routeSource).toContain("getCurrentActor");
  expect(routeSource).toContain("resolveTenantBootstrapActor");
  expect(routeSource).toContain("guardApiRequest");
  expect(routeSource).toContain('req.method !== "POST"');
});

test("tenant bootstrap authorization never trusts editable auth metadata", () => {
  const resolverSource = readProjectFile("api/_lib/platform-tenant-bootstrap.js");
  expect(resolverSource).toContain("app_metadata");
  expect(resolverSource).toContain("platform_memberships");
  expect(resolverSource).not.toContain("user_metadata");
});

test("tenant bootstrap actor resolves admin from server-owned app metadata", async () => {
  const result = await tenantBootstrap.resolveTenantBootstrapActor(
    { id: actorId, email: "admin@example.com", role: "guest" },
    {
      config: testConfig,
      fetchImpl: async (url) => {
        if (String(url).includes("/auth/v1/admin/users/")) {
          return jsonResponse({ id: actorId, email: "admin@example.com", app_metadata: { role: "admin", status: "active" } });
        }
        return jsonResponse([]);
      },
    }
  );

  expect(result).toMatchObject({
    ok: true,
    actor: {
      id: actorId,
      role: "admin",
      adminSource: "app_metadata",
    },
  });
});

test("tenant bootstrap rejects apparent admins when server-owned auth and memberships do not agree", async () => {
  const result = await tenantBootstrap.resolveTenantBootstrapActor(
    { id: actorId, email: "admin@example.com", role: "admin" },
    {
      config: testConfig,
      fetchImpl: async (url) => {
        if (String(url).includes("/auth/v1/admin/users/")) {
          return jsonResponse({ id: actorId, email: "admin@example.com", app_metadata: { role: "coach", status: "active" } });
        }
        return jsonResponse([]);
      },
    }
  );

  expect(result.ok).toBe(false);
  expect(result.status).toBe(403);
});

test("tenant bootstrap dry run validates and plans without writes", async () => {
  const calls = [];
  const result = await tenantBootstrap.executeTenantBootstrap(
    {
      dryRun: true,
      organization: { slug: "north-carolina-courage", name: "North Carolina Courage" },
      club: { slug: "ncc", name: "NCC" },
      team: { slug: "first-team", name: "First Team", gender: "women" },
      user: { id: targetUserId },
      membership: { role: "team-admin", scope: "team" },
      links: [{ moduleId: "chat", moduleTable: "chat_threads", moduleRecordId, scope: "team" }],
    },
    { id: actorId, email: "admin@example.com", role: "admin", adminSource: "app_metadata" },
    {
      config: testConfig,
      fetchImpl: async (url, request = {}) => {
        calls.push({ url: String(url), method: request.method || "GET" });
        if (String(url).includes("/auth/v1/admin/users/")) {
          return jsonResponse({ id: targetUserId, email: "coach@example.com", app_metadata: { role: "coach" } });
        }
        return jsonResponse([]);
      },
    }
  );

  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(true);
  expect(result.operations.map((entry) => entry.action)).toEqual(["planned", "planned", "planned", "planned", "planned", "planned"]);
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  expect(result.tenant.organization.slug).toBe("north-carolina-courage");
  expect(result.membership).toMatchObject({ userId: targetUserId, role: "team-admin", scope: "team" });
});

test("tenant bootstrap creates canonical tenant rows in dependency order", async () => {
  const writes = [];
  const idsByTable = {
    platform_organizations: organizationId,
    platform_clubs: clubId,
    platform_teams: teamId,
    platform_memberships: membershipId,
    platform_tenant_links: tenantLinkId,
  };

  const result = await tenantBootstrap.executeTenantBootstrap(
    {
      organization: { slug: "north-carolina-courage", name: "North Carolina Courage" },
      club: { slug: "ncc", name: "NCC", countryCode: "US" },
      team: { slug: "first-team", name: "First Team", gender: "women" },
      user: { id: targetUserId, title: "Head Coach" },
      membership: { role: "team-admin", scope: "team" },
      links: [{ moduleId: "chat", moduleTable: "chat_threads", moduleRecordId, scope: "team" }],
    },
    { id: actorId, email: "admin@example.com", role: "admin", adminSource: "platform_memberships" },
    {
      config: testConfig,
      fetchImpl: async (url, request = {}) => {
        const method = request.method || "GET";
        if (String(url).includes("/auth/v1/admin/users/")) {
          return jsonResponse({ id: targetUserId, email: "coach@example.com", app_metadata: { role: "coach" } });
        }
        const tableName = tableNameFromUrl(url);
        if (method === "GET") {
          return jsonResponse([]);
        }
        const body = JSON.parse(request.body || "{}");
        writes.push({ tableName, body });
        if (tableName === "platform_user_profiles") {
          return jsonResponse([{ ...body }], 201);
        }
        return jsonResponse([{ id: idsByTable[tableName], ...body }], 201);
      },
    }
  );

  expect(result.ok).toBe(true);
  expect(result.schema).toBe(tenantBootstrap.PLATFORM_TENANT_BOOTSTRAP_SCHEMA);
  expect(writes.map((entry) => entry.tableName)).toEqual([
    "platform_organizations",
    "platform_clubs",
    "platform_teams",
    "platform_user_profiles",
    "platform_memberships",
    "platform_tenant_links",
  ]);
  expect(writes.find((entry) => entry.tableName === "platform_user_profiles")?.body).toMatchObject({
    user_id: targetUserId,
    primary_organization_id: organizationId,
    primary_club_id: clubId,
    primary_team_id: teamId,
    email: "coach@example.com",
  });
  expect(writes.find((entry) => entry.tableName === "platform_memberships")?.body).toMatchObject({
    organization_id: organizationId,
    club_id: clubId,
    team_id: teamId,
    user_id: targetUserId,
    role: "team-admin",
    scope: "team",
  });
  expect(result.links[0]).toMatchObject({
    moduleId: "chat",
    moduleTable: "chat_threads",
    moduleRecordId,
    scope: "team",
  });
});

test("tenant bootstrap refuses to relink an existing module record to another tenant", async () => {
  const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
  const result = await tenantBootstrap.executeTenantBootstrap(
    {
      organization: { id: organizationId, slug: "north-carolina-courage", name: "North Carolina Courage" },
      user: { id: targetUserId },
      membership: { role: "admin", scope: "organization" },
      links: [{ moduleId: "squad", moduleTable: "squad_teams", moduleRecordId, scope: "organization" }],
    },
    { id: actorId, email: "admin@example.com", role: "admin", adminSource: "app_metadata" },
    {
      config: testConfig,
      fetchImpl: async (url, request = {}) => {
        const tableName = tableNameFromUrl(url);
        if (String(url).includes("/auth/v1/admin/users/")) {
          return jsonResponse({ id: targetUserId, email: "coach@example.com", app_metadata: { role: "coach" } });
        }
        if (tableName === "platform_organizations") {
          return jsonResponse([{ id: organizationId, slug: "north-carolina-courage", name: "North Carolina Courage", status: "active" }]);
        }
        if (tableName === "platform_tenant_links") {
          return jsonResponse([
            {
              id: tenantLinkId,
              organization_id: otherOrganizationId,
              club_id: null,
              team_id: null,
              module_id: "squad",
              module_table: "squad_teams",
              module_record_id: moduleRecordId,
              scope: "organization",
              status: "active",
            },
          ]);
        }
        if ((request.method || "GET") === "GET") {
          return jsonResponse([]);
        }
        return jsonResponse([{ id: membershipId, ...JSON.parse(request.body || "{}") }], 201);
      },
    }
  );

  expect(result.ok).toBe(false);
  expect(result.status).toBe(409);
  expect(result.reason).toContain("will not relink");
});
