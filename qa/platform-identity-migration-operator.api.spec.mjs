import { expect, test } from "@playwright/test";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import { createPlatformIdentityBackfillMigrationBundle } from "../scripts/lib/platform-identity-migration-plan.mjs";
import {
  PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
  executePlatformIdentityStagingDrill,
  readPlatformIdentityMigrationAudit,
} from "../scripts/lib/platform-identity-migration-operator.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const planSha256 = "a".repeat(64);
const projectRef = "staging-project-ref";
const createdAt = "2026-07-23T12:00:00.000Z";
const rollbackCreatedAt = "2026-07-23T12:05:00.000Z";

function entry() {
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
      metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
    },
    links: [],
  };
}

function snapshot() {
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
    },
  });
}

function options(overrides = {}) {
  const baseline = snapshot();
  const entries = [entry()];
  const bundle = createPlatformIdentityBackfillMigrationBundle({
    snapshot: baseline,
    entries,
    actorId,
    projectRef,
    requestId: "identity-drill-1",
    createdAt,
  });
  return {
    target: "staging",
    projectRef,
    config: {
      url: "https://staging-project-ref.supabase.co",
      serviceRoleKey: "test-service-key",
    },
    snapshot: baseline,
    entries,
    actorId,
    requestId: "identity-drill-1",
    createdAt,
    rollbackCreatedAt,
    apply: true,
    confirm: PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
    expectedBundleSha256: bundle.integrity.contentSha256,
    ...overrides,
  };
}

function appliedAndRestoredRows(drillOptions, mutateApplied) {
  const bundle = createPlatformIdentityBackfillMigrationBundle({
    snapshot: drillOptions.snapshot,
    entries: drillOptions.entries,
    actorId,
    projectRef,
    requestId: drillOptions.requestId,
    createdAt,
  });
  const profile = structuredClone(
    bundle.commands.find(
      (command) => command.table === "platform_user_profiles"
    ).record
  );
  const membership = structuredClone(
    bundle.commands.find(
      (command) => command.table === "platform_memberships"
    ).record
  );
  profile.row_version = 1;
  membership.row_version = 1;
  const applied = {
    ...structuredClone(drillOptions.snapshot.tables),
    platform_user_profiles: [profile],
    platform_memberships: [membership],
  };
  mutateApplied?.(applied);
  const restored = structuredClone(applied);
  restored.platform_user_profiles[0] = {
    ...profile,
    status: "removed",
    deleted_by: actorId,
    deleted_at: rollbackCreatedAt,
    delete_reason: "Rollback of Platform Identity backfill.",
    row_version: 2,
  };
  restored.platform_memberships[0] = {
    ...membership,
    status: "removed",
    deleted_by: actorId,
    deleted_at: rollbackCreatedAt,
    delete_reason: "Rollback of Platform Identity backfill.",
    row_version: 2,
  };
  return { bundle, applied, restored };
}

function successfulDependencies(drillOptions, mutateApplied) {
  const { bundle, applied, restored } = appliedAndRestoredRows(
    drillOptions,
    mutateApplied
  );
  const calls = [];
  let collectCount = 0;
  return {
    bundle,
    calls,
    dependencies: {
      executeRpc: async (migrationBundle, confirmation) => {
        calls.push({ operation: migrationBundle.operation, confirmation });
        return {
          ok: true,
          receipt: {
            ok: true,
            schema:
              "footballscience-platform-identity-migration-execution-v1",
            operation: migrationBundle.operation,
            runId: `${migrationBundle.operation}-run`,
            bundleSha256: migrationBundle.integrity.contentSha256,
            appliedCount: migrationBundle.commandCount,
            piiExposed: false,
          },
        };
      },
      collectRows: async () => ({
        ok: true,
        rowsByTable: collectCount++ === 0 ? applied : restored,
      }),
      readAudit: async () => ({ ok: true, eventCount: 2 }),
    },
  };
}

test("Platform Identity staging drill is read-only by default and exposes no PII", async () => {
  const drillOptions = options({ apply: false, confirm: "" });
  let executed = false;
  const report = await executePlatformIdentityStagingDrill(drillOptions, {
    executeRpc: async () => {
      executed = true;
      return { ok: false };
    },
  });

  expect(report).toMatchObject({
    ok: true,
    dryRun: true,
    applied: false,
    rolledBack: false,
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    piiExposed: false,
  });
  expect(executed).toBe(false);
  expect(JSON.stringify(report)).not.toContain("coach@example.com");
});

test("Platform Identity staging drill applies, verifies, audits, rolls back, and verifies baseline", async () => {
  const drillOptions = options();
  const harness = successfulDependencies(drillOptions);
  const report = await executePlatformIdentityStagingDrill(
    drillOptions,
    harness.dependencies
  );

  expect(report).toMatchObject({
    ok: true,
    dryRun: false,
    applied: true,
    rolledBack: true,
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    recoveryRequired: false,
    audit: { backfillEvents: 2, rollbackEvents: 2 },
    rollbackVerification: { ok: true, blockers: [] },
    piiExposed: false,
  });
  expect(harness.calls).toEqual([
    {
      operation: "backfill",
      confirmation: "APPLY_PLATFORM_IDENTITY_BACKFILL",
    },
    {
      operation: "rollback",
      confirmation: "APPLY_PLATFORM_IDENTITY_ROLLBACK",
    },
  ]);
});

test("Platform Identity staging drill blocks stale reviewed hashes before RPC", async () => {
  const drillOptions = options({ expectedBundleSha256: "b".repeat(64) });
  let executed = false;
  const report = await executePlatformIdentityStagingDrill(drillOptions, {
    executeRpc: async () => {
      executed = true;
      return { ok: true };
    },
  });

  expect(report).toMatchObject({
    ok: false,
    applied: false,
    rolledBack: false,
    failures: ["reviewed bundle SHA-256 changed"],
  });
  expect(executed).toBe(false);
});

test("Platform Identity staging drill still rolls back when post-apply verification detects drift", async () => {
  const drillOptions = options();
  const harness = successfulDependencies(drillOptions, (applied) => {
    applied.platform_user_profiles[0].display_name = "Unexpected";
  });
  const report = await executePlatformIdentityStagingDrill(
    drillOptions,
    harness.dependencies
  );

  expect(report).toMatchObject({
    ok: false,
    applied: true,
    rolledBack: true,
    recoveryRequired: true,
  });
  expect(report.failures).toContain("post-apply state is not idempotent");
  expect(harness.calls.map((call) => call.operation)).toEqual([
    "backfill",
    "rollback",
  ]);
});

test("Platform Identity staging drill reports recovery-required if rollback fails", async () => {
  const drillOptions = options();
  const harness = successfulDependencies(drillOptions);
  harness.dependencies.executeRpc = async (bundle) =>
    bundle.operation === "backfill"
      ? {
          ok: true,
          receipt: {
            runId: "backfill-run",
            appliedCount: bundle.commandCount,
          },
        }
      : { ok: false, reason: "rollback unavailable" };
  const report = await executePlatformIdentityStagingDrill(
    drillOptions,
    harness.dependencies
  );

  expect(report).toMatchObject({
    ok: false,
    applied: true,
    rolledBack: false,
    recoveryRequired: true,
    failures: ["rollback unavailable"],
  });
});

test("Platform Identity audit reads are scoped by run and organization", async () => {
  let requestUrl = "";
  const report = await readPlatformIdentityMigrationAudit(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationId,
    {
      config: {
        url: "https://staging-project.supabase.co",
        serviceRoleKey: "test-service-key",
      },
      fetchImpl: async (url) => {
        requestUrl = url;
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) =>
              name.toLowerCase() === "content-range" ? "0-0/4" : null,
          },
          text: async () => '[{"id":"event-1"}]',
        };
      },
    }
  );

  const parsed = new URL(requestUrl);
  expect(report).toEqual({ ok: true, eventCount: 4 });
  expect(parsed.searchParams.get("run_id")).toBe(
    "eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  );
  expect(parsed.searchParams.get("organization_id")).toBe(
    `eq.${organizationId}`
  );
  expect(parsed.searchParams.get("limit")).toBe("1");
});
