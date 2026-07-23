#!/usr/bin/env node
import {
  lstatSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  assembleSessionPlannerPromotionEvidence,
} = require("../api/_lib/session-planner-promotion-evidence.js");

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXED_SOURCE_PATHS = Object.freeze({
  appStateSource: path.join(REPO_ROOT, "api/app-state.js"),
  gatewaySource: path.join(
    REPO_ROOT,
    "api/_lib/session-planner-read-gateway.js"
  ),
  gatewayContract: path.join(
    REPO_ROOT,
    "qa/session-planner-read-gateway.api.spec.mjs"
  ),
});

function normalizeText(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) {
    return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  }
  return { value: args[index + 1], consumed: 1 };
}

export function parseSessionPlannerPromotionReviewArgs(
  argv = process.argv.slice(2),
  env = process.env
) {
  const options = {
    help: false,
    forbiddenCapability: "",
    target: normalizeText(env.SESSION_PLANNER_PROMOTION_TARGET || "staging", 40),
    projectRef: normalizeText(
      env.SESSION_PLANNER_EXPECTED_PROJECT_REF,
      80
    ).toLowerCase(),
    canonicalProductionProjectRef: normalizeText(
      env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF,
      80
    ).toLowerCase(),
    organizationId: normalizeText(
      env.SESSION_PLANNER_DOMAIN_ORGANIZATION_ID,
      120
    ).toLowerCase(),
    teamId: normalizeText(
      env.SESSION_PLANNER_DOMAIN_TEAM_ID,
      120
    ).toLowerCase(),
    sourceRevision: Number(env.SESSION_PLANNER_EXPECTED_SOURCE_REVISION) || 0,
    sourceHash: normalizeText(
      env.SESSION_PLANNER_EXPECTED_SOURCE_HASH,
      64
    ).toLowerCase(),
    stagingAppOrigin: normalizeText(env.STAGING_APP_ORIGIN, 500),
    canonicalProductionAppOrigin: normalizeText(
      env.CANONICAL_PRODUCTION_APP_ORIGIN,
      500
    ),
    reviewerId: normalizeText(
      env.SESSION_PLANNER_PROMOTION_REVIEWER_ID,
      120
    ).toLowerCase(),
    reviewedAt: normalizeText(
      env.SESSION_PLANNER_PROMOTION_REVIEWED_AT,
      80
    ),
    expiresAt: normalizeText(
      env.SESSION_PLANNER_PROMOTION_EXPIRES_AT,
      80
    ),
    identityReportPath: normalizeText(
      env.PLATFORM_IDENTITY_STAGING_DRILL_REPORT,
      1000
    ),
    shadowReportPath: normalizeText(
      env.SESSION_PLANNER_SHADOW_EVIDENCE_REPORT,
      1000
    ),
    drillReportPath: normalizeText(
      env.SESSION_PLANNER_STAGING_DRILL_REPORT,
      1000
    ),
    canaryReportPath: normalizeText(
      env.SESSION_PLANNER_STAGING_CANARY_REPORT,
      1000
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (["--apply", "--activate", "--write", "--deploy"].includes(arg)) {
      options.forbiddenCapability = arg;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const flag = arg.split("=", 1)[0];
    const { value, consumed } = parseFlagValue(argv, index);
    index += consumed;
    if (flag === "--target") options.target = normalizeText(value, 40).toLowerCase();
    if (flag === "--project-ref") {
      options.projectRef = normalizeText(value, 80).toLowerCase();
    }
    if (flag === "--canonical-production-project-ref") {
      options.canonicalProductionProjectRef =
        normalizeText(value, 80).toLowerCase();
    }
    if (flag === "--organization-id") {
      options.organizationId = normalizeText(value, 120).toLowerCase();
    }
    if (flag === "--team-id") {
      options.teamId = normalizeText(value, 120).toLowerCase();
    }
    if (flag === "--source-revision") {
      options.sourceRevision = Number(value) || 0;
    }
    if (flag === "--source-hash") {
      options.sourceHash = normalizeText(value, 64).toLowerCase();
    }
    if (flag === "--staging-app-origin") {
      options.stagingAppOrigin = normalizeText(value, 500);
    }
    if (flag === "--canonical-production-app-origin") {
      options.canonicalProductionAppOrigin = normalizeText(value, 500);
    }
    if (flag === "--reviewer-id") {
      options.reviewerId = normalizeText(value, 120).toLowerCase();
    }
    if (flag === "--reviewed-at") options.reviewedAt = normalizeText(value, 80);
    if (flag === "--expires-at") options.expiresAt = normalizeText(value, 80);
    if (flag === "--identity-report") {
      options.identityReportPath = normalizeText(value, 1000);
    }
    if (flag === "--shadow-report") {
      options.shadowReportPath = normalizeText(value, 1000);
    }
    if (flag === "--drill-report") {
      options.drillReportPath = normalizeText(value, 1000);
    }
    if (flag === "--canary-report") {
      options.canaryReportPath = normalizeText(value, 1000);
    }
  }
  return options;
}

function readBoundedText(filePath) {
  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_REPORT_BYTES) {
    throw new Error("Session Planner promotion evidence file is not a bounded regular file.");
  }
  return readFileSync(filePath, "utf8");
}

function readJsonReport(filePath) {
  if (!filePath) {
    throw new Error("Session Planner promotion evidence report path is required.");
  }
  const report = JSON.parse(readBoundedText(path.resolve(filePath)));
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Session Planner promotion evidence report must be an object.");
  }
  return report;
}

export function validateSessionPlannerPromotionReviewOptions(options = {}) {
  const failures = [];
  if (options.forbiddenCapability) {
    failures.push("promotion review has no apply, activate, write, or deploy capability");
  }
  for (const [key, value] of Object.entries({
    identityReportPath: options.identityReportPath,
    shadowReportPath: options.shadowReportPath,
    drillReportPath: options.drillReportPath,
    canaryReportPath: options.canaryReportPath,
  })) {
    if (!value) failures.push(`${key} is required`);
  }
  return failures;
}

export async function executeSessionPlannerPromotionReview(
  options = {},
  dependencies = {}
) {
  const failures = validateSessionPlannerPromotionReviewOptions(options);
  if (failures.length) {
    throw new TypeError(
      `Session Planner promotion review blocked: ${failures.join(", ")}.`
    );
  }
  const readJson = dependencies.readJson || readJsonReport;
  const readText = dependencies.readText || readBoundedText;
  const result = assembleSessionPlannerPromotionEvidence({
    expected: {
      target: options.target,
      projectRef: options.projectRef,
      canonicalProductionProjectRef: options.canonicalProductionProjectRef,
      organizationId: options.organizationId,
      teamId: options.teamId,
      sourceRevision: options.sourceRevision,
      sourceHash: options.sourceHash,
      stagingAppOrigin: options.stagingAppOrigin,
      canonicalProductionAppOrigin: options.canonicalProductionAppOrigin,
    },
    review: {
      reviewerId: options.reviewerId,
      reviewedAt: options.reviewedAt,
      expiresAt: options.expiresAt,
    },
    platformIdentityReport: await readJson(options.identityReportPath),
    shadowEvidenceReport: await readJson(options.shadowReportPath),
    migrationDrillReport: await readJson(options.drillReportPath),
    multiUserCanaryReport: await readJson(options.canaryReportPath),
    appStateSource: await readText(FIXED_SOURCE_PATHS.appStateSource),
    gatewaySource: await readText(FIXED_SOURCE_PATHS.gatewaySource),
    gatewayContract: await readText(FIXED_SOURCE_PATHS.gatewayContract),
  }, {
    now: dependencies.now ? dependencies.now() : new Date(),
  });

  return Object.freeze({
    ...result,
    mode: "review-only",
    reportFilesRead: 4,
    fixedCompatibilitySourcesRead: 3,
  });
}

function printHelp() {
  console.log(`Session Planner promotion evidence review

Reads four content-free staging reports, validates their exact project, tenant,
source checkpoint, rollback and multi-user proof, then prints a sealed receipt.
The command has no network, write, activation, feature-flag, or deploy capability.

Required report flags:
  --identity-report <json>
  --shadow-report <json>
  --drill-report <json>
  --canary-report <json>

Required review binding:
  --project-ref <staging-ref>
  --canonical-production-project-ref <production-ref>
  --organization-id <uuid>
  --team-id <uuid>
  --source-revision <integer>
  --source-hash <sha256>
  --staging-app-origin <https-origin>
  --canonical-production-app-origin <https-origin>
  --reviewer-id <uuid>
  --reviewed-at <iso>
  --expires-at <iso>
`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseSessionPlannerPromotionReviewArgs();
  if (options.help) {
    printHelp();
  } else {
    executeSessionPlannerPromotionReview(options)
      .then((report) => console.log(JSON.stringify(report, null, 2)))
      .catch((error) => {
        console.error(
          `Session Planner promotion review failed: ${error.message}`
        );
        if (Array.isArray(error.failureCodes)) {
          console.error(`Failure codes: ${error.failureCodes.join(", ")}`);
        }
        process.exitCode = 1;
      });
  }
}
