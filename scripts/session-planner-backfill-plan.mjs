#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  readSessionPlannerSourceRecord,
  resolveSessionPlannerScope,
} from "./session-planner-domain-dry-run.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const { readSessionPlannerDomainSnapshot } = require("../api/_lib/session-planner-database.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
  createSessionPlannerMigrationSnapshotSummary,
} = require("../api/_lib/session-planner-migration-plan.js");

export const SESSION_PLANNER_BACKFILL_REVIEW_SCHEMA =
  "footballscience-session-planner-backfill-review-v1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const TARGETS = new Set(["staging", "production"]);

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  return { value: args[index + 1], consumed: 1 };
}

export function parseBackfillReviewArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    json: false,
    help: false,
    target: normalizeText(env.SESSION_PLANNER_MIGRATION_TARGET, 40).toLowerCase(),
    expectedProjectRef: normalizeText(env.SESSION_PLANNER_EXPECTED_PROJECT_REF, 80).toLowerCase(),
    organizationId: normalizeText(env.SESSION_PLANNER_DOMAIN_ORGANIZATION_ID, 120).toLowerCase(),
    teamId: normalizeText(env.SESSION_PLANNER_DOMAIN_TEAM_ID, 120).toLowerCase(),
    appStateOrganizationId: normalizeText(env.SESSION_PLANNER_APP_STATE_ORGANIZATION_ID || "global", 120),
    expectedSourceRevision: Number(env.SESSION_PLANNER_EXPECTED_SOURCE_REVISION) || 0,
    expectedSourceHash: normalizeText(env.SESSION_PLANNER_EXPECTED_SOURCE_HASH, 64).toLowerCase(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (flag === "--organization-id") options.organizationId = normalizeText(value, 120).toLowerCase();
    if (flag === "--team-id") options.teamId = normalizeText(value, 120).toLowerCase();
    if (flag === "--app-state-organization-id") options.appStateOrganizationId = normalizeText(value, 120);
    if (flag === "--expected-source-revision") options.expectedSourceRevision = Number(value) || 0;
    if (flag === "--expected-source-hash") options.expectedSourceHash = normalizeText(value, 64).toLowerCase();
  }
  return options;
}

function validateReviewOptions(options = {}) {
  const failures = [];
  if (!TARGETS.has(options.target)) failures.push("target must be staging or production");
  if (!PROJECT_REF_PATTERN.test(options.expectedProjectRef || "")) {
    failures.push("an explicit expected Supabase project ref is required");
  }
  if (!UUID_PATTERN.test(options.organizationId || "")) failures.push("an explicit organization id is required");
  if (!UUID_PATTERN.test(options.teamId || "")) failures.push("an explicit team id is required");
  if (!Number.isInteger(options.expectedSourceRevision) || options.expectedSourceRevision < 1) {
    failures.push("an expected positive source revision is required");
  }
  if (!SHA256_PATTERN.test(options.expectedSourceHash || "")) {
    failures.push("an expected source SHA-256 is required");
  }
  return failures;
}

function databaseConfig(config = {}) {
  const url = normalizeText(config.url, 500).replace(/\/+$/, "");
  return {
    url: url.endsWith("/rest/v1") ? url : `${url}/rest/v1`,
    serviceRoleKey: normalizeText(config.serviceRoleKey, 1000),
  };
}

function resolveDatabaseProjectRef(config = {}) {
  const explicitProjectRef = normalizeText(config.projectRef, 80).toLowerCase();
  if (PROJECT_REF_PATTERN.test(explicitProjectRef)) return explicitProjectRef;
  try {
    const hostname = new URL(normalizeText(config.url, 500)).hostname.toLowerCase();
    if (!hostname.endsWith(".supabase.co")) return "";
    const projectRef = hostname.slice(0, -".supabase.co".length);
    return PROJECT_REF_PATTERN.test(projectRef) ? projectRef : "";
  } catch {
    return "";
  }
}

function calculateSourceHash(sourceRecord = {}) {
  return crypto.createHash("sha256").update(String(sourceRecord.value || ""), "utf8").digest("hex");
}

function createSafePlanSummary(plan = {}) {
  return Object.freeze({
    ok: plan.ok === true,
    schema: plan.schema || null,
    planSha256: plan.planSha256 || null,
    counts: plan.counts || { actions: 0, unchanged: 0, blockers: 0 },
    actions: Array.isArray(plan.actions) ? plan.actions : [],
    blockers: Array.isArray(plan.blockers) ? plan.blockers : [],
    containsCoachingContent: false,
  });
}

export async function prepareSessionPlannerBackfillReview(options = {}, dependencies = {}) {
  const failures = validateReviewOptions(options);
  if (failures.length) throw new TypeError(`Session Planner backfill review blocked: ${failures.join(", ")}.`);

  const config = dependencies.config || readConfig();
  const projectRef = resolveDatabaseProjectRef(config);
  if (!config.url || !config.serviceRoleKey || !projectRef) {
    throw new Error("Session Planner Supabase target configuration is incomplete or unidentifiable.");
  }
  if (projectRef !== options.expectedProjectRef) {
    throw new Error("Session Planner Supabase project ref does not match the reviewed target.");
  }

  const scope = await (dependencies.resolveScope || resolveSessionPlannerScope)(options, dependencies);
  if (scope.organizationId !== options.organizationId || scope.teamId !== options.teamId) {
    throw new Error("Resolved Session Planner scope does not match the explicit review scope.");
  }
  const sourceRecord = await (dependencies.readSourceRecord || readSessionPlannerSourceRecord)(options, dependencies);
  const calculatedSourceHash = calculateSourceHash(sourceRecord);
  const recordedSourceHash = normalizeText(sourceRecord.value_hash, 64).toLowerCase();
  if (Number(sourceRecord.revision) !== options.expectedSourceRevision) {
    throw new Error("Session Planner source revision changed after dry-run review.");
  }
  if (calculatedSourceHash !== options.expectedSourceHash) {
    throw new Error("Session Planner source hash changed after dry-run review.");
  }
  if (recordedSourceHash && recordedSourceHash !== calculatedSourceHash) {
    throw new Error("Session Planner source record hash is inconsistent.");
  }

  let sourceState;
  try {
    sourceState = JSON.parse(String(sourceRecord.value || ""));
  } catch {
    throw new Error("Session Planner source record contains invalid JSON.");
  }

  const readTarget = dependencies.readTargetSnapshot || readSessionPlannerDomainSnapshot;
  const targetRows = await readTarget(
    { organizationId: scope.organizationId, teamId: scope.teamId },
    {
      allowDisabled: true,
      includeArchived: true,
      config: databaseConfig(config),
      fetchImpl: dependencies.fetchImpl,
      env: dependencies.env || process.env,
    }
  );
  if (!targetRows?.ok) {
    throw new Error(`Session Planner target snapshot unavailable: ${normalizeText(targetRows?.code || targetRows?.reason, 160)}.`);
  }

  const generatedAt = (dependencies.now || (() => new Date()))().toISOString();
  const privateSnapshot = createSessionPlannerMigrationSnapshot({
    target: options.target,
    projectRef,
    createdAt: generatedAt,
    scope,
    sourceRevision: Number(sourceRecord.revision),
    sourceHash: calculatedSourceHash,
    rows: targetRows,
  });
  if (!privateSnapshot.ok) {
    throw new Error(`Session Planner migration snapshot failed: ${privateSnapshot.failures.join(", ")}.`);
  }
  const backfillPlan = createSessionPlannerBackfillPlan({
    sourceState,
    baselineSnapshot: privateSnapshot,
    generatedAt,
  });
  const report = Object.freeze({
    schema: SESSION_PLANNER_BACKFILL_REVIEW_SCHEMA,
    mode: "read-only",
    target: options.target,
    projectRef,
    generatedAt,
    writeCapability: false,
    applyEnabled: false,
    source: Object.freeze({
      storageKey: "football-session-planner-v3",
      revision: Number(sourceRecord.revision),
      hash: calculatedSourceHash,
    }),
    scope: Object.freeze({ organizationId: scope.organizationId, teamId: scope.teamId }),
    snapshot: Object.freeze(createSessionPlannerMigrationSnapshotSummary(privateSnapshot)),
    backfill: createSafePlanSummary(backfillPlan),
    readyForApplyReview: backfillPlan.ok === true,
    containsCoachingContent: false,
  });
  return Object.freeze({ privateSnapshot, backfillPlan, report });
}

export async function runSessionPlannerBackfillReview(options = {}, dependencies = {}) {
  const prepared = await prepareSessionPlannerBackfillReview(options, dependencies);
  return prepared.report;
}

function printHelp() {
  console.log(`Session Planner backfill review (database read-only)

Usage:
  npm run session-planner:backfill:plan -- \\
    --target staging \\
    --expected-project-ref <supabase-project-ref> \\
    --organization-id <uuid> \\
    --team-id <uuid> \\
    --expected-source-revision <revision> \\
    --expected-source-hash <sha256> \\
    --json

The command performs GET requests only. It requires the exact source checkpoint from the preceding dry-run and has no database apply mode.
`);
}

function printSummary(report) {
  console.log(`Session Planner backfill review: ${report.readyForApplyReview ? "ready" : "blocked"}`);
  console.log(`- Target: ${report.target}`);
  console.log(`- Supabase project ref: ${report.projectRef}`);
  console.log(`- Source revision: ${report.source.revision}`);
  console.log(`- Existing sessions / blocks: ${report.snapshot.counts.sessions} / ${report.snapshot.counts.blocks}`);
  console.log(`- Planned actions / blockers: ${report.backfill.counts.actions} / ${report.backfill.counts.blockers}`);
  console.log(`- Plan SHA-256: ${report.backfill.planSha256 || "none"}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseBackfillReviewArgs();
  if (options.help) {
    printHelp();
  } else {
    runSessionPlannerBackfillReview(options)
      .then((report) => {
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else printSummary(report);
        if (!report.readyForApplyReview) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(`Session Planner backfill review failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
