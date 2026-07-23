import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_READ_GATEWAY_MODE,
  SESSION_PLANNER_READ_GATEWAY_SCHEMA,
  getSessionPlannerReadGatewayAccess,
  hashText,
  resolveSessionPlannerReadGateway,
} = require("../api/_lib/session-planner-read-gateway.js");
const {
  sealSessionPlannerReadPromotion,
} = require("../api/_lib/session-planner-read-promotion.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-23T12:00:00.000Z");

function sourceState() {
  return {
    selectedDate: "2026-07-22",
    sessions: {
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Training",
        theme: "Pressing",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Possession", minutes: 20 }],
      },
    },
    blockDeletionTombstones: {
      "session-2026-07-21:block-old": "2026-07-22T10:00:00.000Z",
    },
  };
}

function sourceEntry(state = sourceState()) {
  const value = JSON.stringify(state);
  return {
    key: "football-session-planner-v3",
    revision: 301,
    hash: hashText(value),
    value,
  };
}

function actorScope(overrides = {}) {
  return {
    ok: true,
    schema: "footballscience-platform-identity-scope-v1",
    actor: {
      id: actorId,
      status: "active",
    },
    scope: {
      teams: [{
        id: teamId,
        organizationId,
        clubId: "44444444-4444-4444-8444-444444444444",
        status: "active",
      }],
      memberships: [{
        organizationId,
        clubId: "",
        teamId,
        role: "coach",
        scope: "team",
        status: "active",
      }],
    },
    ...overrides,
  };
}

function promotionReceipt(entry = sourceEntry()) {
  return sealSessionPlannerReadPromotion({
    target: "staging",
    projectRef: "stageproject123",
    canonicalProductionProjectRef: "prodproject456",
    scope: { organizationId, teamId },
    source: {
      storageKey: entry.key,
      revision: entry.revision,
      hash: entry.hash,
    },
    evidence: {
      platformIdentity: {
        passed: true,
        rollbackVerified: true,
        distinctUserCount: 2,
      },
      shadow: {
        passed: true,
        reportCount: 3,
        observationSpanMs: 10 * 60 * 1000,
        snapshotContentSha256: "a".repeat(64),
      },
      migrationDrill: {
        passed: true,
        applyVerified: true,
        rollbackVerified: true,
        reapplyVerified: true,
        recoveryPackageVerified: true,
      },
      multiUserCanary: {
        passed: true,
        distinctUserCount: 2,
        immediateReloadVerified: true,
        staleWriteRejected: true,
        cleanupVerified: true,
        recoveryPackageVerified: true,
      },
      compatibility: {
        appStatePrimary: true,
        fallbackEnabled: true,
        snapshotVerified: true,
        restoreVerified: true,
      },
    },
    review: {
      reviewedAt: "2026-07-23T11:30:00.000Z",
      expiresAt: "2026-07-23T15:30:00.000Z",
    },
  }, { now });
}

function gatewayEnv(receipt, overrides = {}) {
  return {
    SESSION_PLANNER_READ_GATEWAY_MODE: "staging-canary",
    SESSION_PLANNER_READ_GATEWAY_SCOPES: `${organizationId}:${teamId}`,
    SESSION_PLANNER_READ_PROMOTION_SHA256: receipt.integrity.contentSha256,
    SESSION_PLANNER_STAGING_PROJECT_REF: "stageproject123",
    SESSION_PLANNER_CANONICAL_PRODUCTION_PROJECT_REF: "prodproject456",
    SUPABASE_PROJECT_REF: "stageproject123",
    SUPABASE_URL: "https://stageproject123.supabase.co",
    ...overrides,
  };
}

function matchingCandidate() {
  const state = sourceState();
  state.selectedDate = "2026-07-21";
  delete state.blockDeletionTombstones;
  return { ok: true, state };
}

test("Session Planner read gateway is disabled by default and never touches the database", async () => {
  const entry = sourceEntry();
  let reads = 0;
  const result = await resolveSessionPlannerReadGateway(
    entry,
    actorScope(),
    { organizationId, teamId },
    {
      env: {},
      now,
      readCandidate: async () => {
        reads += 1;
        return matchingCandidate();
      },
    }
  );

  expect(result).toMatchObject({
    schema: SESSION_PLANNER_READ_GATEWAY_SCHEMA,
    active: false,
    mode: "off",
    status: "fallback",
    userFacingSource: "app-state",
    databaseReadAttempted: false,
    value: entry.value,
  });
  expect(reads).toBe(0);
});

test("Session Planner gateway requires exact staging project separation and tenant allowlist", () => {
  const receipt = promotionReceipt();
  const access = getSessionPlannerReadGatewayAccess(
    { organizationId, teamId },
    gatewayEnv(receipt, {
      SUPABASE_URL: "https://prodproject456.supabase.co",
      SESSION_PLANNER_READ_GATEWAY_SCOPES:
        `${organizationId}:55555555-5555-4555-8555-555555555555`,
    })
  );

  expect(access.enabled).toBe(false);
  expect(access.mode).toBe(SESSION_PLANNER_READ_GATEWAY_MODE);
  expect(access.failureCodes).toEqual(expect.arrayContaining([
    "gateway_scope_not_enabled",
    "gateway_staging_project_mismatch",
  ]));
});

test("Session Planner gateway denies actors without an active membership covering the exact team", async () => {
  const entry = sourceEntry();
  const receipt = promotionReceipt(entry);
  let reads = 0;
  const deniedScope = actorScope();
  deniedScope.scope.memberships[0].teamId =
    "55555555-5555-4555-8555-555555555555";

  const result = await resolveSessionPlannerReadGateway(
    entry,
    deniedScope,
    { organizationId, teamId },
    {
      env: gatewayEnv(receipt),
      promotionReceipt: receipt,
      now,
      readCandidate: async () => {
        reads += 1;
        return matchingCandidate();
      },
    }
  );

  expect(result).toMatchObject({
    active: false,
    reasonCode: "gateway_actor_scope_denied",
    databaseReadAttempted: false,
    value: entry.value,
  });
  expect(reads).toBe(0);
});

test("Session Planner gateway binds promotion to the current app-state revision and hash", async () => {
  const entry = sourceEntry();
  const receipt = promotionReceipt(entry);
  const staleEntry = { ...entry, revision: entry.revision + 1 };
  const result = await resolveSessionPlannerReadGateway(
    staleEntry,
    actorScope(),
    { organizationId, teamId },
    {
      env: gatewayEnv(receipt),
      promotionReceipt: receipt,
      now,
      readCandidate: async () => matchingCandidate(),
    }
  );

  expect(result).toMatchObject({
    active: false,
    reasonCode: "promotion_source_revision_mismatch",
    databaseReadAttempted: false,
    value: entry.value,
  });
});

test("Session Planner gateway preserves exact app-state bytes when checkpoint metadata is invalid", async () => {
  const entry = sourceEntry();
  const receipt = promotionReceipt(entry);
  let reads = 0;
  const result = await resolveSessionPlannerReadGateway(
    { ...entry, hash: "0".repeat(64) },
    actorScope(),
    { organizationId, teamId },
    {
      env: gatewayEnv(receipt),
      promotionReceipt: receipt,
      now,
      readCandidate: async () => {
        reads += 1;
        return matchingCandidate();
      },
    }
  );

  expect(result).toMatchObject({
    active: false,
    reasonCode: "gateway_source_checkpoint_invalid",
    databaseReadAttempted: false,
    value: entry.value,
  });
  expect(result.state).toEqual(sourceState());
  expect(reads).toBe(0);
});

test("Session Planner gateway falls back to the exact app-state bytes on database failure or mismatch", async () => {
  const entry = sourceEntry();
  const receipt = promotionReceipt(entry);
  const options = {
    env: gatewayEnv(receipt),
    promotionReceipt: receipt,
    now,
  };
  const unavailable = await resolveSessionPlannerReadGateway(
    entry,
    actorScope(),
    { organizationId, teamId },
    {
      ...options,
      readCandidate: async () => ({
        ok: false,
        status: 503,
        reason: "private provider detail",
      }),
    }
  );
  const changed = matchingCandidate();
  changed.state.sessions["2026-07-22"].blocks[0].minutes = 25;
  const mismatch = await resolveSessionPlannerReadGateway(
    entry,
    actorScope(),
    { organizationId, teamId },
    {
      ...options,
      readCandidate: async () => changed,
    }
  );

  expect(unavailable).toMatchObject({
    reasonCode: "gateway_database_unavailable",
    fallbackRequired: true,
    value: entry.value,
  });
  expect(mismatch).toMatchObject({
    reasonCode: "gateway_candidate_mismatch",
    fallbackRequired: true,
    value: entry.value,
  });
  expect(JSON.stringify(unavailable)).not.toContain("private provider detail");
});

test("Session Planner gateway selects a verified domain read while preserving compatibility-only state", async () => {
  const original = sourceState();
  const originalBefore = JSON.stringify(original);
  const entry = sourceEntry(original);
  const receipt = promotionReceipt(entry);
  const result = await resolveSessionPlannerReadGateway(
    entry,
    actorScope(),
    { organizationId, teamId },
    {
      env: gatewayEnv(receipt),
      promotionReceipt: receipt,
      now,
      readCandidate: async () => matchingCandidate(),
    }
  );

  expect(result).toMatchObject({
    active: true,
    status: "database-canary",
    reasonCode: "gateway_candidate_verified",
    userFacingSource: "session-planner-domain",
    fallbackRequired: false,
    databaseReadAttempted: true,
    promotionVerified: true,
    comparisonPassed: true,
    evidence: {
      sourceRevision: 301,
      sourceHash: entry.hash,
      sessionCount: 1,
      receiptSha256: receipt.integrity.contentSha256,
      containsCoachingContent: false,
    },
  });
  expect(result.state).toEqual(original);
  expect(JSON.parse(result.value)).toEqual(original);
  expect(JSON.stringify(original)).toBe(originalBefore);
});

test("Session Planner read gateway exports no write, promote, or backfill capability", () => {
  const gateway = require("../api/_lib/session-planner-read-gateway.js");
  expect(gateway.writeSessionPlannerState).toBeUndefined();
  expect(gateway.promoteSessionPlannerDatabase).toBeUndefined();
  expect(gateway.applySessionPlannerBackfill).toBeUndefined();
});

test("Session Planner read gateway remains inert until staging evidence is approved", () => {
  const appStateSource = readFileSync(
    new URL("../api/app-state.js", import.meta.url),
    "utf8"
  );

  expect(appStateSource).not.toContain("session-planner-read-gateway");
});
