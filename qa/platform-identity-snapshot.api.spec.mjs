import { expect, test } from "@playwright/test";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentityRollbackPlan,
  createPlatformIdentityRollbackSummary,
  createPlatformIdentitySnapshot,
  createPlatformIdentitySnapshotSummary,
  verifyPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  buildPlatformIdentitySnapshot,
  collectPlatformIdentitySnapshotRows,
  storePlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot-io.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";
const secondMembershipId = "66666666-6666-4666-8666-666666666666";
const tenantLinkId = "77777777-7777-4777-8777-777777777777";
const createdAt = "2026-07-22T22:00:00.000Z";
const planSha256 = "a".repeat(64);

function baselineTables() {
  return {
    platform_organizations: [
      {
        id: organizationId,
        slug: "football-science",
        name: "Football Science",
        status: "active",
        row_version: 2,
        metadata: { existing: true },
      },
    ],
    platform_clubs: [],
    platform_teams: [
      {
        id: teamId,
        organization_id: organizationId,
        club_id: null,
        slug: "first-team",
        name: "First Team",
        sport: "football",
        age_group: null,
        gender: "women",
        status: "active",
        row_version: 3,
        metadata: { existing: true },
      },
    ],
    platform_user_profiles: [
      {
        user_id: userId,
        primary_organization_id: null,
        primary_club_id: null,
        primary_team_id: null,
        display_name: "Existing User",
        first_name: null,
        last_name: null,
        email: "private@example.com",
        title: null,
        department: null,
        avatar_url: null,
        status: "active",
        row_version: 4,
        metadata: { existing: true },
      },
    ],
    platform_memberships: [],
    platform_tenant_links: [],
  };
}

function snapshot(overrides = {}) {
  return createPlatformIdentitySnapshot({
    target: "staging",
    projectRef: "staging-project",
    planSha256,
    userCount: 1,
    createdAt,
    scope: {
      organizationId,
      teamId,
      userIds: [userId],
      links: [],
    },
    rowsByTable: baselineTables(),
    ...overrides,
  });
}

test("Platform Identity snapshot is canonical, deterministic, and PII-free in summaries", () => {
  const first = snapshot();
  const shuffledTables = baselineTables();
  shuffledTables.platform_organizations = [
    Object.fromEntries(Object.entries(shuffledTables.platform_organizations[0]).reverse()),
  ];
  const second = snapshot({
    rowsByTable: shuffledTables,
    scope: { teamId, organizationId, links: [], userIds: [userId, userId] },
  });

  expect(first.ok).toBe(true);
  expect(verifyPlatformIdentitySnapshot(first)).toEqual({
    ok: true,
    contentSha256: first.integrity.contentSha256,
  });
  expect(second.integrity.contentSha256).toBe(first.integrity.contentSha256);

  const summary = createPlatformIdentitySnapshotSummary(first);
  expect(summary).toMatchObject({
    ok: true,
    target: "staging",
    planSha256,
    userCount: 1,
    piiExposed: false,
  });
  expect(JSON.stringify(summary)).not.toContain("private@example.com");
  expect(JSON.stringify(summary)).not.toContain(userId);
});

test("Platform Identity snapshot fails integrity verification after content tampering", () => {
  const original = snapshot();
  const tampered = structuredClone(original);
  tampered.tables.platform_user_profiles[0].display_name = "Tampered";

  expect(verifyPlatformIdentitySnapshot(tampered)).toMatchObject({
    ok: false,
    reason: "Snapshot content hash does not match.",
  });
});

test("Platform Identity rollback restores baseline rows and archives backfill-owned creations", () => {
  const before = snapshot();
  const current = baselineTables();
  current.platform_user_profiles[0] = {
    ...current.platform_user_profiles[0],
    primary_organization_id: organizationId,
    primary_team_id: teamId,
    display_name: "Updated User",
    email: "updated@example.com",
    row_version: 5,
    metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
  };
  current.platform_memberships.push({
    id: membershipId,
    organization_id: organizationId,
    club_id: null,
    team_id: teamId,
    user_id: userId,
    role: "coach",
    scope: "team",
    status: "active",
    relationship: "staff",
    row_version: 1,
    metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
  });
  current.platform_tenant_links.push({
    id: tenantLinkId,
    organization_id: organizationId,
    club_id: null,
    team_id: teamId,
    module_id: "chat",
    module_table: "chat_teams",
    module_record_id: teamId,
    scope: "team",
    status: "active",
    metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
  });

  const plan = createPlatformIdentityRollbackPlan({
    snapshot: before,
    currentRowsByTable: current,
    actorId,
    createdAt: "2026-07-22T22:30:00.000Z",
  });

  expect(plan.ok).toBe(true);
  expect(plan.blockers).toEqual([]);
  expect(plan.actions.map((action) => `${action.table}:${action.action}`)).toEqual([
    "platform_tenant_links:archive-created",
    "platform_memberships:archive-created",
    "platform_user_profiles:restore-existing",
  ]);
  expect(plan.actions.some((action) => action.action.includes("delete"))).toBe(false);
  expect(plan.actions.find((action) => action.table === "platform_memberships")?.patch).toMatchObject({
    status: "removed",
    deleted_by: actorId,
  });
  expect(plan.actions.find((action) => action.table === "platform_tenant_links")?.patch).toEqual({ status: "archived" });
  expect(plan.actions.find((action) => action.table === "platform_user_profiles")?.patch).toMatchObject({
    primary_organization_id: null,
    primary_team_id: null,
    display_name: "Existing User",
    email: "private@example.com",
    updated_by: actorId,
  });

  const summary = createPlatformIdentityRollbackSummary(plan);
  expect(summary).toMatchObject({ ok: true, actionCount: 3, blockerCount: 0, piiExposed: false });
  expect(JSON.stringify(summary)).not.toContain(userId);
  expect(JSON.stringify(summary)).not.toContain("private@example.com");
});

test("Platform Identity rollback fails closed when tenant scope changes", () => {
  const current = baselineTables();
  current.platform_teams[0] = {
    ...current.platform_teams[0],
    organization_id: "88888888-8888-4888-8888-888888888888",
    row_version: 4,
  };

  const plan = createPlatformIdentityRollbackPlan({ snapshot: snapshot(), currentRowsByTable: current, actorId, createdAt });
  expect(plan.ok).toBe(false);
  expect(plan.blockers).toContain(`platform_teams:${teamId}:tenant-scope-changed`);
});

test("Platform Identity rollback refuses unknown new rows and missing baseline rows", () => {
  const current = baselineTables();
  current.platform_user_profiles = [];
  current.platform_memberships.push({
    id: secondMembershipId,
    organization_id: organizationId,
    club_id: null,
    team_id: teamId,
    user_id: userId,
    role: "coach",
    scope: "team",
    status: "active",
    metadata: { source: "manual" },
  });

  const plan = createPlatformIdentityRollbackPlan({ snapshot: snapshot(), currentRowsByTable: current, actorId, createdAt });
  expect(plan.ok).toBe(false);
  expect(plan.blockers).toEqual(
    expect.arrayContaining([
      `platform_user_profiles:${userId}:baseline-row-missing`,
      `platform_memberships:${secondMembershipId}:new-row-not-owned-by-backfill`,
    ])
  );
});

test("Platform Identity snapshot validation rejects unreviewed or ambiguous inputs", () => {
  expect(createPlatformIdentitySnapshot({ target: "local" }).ok).toBe(false);
  expect(snapshot({ planSha256: "not-a-hash" }).failures).toContain("A reviewed plan SHA-256 is required.");
  expect(snapshot({ userCount: -1 }).failures).toContain("A reviewed non-negative user count is required.");
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createSnapshotFetch({ publicBucket = false, corruptReadback = false } = {}) {
  const calls = [];
  let stored = null;
  const fetchImpl = async (url, request = {}) => {
    const requestUrl = new URL(String(url));
    const method = request.method || "GET";
    calls.push({ url: String(url), method, body: request.body || null });

    if (requestUrl.pathname.startsWith("/rest/v1/")) {
      const table = requestUrl.pathname.split("/").pop();
      return jsonResponse(baselineTables()[table] || []);
    }
    if (requestUrl.pathname.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return jsonResponse({ id: "footballscience-app-state", public: publicBucket });
    }
    if (requestUrl.pathname.includes("/storage/v1/object/footballscience-app-state/") && method === "POST") {
      stored = JSON.parse(request.body);
      return jsonResponse({ Key: requestUrl.pathname }, 200);
    }
    if (requestUrl.pathname.includes("/storage/v1/object/footballscience-app-state/") && method === "GET") {
      const payload = structuredClone(stored);
      if (corruptReadback && payload?.tables?.platform_organizations?.[0]) {
        payload.tables.platform_organizations[0].name = "Corrupted";
      }
      return jsonResponse(payload);
    }
    return jsonResponse({ message: "not found" }, 404);
  };
  return { calls, fetchImpl };
}

test("Platform Identity snapshot collector is scoped and read-only", async () => {
  const harness = createSnapshotFetch();
  const result = await buildPlatformIdentitySnapshot({
    config: { url: "https://project.supabase.co", serviceRoleKey: "secret-test-key" },
    fetchImpl: harness.fetchImpl,
    target: "staging",
    projectRef: "project",
    planSha256,
    userCount: 1,
    createdAt,
    organizationId,
    teamId,
    userIds: [userId],
    links: [{ moduleId: "chat", moduleTable: "chat_teams", moduleRecordId: teamId }],
    scope: { organizationId, teamId, userIds: [userId] },
  });

  expect(result.ok).toBe(true);
  expect(harness.calls).toHaveLength(5);
  expect(harness.calls.every((call) => call.method === "GET")).toBe(true);
  expect(harness.calls.find((call) => call.url.includes("platform_user_profiles"))?.url).toContain("user_id=in.%28");
  expect(harness.calls.find((call) => call.url.includes("platform_tenant_links"))?.url).toContain("module_record_id=eq.");
});

test("Platform Identity snapshot storage requires a private bucket and verifies read-after-write", async () => {
  const safeHarness = createSnapshotFetch();
  const stored = await storePlatformIdentitySnapshot({
    snapshot: snapshot(),
    config: { url: "https://project.supabase.co", serviceRoleKey: "secret-test-key" },
    fetchImpl: safeHarness.fetchImpl,
  });
  expect(stored).toMatchObject({ ok: true, readAfterWriteVerified: true });
  expect(stored.path).toContain("backups/platform-identity/staging/");
  expect(safeHarness.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
  expect(safeHarness.calls.find((call) => call.method === "POST")?.url).toContain("footballscience-app-state/backups/platform-identity/staging/");

  const publicHarness = createSnapshotFetch({ publicBucket: true });
  const rejected = await storePlatformIdentitySnapshot({
    snapshot: snapshot(),
    config: { url: "https://project.supabase.co", serviceRoleKey: "secret-test-key" },
    fetchImpl: publicHarness.fetchImpl,
  });
  expect(rejected).toMatchObject({ ok: false, reason: "Snapshot bucket must exist and remain private." });
  expect(publicHarness.calls.some((call) => call.method === "POST")).toBe(false);
});

test("Platform Identity snapshot storage fails closed on corrupt read-after-write", async () => {
  const harness = createSnapshotFetch({ corruptReadback: true });
  const result = await storePlatformIdentitySnapshot({
    snapshot: snapshot(),
    config: { url: "https://project.supabase.co", serviceRoleKey: "secret-test-key" },
    fetchImpl: harness.fetchImpl,
  });
  expect(result).toMatchObject({
    ok: false,
    reason: "Stored snapshot failed read-after-write integrity verification.",
  });
});

test("Platform Identity snapshot collector refuses oversized operations before network access", async () => {
  const harness = createSnapshotFetch();
  const result = await collectPlatformIdentitySnapshotRows({
    config: { url: "https://project.supabase.co", serviceRoleKey: "secret-test-key" },
    organizationId,
    userIds: Array.from({ length: 4001 }, (_, index) => `user-${index}`),
    fetchImpl: harness.fetchImpl,
  });
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("Snapshot scope exceeds 4000 users; split the operation.");
  expect(harness.calls).toHaveLength(0);
});
