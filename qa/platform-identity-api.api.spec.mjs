import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const platformIdentity = require("../api/_lib/platform-identity.js");

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const clubId = "33333333-3333-4333-8333-333333333333";
const teamId = "44444444-4444-4444-8444-444444444444";

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("platform identity API is registered, guarded, and read-only", () => {
  expect(permissionMatrix.apiRouteSecurity["/api/platform-identity"]).toMatchObject({
    moduleId: "platform-identity",
    enforcePermission: true,
  });
  expect(permissionMatrix.getApiActionForMethod("/api/platform-identity", "GET")).toBe("read");
  expect(permissionMatrix.platformPermissionMatrixByModule["platform-identity"].routes).toContain("/api/platform-identity");

  const routeSource = readProjectFile("api/platform-identity.js");
  expect(routeSource).toContain("getCurrentActor");
  expect(routeSource).toContain("guardApiRequest");
  expect(routeSource).toContain("resolvePlatformActorScope");
  expect(routeSource).toContain('req.method !== "GET"');
});

test("platform identity resolver never trusts user metadata for authorization", () => {
  const resolverSource = readProjectFile("api/_lib/platform-identity.js");
  expect(resolverSource).toContain("app_metadata");
  expect(resolverSource).not.toContain("user_metadata");
  expect(resolverSource).toContain("platform_memberships");
  expect(resolverSource).toContain("user_id");
  expect(resolverSource).toContain("deleted_at");
  expect(resolverSource).toContain("app_state_fallback_enabled");
});

test("platform identity scope payload is driven by memberships and server-owned app metadata", () => {
  const payload = platformIdentity.createPlatformActorScopePayload(
    { id: userId, email: "mak@example.com", role: "admin" },
    {
      id: userId,
      email: "mak@example.com",
      app_metadata: { role: "coach", status: "active" },
    },
    {
      profile: {
        user_id: userId,
        primary_organization_id: organizationId,
        primary_club_id: clubId,
        primary_team_id: teamId,
        display_name: "Mak Coach",
        email: "mak@example.com",
        status: "active",
      },
      memberships: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          organization_id: organizationId,
          club_id: clubId,
          team_id: teamId,
          user_id: userId,
          role: "team-admin",
          scope: "team",
          status: "active",
          relationship: "staff",
          updated_at: "2026-05-15T04:00:00.000Z",
        },
      ],
      organizations: [{ id: organizationId, slug: "ncc", name: "North Carolina Courage", status: "active" }],
      clubs: [{ id: clubId, organization_id: organizationId, slug: "ncc-club", name: "NCC", status: "active" }],
      teams: [{ id: teamId, organization_id: organizationId, club_id: clubId, slug: "first", name: "First Team", status: "active" }],
      checkpoints: [
        {
          module_id: "chat",
          source_storage_key: "football-dashboard-chat-v1",
          target_table: "chat_messages",
          phase: "shadow",
          reads_from_database: false,
          writes_to_database: false,
          app_state_fallback_enabled: true,
          owner: "platform",
        },
      ],
    }
  );

  expect(payload).toMatchObject({
    ok: true,
    schema: platformIdentity.PLATFORM_IDENTITY_SCOPE_SCHEMA,
    actor: {
      id: userId,
      email: "mak@example.com",
      role: "team-admin",
      bootstrapRole: "coach",
    },
    scope: {
      primary: {
        organizationId,
        clubId,
        teamId,
        role: "team-admin",
      },
      manageable: {
        canManagePlatform: false,
        teamIds: [teamId],
      },
    },
    appStateFallback: {
      enabled: true,
    },
  });
  expect(payload.appStateFallback.checkpoints[0]).not.toHaveProperty("targetTable");
});

test("platform admin bootstrap can see operational checkpoint details without memberships", () => {
  const payload = platformIdentity.createPlatformActorScopePayload(
    { id: userId, email: "admin@example.com", role: "guest" },
    {
      id: userId,
      email: "admin@example.com",
      app_metadata: { role: "admin", status: "active" },
    },
    {
      profile: null,
      memberships: [],
      organizations: [],
      clubs: [],
      teams: [],
      checkpoints: [
        {
          module_id: "scouting",
          source_storage_key: "football-scouting-v1",
          target_table: "scouting_players",
          phase: "shadow",
          reads_from_database: false,
          writes_to_database: false,
          app_state_fallback_enabled: true,
          owner: "platform",
        },
      ],
    }
  );

  expect(payload.actor.role).toBe("admin");
  expect(payload.scope.manageable.canManagePlatform).toBe(true);
  expect(payload.appStateFallback.checkpoints[0]).toMatchObject({
    moduleId: "scouting",
    targetTable: "scouting_players",
    owner: "platform",
  });
  expect(payload.warnings[0]).toContain("No active platform membership rows");
});

test("platform identity database reads are scoped to the signed-in actor", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const seenUrls = [];
  const rowsByTable = {
    platform_memberships: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: organizationId,
        club_id: clubId,
        team_id: teamId,
        user_id: userId,
        role: "coach",
        scope: "team",
        status: "active",
      },
    ],
    platform_user_profiles: [{ user_id: userId, primary_organization_id: organizationId, primary_club_id: clubId, primary_team_id: teamId }],
    platform_module_migration_checkpoints: [],
    platform_organizations: [{ id: organizationId, slug: "ncc", name: "North Carolina Courage", status: "active" }],
    platform_clubs: [{ id: clubId, organization_id: organizationId, slug: "ncc-club", name: "NCC", status: "active" }],
    platform_teams: [{ id: teamId, organization_id: organizationId, club_id: clubId, slug: "first", name: "First Team", status: "active" }],
  };

  try {
    const result = await platformIdentity.fetchPlatformIdentityRows(userId, {
      fetchImpl: async (url) => {
        seenUrls.push(String(url));
        const tableName = new URL(url).pathname.split("/").pop();
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(rowsByTable[tableName] || []),
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.memberships).toHaveLength(1);
    const membershipUrl = seenUrls.find((url) => url.includes("/rest/v1/platform_memberships?"));
    expect(membershipUrl).toContain(`user_id=eq.${userId}`);
    expect(membershipUrl).toContain("status=eq.active");
    expect(membershipUrl).toContain("deleted_at=is.null");
  } finally {
    process.env.SUPABASE_URL = previousEnv.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.SUPABASE_SERVICE_ROLE_KEY;
  }
});
