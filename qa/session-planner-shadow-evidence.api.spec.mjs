import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  runSessionPlannerShadowEvidence,
} from "../scripts/session-planner-shadow-evidence.mjs";

const require = createRequire(import.meta.url);
const {
  evaluateSessionPlannerShadowEvidence,
} = require("../api/_lib/session-planner-shadow-evidence.js");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evaluatorSource = fs.readFileSync(
  path.join(rootDir, "api/_lib/session-planner-shadow-evidence.js"),
  "utf8"
);
const commandSource = fs.readFileSync(
  path.join(rootDir, "scripts/session-planner-shadow-evidence.mjs"),
  "utf8"
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8")
);
const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const projectRef = "staging-project";
const sourceHash = crypto.createHash("sha256").update("source").digest("hex");
const snapshotHash = crypto.createHash("sha256").update("snapshot").digest("hex");
const comparisonHash = crypto.createHash("sha256").update("comparison").digest("hex");
const now = "2026-07-23T12:00:00.000Z";

function options(overrides = {}) {
  return {
    target: "staging",
    expectedProjectRef: projectRef,
    organizationId,
    teamId,
    expectedSourceRevision: 42,
    expectedSourceHash: sourceHash,
    now: () => new Date(now),
    ...overrides,
  };
}

function report(checkedAt, overrides = {}) {
  const value = {
    ok: true,
    schema: "footballscience-session-planner-shadow-check-v1",
    mode: "shadow-read-only",
    target: "staging",
    projectRef,
    checkedAt,
    scope: { organizationId, teamId },
    source: { revision: 42, hash: sourceHash },
    snapshot: { contentSha256: snapshotHash, counts: { sessions: 1, blocks: 1 } },
    counts: {
      sourceSessions: 1,
      sourceBlocks: 1,
      candidateSessions: 1,
      candidateBlocks: 1,
      pendingActions: 0,
      blockers: 0,
    },
    comparison: {
      equal: true,
      leftHash: comparisonHash,
      rightHash: comparisonHash,
      sessionCount: 1,
    },
    reasonCode: "session_planner_shadow_match",
    backfillConverged: true,
    shadowComparisonPassed: true,
    databaseReadAttempted: true,
    primarySource: "app-state",
    candidateSource: "session-planner-domain",
    userFacingSource: "app-state",
    fallbackRequired: false,
    promotionBlocked: true,
    writeCapability: false,
    applyEnabled: false,
    containsCoachingContent: false,
  };
  return { ...value, ...overrides };
}

function validReports() {
  return [
    report("2026-07-23T11:45:00.000Z"),
    report("2026-07-23T11:50:00.000Z"),
    report("2026-07-23T11:55:00.000Z"),
  ];
}

test("repeated Session Planner shadow evidence proves exact matches but never promotes", () => {
  const result = evaluateSessionPlannerShadowEvidence(validReports(), options());

  expect(result).toMatchObject({
    ok: true,
    schema: "footballscience-session-planner-shadow-evidence-v1",
    target: "staging",
    projectRef,
    source: { revision: 42, hash: sourceHash },
    evidence: {
      reportCount: 3,
      validReportCount: 3,
      distinctReportCount: 3,
      observationSpanMs: 10 * 60 * 1000,
      snapshotContentSha256: snapshotHash,
    },
    evidencePassed: true,
    readyForManualReview: true,
    reasonCode: "session_planner_shadow_evidence_ready",
    failureCodes: [],
    promotionBlocked: true,
    automaticPromotion: false,
    writeCapability: false,
    containsCoachingContent: false,
  });
  expect(result.remainingRequirements).toContain("authenticated_multi_user_canary");
});

test("shadow evidence cannot weaken the minimum count or observation span", () => {
  const result = evaluateSessionPlannerShadowEvidence(
    validReports().slice(0, 2),
    options({ minimumReports: 2, minimumSpanMs: 60 * 1000 })
  );

  expect(result.evidencePassed).toBe(false);
  expect(result.promotionBlocked).toBe(true);
  expect(result.failureCodes).toEqual(expect.arrayContaining([
    "insufficient_reports",
    "minimum_reports_policy_weakened",
    "minimum_span_policy_weakened",
  ]));
});

test("shadow evidence rejects duplicate, stale, future, and drifting observations", () => {
  const reports = validReports();
  reports[1] = report("2026-07-23T11:45:00.000Z");
  reports[2] = report("2026-07-23T12:05:00.000Z", {
    snapshot: {
      contentSha256: crypto.createHash("sha256").update("drift").digest("hex"),
    },
  });
  reports.push(report("2026-07-23T08:00:00.000Z"));
  const result = evaluateSessionPlannerShadowEvidence(reports, options());

  expect(result.evidencePassed).toBe(false);
  expect(result.failureCodes).toEqual(expect.arrayContaining([
    "duplicate_report_timestamp",
    "report_timestamp_future",
    "report_timestamp_stale",
    "snapshot_hash_drift",
  ]));
});

test("shadow evidence rejects tenant, source, project, and safety mismatches", () => {
  const reports = validReports();
  reports[0] = report(reports[0].checkedAt, {
    mode: "database-primary",
    projectRef: "other-staging",
    scope: { organizationId, teamId: "33333333-3333-4333-8333-333333333333" },
    source: { revision: 41, hash: "f".repeat(64) },
    promotionBlocked: false,
    writeCapability: true,
  });
  const result = evaluateSessionPlannerShadowEvidence(reports, options());

  expect(result.evidencePassed).toBe(false);
  expect(result.readyForManualReview).toBe(false);
  expect(result.failureCodes).toEqual(expect.arrayContaining([
    "report_mode_invalid",
    "report_project_ref_mismatch",
    "report_team_mismatch",
    "report_source_revision_mismatch",
    "report_source_hash_mismatch",
    "report_safety_flags_invalid",
  ]));
});

test("shadow evidence rejects non-converged counts and comparison hashes", () => {
  const reports = validReports();
  reports[2] = report(reports[2].checkedAt, {
    counts: {
      sourceSessions: 1,
      sourceBlocks: 1,
      candidateSessions: 0,
      candidateBlocks: 0,
      pendingActions: 1,
      blockers: 0,
    },
    comparison: {
      equal: true,
      leftHash: comparisonHash,
      rightHash: "e".repeat(64),
      sessionCount: 1,
    },
  });
  const result = evaluateSessionPlannerShadowEvidence(reports, options());

  expect(result.failureCodes).toEqual(expect.arrayContaining([
    "report_counts_not_converged",
    "report_comparison_invalid",
  ]));
  expect(result.promotionBlocked).toBe(true);
});

test("shadow evidence command consumes local reports without network or write capability", () => {
  let reads = 0;
  const result = runSessionPlannerShadowEvidence(
    { ...options(), reportsFile: "/private/content-free-reports.json" },
    {
      now: () => new Date(now),
      readReports: (reportsFile) => {
        reads += 1;
        expect(reportsFile).toBe("/private/content-free-reports.json");
        return validReports();
      },
    }
  );

  expect(reads).toBe(1);
  expect(result.evidencePassed).toBe(true);
  expect(`${evaluatorSource}\n${commandSource}`).not.toMatch(
    /\b(?:fetch|https?\.request|POST|PUT|PATCH|DELETE)\b/
  );
  expect(commandSource).not.toContain("--apply");
  expect(commandSource).not.toContain("SESSION_PLANNER_DATABASE_MODE");
  expect(packageJson.scripts["session-planner:shadow:evidence"]).toBe(
    "node scripts/session-planner-shadow-evidence.mjs"
  );
  expect(packageJson.scripts["qa:supabase"]).toContain(
    "node --check api/_lib/session-planner-shadow-evidence.js"
  );
  expect(packageJson.scripts["qa:supabase"]).toContain(
    "node --check scripts/session-planner-shadow-evidence.mjs"
  );
});

test("shadow evidence rejects an invalid evaluation clock", () => {
  expect(() => evaluateSessionPlannerShadowEvidence(
    validReports(),
    options({ now: () => new Date("invalid") })
  )).toThrow("requires a valid evaluation time");
});
