import { expect, test } from "@playwright/test";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  createDeterministicPlatformIdentityMigrationId,
  createPlatformIdentityBackfillCommands,
  createPlatformIdentityBackfillMigrationBundle,
} from "../scripts/lib/platform-identity-migration-plan.mjs";
import { verifyPlatformIdentityMigrationBundle } from "../scripts/lib/platform-identity-migration-bundle.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";
const linkId = "66666666-6666-4666-8666-666666666666";
const moduleRecordId = "77777777-7777-4777-8777-777777777777";
const planSha256 = "a".repeat(64);
const projectRef = "staging-project-ref";
const createdAt = "2026-07-23T12:00:00.000Z";

function entry(overrides = {}) {
  return {
    organization: {
      id: organizationId,
      slug: "football-science",
      name: "Football Science",
      status: "active",
      metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
    },
    team: {
      id: teamId,
      slug: "first-team",
      name: "First Team",
      sport: "football",
      status: "active",
      metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
    },
    user: {
      id: userId,
      email: "coach@example.com",
      displayName: "Coach",
      firstName: "Test",
      lastName: "Coach",
      title: "Coach",
      department: "First Team",
      status: "active",
      metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
    },
    membership: {
      role: "coach",
      scope: "team",
      relationship: "staff",
      metadata: {
        backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER,
        roleSource: "app_metadata",
      },
    },
    links: [],
    ...overrides,
  };
}

function snapshot(rowsByTable = {}) {
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
      ...rowsByTable,
    },
  });
}

function plan(overrides = {}) {
  return createPlatformIdentityBackfillCommands({
    snapshot: overrides.snapshot || snapshot(),
    entries: overrides.entries || [entry()],
    actorId,
    createdAt,
    createId: overrides.createId || (() => membershipId),
  });
}

test("Platform Identity planner creates only missing profile and membership under existing tenant roots", () => {
  const result = plan();

  expect(result.ok).toBe(true);
  expect(result.commands).toEqual([
    expect.objectContaining({
      table: "platform_user_profiles",
      action: "create",
      key: userId,
    }),
    expect.objectContaining({
      table: "platform_memberships",
      action: "create",
      key: membershipId,
      record: expect.objectContaining({
        invited_by: actorId,
        organization_id: organizationId,
        team_id: teamId,
      }),
    }),
  ]);
});

test("Platform Identity planner produces a hash-verified staging bundle", () => {
  const bundle = createPlatformIdentityBackfillMigrationBundle({
    snapshot: snapshot(),
    entries: [entry()],
    actorId,
    projectRef,
    requestId: "identity-plan-1",
    createdAt,
    createId: () => membershipId,
  });

  expect(bundle.ok).toBe(true);
  expect(bundle.commandCount).toBe(2);
  expect(verifyPlatformIdentityMigrationBundle(bundle).ok).toBe(true);
});

test("Platform Identity planner reproduces stable UUIDs and bundle hashes without random state", () => {
  const input = {
    snapshot: snapshot(),
    entries: [entry()],
    actorId,
    projectRef,
    requestId: "identity-plan-stable",
    createdAt,
  };
  const first = createPlatformIdentityBackfillMigrationBundle(input);
  const second = createPlatformIdentityBackfillMigrationBundle(input);

  expect(first).toEqual(second);
  expect(first.integrity.contentSha256).toBe(second.integrity.contentSha256);
  expect(first.commands[1].key).toBe(
    createDeterministicPlatformIdentityMigrationId(
      `${first.snapshotSha256}:platform_memberships:${userId}:coach:team:${organizationId}::${teamId}`
    )
  );
});

test("Platform Identity planner is idempotent after the desired rows exist", () => {
  const rows = {
    platform_user_profiles: [
      {
        user_id: userId,
        primary_organization_id: organizationId,
        primary_club_id: null,
        primary_team_id: teamId,
        display_name: "Coach",
        first_name: "Test",
        last_name: "Coach",
        email: "coach@example.com",
        title: "Coach",
        department: "First Team",
        status: "active",
        row_version: 1,
        metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
      },
    ],
    platform_memberships: [
      {
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
      },
    ],
  };
  const result = plan({ snapshot: snapshot(rows) });

  expect(result).toMatchObject({ ok: true, blockers: [], commands: [] });
});

test("Platform Identity planner fails closed on unowned archived rows and missing revisions", () => {
  const unowned = plan({
    snapshot: snapshot({
      platform_user_profiles: [
        {
          user_id: userId,
          status: "removed",
          deleted_at: createdAt,
          row_version: 2,
          metadata: {},
        },
      ],
    }),
  });
  const missingVersion = plan({
    entries: [
      entry({
        links: [
          {
            moduleId: "session-planner",
            moduleTable: "session_planner_sessions",
            moduleRecordId,
            scope: "team",
            status: "active",
            metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
          },
        ],
      }),
    ],
    snapshot: snapshot({
      platform_tenant_links: [
        {
          id: linkId,
          organization_id: organizationId,
          club_id: null,
          team_id: teamId,
          module_id: "session-planner",
          module_table: "session_planner_sessions",
          module_record_id: moduleRecordId,
          scope: "team",
          status: "archived",
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
        },
      ],
    }),
  });

  expect(unowned.blockers).toContain(
    `platform_user_profiles:${userId}:archived-row-not-owned`
  );
  expect(missingVersion.blockers).toContain(
    `platform_tenant_links:${linkId}:missing-row-version`
  );
});

test("Platform Identity planner blocks mixed tenants and existing links owned by another tenant", () => {
  const mixedTenant = plan({
    entries: [
      entry({
        team: {
          ...entry().team,
          id: "88888888-8888-4888-8888-888888888888",
        },
      }),
    ],
  });
  const linkedElsewhere = plan({
    entries: [
      entry({
        links: [
          {
            moduleId: "session-planner",
            moduleTable: "session_planner_sessions",
            moduleRecordId,
            scope: "team",
            status: "active",
            metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
          },
        ],
      }),
    ],
    snapshot: snapshot({
      platform_tenant_links: [
        {
          id: linkId,
          organization_id: organizationId,
          club_id: null,
          team_id: "88888888-8888-4888-8888-888888888888",
          module_id: "session-planner",
          module_table: "session_planner_sessions",
          module_record_id: moduleRecordId,
          scope: "team",
          status: "active",
          row_version: 1,
          metadata: {},
        },
      ],
    }),
  });

  expect(mixedTenant.blockers).toContain("snapshot-tenant-scope-mismatch");
  expect(linkedElsewhere.blockers).toContain(
    `platform_tenant_links:${linkId}:tenant-scope-mismatch`
  );
});
