import { expect, test } from "@playwright/test";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentityRollbackPlan,
  createPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  createPlatformIdentityMigrationBundle,
  createPlatformIdentityMigrationSummary,
  createPlatformIdentityRollbackBundle,
  verifyPlatformIdentityMigrationBundle,
} from "../scripts/lib/platform-identity-migration-bundle.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";
const planSha256 = "a".repeat(64);
const projectRef = "staging-project-ref";
const createdAt = "2026-07-23T12:00:00.000Z";

function stagingSnapshot(overrides = {}) {
  return createPlatformIdentitySnapshot({
    target: "staging",
    projectRef,
    planSha256,
    userCount: 1,
    createdAt,
    scope: {
      organizationId,
      teamId,
      userIds: [userId],
      links: [],
    },
    rowsByTable: {
      platform_organizations: [
        {
          id: organizationId,
          slug: "football-science",
          name: "Football Science",
          status: "active",
          row_version: 2,
          metadata: {},
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
          gender: null,
          status: "active",
          row_version: 3,
          metadata: {},
        },
      ],
      platform_user_profiles: [],
      platform_memberships: [],
      platform_tenant_links: [],
      ...(overrides.rowsByTable || {}),
    },
    ...overrides,
  });
}

function backfillBundle(overrides = {}) {
  const snapshot = overrides.snapshot || stagingSnapshot();
  return createPlatformIdentityMigrationBundle({
    target: "staging",
    projectRef,
    actorId,
    requestId: "identity-drill-1",
    createdAt,
    operation: "backfill",
    planSha256,
    snapshot,
    commands: [
      {
        table: "platform_user_profiles",
        action: "create",
        keyColumn: "user_id",
        key: userId,
        expectedRowVersion: null,
        record: {
          user_id: userId,
          primary_organization_id: organizationId,
          primary_club_id: null,
          primary_team_id: teamId,
          display_name: "Private Coach",
          email: "private@example.com",
          status: "active",
          metadata: {
            backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER,
          },
        },
      },
      {
        table: "platform_memberships",
        action: "create",
        keyColumn: "id",
        key: membershipId,
        expectedRowVersion: null,
        record: {
          id: membershipId,
          organization_id: organizationId,
          club_id: null,
          team_id: teamId,
          user_id: userId,
          role: "coach",
          scope: "team",
          status: "active",
          relationship: "staff",
          invited_by: actorId,
          accepted_at: createdAt,
          metadata: {
            backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER,
          },
        },
      },
    ],
    ...overrides,
  });
}

test("Platform Identity migration bundle is deterministic, staging-only, and PII-free in summaries", () => {
  const first = backfillBundle();
  const second = backfillBundle();

  expect(first.ok).toBe(true);
  expect(first).toEqual(second);
  expect(first.executionEnabled).toBe(false);
  expect(first.transactionRequired).toBe(true);
  expect(verifyPlatformIdentityMigrationBundle(first)).toEqual({
    ok: true,
    contentSha256: first.integrity.contentSha256,
  });

  const summary = createPlatformIdentityMigrationSummary(first);
  expect(summary).toMatchObject({
    ok: true,
    target: "staging",
    operation: "backfill",
    commandCount: 2,
    piiExposed: false,
  });
  expect(JSON.stringify(summary)).not.toContain("private@example.com");
  expect(JSON.stringify(summary)).not.toContain("Private Coach");
});

test("Platform Identity migration bundle fails integrity after command tampering", () => {
  const bundle = backfillBundle();
  const tampered = structuredClone(bundle);
  tampered.commands[0].record.display_name = "Changed after review";

  expect(verifyPlatformIdentityMigrationBundle(tampered)).toMatchObject({
    ok: false,
    reason: "Migration bundle content hash does not match.",
  });
});

test("Platform Identity migration bundle blocks production, snapshot drift, and unapproved fields", () => {
  expect(backfillBundle({ target: "production" }).failures).toContain(
    "Platform Identity migration bundles are staging-only."
  );

  const wrongSnapshot = stagingSnapshot({ planSha256: "b".repeat(64) });
  expect(backfillBundle({ snapshot: wrongSnapshot }).failures).toContain(
    "Bundle and snapshot plan hashes must match."
  );

  const command = structuredClone(backfillBundle().commands[0]);
  command.record.created_by = actorId;
  const result = backfillBundle({ commands: [command] });
  expect(result.failures).toContain("Command 1: create record is invalid.");
});

test("Platform Identity migration bundle requires optimistic row versions for every existing row", () => {
  const result = backfillBundle({
    commands: [
      {
        table: "platform_organizations",
        action: "update",
        keyColumn: "id",
        key: organizationId,
        expectedRowVersion: null,
        patch: { name: "Football Science" },
      },
    ],
  });

  expect(result.failures).toContain(
    "Command 1: expected row version is invalid."
  );
});

test("Platform Identity rollback bundle pins the reviewed snapshot and rollback revisions", () => {
  const snapshot = stagingSnapshot();
  const currentRowsByTable = structuredClone(snapshot.tables);
  currentRowsByTable.platform_user_profiles.push({
    user_id: userId,
    primary_organization_id: organizationId,
    primary_club_id: null,
    primary_team_id: teamId,
    display_name: "Private Coach",
    email: "private@example.com",
    status: "active",
    row_version: 1,
    metadata: {
      backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER,
    },
  });
  currentRowsByTable.platform_memberships.push({
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
    metadata: {
      backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER,
    },
  });

  const rollbackPlan = createPlatformIdentityRollbackPlan({
    snapshot,
    currentRowsByTable,
    actorId,
    createdAt,
  });
  const bundle = createPlatformIdentityRollbackBundle({
    snapshot,
    rollbackPlan,
    projectRef,
    actorId,
    requestId: "identity-rollback-1",
    createdAt,
  });

  expect(rollbackPlan.ok).toBe(true);
  expect(bundle.ok).toBe(true);
  expect(bundle.operation).toBe("rollback");
  expect(bundle.commands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        table: "platform_user_profiles",
        action: "archive-created",
        expectedRowVersion: 1,
      }),
      expect.objectContaining({
        table: "platform_memberships",
        action: "archive-created",
        expectedRowVersion: 1,
      }),
    ])
  );
  expect(verifyPlatformIdentityMigrationBundle(bundle).ok).toBe(true);
});
