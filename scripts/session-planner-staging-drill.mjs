#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  prepareSessionPlannerBackfillReview,
} from "./session-planner-backfill-plan.mjs";
import {
  storeSessionPlannerMigrationSnapshot,
} from "./lib/session-planner-migration-snapshot-storage.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const { readSessionPlannerDomainSnapshot } = require("../api/_lib/session-planner-database.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
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

export const SESSION_PLANNER_STAGING_DRILL_SCHEMA =
  "footballscience-session-planner-staging-drill-v1";
export const STAGING_DRILL_CONFIRMATION = "RUN_SESSION_PLANNER_STAGING_DRILL";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function scopedRequestId(requestId, suffix) {
  const normalizedSuffix = normalizeText(suffix, 40);
  const maxBaseLength = Math.max(1, 180 - normalizedSuffix.length);
  return normalizeText(requestId, maxBaseLength) + normalizedSuffix;
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

function databaseConfig(config = {}) {
  const url = normalizeText(config.url, 500).replace(/\/+$/, "");
  return {
    url: url.endsWith("/rest/v1") ? url : url + "/rest/v1",
    serviceRoleKey: normalizeText(config.serviceRoleKey, 1000),
  };
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: "Bearer " + serviceRoleKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function safeExecutionResult(result = {}) {
  return {
    ok: result.ok === true,
    schema: normalizeText(result.schema, 120) || null,
    operation: normalizeText(result.operation, 40) || null,
    runId: normalizeText(result.runId, 120) || null,
    planSha256: normalizeText(result.planSha256, 64) || null,
    bundleSha256: normalizeText(result.bundleSha256, 64) || null,
    projectRef: normalizeText(result.projectRef, 80) || null,
    appliedSessions: Number(result.appliedSessions) || 0,
    appliedBlocks: Number(result.appliedBlocks) || 0,
    containsCoachingContent: false,
  };
}

async function executeMigrationRpc(bundle, confirmation, options, dependencies) {
  if (dependencies.executeRpc) {
    return dependencies.executeRpc(bundle, confirmation, options);
  }
  const config = dependencies.config || readConfig();
  const response = await (dependencies.fetchImpl || fetch)(
    databaseConfig(config).url + "/rpc/execute_session_planner_migration_bundle",
    {
      method: "POST",
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        p_bundle: bundle,
        p_expected_bundle_sha256: bundle.integrity.contentSha256,
        p_source_organization_id: options.appStateOrganizationId,
        p_confirmation: confirmation,
      }),
    }
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error("Session Planner atomic migration RPC failed.");
  }
  return payload;
}

function timestamp(dependencies, label) {
  const value = dependencies.nextTimestamp
    ? dependencies.nextTimestamp(label)
    : new Date().toISOString();
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error("Session Planner staging drill timestamp is invalid.");
  }
  return new Date(value).toISOString();
}

async function captureSnapshot(options, source, dependencies, label) {
  const config = dependencies.config || readConfig();
  const readTarget = dependencies.readTargetSnapshot || readSessionPlannerDomainSnapshot;
  const rows = await readTarget(
    { organizationId: options.organizationId, teamId: options.teamId },
    {
      allowDisabled: true,
      includeArchived: true,
      config: databaseConfig(config),
      fetchImpl: dependencies.fetchImpl,
      env: dependencies.env || process.env,
    }
  );
  if (!rows?.ok) throw new Error("Session Planner staging snapshot could not be read.");
  const snapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef: options.expectedProjectRef,
    createdAt: timestamp(dependencies, label),
    scope: { organizationId: options.organizationId, teamId: options.teamId },
    sourceRevision: source.revision,
    sourceHash: source.hash,
    rows,
  });
  if (!snapshot.ok) throw new Error("Session Planner staging snapshot is invalid.");
  return snapshot;
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
    generatedAt: timestamp(dependencies, label),
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
    requestId: scopedRequestId(options.requestId, ":backfill-1"),
    createdAt: options.bundleCreatedAt,
  }), "initial backfill");
  const initialSummary = createSessionPlannerMigrationBundleSummary(initialBundle);
  const baseReport = {
    schema: SESSION_PLANNER_STAGING_DRILL_SCHEMA,
    target: "staging",
    projectRef: options.expectedProjectRef,
    mode: options.apply ? "drill" : "dry-run",
    source: {
      revision: prepared.privateSnapshot.source.revision,
      hash: prepared.privateSnapshot.source.hash,
    },
    initialBundle: initialSummary,
    containsCoachingContent: false,
  };
  if (!options.apply) return Object.freeze({ ok: true, ready: true, ...baseReport });
  if (initialBundle.integrity.contentSha256 !== options.expectedInitialBundleSha256) {
    throw new Error("Session Planner initial bundle changed after review.");
  }
  const storeSnapshot = dependencies.storeMigrationSnapshot || storeSessionPlannerMigrationSnapshot;
  const recoverySnapshot = await storeSnapshot({
    snapshot: prepared.privateSnapshot,
    config,
    fetchImpl: dependencies.fetchImpl,
  });
  if (
    recoverySnapshot?.ok !== true ||
    recoverySnapshot.readAfterWriteVerified !== true ||
    recoverySnapshot.contentSha256 !== prepared.privateSnapshot.integrity.contentSha256
  ) {
    throw new Error("Session Planner recovery snapshot was not stored and verified.");
  }
  const recoveryReceipt = Object.freeze({
    schema: SESSION_PLANNER_STAGING_DRILL_SCHEMA,
    stage: "recovery-snapshot-verified",
    target: "staging",
    projectRef: options.expectedProjectRef,
    bucket: recoverySnapshot.bucket || null,
    path: recoverySnapshot.path || null,
    contentSha256: recoverySnapshot.contentSha256,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
  if (dependencies.onCheckpoint) await dependencies.onCheckpoint(recoveryReceipt);

  const firstExecution = await executeMigrationRpc(
    initialBundle,
    "APPLY_SESSION_PLANNER_BACKFILL",
    options,
    dependencies
  );
  const firstAppliedSnapshot = await captureSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
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
    generatedAt: timestamp(dependencies, "rollback-plan"),
  });
  const rollbackBundle = requireBundle(createSessionPlannerRollbackBundle({
    baselineSnapshot: prepared.privateSnapshot,
    currentSnapshot: firstAppliedSnapshot,
    rollbackPlan,
    actorId: options.actorId,
    requestId: scopedRequestId(options.requestId, ":rollback"),
    createdAt: timestamp(dependencies, "rollback-bundle"),
  }), "rollback");
  const rollbackExecution = await executeMigrationRpc(
    rollbackBundle,
    "APPLY_SESSION_PLANNER_ROLLBACK",
    options,
    dependencies
  );
  const rolledBackSnapshot = await captureSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
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
    generatedAt: timestamp(dependencies, "reapply-plan"),
  });
  const reapplyBundle = requireBundle(createSessionPlannerBackfillBundle({
    sourceState: prepared.privateSourceState,
    baselineSnapshot: rolledBackSnapshot,
    backfillPlan: reapplyPlan,
    actorId: options.actorId,
    requestId: scopedRequestId(options.requestId, ":backfill-2"),
    createdAt: timestamp(dependencies, "reapply-bundle"),
  }), "reapply");
  const reapplyExecution = await executeMigrationRpc(
    reapplyBundle,
    "APPLY_SESSION_PLANNER_BACKFILL",
    options,
    dependencies
  );
  const finalSnapshot = await captureSnapshot(
    options,
    prepared.privateSnapshot.source,
    dependencies,
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
    recoverySnapshot: recoveryReceipt,
    firstApply: {
      bundle: initialSummary,
      execution: safeExecutionResult(firstExecution),
      projectionSha256: firstProjection.contentSha256,
    },
    rollback: {
      bundle: createSessionPlannerMigrationBundleSummary(rollbackBundle),
      execution: safeExecutionResult(rollbackExecution),
      projectionSha256: rolledBackProjection.contentSha256,
    },
    reapply: {
      bundle: createSessionPlannerMigrationBundleSummary(reapplyBundle),
      execution: safeExecutionResult(reapplyExecution),
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
