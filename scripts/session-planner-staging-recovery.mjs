#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  loadSessionPlannerMigrationRecoveryPackage,
} from "./lib/session-planner-migration-recovery-storage.mjs";
import {
  captureSessionPlannerOperatorSnapshot,
  createSafeSessionPlannerExecutionResult,
  executeSessionPlannerMigrationRpc,
  sessionPlannerOperatorRequestId,
} from "./lib/session-planner-migration-operator.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const {
  createSessionPlannerSnapshotProjectionHash,
} = require("../api/_lib/session-planner-migration-plan.js");
const {
  createSessionPlannerRollbackPlan,
} = require("../api/_lib/session-planner-rollback.js");
const {
  createSessionPlannerMigrationBundleSummary,
  createSessionPlannerRollbackBundle,
  verifySessionPlannerMigrationBundle,
} = require("../api/_lib/session-planner-migration-bundle.js");
const {
  createSessionPlannerMigrationRecoverySummary,
} = require("../api/_lib/session-planner-migration-recovery.js");

export const SESSION_PLANNER_STAGING_RECOVERY_SCHEMA =
  "footballscience-session-planner-staging-recovery-v1";
export const STAGING_RECOVERY_CONFIRMATION =
  "RECOVER_SESSION_PLANNER_STAGING_ROLLBACK";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maxLength = 900) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  return { value: args[index + 1], consumed: 1 };
}

export function parseStagingRecoveryArgs(argv = process.argv.slice(2), env = process.env) {
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
    recoveryPath: normalizeText(env.SESSION_PLANNER_RECOVERY_PATH, 900),
    expectedRecoverySha256: normalizeText(
      env.SESSION_PLANNER_EXPECTED_RECOVERY_SHA256,
      64
    ).toLowerCase(),
    expectedRollbackBundleSha256: normalizeText(
      env.SESSION_PLANNER_EXPECTED_ROLLBACK_BUNDLE_SHA256,
      64
    ).toLowerCase(),
    bundleCreatedAt: normalizeText(env.SESSION_PLANNER_RECOVERY_BUNDLE_CREATED_AT, 80),
    requestId: normalizeText(env.SESSION_PLANNER_MIGRATION_REQUEST_ID, 180),
    confirm: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
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
    if (flag === "--recovery-path") options.recoveryPath = normalizeText(value, 900);
    if (flag === "--expected-recovery-sha256") {
      options.expectedRecoverySha256 = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--expected-rollback-bundle-sha256") {
      options.expectedRollbackBundleSha256 = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--bundle-created-at") options.bundleCreatedAt = normalizeText(value, 80);
    if (flag === "--request-id") options.requestId = normalizeText(value, 180);
    if (flag === "--confirm") options.confirm = normalizeText(value, 80);
  }
  return options;
}

function validateOptions(options = {}) {
  const failures = [];
  if (options.target !== "staging") failures.push("the recovery target must be staging");
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
  if (!options.recoveryPath) failures.push("the private recovery path is required");
  if (!SHA256_PATTERN.test(options.expectedRecoverySha256 || "")) {
    failures.push("the exact recovery package SHA-256 is required");
  }
  if (!options.bundleCreatedAt || Number.isNaN(Date.parse(options.bundleCreatedAt))) {
    failures.push("a deterministic rollback bundle timestamp is required");
  }
  if (!options.requestId) failures.push("a request id is required");
  if (options.apply && options.confirm !== STAGING_RECOVERY_CONFIRMATION) {
    failures.push("the staging recovery confirmation is invalid");
  }
  return failures;
}

function sameScope(options, recoveryPackage) {
  return (
    options.organizationId === recoveryPackage.scope.organizationId &&
    options.teamId === recoveryPackage.scope.teamId
  );
}

function requireRollbackBundle(bundle) {
  const verification = verifySessionPlannerMigrationBundle(bundle);
  if (!verification.ok || bundle.operation !== "rollback") {
    throw new Error("Session Planner recovery rollback bundle is invalid.");
  }
  return bundle;
}

export async function executeSessionPlannerStagingRecovery(options = {}, dependencies = {}) {
  const failures = validateOptions(options);
  if (failures.length) {
    throw new TypeError("Session Planner staging recovery blocked: " + failures.join(", ") + ".");
  }
  const config = dependencies.config || readConfig();
  if (!config.url || !config.serviceRoleKey) {
    throw new Error("Session Planner staging Supabase configuration is incomplete.");
  }
  const loadRecovery = dependencies.loadMigrationRecovery ||
    loadSessionPlannerMigrationRecoveryPackage;
  const loaded = await loadRecovery({
    path: options.recoveryPath,
    expectedContentSha256: options.expectedRecoverySha256,
    expectedProjectRef: options.expectedProjectRef,
    config,
    fetchImpl: dependencies.fetchImpl,
  });
  const recoveryPackage = loaded?.privateRecoveryPackage;
  if (loaded?.ok !== true || !recoveryPackage || !sameScope(options, recoveryPackage)) {
    throw new Error("Session Planner recovery package scope or integrity is invalid.");
  }
  const currentSnapshot = await captureSessionPlannerOperatorSnapshot(
    options,
    recoveryPackage.source,
    dependencies,
    config,
    "recovery-current"
  );
  const baselineProjection = createSessionPlannerSnapshotProjectionHash(
    recoveryPackage.baselineSnapshot
  );
  const currentProjection = createSessionPlannerSnapshotProjectionHash(currentSnapshot);
  const baseReport = {
    schema: SESSION_PLANNER_STAGING_RECOVERY_SCHEMA,
    target: "staging",
    projectRef: options.expectedProjectRef,
    mode: options.apply ? "recovery" : "dry-run",
    recoveryPackage: createSessionPlannerMigrationRecoverySummary(recoveryPackage),
    recoveryReceipt: loaded.receipt || null,
    baselineProjectionSha256: baselineProjection.contentSha256 || null,
    currentProjectionSha256: currentProjection.contentSha256 || null,
    containsCoachingContent: false,
  };
  if (
    baselineProjection.ok &&
    currentProjection.ok &&
    baselineProjection.contentSha256 === currentProjection.contentSha256
  ) {
    return Object.freeze({
      ok: true,
      ready: true,
      alreadyRestored: true,
      wroteData: false,
      ...baseReport,
    });
  }

  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: recoveryPackage.baselineSnapshot,
    currentSnapshot,
    backfillPlan: recoveryPackage.backfillPlan,
    generatedAt: options.bundleCreatedAt,
  });
  const rollbackBundle = requireRollbackBundle(createSessionPlannerRollbackBundle({
    baselineSnapshot: recoveryPackage.baselineSnapshot,
    currentSnapshot,
    rollbackPlan,
    actorId: options.actorId,
    requestId: sessionPlannerOperatorRequestId(options.requestId, ":recovery"),
    createdAt: options.bundleCreatedAt,
  }));
  const rollbackSummary = createSessionPlannerMigrationBundleSummary(rollbackBundle);
  if (!options.apply) {
    return Object.freeze({
      ok: true,
      ready: true,
      alreadyRestored: false,
      wroteData: false,
      ...baseReport,
      rollbackBundle: rollbackSummary,
    });
  }
  if (
    !SHA256_PATTERN.test(options.expectedRollbackBundleSha256 || "") ||
    options.expectedRollbackBundleSha256 !== rollbackBundle.integrity.contentSha256
  ) {
    throw new Error("Session Planner recovery rollback bundle changed after review.");
  }
  const checkpoint = Object.freeze({
    schema: SESSION_PLANNER_STAGING_RECOVERY_SCHEMA,
    stage: "rollback-bundle-verified",
    projectRef: options.expectedProjectRef,
    recoveryPackageSha256: options.expectedRecoverySha256,
    rollbackBundleSha256: rollbackBundle.integrity.contentSha256,
    containsCoachingContent: false,
  });
  if (dependencies.onCheckpoint) await dependencies.onCheckpoint(checkpoint);
  const execution = await executeSessionPlannerMigrationRpc(
    rollbackBundle,
    "APPLY_SESSION_PLANNER_ROLLBACK",
    options,
    dependencies,
    config
  );
  const restoredSnapshot = await captureSessionPlannerOperatorSnapshot(
    options,
    recoveryPackage.source,
    dependencies,
    config,
    "recovery-restored"
  );
  const restoredProjection = createSessionPlannerSnapshotProjectionHash(restoredSnapshot);
  if (
    !restoredProjection.ok ||
    restoredProjection.contentSha256 !== baselineProjection.contentSha256
  ) {
    throw new Error("Session Planner staging recovery did not restore the baseline projection.");
  }
  return Object.freeze({
    ok: true,
    ready: true,
    alreadyRestored: false,
    wroteData: true,
    ...baseReport,
    rollbackBundle: rollbackSummary,
    execution: createSafeSessionPlannerExecutionResult(execution),
    restoredProjectionSha256: restoredProjection.contentSha256,
  });
}

function printHelp() {
  console.log("Session Planner staging recovery\n\n" +
    "Dry-run is the default. Apply additionally requires:\n" +
    "  --apply --confirm=" + STAGING_RECOVERY_CONFIRMATION +
    " --expected-rollback-bundle-sha256 <sha256>\n\n" +
    "Recovery refuses production and only accepts the exact private package path and hash.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseStagingRecoveryArgs();
  if (options.help) {
    printHelp();
  } else {
    executeSessionPlannerStagingRecovery(options, {
      onCheckpoint: (value) => console.error(
        "Session Planner staging recovery checkpoint: " + JSON.stringify(value)
      ),
    })
      .then((report) => console.log(JSON.stringify(report, null, 2)))
      .catch((error) => {
        console.error("Session Planner staging recovery failed: " + error.message);
        process.exitCode = 1;
      });
  }
}
