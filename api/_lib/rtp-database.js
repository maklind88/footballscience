const { sendJson } = require("./supabase-admin.js");
const {
  buildPerformanceReadinessEmptyState,
} = require("./rtp-performance-readiness.js");

const RTP_SCHEMA = "footballscience-rtp-operating-spine-v1";
const RTP_MODULE_ID = "rtp";
const RTP_WRITES_ENABLED = false;

const RTP_LIFECYCLE_STATUSES = Object.freeze([
  "created",
  "medical-review",
  "active-rtp",
  "training-available",
  "match-available",
  "performance-restored",
  "closed",
]);

const RTP_MEDICAL_CLEARANCE_STATUSES = Object.freeze([
  "not-cleared",
  "rehab-only",
  "running-only",
  "modified-training",
  "full-training",
  "match-available",
  "blocked",
]);

const RTP_MEDICAL_CONFIDENCE_LEVELS = Object.freeze(["high", "moderate", "low"]);

const RTP_STATUS_RANK = Object.freeze({
  "created": 10,
  "medical-review": 20,
  "active-rtp": 30,
  "training-available": 40,
  "match-available": 50,
  "performance-restored": 60,
  "closed": 70,
});

const MEDICAL_CLEARANCE_TO_LIFECYCLE = Object.freeze({
  "blocked": "medical-review",
  "not-cleared": "medical-review",
  "rehab-only": "active-rtp",
  "running-only": "active-rtp",
  "modified-training": "training-available",
  "full-training": "training-available",
  "match-available": "match-available",
});

const ROLE_GROUPS = Object.freeze({
  read: Object.freeze(["admin", "club-admin", "team-admin", "coach", "performance", "medical"]),
  write: Object.freeze(["admin", "club-admin", "team-admin", "medical", "performance"]),
  medicalPrivate: Object.freeze(["admin", "medical"]),
});

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function actorRole(actor = {}) {
  return normalizeText(actor.role || actor.appRole || "unknown", 40).toLowerCase();
}

function hasRole(actor, roles = []) {
  return roles.includes(actorRole(actor));
}

function canReadRtp(actor = {}) {
  return hasRole(actor, ROLE_GROUPS.read);
}

function canWriteRtp(actor = {}) {
  return hasRole(actor, ROLE_GROUPS.write);
}

function canViewMedicalConfidence(actor = {}) {
  return hasRole(actor, ROLE_GROUPS.medicalPrivate);
}

function normalizeLifecycleStatus(value, fallback = "created") {
  const status = normalizeText(value, 80).toLowerCase();
  return RTP_LIFECYCLE_STATUSES.includes(status) ? status : fallback;
}

function normalizeMedicalClearanceStatus(value, fallback = "not-cleared") {
  const status = normalizeText(value, 80).toLowerCase();
  return RTP_MEDICAL_CLEARANCE_STATUSES.includes(status) ? status : fallback;
}

function normalizeMedicalConfidenceLevel(value, fallback = "low") {
  const level = normalizeText(value, 40).toLowerCase();
  return RTP_MEDICAL_CONFIDENCE_LEVELS.includes(level) ? level : fallback;
}

function resolveMostRestrictiveStatus(input = {}) {
  const lifecycleStatus = normalizeLifecycleStatus(input.lifecycleStatus || input.lifecycle_status, "created");
  if (lifecycleStatus === "closed") {
    return {
      status: "closed",
      source: "lifecycle",
      lifecycleStatus,
      medicalClearanceStatus: normalizeMedicalClearanceStatus(
        input.medicalClearanceStatus || input.medical_clearance_status,
        "not-cleared"
      ),
      reason: "RTP case is closed.",
    };
  }

  const medicalClearanceStatus = normalizeMedicalClearanceStatus(
    input.medicalClearanceStatus || input.medical_clearance_status,
    lifecycleStatus === "created" ? "not-cleared" : "rehab-only"
  );
  const medicalLifecycleStatus = MEDICAL_CLEARANCE_TO_LIFECYCLE[medicalClearanceStatus] || "medical-review";
  const lifecycleRank = RTP_STATUS_RANK[lifecycleStatus] || RTP_STATUS_RANK.created;
  const medicalRank = RTP_STATUS_RANK[medicalLifecycleStatus] || RTP_STATUS_RANK["medical-review"];
  const status = medicalRank < lifecycleRank ? medicalLifecycleStatus : lifecycleStatus;

  return {
    status,
    source: medicalRank < lifecycleRank ? "medical-clearance" : "lifecycle",
    lifecycleStatus,
    medicalClearanceStatus,
    reason: medicalRank < lifecycleRank
      ? "Medical clearance is more restrictive than the current RTP lifecycle stage."
      : "Lifecycle stage is currently the most restrictive RTP state.",
  };
}

function filterMedicalClearanceForActor(clearance = null, actor = {}) {
  if (!clearance) {
    return null;
  }

  const base = {
    status: normalizeMedicalClearanceStatus(clearance.status || clearance.clearance_status),
    participationCeiling: normalizeText(clearance.participationCeiling || clearance.participation_ceiling, 80),
    restrictions: clearance.restrictions || clearance.medical_restrictions || {},
    reviewedAt: normalizeText(clearance.reviewedAt || clearance.reviewed_at, 80),
  };

  if (canViewMedicalConfidence(actor)) {
    base.medicalConfidenceLevel = normalizeMedicalConfidenceLevel(
      clearance.medicalConfidenceLevel || clearance.medical_confidence_level
    );
  }

  return base;
}

function actorScope(actor = {}) {
  return {
    organizationId: normalizeText(actor.organizationId || actor.organization_id || actor.clubId || actor.club_id, 160),
    teamId: normalizeText(actor.teamId || actor.team_id, 160),
    actorId: normalizeText(actor.id, 160),
  };
}

function buildEmptyState(actor = {}, query = {}) {
  const scope = actorScope(actor);
  const playerId = normalizeText(query.playerId || query.player_id, 160);

  return {
    ok: true,
    schema: RTP_SCHEMA,
    moduleId: RTP_MODULE_ID,
    mode: "operating-spine-foundation",
    writesEnabled: RTP_WRITES_ENABLED,
    canRead: canReadRtp(actor),
    canWrite: RTP_WRITES_ENABLED && canWriteRtp(actor),
    scope,
    playerId,
    cases: [],
    activeCase: null,
    resolvedStatus: resolveMostRestrictiveStatus({ lifecycleStatus: "created", medicalClearanceStatus: "not-cleared" }),
    lifecycleStatuses: RTP_LIFECYCLE_STATUSES,
    medicalClearanceStatuses: RTP_MEDICAL_CLEARANCE_STATUSES,
    medicalConfidenceLevels: canViewMedicalConfidence(actor) ? RTP_MEDICAL_CONFIDENCE_LEVELS : [],
    performanceReadiness: buildPerformanceReadinessEmptyState(actor),
    coachSafe: actorRole(actor) === "coach",
    exclusions: {
      ui: true,
      aiDecisionEngine: true,
      matchdayIntegration: true,
      injuryProfileImport: true,
      medicalCaseIntegration: true,
      playerPlanAutomation: true,
      frontendSupabaseWrites: true,
    },
  };
}

function parseQuery(req = {}) {
  try {
    return Object.fromEntries(new URL(req.url || "/api/rtp", "https://footballscience.local").searchParams.entries());
  } catch {
    return {};
  }
}

async function handleRtpRequest(req, res, actor) {
  if (req.method === "GET") {
    return sendJson(res, 200, buildEmptyState(actor, parseQuery(req)));
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())) {
    return sendJson(res, RTP_WRITES_ENABLED ? 400 : 501, {
      ok: false,
      schema: RTP_SCHEMA,
      writesEnabled: RTP_WRITES_ENABLED,
      reason: "RTP writes are intentionally disabled in Sprint 2.",
    });
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  RTP_LIFECYCLE_STATUSES,
  RTP_MEDICAL_CLEARANCE_STATUSES,
  RTP_MEDICAL_CONFIDENCE_LEVELS,
  RTP_SCHEMA,
  RTP_WRITES_ENABLED,
  actorScope,
  canReadRtp,
  canViewMedicalConfidence,
  canWriteRtp,
  filterMedicalClearanceForActor,
  handleRtpRequest,
  normalizeLifecycleStatus,
  normalizeMedicalClearanceStatus,
  normalizeMedicalConfidenceLevel,
  resolveMostRestrictiveStatus,
};
