#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  prepareSessionPlannerBackfillReview,
} from "./session-planner-backfill-plan.mjs";
import {
  storeSessionPlannerMigrationRecoveryPackage,
} from "./lib/session-planner-migration-recovery-storage.mjs";
import {
  captureSessionPlannerOperatorSnapshot,
  createSafeSessionPlannerExecutionResult,
  executeSessionPlannerMigrationRpc,
  sessionPlannerOperatorRequestId,
  sessionPlannerOperatorTimestamp,
} from "./lib/session-planner-migration-operator.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerSnapshotProjectionHash,
} = require("../api/_lib/session-planner-migration-plan.js");
const {
  createSessionPlannerRollbackPlan,
} = require("../api/_lib/session-planner-rollback.js");
const {
  createSessionPlannerBackfillBundle,
  createSessionPlannerMigrationBundleSummary,
  createSessionPlannerRollbackBundle,
  verifySessionPlannerMigrationBundle,
} = require("../api/_lib/session-planner-migration-bundle.js");
const {
  createSessionPlannerMigrationRecoveryPackage,
  createSessionPlannerMigrationRecoverySummary,
} = require("../api/_lib/session-planner-migration-recovery.js");

export const SESSION_PLANNER_STAGING_DRILL_SCHEMA =
  "footballscience-session-planner-staging-drill-v1";
export const STAGING_DRILL_CONFIRMATION = "RUN_SESSION_PLANNER_STAGING_DRILL";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  return { value: args[index + 1], consumed: 1 };
}

export function parseStagingDrillArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    apply: false,
    help: false,
    json: false,
    target: normalizeText(env.SESSION_PLANNER_MIGRATION_TARGET, 40).toLowerCase(),
    expectedProjectRef: normalizeText(env.SESSION_PLANNER_EXPECTED_PROJECT_REF, 80).toLowerCase(),
    canonicalProductionProjectRef: normalizeText(
      env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF,
      80
    ).toLowerCase(),
    organizationId: normalizeText(env.SESSION_PLANNER_DOMAIN_ORGANIZATION_ID, 120).toLowerCase(),
    teamId: normalizeText(env.SESSION_PLANNER_DOMAIN_TEAM_ID, 120).toLowerCase(),
    actorId: normalizeText(env.SESSION_PLANNER_MIGRATION_ACTOR_ID, 120).toLowerCase(),
    appStateOrganizationId: normalizeText(
      env.SESSION_PLANNER_APP_STATE_ORGANIZATION_ID || "global",
      120
    ),
    expectedSourceRevision: Number(env.SESSION_PLANNER_EXPECTED_SOURCE_REVISION) || 0,
    expectedSourceHash: normalizeText(env.SESSION_PLANNER_EXPECTED_SOURCE_HASH, 64).toLowerCase(),
    expectedInitialBundleSha256: normalizeText(
      env.SESSION_PLANNER_EXPECTED_BUNDLE_SHA256,
      64
    ).toLowerCase(),
    bundleCreatedAt: normalizeText(env.SESSION_PLANNER_BUNDLE_CREATED_AT, 80),
    requestId: normalizeText(env.SESSION_PLANNER_MIGRATION_REQUEST_ID, 180),
    confirm: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const flag = arg.split("=", 1)[0];
    const { value, consumed } = parseFlagValue(argv, index);
    index += consumed;
    if (flag === "--target") options.target = normalizeText(value, 40).toLowerCase();
    if (flag === "--expected-project-ref") options.expectedProjectRef = normalizeText(value, 80).toLowerCase();
    if (flag === "--canonical-production-project-ref") {
      options.canonicalProductionProjectRef = normalizeText(value, 80).toLowerCase();
    }
    if (flag === "--organization-id") options.organizationId = normalizeText(value, 120).toLowerCase();
    if (flag === "--team-id") options.teamId = normalizeText(value, 120).toLowerCase();
    if (flag === "--actor-id") options.actorId = normalizeText(value, 120).toLowerCase();
    if (flag === "--app-state-organization-id") options.appStateOrganizationId = normalizeText(value, 120);
    if (flag === "--expected-source-revision") options.expectedSourceRevision = Number(value) || 0;
    if (flag === "--expected-source-hash") options.expectedSourceHash = normalizeText(value, 64).toLowerCase();
    if (flag === "--expected-bundle-sha256") {
      options.expectedInitialBundleSha256 = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--bundle-created-at") options.bundleCreatedAt = normalizeText(value, 80);
    if (flag === "--request-id") options.requestId = normalizeText(value, 180);
    if (flag === "--confirm") options.confirm = normalizeText(value, 80);
  }
  return options;
}

function validateOptions(options = {}) {
  const failures = [];
  if (options.target !== "staging") failures.push("the drill target must be staging");
  if (!PROJECT_REF_PATTERN.test(options.expectedProjectRef || "")) {
    failures.push("an explicit staging project ref is required");
  }
  if (!PROJECT_REF_PATTERN.test(options.canonicalProductionProjectRef || "")) {
    failures.push("the canonical production project ref is required");
  }
  if (options.expectedProjectRef === options.canonicalProductionProjectRef) {
    failures.push("the staging project must differ from canonical production");
  }
  if (!UUID_PATTERN.test(options.organizationId || "")) failures.push("a valid organization is required");
  if (!UUID_PATTERN.test(options.teamId || "")) failures.push("a valid team is required");
  if (!UUID_PATTERN.test(options.actorId || "")) failures.push("a valid audit actor is required");
  if (options.appStateOrganizationId !== "global") {
    failures.push("the source organization must be global");
  }
  if (!Number.isInteger(options.expectedSourceRevision) || options.expectedSourceRevision < 1) {
    failures.push("an exact positive source revision is required");
  }
  if (!SHA256_PATTERN.test(options.expectedSourceHash || "")) {
    failures.push("an exact source SHA-256 is required");
  }
  if (!options.requestId) failures.push("a request id is required");
  if (!options.bundleCreatedAt || Number.isNaN(Date.parse(options.bundleCreatedAt))) {
    failures.push("a deterministic bundle timestamp is required");
  }
  if (options.apply) {
    if (options.confirm !== STAGING_DRILL_CONFIRMATION) failures.push("the staging drill confirmation is invalid");
    if (!SHA256_PATTERN.test(options.expectedInitialBundleSha256 || "")) {
      failures.push("the reviewed initial bundle SHA-256 is required");
    }
  }
  return failures;
}

function requireBundle(bundle, operation) {
  const verification = verifySessionPlannerMigrationBundle(bundle);
  if (!verification.ok) {
    throw new Error("Session Planner " + operation + " bundle verification failed.");
  }
  return bundle;
}

function requireIdempotentProjection(sourceState, snapshot, dependencies, label) {
  const plan = createSessionPlannerBackfillPlan({
    sourceState,
    baselineSnapshot: snapshot,
    generatedAt: sessionPlannerOperatorTimestamp(dependencies, label),
  });
  if (!plan.ok || plan.counts.actions !== 0 || plan.counts.blockers !== 0) {
    throw new Error("Session Planner applied projection does not match the source.");
  }
  return createSessionPlannerSnapshotProjectionHash(snapshot);
}

export async function executeSessionPlannerStagingDrill(options = {}, dependencies = {}) {
  const failures = validateOptions(options);
  if (failures.length) {
    throw new TypeError("Session Planner staging drill blocked: " + failures.join(", ") + ".");
  }
  const config = dependencies.config || readConfig();
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("Session Planner staging Supabase configuration is incomplete.");
  }
  const prepare = dependencies.prepareBackfillReview || prepareSessionPlannerBackfillReview;
  const prepared = await prepare(options, {
    ...dependencies,
    config,
    now: () => new Date(options.bundleCreatedAt),
  });
  const initialBundle = requireBundle(createSessionPlannerBackfillBundle({
    sourceState: prepared.privateSourceState,
    baselineSnapshot: prepared.privateSnapshot,
    backfillPlan: prepared.backfillPlan,
    actorId: options.actorId,
    requestId: sessionPlannerOperatorRequestId(options.requestId, ":backfill-1"),
    createdAt: options.bundleCreatedAt,
  }), "initial backfill");
  const initialSummary = createSessionPlannerMigrationBundleSummary(initialBundle);
  const recoveryPackage = createSessionPlannerMigrationRecoveryPackage({
    baselineSnapshot: prepared.privateSnapshot,
    backfillPlan: prepared.backfillPlan,
    initialBundle,
    createdAt: options.bundleCreatedAt,
  });
  if (!recoveryPackage.ok) throw new Error("Session Planner recovery package is invalid.");
  const baseReport = {
    schema: SESSION_PLANNER_STAGING_DRILL_SCHEMA,
    target: "staging",
    projectRef: options.expectedProjectRef,
    mode: options.apply ? "drill" : "dry-run",
    scope: {
      organizationId: options.organizationId,
      teamId: options.teamId,
    },
    source: {
      revision: prepared.privateSnapshot.source.revision,
      hash: prepared.privateSnapshot.source.hash,
    },
    initialBundle: initialSummary,
    recoveryPackage: createSessionPlannerMigrationRecoverySummary(recoveryPackage),
    containsCoachingContent: false,
  };
  if (!options.apply) return Object.freeze({ ok: true, ready: true, ...baseReport });
  if (initialBundle.integrity.contentSha256 !== options.expectedInitialBundleSha256) {
    throw new Error("Session Planner initial bundle changed after review.");
  }
  const storeRecovery = dependencies.storeMigrationRecovery ||
    storeSessionPlannerMigrationRecoveryPackage;
  const storedRecovery = await storeRecovery({
    recoveryPackage,
    config,
    fetchImpl: dependencies.fetchImpl,
  });
  if (
    storedRecovery?.ok !== true ||
    storedRecovery.readAfterWriteVerified !== true ||
    storedRecovery.contentSha256 !== recoveryPackage.integrity.contentSha256
  ) {
    throw new Error("Session Planner recovery package was not stored and verified.");
  }
  const recoveryReceipt = Object.freeze({
    schema: SESSION_PLANNER_STAGING_DRILL_SCHEMA,
    stage: "recovery-package-verified",
    target: "staging",
    projectRef: options.expectedProjectRef,
    bucket: storedRecovery.bucket || null,
    path: storedRecovery.path || null,
    contentSha256: storedRecovery.contentSha256,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
  if (dependencies.onCheckpoint) await dependencies.onCheckpoint(recoveryReceipt);

  const firstExecution = await executeSessionPlannerMigrationRpc(
    initialBundle,
    "APPLY_SESSION_PLANNER_BACKFILL",
    options,
    dependencies,
    config
  );
  const firstAppliedSnapshot = await captureSessionPlannerOperatorSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
    config,
    "after-backfill"
  );
  const firstProjection = requireIdempotentProjection(
    prepared.privateSourceState,
    firstAppliedSnapshot,
    dependencies,
    "verify-backfill"
  );

  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: prepared.privateSnapshot,
    currentSnapshot: firstAppliedSnapshot,
    backfillPlan: prepared.backfillPlan,
    generatedAt: sessionPlannerOperatorTimestamp(dependencies, "rollback-plan"),
  });
  const rollbackBundle = requireBundle(createSessionPlannerRollbackBundle({
    baselineSnapshot: prepared.privateSnapshot,
    currentSnapshot: firstAppliedSnapshot,
    rollbackPlan,
    actorId: options.actorId,
    requestId: sessionPlannerOperatorRequestId(options.requestId, ":rollback"),
    createdAt: sessionPlannerOperatorTimestamp(dependencies, "rollback-bundle"),
  }), "rollback");
  const rollbackExecution = await executeSessionPlannerMigrationRpc(
    rollbackBundle,
    "APPLY_SESSION_PLANNER_ROLLBACK",
    options,
    dependencies,
    config
  );
  const rolledBackSnapshot = await captureSessionPlannerOperatorSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
    config,
    "after-rollback"
  );
  const baselineProjection = createSessionPlannerSnapshotProjectionHash(prepared.privateSnapshot);
  const rolledBackProjection = createSessionPlannerSnapshotProjectionHash(rolledBackSnapshot);
  if (
    !baselineProjection.ok ||
    !rolledBackProjection.ok ||
    baselineProjection.contentSha256 !== rolledBackProjection.contentSha256
  ) {
    throw new Error("Session Planner rollback did not restore the baseline projection.");
  }

  const reapplyPlan = createSessionPlannerBackfillPlan({
    sourceState: prepared.privateSourceState,
    baselineSnapshot: rolledBackSnapshot,
    generatedAt: sessionPlannerOperatorTimestamp(dependencies, "reapply-plan"),
  });
  const reapplyBundle = requireBundle(createSessionPlannerBackfillBundle({
    sourceState: prepared.privateSourceState,
    baselineSnapshot: rolledBackSnapshot,
    backfillPlan: reapplyPlan,
    actorId: options.actorId,
    requestId: sessionPlannerOperatorRequestId(options.requestId, ":backfill-2"),
    createdAt: sessionPlannerOperatorTimestamp(dependencies, "reapply-bundle"),
  }), "reapply");
  const reapplyExecution = await executeSessionPlannerMigrationRpc(
    reapplyBundle,
    "APPLY_SESSION_PLANNER_BACKFILL",
    options,
    dependencies,
    config
  );
  const finalSnapshot = await captureSessionPlannerOperatorSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
    config,
    "after-reapply"
  );
  const finalProjection = requireIdempotentProjection(
    prepared.privateSourceState,
    finalSnapshot,
    dependencies,
    "verify-reapply"
  );
  if (firstProjection.contentSha256 !== finalProjection.contentSha256) {
    throw new Error("Session Planner reapply projection differs from the first verified apply.");
  }

  return Object.freeze({
    ok: true,
    ready: true,
    ...baseReport,
    recoveryPackageReceipt: recoveryReceipt,
    firstApply: {
      bundle: initialSummary,
      execution: createSafeSessionPlannerExecutionResult(firstExecution),
      projectionSha256: firstProjection.contentSha256,
    },
    rollback: {
      bundle: createSessionPlannerMigrationBundleSummary(rollbackBundle),
      execution: createSafeSessionPlannerExecutionResult(rollbackExecution),
      projectionSha256: rolledBackProjection.contentSha256,
    },
    reapply: {
      bundle: createSessionPlannerMigrationBundleSummary(reapplyBundle),
      execution: createSafeSessionPlannerExecutionResult(reapplyExecution),
      projectionSha256: finalProjection.contentSha256,
    },
    containsCoachingContent: false,
  });
}

function printHelp() {
  console.log("Session Planner staging drill\n\n" +
    "Dry-run is the default. A write drill additionally requires:\n" +
    "  --apply --confirm=" + STAGING_DRILL_CONFIRMATION + " --expected-bundle-sha256 <sha256>\n\n" +
    "The command refuses production, requires a separate canonical production project ref,\n" +
    "and returns content-free summaries only.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseStagingDrillArgs();
  if (options.help) {
    printHelp();
  } else {
    executeSessionPlannerStagingDrill(options, {
      onCheckpoint: (checkpoint) => {
        console.error("Session Planner staging drill checkpoint: " + JSON.stringify(checkpoint));
      },
    })
      .then((report) => console.log(JSON.stringify(report, null, 2)))
      .catch((error) => {
        console.error("Session Planner staging drill failed: " + error.message);
        process.exitCode = 1;
      });
  }
}
