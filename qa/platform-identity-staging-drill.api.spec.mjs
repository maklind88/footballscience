import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  executePlatformIdentityBackfill,
} from "../scripts/platform-identity-backfill.mjs";
import {
  executePlatformIdentityRollback,
  executePlatformIdentityStagingDrill,
  STAGING_APPLY_CONFIRMATION,
} from "../scripts/lib/platform-identity-staging-backfill-drill.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const teamId = "55555555-5555-4555-8555-555555555555";
const config = {
  url: "https://pokrksgempkuraueglpu.supabase.co",
  serviceRoleKey: "service-role-test-key",
};
const workflow = readFileSync(
  new URL("../.github/workflows/platform-identity-staging-drill.yml", import.meta.url),
  "utf8"
);

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function environment() {
  return {
    PLATFORM_BACKFILL_TARGET: "staging",
    SUPABASE_PROJECT_REF: "pokrksgempkuraueglpu",
    CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: "bustidorxevacosqhkcz",
    SUPABASE_URL: config.url,
    SUPABASE_SECRET_KEY: config.serviceRoleKey,
    PLATFORM_BACKFILL_ACTOR_ID: actorId,
    PLATFORM_BACKFILL_ORGANIZATION_ID: organizationId,
    PLATFORM_BACKFILL_ORGANIZATION_NAME: "North Carolina Courage",
    PLATFORM_BACKFILL_ORGANIZATION_SLUG: "north-carolina-courage",
    PLATFORM_BACKFILL_TEAM_ID: teamId,
    PLATFORM_BACKFILL_TEAM_NAME: "North Carolina Courage",
    PLATFORM_BACKFILL_TEAM_SLUG: "north-carolina-courage",
    PLATFORM_BACKFILL_TEAM_GENDER: "women",
  };
}

function matchesFilter(row, column, value) {
  if (value === "is.null") return row[column] === null || row[column] === undefined;
  if (!value.startsWith("eq.")) return true;
  return String(row[column] ?? "") === value.slice(3);
}

function createHarness() {
  const tables = {
    platform_organizations: [],
    platform_clubs: [],
    platform_teams: [],
    platform_user_profiles: [{
      user_id: userId,
      primary_organization_id: null,
      primary_club_id: null,
      primary_team_id: null,
      display_name: "Existing Admin",
      first_name: null,
      last_name: null,
      email: "admin@example.com",
      title: null,
      department: null,
      avatar_url: null,
      status: "active",
      metadata: { source: "existing" },
      row_version: 4,
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    }],
    platform_memberships: [{
      id: "77777777-7777-4777-8777-777777777777",
      organization_id: "88888888-8888-4888-8888-888888888888",
      club_id: null,
      team_id: null,
      user_id: userId,
      role: "coach",
      scope: "organization",
      status: "active",
      relationship: "staff",
      invited_by: null,
      accepted_at: null,
      metadata: { source: "existing" },
      row_version: 3,
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    }],
    platform_tenant_links: [],
  };
  const storage = new Map();
  let nextMembership = 1;
  const user = {
    id: userId,
    email: "admin@example.com",
    app_metadata: { role: "admin", status: "active" },
    user_metadata: { displayName: "Admin" },
  };

  const fetchImpl = async (url, request = {}) => {
    const requestUrl = new URL(String(url));
    const method = request.method || "GET";
    if (requestUrl.pathname === "/auth/v1/admin/users") return jsonResponse({ users: [user] });
    if (requestUrl.pathname === `/auth/v1/admin/users/${userId}`) return jsonResponse(user);
    if (requestUrl.pathname === "/storage/v1/bucket/footballscience-app-state") return jsonResponse({ public: false });
    if (requestUrl.pathname.startsWith("/storage/v1/object/")) {
      const key = requestUrl.pathname;
      if (method === "POST") {
        storage.set(key, JSON.parse(request.body));
        return jsonResponse({}, 200);
      }
      return storage.has(key) ? jsonResponse(storage.get(key)) : jsonResponse({ message: "not found" }, 404);
    }
    const table = requestUrl.pathname.split("/").pop();
    const rows = tables[table];
    if (!rows) return jsonResponse({ message: "unexpected route" }, 404);
    if (method === "GET") {
      const selected = rows.filter((row) => [...requestUrl.searchParams.entries()].every(([key, value]) => key === "select" || key === "limit" || matchesFilter(row, key, value)));
      return jsonResponse(selected);
    }
    if (method === "POST") {
      const body = JSON.parse(request.body);
      const row = {
        ...body,
        id: body.id || (table === "platform_memberships" ? `66666666-6666-4666-8666-${String(nextMembership++).padStart(12, "0")}` : undefined),
        row_version: 1,
        metadata: body.metadata || {},
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
      };
      rows.push(row);
      return jsonResponse([row], 201);
    }
    if (method === "PATCH") {
      const body = JSON.parse(request.body);
      const target = rows.filter((row) => [...requestUrl.searchParams.entries()].every(([key, value]) => key === "select" || matchesFilter(row, key, value)));
      if (target.length !== 1) return jsonResponse([]);
      Object.assign(target[0], body, { row_version: Number(target[0].row_version || 0) + 1 });
      return jsonResponse([target[0]]);
    }
    return jsonResponse({ message: "unexpected method" }, 405);
  };
  return { tables, fetchImpl };
}

function baseBackfill() {
  return {
    actorId,
    organization: { id: organizationId, name: "North Carolina Courage", slug: "north-carolina-courage" },
    team: { id: teamId, name: "North Carolina Courage", slug: "north-carolina-courage", gender: "women" },
    userIds: [],
    roles: [],
    links: [],
    limit: 20,
    maxPages: 1,
  };
}

test("staging drill refuses a non-staging environment before any database request", async () => {
  const result = await executePlatformIdentityStagingDrill({
    backfill: { ...baseBackfill(), apply: true, confirm: STAGING_APPLY_CONFIRMATION, expectedPlanSha256: "a".repeat(64), expectedUserCount: 1 },
    env: { ...environment(), PLATFORM_BACKFILL_TARGET: "production", SUPABASE_PROJECT_REF: "bustidorxevacosqhkcz", SUPABASE_URL: "https://bustidorxevacosqhkcz.supabase.co" },
    config,
    fetchImpl: async () => {
      throw new Error("database must not be called");
    },
  });
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("Platform Identity drill is staging-only.");
});

test("staging drill blocks tenant links before any database request because their rollback lacks an optimistic version", async () => {
  const result = await executePlatformIdentityStagingDrill({
    backfill: {
      ...baseBackfill(),
      apply: true,
      confirm: STAGING_APPLY_CONFIRMATION,
      expectedPlanSha256: "a".repeat(64),
      expectedUserCount: 1,
      links: [{ moduleId: "chat", moduleTable: "chat_teams", moduleRecordId: teamId, scope: "team" }],
    },
    env: environment(),
    config,
    fetchImpl: async () => {
      throw new Error("database must not be called");
    },
  });
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("Staging drill does not support tenant links until their rollback has an optimistic version contract.");
});

test("staging drill captures, applies, rolls back, verifies, and reapplies only the reviewed identity scope", async () => {
  const harness = createHarness();
  const dryRun = await executePlatformIdentityBackfill({ ...baseBackfill(), apply: false, config, fetchImpl: harness.fetchImpl });
  expect(dryRun.ok).toBe(true);
  const result = await executePlatformIdentityStagingDrill({
    backfill: {
      ...baseBackfill(),
      apply: true,
      confirm: STAGING_APPLY_CONFIRMATION,
      expectedPlanSha256: dryRun.plan.planSha256,
      expectedUserCount: dryRun.plan.usersPlanned,
    },
    env: environment(),
    config,
    fetchImpl: harness.fetchImpl,
    now: () => new Date("2026-09-20T20:00:00.000Z"),
  });

  expect(result, JSON.stringify(result)).toMatchObject({ ok: true, target: "staging", userCount: 1, piiExposed: false });
  expect(result.final.counts).toMatchObject({ platform_organizations: 1, platform_teams: 1, platform_user_profiles: 1, platform_memberships: 2 });
  expect(result.rollback).toMatchObject({ ok: true, actionsApplied: 4, blockerCount: 0 });
  expect(harness.tables.platform_organizations).toHaveLength(1);
  expect(harness.tables.platform_organizations[0]).toMatchObject({ id: organizationId, status: "active", deleted_at: null });
  expect(harness.tables.platform_teams[0]).toMatchObject({ id: teamId, organization_id: organizationId, status: "active", deleted_at: null });
  expect(harness.tables.platform_user_profiles[0]).toMatchObject({ display_name: "Admin", primary_organization_id: organizationId, primary_team_id: teamId });
  expect(harness.tables.platform_memberships).toHaveLength(2);
});

test("rollback executor stops on stale optimistic versions without accepting a partial acknowledgement", async () => {
  const result = await executePlatformIdentityRollback(
    {
      ok: true,
      actions: [{
        table: "platform_organizations",
        keyColumn: "id",
        key: organizationId,
        action: "archive-created",
        expectedRowVersion: 2,
        patch: { status: "archived", deleted_at: "2026-09-20T20:00:00.000Z" },
      }],
    },
    { config, fetchImpl: async () => jsonResponse([]) }
  );
  expect(result).toMatchObject({ ok: false, actionsApplied: 0 });
});

test("staging drill workflow is manual, staging-bound, confirmed, and cannot target production", () => {
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("environment: platform-staging");
  expect(workflow).toContain("PLATFORM_BACKFILL_TARGET: staging");
  expect(workflow).toContain("APPLY_PLATFORM_IDENTITY_STAGING");
  expect(workflow).toContain("expected_plan_sha256");
  expect(workflow).toContain("expected_user_count");
  expect(workflow).not.toContain("platform-production");
  expect(workflow).not.toContain("inputs.target");
});
