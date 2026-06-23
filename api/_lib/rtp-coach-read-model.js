const {
  READINESS_SCORE_LABEL,
  calculateReadinessScore,
  filterBottleneckForActor,
  filterReadinessForActor,
  resolveBottleneck,
} = require("./rtp-performance-readiness.js");

const RTP_COACH_CONTRACT_VERSION = "footballscience-rtp-coach-read-v1";

const COACH_READ_ROLES = Object.freeze(["admin", "club-admin", "team-admin", "coach", "performance", "medical"]);
const TRAINING_AVAILABILITY = Object.freeze(["no", "modified", "yes", "unknown"]);
const MATCH_AVAILABILITY = Object.freeze(["no", "limited", "yes", "unknown"]);
const MINUTES_BANDS = Object.freeze(["none", "low", "moderate", "normal", "unknown"]);
const POSITION_READINESS_BANDS = Object.freeze(["not-ready", "partial", "near-ready", "ready", "unknown"]);
const RISK_LEVELS = Object.freeze(["low", "moderate", "high", "unknown"]);

const PRIVATE_COACH_FIELDS = Object.freeze(new Set([
  "capsApplied",
  "clinicalAssessment",
  "componentScores",
  "components",
  "diagnosisConfidence",
  "exactPercentage",
  "gps",
  "imaging",
  "medicalClearanceNotes",
  "medicalConfidenceLevel",
  "missingComponents",
  "performanceOnlyReason",
  "priority",
  "privateMedicalNotes",
  "prognosis",
  "rawExposureDetail",
  "rawGps",
  "rawStrength",
  "score",
  "strengthAsymmetry",
  "weight",
]));

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function actorRole(actor = {}) {
  return normalizeText(actor.role || actor.appRole || "unknown", 40).toLowerCase();
}

function assertCoachSafeReadActor(actor = {}) {
  return COACH_READ_ROLES.includes(actorRole(actor));
}

function enumValue(value, allowed, fallback) {
  const normalized = normalizeText(value, 80).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  const source = Array.isArray(value) ? value : [value];
  return source
    .map((entry) => normalizeText(entry, 160))
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeReadiness(input = {}) {
  const source = input.readinessScore || input.performanceReadiness?.readinessScore || input.performanceReadiness || null;
  const readiness = source || calculateReadinessScore({});
  const filtered = filterReadinessForActor(readiness, { role: "coach" });

  return {
    label: READINESS_SCORE_LABEL,
    band: filtered.band || "insufficient-data",
    bandLabel: filtered.bandLabel || "Insufficient data",
    status: filtered.status || "insufficient-data",
    dataCompleteness: filtered.dataCompleteness || "insufficient",
  };
}

function normalizeMostRestrictiveStatus(input = {}) {
  const source = input.mostRestrictiveStatus || input.resolvedStatus || {};
  return {
    status: normalizeText(source.status || input.rtpStage || input.lifecycleStatus, 80).toLowerCase() || null,
    source: normalizeText(source.source, 80) || null,
    lifecycleStatus: normalizeText(source.lifecycleStatus || input.lifecycleStatus, 80).toLowerCase() || null,
    medicalClearanceStatus: normalizeText(
      source.medicalClearanceStatus || input.medicalClearanceStatus || input.medical_clearance_status,
      80
    ).toLowerCase() || null,
  };
}

function hasActiveCase(input = {}, status = {}) {
  if (input.hasActiveRtpCase !== undefined) {
    return Boolean(input.hasActiveRtpCase);
  }
  if (input.rtpCase || input.activeCase) {
    return true;
  }
  return Boolean(status.status && status.status !== "closed");
}

function normalizeBottleneck(input = {}, readiness = {}) {
  const source = input.bottleneck || resolveBottleneck({
    readinessScore: readiness,
    medicalClearanceStatus: input.medicalClearanceStatus || input.medical_clearance_status,
    participationCeiling: input.participationCeiling || input.participation_ceiling,
    latestExposureStatus: input.latestExposureStatus || input.latest_exposure_status,
    hasSprintExposure: input.hasSprintExposure,
    hasCodExposure: input.hasCodExposure,
  });

  if (!source) {
    return null;
  }

  if (source.label && !source.coachSafeLabel) {
    return {
      key: normalizeText(source.key, 120),
      domain: normalizeText(source.domain, 120),
      severity: enumValue(source.severity, RISK_LEVELS, "moderate"),
      label: normalizeText(source.label, 160),
      summary: normalizeText(source.summary, 300),
      nextRequiredExposure: normalizeText(source.nextRequiredExposure, 240),
    };
  }

  return filterBottleneckForActor(source, { role: "coach" });
}

function resolveCoachTrainingAvailability(input = {}) {
  const status = normalizeMostRestrictiveStatus(input);
  const activeCase = hasActiveCase(input, status);
  if (!activeCase) {
    return "unknown";
  }
  if (["blocked", "not-cleared"].includes(status.medicalClearanceStatus)) {
    return "no";
  }
  if (["created", "medical-review"].includes(status.status)) {
    return "no";
  }
  if (["active-rtp"].includes(status.status)) {
    return "modified";
  }
  if (["training-available", "match-available", "performance-restored"].includes(status.status)) {
    return "yes";
  }
  return "unknown";
}

function resolveCoachPositionReadinessBand(input = {}) {
  const readiness = input.readiness || normalizeReadiness(input);
  if (readiness.band === "match-demand-candidate") {
    return "ready";
  }
  if (readiness.band === "training-demand-build") {
    return "near-ready";
  }
  if (readiness.band === "field-build" || readiness.band === "controlled-loading") {
    return "partial";
  }
  if (readiness.band === "foundation-incomplete") {
    return "not-ready";
  }
  return "unknown";
}

function resolveCoachRiskLevel(input = {}) {
  const explicit = enumValue(input.riskLevel || input.risk_level, RISK_LEVELS, "");
  if (explicit) {
    return explicit;
  }

  const status = normalizeMostRestrictiveStatus(input);
  const readiness = input.readiness || normalizeReadiness(input);
  const bottleneck = input.bottleneck || normalizeBottleneck(input, readiness);

  if (["blocked", "not-cleared"].includes(status.medicalClearanceStatus)) {
    return "high";
  }
  if (bottleneck?.severity === "high") {
    return "high";
  }
  if (readiness.band === "insufficient-data" || readiness.band === "foundation-incomplete") {
    return "high";
  }
  if (bottleneck?.severity === "moderate" || readiness.band !== "match-demand-candidate") {
    return "moderate";
  }
  return "low";
}

function resolveCoachMatchAvailability(input = {}) {
  const status = normalizeMostRestrictiveStatus(input);
  const readiness = input.readiness || normalizeReadiness(input);
  const riskLevel = input.riskLevel || resolveCoachRiskLevel({ ...input, readiness });
  const trainingAvailability = input.trainingAvailability || resolveCoachTrainingAvailability(input);

  if (!hasActiveCase(input, status)) {
    return "unknown";
  }
  if (trainingAvailability === "no" || riskLevel === "high") {
    return "no";
  }
  if (status.status === "performance-restored") {
    return riskLevel === "low" ? "yes" : "limited";
  }
  if (status.status === "match-available") {
    return readiness.band === "match-demand-candidate" && riskLevel === "low" ? "yes" : "limited";
  }
  if (status.status === "training-available" && readiness.band === "match-demand-candidate") {
    return "limited";
  }
  return "no";
}

function resolveCoachMinutesGuidanceBand(input = {}) {
  const matchAvailability = input.matchAvailability || resolveCoachMatchAvailability(input);
  const readiness = input.readiness || normalizeReadiness(input);
  const riskLevel = input.riskLevel || resolveCoachRiskLevel({ ...input, readiness });

  if (matchAvailability === "no") {
    return "none";
  }
  if (matchAvailability === "unknown") {
    return "unknown";
  }
  if (matchAvailability === "limited") {
    return readiness.band === "match-demand-candidate" && riskLevel !== "high" ? "moderate" : "low";
  }
  if (matchAvailability === "yes") {
    return riskLevel === "low" ? "normal" : "moderate";
  }
  return "unknown";
}

function resolveCoachNextDecisionPoint(input = {}) {
  const readiness = input.readiness || normalizeReadiness(input);
  const bottleneck = input.bottleneck || normalizeBottleneck(input, readiness);
  return normalizeText(
    input.nextDecisionPoint || input.next_decision_point || bottleneck?.nextRequiredExposure || bottleneck?.summary,
    240
  ) || null;
}

function buildCoachPlayerEmptyState(actor = {}, playerId = "") {
  return {
    code: "rtp-coach-player-empty",
    message: playerId
      ? "No coach-safe RTP status is available for this player yet."
      : "No coach-safe RTP player status has been requested yet.",
  };
}

function buildCoachSquadEmptyState() {
  return {
    code: "rtp-coach-squad-empty",
    message: "No coach-safe squad RTP data is available yet.",
  };
}

function buildCoachMatchdayEmptyState() {
  return {
    code: "rtp-coach-matchday-empty",
    message: "No matchday RTP readiness data is available yet.",
  };
}

function buildCoachPlayerStatusCard(input = {}, actor = {}) {
  const playerId = normalizeText(input.playerId || input.player_id || input.player?.id, 160) || null;
  const status = normalizeMostRestrictiveStatus(input);
  const activeCase = hasActiveCase(input, status);
  const readiness = normalizeReadiness(input);
  const bottleneck = normalizeBottleneck(input, readiness);
  const trainingAvailability = resolveCoachTrainingAvailability(input);
  const riskLevel = resolveCoachRiskLevel({ ...input, readiness, bottleneck });
  const matchAvailability = resolveCoachMatchAvailability({
    ...input,
    readiness,
    riskLevel,
    trainingAvailability,
  });
  const minutesGuidanceBand = resolveCoachMinutesGuidanceBand({
    ...input,
    readiness,
    riskLevel,
    matchAvailability,
  });

  const payload = {
    contractVersion: RTP_COACH_CONTRACT_VERSION,
    scope: "coach-safe",
    canRead: assertCoachSafeReadActor(actor),
    playerId,
    statusCard: {
      canTrainToday: enumValue(trainingAvailability, TRAINING_AVAILABILITY, "unknown"),
      canPlayNextMatch: enumValue(matchAvailability, MATCH_AVAILABILITY, "unknown"),
      riskLevel: enumValue(riskLevel, RISK_LEVELS, "unknown"),
      minutesGuidanceBand: enumValue(minutesGuidanceBand, MINUTES_BANDS, "unknown"),
      restrictions: normalizeArray(input.restrictions || input.coachSafeRestrictions || input.coach_safe_restrictions),
      positionReadinessBand: resolveCoachPositionReadinessBand({ readiness }),
      nextDecisionPoint: resolveCoachNextDecisionPoint({ ...input, readiness, bottleneck }),
    },
    readiness,
    case: {
      hasActiveRtpCase: activeCase,
      rtpStage: status.status,
      mostRestrictiveStatus: status.status || "unknown",
      lastUpdatedAt: normalizeText(input.lastUpdatedAt || input.updated_at || input.assessedAt || input.assessed_at, 80) || null,
    },
  };

  if (!activeCase && !input.rtpCase && !input.activeCase) {
    payload.emptyState = buildCoachPlayerEmptyState(actor, playerId || "");
  }

  return filterCoachSafeRtpSummary(payload, actor);
}

function availabilityBucket(card = {}) {
  const status = card.statusCard || {};
  if (status.canPlayNextMatch === "yes") {
    return "available";
  }
  if (status.canPlayNextMatch === "limited") {
    return "limited";
  }
  if (status.canTrainToday === "modified") {
    return "modifiedTraining";
  }
  if (status.canTrainToday === "no" || status.canPlayNextMatch === "no") {
    return "unavailable";
  }
  return "unknown";
}

function buildCoachSquadAvailabilityReadModel(input = {}, actor = {}) {
  const sourcePlayers = Array.isArray(input.players) ? input.players : [];
  const players = sourcePlayers.map((player) => buildCoachPlayerStatusCard(player, actor));
  const summary = {
    available: 0,
    limited: 0,
    modifiedTraining: 0,
    unavailable: 0,
    unknown: 0,
  };

  players.forEach((player) => {
    summary[availabilityBucket(player)] += 1;
  });

  const payload = {
    contractVersion: RTP_COACH_CONTRACT_VERSION,
    scope: "coach-safe",
    canRead: assertCoachSafeReadActor(actor),
    summary,
    players,
  };

  if (!players.length) {
    payload.emptyState = buildCoachSquadEmptyState(actor);
  }

  return filterCoachSafeRtpSummary(payload, actor);
}

function matchdayBucket(card = {}) {
  const status = card.statusCard || {};
  if (status.canPlayNextMatch === "yes" && status.minutesGuidanceBand === "normal") {
    return "available";
  }
  if (status.canPlayNextMatch === "limited" || ["low", "moderate"].includes(status.minutesGuidanceBand)) {
    return "limitedMinutes";
  }
  if (["yes", "modified"].includes(status.canTrainToday) && status.canPlayNextMatch === "no") {
    return "trainingOnly";
  }
  if (status.canTrainToday === "no" || status.canPlayNextMatch === "no") {
    return "unavailable";
  }
  return "unknown";
}

function buildCoachMatchdayReadinessReadModel(input = {}, actor = {}) {
  const sourcePlayers = Array.isArray(input.players) ? input.players : [];
  const players = sourcePlayers.map((player) => buildCoachPlayerStatusCard(player, actor));
  const selectionGroups = {
    available: [],
    limitedMinutes: [],
    trainingOnly: [],
    unavailable: [],
    unknown: [],
  };

  players.forEach((player) => {
    selectionGroups[matchdayBucket(player)].push(player);
  });

  const payload = {
    contractVersion: RTP_COACH_CONTRACT_VERSION,
    scope: "coach-safe",
    canRead: assertCoachSafeReadActor(actor),
    matchday: {
      matchId: normalizeText(input.matchId || input.match_id, 160) || null,
      generatedAt: normalizeText(input.generatedAt || input.generated_at, 80) || null,
    },
    selectionGroups,
  };

  if (!players.length) {
    payload.emptyState = buildCoachMatchdayEmptyState(actor);
  }

  return filterCoachSafeRtpSummary(payload, actor);
}

function filterCoachSafeRtpSummary(value, actor = {}) {
  if (Array.isArray(value)) {
    return value.map((entry) => filterCoachSafeRtpSummary(entry, actor));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_COACH_FIELDS.has(key))
      .map(([key, entry]) => [key, filterCoachSafeRtpSummary(entry, actor)])
  );
}

module.exports = {
  MATCH_AVAILABILITY,
  MINUTES_BANDS,
  POSITION_READINESS_BANDS,
  RISK_LEVELS,
  RTP_COACH_CONTRACT_VERSION,
  TRAINING_AVAILABILITY,
  assertCoachSafeReadActor,
  buildCoachMatchdayEmptyState,
  buildCoachMatchdayReadinessReadModel,
  buildCoachPlayerEmptyState,
  buildCoachPlayerStatusCard,
  buildCoachSquadAvailabilityReadModel,
  buildCoachSquadEmptyState,
  filterCoachSafeRtpSummary,
  resolveCoachMatchAvailability,
  resolveCoachMinutesGuidanceBand,
  resolveCoachNextDecisionPoint,
  resolveCoachPositionReadinessBand,
  resolveCoachRiskLevel,
  resolveCoachTrainingAvailability,
};
