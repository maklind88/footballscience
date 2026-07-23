#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  evaluateSessionPlannerShadowEvidence,
} = require("../api/_lib/session-planner-shadow-evidence.js");

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseFlagValue(args, index) {
  const equalsIndex = args[index].indexOf("=");
  if (equalsIndex !== -1) return { value: args[index].slice(equalsIndex + 1), consumed: 0 };
  return { value: args[index + 1], consumed: 1 };
}

export function parseSessionPlannerShadowEvidenceArgs(
  argv = process.argv.slice(2),
  env = process.env
) {
  const options = {
    help: false,
    json: false,
    target: normalizeText(env.SESSION_PLANNER_MIGRATION_TARGET || "staging", 40),
    reportsFile: normalizeText(env.SESSION_PLANNER_SHADOW_REPORTS_FILE, 1024),
    expectedProjectRef: normalizeText(env.SESSION_PLANNER_EXPECTED_PROJECT_REF, 80),
    organizationId: normalizeText(env.SESSION_PLANNER_DOMAIN_ORGANIZATION_ID, 120),
    teamId: normalizeText(env.SESSION_PLANNER_DOMAIN_TEAM_ID, 120),
    expectedSourceRevision: Number(env.SESSION_PLANNER_EXPECTED_SOURCE_REVISION) || 0,
    expectedSourceHash: normalizeText(env.SESSION_PLANNER_EXPECTED_SOURCE_HASH, 64),
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
    if (flag === "--target") options.target = normalizeText(value, 40);
    if (flag === "--reports-file") options.reportsFile = normalizeText(value, 1024);
    if (flag === "--expected-project-ref") {
      options.expectedProjectRef = normalizeText(value, 80);
    }
    if (flag === "--organization-id") options.organizationId = normalizeText(value, 120);
    if (flag === "--team-id") options.teamId = normalizeText(value, 120);
    if (flag === "--expected-source-revision") {
      options.expectedSourceRevision = Number(value) || 0;
    }
    if (flag === "--expected-source-hash") {
      options.expectedSourceHash = normalizeText(value, 64);
    }
  }
  return options;
}

function readReportsFile(reportsFile) {
  if (!reportsFile) {
    throw new TypeError("Session Planner shadow evidence requires --reports-file.");
  }
  const absolutePath = path.resolve(reportsFile);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const reports = Array.isArray(parsed) ? parsed : parsed?.reports;
  if (!Array.isArray(reports)) {
    throw new TypeError("Session Planner shadow evidence file must contain a report array.");
  }
  return reports;
}

export function runSessionPlannerShadowEvidence(options = {}, dependencies = {}) {
  const readReports = dependencies.readReports || readReportsFile;
  const reports = readReports(options.reportsFile);
  return evaluateSessionPlannerShadowEvidence(reports, {
    ...options,
    now: dependencies.now,
  });
}

function printHelp() {
  console.log(`Session Planner repeated shadow evidence (local read-only)

Usage:
  npm run session-planner:shadow:evidence -- \\
    --reports-file <content-free-shadow-reports.json> \\
    --target staging \\
    --expected-project-ref <supabase-project-ref> \\
    --organization-id <uuid> \\
    --team-id <uuid> \\
    --expected-source-revision <revision> \\
    --expected-source-hash <sha256> \\
    --json

The command reads a local content-free JSON report file only. Passing evidence
never enables database writes or automatic promotion.
`);
}

function printSummary(report) {
  console.log(
    `Session Planner repeated shadow evidence: ${report.evidencePassed ? "ready for review" : "blocked"}`
  );
  console.log(`- Exact matches: ${report.evidence.validReportCount}/${report.evidence.reportCount}`);
  console.log(`- Observation span: ${report.evidence.observationSpanMs} ms`);
  console.log(`- Reason: ${report.reasonCode}`);
  console.log("- Promotion: blocked");
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseSessionPlannerShadowEvidenceArgs();
  if (options.help) {
    printHelp();
  } else {
    try {
      const report = runSessionPlannerShadowEvidence(options);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else printSummary(report);
      if (!report.evidencePassed) process.exitCode = 1;
    } catch (error) {
      console.error(`Session Planner shadow evidence failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
