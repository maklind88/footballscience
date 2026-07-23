import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
} from "../scripts/lib/platform-identity-migration-operator.mjs";
import {
  executePlatformIdentityStagingDrillCommand,
  parsePlatformIdentityStagingDrillArgs,
} from "../scripts/platform-identity-staging-drill.mjs";

const stagingProjectRef = "abcdefghijklmnopqrst";
const productionProjectRef = "uvwxyzabcdefghijklmn";
const planSha256 = "a".repeat(64);
const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const createdAt = "2026-07-23T12:00:00.000Z";
const rollbackCreatedAt = "2026-07-23T12:05:00.000Z";
const workflow = fs.readFileSync(
  new URL(
    "../.github/workflows/platform-identity-atomic-staging-drill.yml",
    import.meta.url
  ),
  "utf8"
);

function environment(overrides = {}) {
  return {
    PLATFORM_BACKFILL_TARGET: "staging",
    SUPABASE_URL: `https://${stagingProjectRef}.supabase.co`,
    SUPABASE_PROJECT_REF: stagingProjectRef,
    SUPABASE_SECRET_KEY: "test-service-key",
    CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: productionProjectRef,
    PLATFORM_BACKFILL_ACTOR_ID: actorId,
    PLATFORM_BACKFILL_ORGANIZATION_ID: organizationId,
    PLATFORM_BACKFILL_ORGANIZATION_NAME: "Football Science",
    PLATFORM_BACKFILL_ORGANIZATION_SLUG: "football-science",
    PLATFORM_BACKFILL_TEAM_ID: teamId,
    PLATFORM_BACKFILL_TEAM_NAME: "First Team",
    PLATFORM_BACKFILL_TEAM_SLUG: "first-team",
    PLATFORM_BACKFILL_LINKS: "",
    ...overrides,
  };
}

function authUser(id = userId) {
  return {
    id,
    email: "coach@example.com",
    app_metadata: { role: "coach", status: "active" },
    user_metadata: {
      displayName: "Coach",
      firstName: "Test",
      lastName: "Coach",
    },
  };
}

function snapshot() {
  return createPlatformIdentitySnapshot({
    target: "staging",
    projectRef: stagingProjectRef,
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
          row_version: 1,
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
          deleted_at: null,
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
          row_version: 1,
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
          deleted_at: null,
        },
      ],
      platform_user_profiles: [],
      platform_memberships: [],
      platform_tenant_links: [],
    },
  });
}

function commandOptions(overrides = {}) {
  const stored = snapshot();
  return {
    apply: false,
    confirm: "",
    target: "staging",
    projectRef: stagingProjectRef,
    snapshotPath: "platform-identity/staging/snapshot.json",
    expectedSnapshotSha256: stored.integrity.contentSha256,
    expectedBundleSha256: "",
    expectedPlanSha256: planSha256,
    expectedUserCount: 1,
    requestId: "identity-drill-20260723",
    createdAt,
    rollbackCreatedAt,
    backfill: {
      apply: false,
      actorId,
      organization: {
        id: organizationId,
        name: "Football Science",
        slug: "football-science",
      },
      team: {
        id: teamId,
        name: "First Team",
        slug: "first-team",
      },
      links: [],
      limit: 200,
      maxPages: 20,
    },
    actorId,
    env: environment(),
    config: {
      url: `https://${stagingProjectRef}.supabase.co`,
      serviceRoleKey: "test-service-key",
    },
    ...overrides,
  };
}

function dependencies(options, overrides = {}) {
  const stored = snapshot();
  return {
    loadSnapshot: async () => ({ ok: true, snapshot: stored }),
    listUsers: async () => ({ ok: true, users: [authUser()] }),
    executeBackfill: async () => ({
      ok: true,
      plan: { planSha256, usersPlanned: 1 },
    }),
    ...overrides,
  };
}

test("Platform Identity drill command parses reproducible review and apply guards", () => {
  const options = parsePlatformIdentityStagingDrillArgs(
    [
      "--json",
      "--apply",
      `--confirm=${PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION}`,
      "--snapshot-path=private/snapshot.json",
      `--expected-snapshot-sha256=${"b".repeat(64)}`,
      `--expected-plan-sha256=${planSha256}`,
      "--expected-user-count=1",
      "--expected-bundle-sha256",
      "c".repeat(64),
      "--request-id=identity-drill-20260723",
      `--migration-created-at=${createdAt}`,
      `--rollback-created-at=${rollbackCreatedAt}`,
      `--actor-id=${actorId}`,
      `--organization-id=${organizationId}`,
      "--organization-name=Football Science",
      "--organization-slug=football-science",
      `--team-id=${teamId}`,
      "--team-name=First Team",
      "--team-slug=first-team",
    ],
    environment()
  );

  expect(options).toMatchObject({
    apply: true,
    confirm: PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
    target: "staging",
    projectRef: stagingProjectRef,
    snapshotPath: "private/snapshot.json",
    expectedPlanSha256: planSha256,
    expectedUserCount: 1,
    requestId: "identity-drill-20260723",
    createdAt,
    rollbackCreatedAt,
  });
  expect(options.expectedBundleSha256).toBe("c".repeat(64));
});

test("Platform Identity drill command blocks production before network access", async () => {
  const called = [];
  const options = commandOptions({
    target: "production",
    projectRef: productionProjectRef,
    env: environment({
      PLATFORM_BACKFILL_TARGET: "production",
      SUPABASE_URL: `https://${productionProjectRef}.supabase.co`,
      SUPABASE_PROJECT_REF: productionProjectRef,
    }),
    config: {
      url: `https://${productionProjectRef}.supabase.co`,
      serviceRoleKey: "test-service-key",
    },
  });
  const report = await executePlatformIdentityStagingDrillCommand(options, {
    loadSnapshot: async () => called.push("snapshot"),
  });

  expect(report.ok).toBe(false);
  expect(report.failures).toContain(
    "Platform Identity migration drill is staging-only."
  );
  expect(called).toEqual([]);
});

test("Platform Identity drill command creates a PII-free deterministic dry run", async () => {
  const options = commandOptions();
  let plannedUsers;
  const report = await executePlatformIdentityStagingDrillCommand(
    options,
    dependencies(options, {
      executeBackfill: async (input) => {
        plannedUsers = input.readOnlyAuthUsers;
        return {
          ok: true,
          plan: { planSha256, usersPlanned: 1 },
        };
      },
    })
  );

  expect(report).toMatchObject({
    ok: true,
    dryRun: true,
    applied: false,
    rolledBack: false,
    piiExposed: false,
    bundle: {
      target: "staging",
      operation: "backfill",
      commandCount: 2,
    },
  });
  expect(report.bundle.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(plannedUsers).toEqual([authUser()]);
  expect(JSON.stringify(report)).not.toContain("coach@example.com");
});

test("Platform Identity drill command blocks auth drift after snapshot capture", async () => {
  const options = commandOptions();
  let executed = false;
  const report = await executePlatformIdentityStagingDrillCommand(
    options,
    dependencies(options, {
      listUsers: async () => ({
        ok: true,
        users: [authUser(), authUser("55555555-5555-4555-8555-555555555555")],
      }),
      executeDrill: async () => {
        executed = true;
      },
    })
  );

  expect(report.ok).toBe(false);
  expect(report.failures).toContain("Auth user scope changed after snapshot capture.");
  expect(executed).toBe(false);
});

test("Platform Identity drill command forwards apply only with all reviewed guards", async () => {
  const options = commandOptions({
    apply: true,
    confirm: PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
    expectedBundleSha256: "d".repeat(64),
  });
  let received;
  const report = await executePlatformIdentityStagingDrillCommand(
    options,
    dependencies(options, {
      executeDrill: async (input) => {
        received = input;
        return {
          ok: true,
          dryRun: false,
          applied: true,
          rolledBack: true,
          recoveryRequired: false,
          piiExposed: false,
        };
      },
    })
  );

  expect(report.ok).toBe(true);
  expect(received).toMatchObject({
    apply: true,
    confirm: PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
    expectedBundleSha256: "d".repeat(64),
    projectRef: stagingProjectRef,
  });
  expect(received.entries).toHaveLength(1);
});

test("Platform Identity atomic workflow is manual, staging-only, and fail-closed", () => {
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("environment: platform-staging");
  expect(workflow).toContain("group: platform-identity-write-staging");
  expect(workflow).toContain('[ "$GITHUB_REF" != "refs/heads/main" ]');
  expect(workflow).toContain("DRILL_PLATFORM_IDENTITY_STAGING");
  expect(workflow).toContain("--expected-bundle-sha256");
  expect(workflow).toContain("report.rollbackVerification?.ok !== true");
  expect(workflow).not.toContain("platform-production");
  expect(workflow).not.toContain("production deploy");
});
