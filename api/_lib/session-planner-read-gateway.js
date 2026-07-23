const crypto = require("crypto");
const {
  compareSessionPlannerStates,
} = require("./session-planner-domain-records.js");
const {
  readSessionPlannerLegacyState,
  sessionPlannerScopeKey,
} = require("./session-planner-database.js");
const {
  evaluateSessionPlannerReadPromotion,
} = require("./session-planner-read-promotion.js");

const SESSION_PLANNER_READ_GATEWAY_SCHEMA =
  "footballscience-session-planner-read-gateway-v1";
const SESSION_PLANNER_READ_GATEWAY_MODE = "staging-canary";
const SESSION_PLANNER_SOURCE_STORAGE_KEY = "football-session-planner-v3";
const PLATFORM_IDENTITY_SCOPE_SCHEMA = "footballscience-platform-identity-scope-v1";
const SESSION_PLANNER_READ_ROLES = new Set([
  "admin",
  "club-admin",
  "team-admin",
  "coach",
  "scout",
  "analyst",
  "performance",
  "medical",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

function normalizeText(value, maxLength = 120) {
  return String(value || "").trim().toLowerCase().slice(0, maxLength);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function projectRefFromSupabaseUrl(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9][a-z0-9-]{2,79})\.supabase\.co$/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function getSessionPlannerReadGatewayMode(env = process.env) {
  return normalizeText(env.SESSION_PLANNER_READ_GATEWAY_MODE, 40) ===
    SESSION_PLANNER_READ_GATEWAY_MODE
    ? SESSION_PLANNER_READ_GATEWAY_MODE
    : "off";
}

function getSessionPlannerReadGatewayAccess(scope = {}, env = process.env) {
  const mode = getSessionPlannerReadGatewayMode(env);
  const scopeKey = sessionPlannerScopeKey(scope);
  const scopes = new Set(
    String(env.SESSION_PLANNER_READ_GATEWAY_SCOPES || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const projectRef = normalizeText(env.SESSION_PLANNER_STAGING_PROJECT_REF, 80);
  const configuredProjectRef = normalizeText(env.SUPABASE_PROJECT_REF, 80);
  const urlProjectRef = projectRefFromSupabaseUrl(
    env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  );
  const canonicalProductionProjectRef = normalizeText(
    env.SESSION_PLANNER_CANONICAL_PRODUCTION_PROJECT_REF,
    80
  );
  const receiptSha256 = normalizeText(
    env.SESSION_PLANNER_READ_PROMOTION_SHA256,
    64
  );
  const failures = [];

  if (mode !== SESSION_PLANNER_READ_GATEWAY_MODE) failures.push("gateway_mode_off");
  if (!scopeKey || !scopes.has(scopeKey)) failures.push("gateway_scope_not_enabled");
  if (
    !PROJECT_REF_PATTERN.test(projectRef) ||
    !configuredProjectRef ||
    configuredProjectRef !== projectRef ||
    urlProjectRef !== projectRef
  ) {
    failures.push("gateway_staging_project_mismatch");
  }
  if (
    !PROJECT_REF_PATTERN.test(canonicalProductionProjectRef) ||
    canonicalProductionProjectRef === projectRef
  ) {
    failures.push("gateway_production_separation_invalid");
  }
  if (!SHA256_PATTERN.test(receiptSha256)) {
    failures.push("gateway_promotion_receipt_missing");
  }

  return Object.freeze({
    enabled: failures.length === 0,
    mode,
    scopeKey,
    projectRef,
    canonicalProductionProjectRef,
    receiptSha256,
    failureCodes: Object.freeze(failures.sort()),
  });
}

function findScopedTeam(actorScope, scope) {
  return (actorScope?.scope?.teams || []).find(
    (team) =>
      normalizeText(team?.id) === normalizeText(scope.teamId) &&
      normalizeText(team?.organizationId) === normalizeText(scope.organizationId) &&
      normalizeText(team?.status || "active", 40) === "active"
  );
}

function membershipCoversTeam(membership, team, scope) {
  if (
    normalizeText(membership?.status || "active", 40) !== "active" ||
    normalizeText(membership?.organizationId) !== normalizeText(scope.organizationId) ||
    !SESSION_PLANNER_READ_ROLES.has(normalizeText(membership?.role, 40))
  ) {
    return false;
  }
  const membershipScope = normalizeText(membership?.scope, 40);
  if (membershipScope === "organization") return true;
  if (
    membershipScope === "club" &&
    normalizeText(membership?.clubId) &&
    normalizeText(membership?.clubId) === normalizeText(team?.clubId)
  ) {
    return true;
  }
  return (
    membershipScope === "team" &&
    normalizeText(membership?.teamId) === normalizeText(scope.teamId)
  );
}

function actorCanReadSessionPlannerScope(actorScope = {}, scope = {}) {
  if (
    actorScope.schema !== PLATFORM_IDENTITY_SCOPE_SCHEMA ||
    actorScope.ok !== true ||
    normalizeText(actorScope.actor?.status || "active", 40) !== "active"
  ) {
    return false;
  }
  const team = findScopedTeam(actorScope, scope);
  if (!team) return false;
  return (actorScope.scope?.memberships || []).some((membership) =>
    membershipCoversTeam(membership, team, scope)
  );
}

function parseSourceEntry(sourceEntry = {}) {
  const value = typeof sourceEntry.value === "string" ? sourceEntry.value : "";
  const revision = Number(sourceEntry.revision);
  const expectedHash = normalizeText(sourceEntry.hash, 64);
  let state = null;
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        state = parsed;
      }
    } catch {
      state = null;
    }
  }
  if (
    sourceEntry.key !== SESSION_PLANNER_SOURCE_STORAGE_KEY ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    !value ||
    !SHA256_PATTERN.test(expectedHash) ||
    hashText(value) !== expectedHash
  ) {
    return {
      ok: false,
      code: "gateway_source_checkpoint_invalid",
      value,
      state,
    };
  }
  if (!state) {
    return {
      ok: false,
      code: "gateway_source_state_invalid",
      value,
      state: null,
    };
  }
  return { ok: true, value, revision, hash: expectedHash, state };
}

function createFallbackResult(source, access, reasonCode, extra = {}) {
  return Object.freeze({
    ok: true,
    schema: SESSION_PLANNER_READ_GATEWAY_SCHEMA,
    active: false,
    mode: access.mode,
    status: "fallback",
    reasonCode,
    userFacingSource: "app-state",
    fallbackRequired: true,
    databaseReadAttempted: Boolean(extra.databaseReadAttempted),
    promotionVerified: Boolean(extra.promotionVerified),
    comparisonPassed: false,
    value: source?.value || "",
    state: source?.state || null,
  });
}

function createDomainProjection(sourceState, candidateState) {
  const projection = cloneJson(sourceState);
  projection.sessions = cloneJson(candidateState.sessions || {});
  return projection;
}

function candidateFailureCode(result = {}) {
  const status = Number(result.status) || 0;
  if (status === 401 || status === 403) return "gateway_database_forbidden";
  if (status === 409) return "gateway_database_integrity_failed";
  if (status >= 500) return "gateway_database_unavailable";
  return "gateway_database_read_failed";
}

async function resolveSessionPlannerReadGateway(
  sourceEntry,
  actorScope,
  scope = {},
  options = {}
) {
  const env = options.env || process.env;
  const access = getSessionPlannerReadGatewayAccess(scope, env);
  const source = parseSourceEntry(sourceEntry);
  if (!source.ok) {
    return createFallbackResult(source, access, source.code);
  }
  if (!access.enabled) {
    return createFallbackResult(
      source,
      access,
      access.failureCodes[0] || "gateway_disabled"
    );
  }
  if (!actorCanReadSessionPlannerScope(actorScope, scope)) {
    return createFallbackResult(source, access, "gateway_actor_scope_denied");
  }

  const promotion = evaluateSessionPlannerReadPromotion(
    options.promotionReceipt,
    {
      target: "staging",
      projectRef: access.projectRef,
      canonicalProductionProjectRef: access.canonicalProductionProjectRef,
      organizationId: scope.organizationId,
      teamId: scope.teamId,
      sourceRevision: source.revision,
      sourceHash: source.hash,
      receiptSha256: access.receiptSha256,
    },
    { now: options.now }
  );
  if (!promotion.ok) {
    return createFallbackResult(
      source,
      access,
      promotion.failureCodes[0] || "gateway_promotion_unverified"
    );
  }

  const readCandidate = options.readCandidate || readSessionPlannerLegacyState;
  let candidate;
  try {
    candidate = await readCandidate(scope, {
      ...(options.databaseOptions || {}),
      allowDisabled: true,
      selectedDate: source.state.selectedDate,
    });
  } catch {
    candidate = { ok: false, status: 503 };
  }
  if (!candidate?.ok) {
    return createFallbackResult(source, access, candidateFailureCode(candidate), {
      databaseReadAttempted: true,
      promotionVerified: true,
    });
  }

  let comparison;
  try {
    comparison = compareSessionPlannerStates(source.state, candidate.state);
  } catch {
    comparison = { equal: false };
  }
  if (!comparison.equal) {
    return createFallbackResult(source, access, "gateway_candidate_mismatch", {
      databaseReadAttempted: true,
      promotionVerified: true,
    });
  }

  const state = createDomainProjection(source.state, candidate.state);
  return Object.freeze({
    ok: true,
    schema: SESSION_PLANNER_READ_GATEWAY_SCHEMA,
    active: true,
    mode: access.mode,
    status: "database-canary",
    reasonCode: "gateway_candidate_verified",
    userFacingSource: "session-planner-domain",
    fallbackRequired: false,
    databaseReadAttempted: true,
    promotionVerified: true,
    comparisonPassed: true,
    value: JSON.stringify(state),
    state,
    evidence: Object.freeze({
      sourceRevision: source.revision,
      sourceHash: source.hash,
      candidateHash: comparison.rightHash,
      sessionCount: comparison.sessionCount,
      receiptSha256: promotion.receiptSha256,
      containsCoachingContent: false,
    }),
  });
}

module.exports = {
  SESSION_PLANNER_READ_GATEWAY_MODE,
  SESSION_PLANNER_READ_GATEWAY_SCHEMA,
  actorCanReadSessionPlannerScope,
  getSessionPlannerReadGatewayAccess,
  getSessionPlannerReadGatewayMode,
  hashText,
  projectRefFromSupabaseUrl,
  resolveSessionPlannerReadGateway,
};
