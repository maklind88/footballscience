const {
  getSessionPlannerDatabaseMode,
  getSessionPlannerDatabaseScopeAccess,
  readSessionPlannerLegacyState,
} = require("./session-planner-database.js");
const { compareSessionPlannerStates } = require("./session-planner-domain-records.js");

const SESSION_PLANNER_SHADOW_SCHEMA = "footballscience-session-planner-shadow-comparison-v1";

function countBlocks(state = {}) {
  return Object.values(state.sessions || {}).reduce(
    (total, session) => total + (Array.isArray(session?.blocks) ? session.blocks.length : 0),
    0
  );
}

function createBaseResult(scope, mode, now) {
  return {
    schema: SESSION_PLANNER_SHADOW_SCHEMA,
    checkedAt: now().toISOString(),
    mode,
    organizationId: String(scope.organizationId || "").trim().toLowerCase(),
    teamId: String(scope.teamId || "").trim().toLowerCase(),
    primarySource: "app-state",
    candidateSource: "session-planner-domain",
    userFacingSource: "app-state",
    databaseReadAttempted: false,
    fallbackRequired: false,
    comparisonPassed: false,
    promotionBlocked: true,
  };
}

function normalizeFailureCode(result = {}) {
  if (result.code) return String(result.code).slice(0, 120);
  const status = Number(result.status) || 0;
  if (status === 401 || status === 403) return "session_planner_database_forbidden";
  if (status === 404) return "session_planner_database_missing";
  if (status === 409) return "session_planner_database_integrity_failed";
  if (status >= 500) return "session_planner_database_unavailable";
  return "session_planner_database_read_failed";
}

async function runSessionPlannerShadowComparison(sourceState, scope = {}, options = {}) {
  const env = options.env || process.env;
  const mode = getSessionPlannerDatabaseMode(env);
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const base = createBaseResult(scope, mode, now);
  const access = getSessionPlannerDatabaseScopeAccess(scope, env);

  if (mode !== "shadow") {
    return Object.freeze({
      ...base,
      ok: true,
      status: "skipped",
      reasonCode: "session_planner_shadow_mode_not_enabled",
    });
  }
  if (!access.enabled) {
    return Object.freeze({
      ...base,
      ok: true,
      status: "skipped",
      reasonCode: "session_planner_shadow_scope_not_enabled",
    });
  }

  const readCandidate = options.readCandidate || readSessionPlannerLegacyState;
  let candidate;
  try {
    candidate = await readCandidate(scope, { ...options, env });
  } catch {
    candidate = { ok: false, status: 503, code: "session_planner_database_read_failed" };
  }
  if (!candidate?.ok) {
    return Object.freeze({
      ...base,
      ok: false,
      status: "unavailable",
      databaseReadAttempted: true,
      fallbackRequired: true,
      reasonCode: normalizeFailureCode(candidate),
    });
  }

  let comparison;
  try {
    comparison = compareSessionPlannerStates(sourceState, candidate.state);
  } catch {
    return Object.freeze({
      ...base,
      ok: false,
      status: "invalid",
      databaseReadAttempted: true,
      fallbackRequired: true,
      reasonCode: "session_planner_shadow_comparison_invalid",
    });
  }

  const sourceSessionCount = Object.keys(sourceState?.sessions || {}).length;
  const candidateSessionCount = Object.keys(candidate.state?.sessions || {}).length;
  const matched = comparison.equal;
  return Object.freeze({
    ...base,
    ok: matched,
    status: matched ? "match" : "mismatch",
    databaseReadAttempted: true,
    fallbackRequired: !matched,
    comparisonPassed: matched,
    promotionBlocked: true,
    counts: Object.freeze({
      sourceSessions: sourceSessionCount,
      candidateSessions: candidateSessionCount,
      sourceBlocks: countBlocks(sourceState),
      candidateBlocks: countBlocks(candidate.state),
    }),
    comparison,
  });
}

module.exports = {
  SESSION_PLANNER_SHADOW_SCHEMA,
  runSessionPlannerShadowComparison,
};
