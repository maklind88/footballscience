#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  parseBackfillReviewArgs,
  prepareSessionPlannerBackfillReview,
} from "./session-planner-backfill-plan.mjs";

const require = createRequire(import.meta.url);
const {
  compareSessionPlannerStates,
  composeSessionPlannerLegacyState,
} = require("../api/_lib/session-planner-domain-records.js");
const {
  getSessionPlannerDatabaseScopeAccess,
} = require("../api/_lib/session-planner-database.js");

export const SESSION_PLANNER_SHADOW_CHECK_SCHEMA =
  "footballscience-session-planner-shadow-check-v1";

function activeRows(snapshot = {}) {
  const sessions = (snapshot.rows?.sessions || []).filter((row) => !row.archivedAt);
  const sessionIds = new Set(sessions.map((row) => row.id));
  const blocks = (snapshot.rows?.blocks || []).filter(
    (row) => !row.archivedAt && sessionIds.has(row.sessionId)
  );
  return { sessions, blocks };
}

function safeCounts(prepared, rows) {
  const planCounts = prepared.backfillPlan?.counts || {};
  const sourceBlocks = Object.values(prepared.privateSourceState?.sessions || {})
    .reduce(
      (total, session) => total + (Array.isArray(session?.blocks) ? session.blocks.length : 0),
      0
    );
  return Object.freeze({
    sourceSessions: Object.keys(prepared.privateSourceState?.sessions || {}).length,
    sourceBlocks,
    candidateSessions: rows.sessions.length,
    candidateBlocks: rows.blocks.length,
    pendingActions: Number(planCounts.actions) || 0,
    blockers: Number(planCounts.blockers) || 0,
  });
}

export function createSessionPlannerShadowCheckReport(prepared, options = {}) {
  const rows = activeRows(prepared.privateSnapshot);
  const candidateState = composeSessionPlannerLegacyState(rows, {
    organizationId: options.organizationId,
    teamId: options.teamId,
  });
  const comparison = compareSessionPlannerStates(
    prepared.privateSourceState,
    candidateState
  );
  const counts = safeCounts(prepared, rows);
  const backfillConverged =
    prepared.backfillPlan?.ok === true &&
    counts.pendingActions === 0 &&
    counts.blockers === 0;
  const shadowComparisonPassed = comparison.equal && backfillConverged;
  const reasonCode = shadowComparisonPassed
    ? "session_planner_shadow_match"
    : comparison.equal
      ? "session_planner_shadow_backfill_not_converged"
      : "session_planner_shadow_mismatch";

  return Object.freeze({
    ok: shadowComparisonPassed,
    schema: SESSION_PLANNER_SHADOW_CHECK_SCHEMA,
    mode: "shadow-read-only",
    target: prepared.report.target,
    projectRef: prepared.report.projectRef,
    checkedAt: prepared.report.generatedAt,
    scope: Object.freeze({
      organizationId: options.organizationId,
      teamId: options.teamId,
    }),
    source: Object.freeze({ ...prepared.report.source }),
    snapshot: Object.freeze({
      contentSha256: prepared.report.snapshot.contentSha256,
      counts: Object.freeze({ ...prepared.report.snapshot.counts }),
    }),
    counts,
    comparison: Object.freeze({ ...comparison }),
    reasonCode,
    backfillConverged,
    shadowComparisonPassed,
    databaseReadAttempted: true,
    primarySource: "app-state",
    candidateSource: "session-planner-domain",
    userFacingSource: "app-state",
    fallbackRequired: !shadowComparisonPassed,
    promotionBlocked: true,
    writeCapability: false,
    applyEnabled: false,
    containsCoachingContent: false,
  });
}

export async function runSessionPlannerShadowCheck(options = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const access = getSessionPlannerDatabaseScopeAccess(
    { organizationId: options.organizationId, teamId: options.teamId },
    env
  );
  if (!access.enabled) {
    const reason = access.readModeEnabled
      ? "the exact tenant scope is not allowlisted"
      : "shadow mode is not enabled";
    throw new Error(`Session Planner shadow check blocked: ${reason}.`);
  }

  const prepared = await prepareSessionPlannerBackfillReview(options, {
    ...dependencies,
    env,
  });
  return createSessionPlannerShadowCheckReport(prepared, options);
}

function printHelp() {
  console.log(`Session Planner shadow comparison (database read-only)

Required environment:
  SESSION_PLANNER_DATABASE_MODE=shadow
  SESSION_PLANNER_DATABASE_SCOPES=<organization-uuid>:<team-uuid>

Usage:
  npm run session-planner:shadow:check -- \\
    --target staging \\
    --expected-project-ref <supabase-project-ref> \\
    --organization-id <uuid> \\
    --team-id <uuid> \\
    --expected-source-revision <revision> \\
    --expected-source-hash <sha256> \\
    --json

The command performs GET requests only, never changes the user-facing source,
and emits counts and integrity hashes without coaching content.
`);
}

function printSummary(report) {
  console.log(`Session Planner shadow check: ${report.shadowComparisonPassed ? "match" : "blocked"}`);
  console.log(`- Target: ${report.target}`);
  console.log(`- Source revision: ${report.source.revision}`);
  console.log(`- Sessions source / candidate: ${report.counts.sourceSessions} / ${report.counts.candidateSessions}`);
  console.log(`- Blocks source / candidate: ${report.counts.sourceBlocks} / ${report.counts.candidateBlocks}`);
  console.log(`- Pending actions / blockers: ${report.counts.pendingActions} / ${report.counts.blockers}`);
  console.log(`- Reason: ${report.reasonCode}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseBackfillReviewArgs();
  if (options.help) {
    printHelp();
  } else {
    runSessionPlannerShadowCheck(options)
      .then((report) => {
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else printSummary(report);
        if (!report.shadowComparisonPassed) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(`Session Planner shadow check failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
