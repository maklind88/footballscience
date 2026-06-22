const READINESS_SCORE_LABEL = "Progression score – not clearance";
const RTP_PERFORMANCE_CONTRACT_VERSION = "footballscience-rtp-performance-readiness-v1";

const READINESS_COMPONENTS = Object.freeze([
  "strength",
  "running",
  "sprint",
  "cod",
  "jumpLanding",
  "positionDemand",
]);

const READINESS_WEIGHTS = Object.freeze({
  strength: 20,
  running: 15,
  sprint: 25,
  cod: 15,
  jumpLanding: 10,
  positionDemand: 15,
});

const READINESS_COMPONENT_LABELS = Object.freeze({
  strength: "Strength readiness",
  running: "Running readiness",
  sprint: "Sprint readiness",
  cod: "COD readiness",
  jumpLanding: "Jump/landing readiness",
  positionDemand: "Position-demand readiness",
});

const READINESS_BANDS = Object.freeze([
  Object.freeze({ key: "foundation-incomplete", min: 0, max: 39, label: "Foundation incomplete" }),
  Object.freeze({ key: "controlled-loading", min: 40, max: 59, label: "Controlled loading" }),
  Object.freeze({ key: "field-build", min: 60, max: 74, label: "Field build" }),
  Object.freeze({ key: "training-demand-build", min: 75, max: 89, label: "Training-demand build" }),
  Object.freeze({ key: "match-demand-candidate", min: 90, max: 100, label: "Match-demand candidate" }),
]);

const INSUFFICIENT_DATA_BAND = Object.freeze({
  key: "insufficient-data",
  label: "Insufficient data",
});

const EXPOSURE_TYPES = Object.freeze([
  "running",
  "sprint",
  "change-of-direction",
  "jump-landing",
  "strength",
  "football-technical",
  "contact",
  "match-minutes",
  "position-specific",
  "reconditioning",
  "other",
]);

const EXPOSURE_STATUSES = Object.freeze(["planned", "completed", "modified", "failed", "cancelled"]);

const PERFORMANCE_PRIVATE_ROLES = Object.freeze(["admin", "club-admin", "team-admin", "performance"]);
const RTP_INTERNAL_ROLES = Object.freeze(["admin", "club-admin", "team-admin", "performance", "medical"]);

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function actorRole(actor = {}) {
  return normalizeText(actor.role || actor.appRole || "unknown", 40).toLowerCase();
}

function hasRole(actor, roles = []) {
  return roles.includes(actorRole(actor));
}

function canViewExactReadiness(actor = {}) {
  return hasRole(actor, PERFORMANCE_PRIVATE_ROLES);
}

function canViewPerformanceInternal(actor = {}) {
  return hasRole(actor, RTP_INTERNAL_ROLES);
}

function clampScore(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

function normalizeComponentScores(input = {}) {
  const source = input.components || input.componentScores || input;
  return Object.fromEntries(
    READINESS_COMPONENTS.map((component) => [component, clampScore(source?.[component])])
  );
}

function readinessBandForScore(score) {
  const normalized = clampScore(score);
  if (normalized === null) {
    return INSUFFICIENT_DATA_BAND;
  }
  return READINESS_BANDS.find((band) => normalized >= band.min && normalized <= band.max) || INSUFFICIENT_DATA_BAND;
}

function scoreStatusForBand(bandKey) {
  if (bandKey === "match-demand-candidate" || bandKey === "training-demand-build") {
    return "progressing";
  }
  if (bandKey === "insufficient-data") {
    return "insufficient-data";
  }
  return "building";
}

function capOverallScore(score, cap, reason, capsApplied) {
  if (score === null || score <= cap) {
    return score;
  }
  capsApplied.push({ cap, reason });
  return cap;
}

function calculateReadinessScore(input = {}) {
  const components = normalizeComponentScores(input);
  const missingComponents = READINESS_COMPONENTS.filter((component) => components[component] === null);
  const capsApplied = [];
  const dataCompleteness = missingComponents.length === 0
    ? "complete"
    : missingComponents.length === READINESS_COMPONENTS.length
      ? "insufficient"
      : "partial";

  let exactPercentage = null;
  if (missingComponents.length === 0) {
    exactPercentage = Math.round(
      READINESS_COMPONENTS.reduce(
        (total, component) => total + (components[component] * READINESS_WEIGHTS[component]) / 100,
        0
      )
    );

    if (input.hasSprintExposure === false) {
      exactPercentage = capOverallScore(exactPercentage, 69, "Sprint exposure gap caps progression.", capsApplied);
    }
    if (components.sprint < 75) {
      exactPercentage = capOverallScore(exactPercentage, 74, "Sprint readiness is below training-demand threshold.", capsApplied);
    }
    if (components.cod < 75) {
      exactPercentage = capOverallScore(exactPercentage, 79, "COD readiness is below training-demand threshold.", capsApplied);
    }
    if (components.positionDemand < 75) {
      exactPercentage = capOverallScore(exactPercentage, 84, "Position-demand readiness is incomplete.", capsApplied);
    }
    if (input.latestExposureStatus === "failed") {
      exactPercentage = capOverallScore(exactPercentage, 59, "Latest exposure was failed.", capsApplied);
    }
    if (input.latestExposureStatus === "modified") {
      exactPercentage = capOverallScore(exactPercentage, 74, "Latest exposure was modified.", capsApplied);
    }
  }

  const band = readinessBandForScore(exactPercentage);

  return {
    label: READINESS_SCORE_LABEL,
    exactPercentage,
    band: band.key,
    bandLabel: band.label,
    status: scoreStatusForBand(band.key),
    dataCompleteness,
    missingComponents,
    capsApplied,
    components: Object.fromEntries(
      READINESS_COMPONENTS.map((component) => {
        const componentBand = readinessBandForScore(components[component]);
        return [
          component,
          {
            label: READINESS_COMPONENT_LABELS[component],
            weight: READINESS_WEIGHTS[component],
            score: components[component],
            band: componentBand.key,
            bandLabel: componentBand.label,
          },
        ];
      })
    ),
  };
}

function severityForScore(score) {
  const normalized = clampScore(score);
  if (normalized === null) {
    return "moderate";
  }
  if (normalized < 50) {
    return "high";
  }
  if (normalized < 75) {
    return "moderate";
  }
  return "low";
}

function bottleneckResult(values) {
  return {
    key: values.key,
    domain: values.domain,
    severity: values.severity || "moderate",
    coachSafeLabel: values.coachSafeLabel,
    coachSafeSummary: values.coachSafeSummary || values.coachSafeLabel,
    nextRequiredExposure: values.nextRequiredExposure || "",
    performanceOnlyReason: values.performanceOnlyReason || "",
    priority: values.priority,
  };
}

function resolveBottleneck(input = {}) {
  const readiness = input.readinessScore || calculateReadinessScore(input);
  const components = readiness.components || {};
  const medicalClearanceStatus = normalizeText(input.medicalClearanceStatus || input.medical_clearance_status, 80);
  const participationCeiling = normalizeText(input.participationCeiling || input.participation_ceiling, 80);

  if (["blocked", "not-cleared"].includes(medicalClearanceStatus) || participationCeiling === "none") {
    return bottleneckResult({
      key: "medical-participation-ceiling",
      domain: "medical",
      severity: "high",
      coachSafeLabel: "Participation ceiling",
      coachSafeSummary: "Medical participation status prevents progression.",
      nextRequiredExposure: "Medical review required before demand progression.",
      performanceOnlyReason: "Medical clearance is currently more restrictive than performance progression.",
      priority: 1,
    });
  }

  if (readiness.missingComponents?.length) {
    return bottleneckResult({
      key: "insufficient-readiness-data",
      domain: "data",
      severity: "moderate",
      coachSafeLabel: "Readiness data incomplete",
      coachSafeSummary: "Performance needs more readiness data before progression can be interpreted.",
      nextRequiredExposure: "Complete the missing readiness checks.",
      performanceOnlyReason: `Missing components: ${readiness.missingComponents.join(", ")}`,
      priority: 2,
    });
  }

  if (input.latestExposureStatus === "failed" || input.latestExposureStatus === "modified") {
    return bottleneckResult({
      key: `latest-exposure-${input.latestExposureStatus}`,
      domain: "exposure",
      severity: input.latestExposureStatus === "failed" ? "high" : "moderate",
      coachSafeLabel: "Last exposure not completed cleanly",
      coachSafeSummary: "The last progression exposure needs review before the next demand increase.",
      nextRequiredExposure: "Repeat or adjust the last exposure.",
      performanceOnlyReason: `Latest exposure status: ${input.latestExposureStatus}.`,
      priority: 3,
    });
  }

  if (input.hasSprintExposure === false || (components.sprint?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "sprint-exposure-gap",
      domain: "sprint",
      severity: input.hasSprintExposure === false ? "high" : severityForScore(components.sprint?.score),
      coachSafeLabel: "Sprint exposure gap",
      coachSafeSummary: "Sprint demand is the main progression limiter.",
      nextRequiredExposure: "Complete controlled sprint exposure before match-demand progression.",
      performanceOnlyReason: "Sprint exposure or sprint readiness is below threshold.",
      priority: 4,
    });
  }

  if (input.hasCodExposure === false || (components.cod?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "cod-braking-gap",
      domain: "change-of-direction",
      severity: input.hasCodExposure === false ? "high" : severityForScore(components.cod?.score),
      coachSafeLabel: "COD/braking gap",
      coachSafeSummary: "Change-of-direction and braking demand is the main progression limiter.",
      nextRequiredExposure: "Complete planned COD and braking exposure.",
      performanceOnlyReason: "COD readiness is below threshold.",
      priority: 5,
    });
  }

  if ((components.strength?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "strength-deficit",
      domain: "strength",
      severity: severityForScore(components.strength?.score),
      coachSafeLabel: "Strength gap",
      coachSafeSummary: "Strength readiness is the main progression limiter.",
      nextRequiredExposure: "Complete the required gym strength exposure.",
      performanceOnlyReason: "Strength readiness is below threshold.",
      priority: 6,
    });
  }

  if ((components.running?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "running-load-gap",
      domain: "running",
      severity: severityForScore(components.running?.score),
      coachSafeLabel: "Running load gap",
      coachSafeSummary: "Running load tolerance is the main progression limiter.",
      nextRequiredExposure: "Complete the next running-load progression.",
      performanceOnlyReason: "Running readiness is below threshold.",
      priority: 7,
    });
  }

  if ((components.jumpLanding?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "jump-landing-gap",
      domain: "jump-landing",
      severity: severityForScore(components.jumpLanding?.score),
      coachSafeLabel: "Jump/landing gap",
      coachSafeSummary: "Jump and landing exposure is the main progression limiter.",
      nextRequiredExposure: "Complete jump and landing exposure before higher football demand.",
      performanceOnlyReason: "Jump/landing readiness is below threshold.",
      priority: 8,
    });
  }

  if ((components.positionDemand?.score ?? 100) < 75) {
    return bottleneckResult({
      key: "position-demand-gap",
      domain: "position-demand",
      severity: severityForScore(components.positionDemand?.score),
      coachSafeLabel: "Position-demand gap",
      coachSafeSummary: "Position-specific demand is the main progression limiter.",
      nextRequiredExposure: "Complete position-specific football exposure.",
      performanceOnlyReason: "Position-demand readiness is below threshold.",
      priority: 9,
    });
  }

  return bottleneckResult({
    key: "no-primary-bottleneck",
    domain: "readiness",
    severity: "low",
    coachSafeLabel: "No primary bottleneck",
    coachSafeSummary: "No single performance bottleneck is currently dominant.",
    nextRequiredExposure: "Progress to the next planned exposure if Medical and staff approve.",
    performanceOnlyReason: "All readiness components meet the current threshold.",
    priority: 10,
  });
}

function filterComponentsForActor(components = {}, actor = {}) {
  return Object.fromEntries(
    READINESS_COMPONENTS.map((component) => {
      const value = components[component] || {};
      const filtered = {
        label: value.label || READINESS_COMPONENT_LABELS[component],
        band: value.band || "insufficient-data",
        bandLabel: value.bandLabel || INSUFFICIENT_DATA_BAND.label,
      };
      if (canViewExactReadiness(actor)) {
        filtered.score = value.score ?? null;
        filtered.weight = value.weight ?? READINESS_WEIGHTS[component];
      }
      return [component, filtered];
    })
  );
}

function filterBottleneckForActor(bottleneck = null, actor = {}) {
  if (!bottleneck) {
    return null;
  }
  const filtered = {
    key: bottleneck.key,
    domain: bottleneck.domain,
    severity: bottleneck.severity,
    label: bottleneck.coachSafeLabel,
    summary: bottleneck.coachSafeSummary,
    nextRequiredExposure: bottleneck.nextRequiredExposure,
  };
  if (canViewPerformanceInternal(actor)) {
    filtered.performanceOnlyReason = bottleneck.performanceOnlyReason;
    filtered.priority = bottleneck.priority;
  }
  return filtered;
}

function filterReadinessForActor(readiness = null, actor = {}) {
  const source = readiness || calculateReadinessScore({});
  const filtered = {
    label: READINESS_SCORE_LABEL,
    band: source.band || "insufficient-data",
    bandLabel: source.bandLabel || INSUFFICIENT_DATA_BAND.label,
    status: source.status || "insufficient-data",
    dataCompleteness: source.dataCompleteness || "insufficient",
    components: filterComponentsForActor(source.components, actor),
  };

  if (canViewExactReadiness(actor)) {
    filtered.exactPercentage = source.exactPercentage;
    filtered.capsApplied = source.capsApplied || [];
    filtered.missingComponents = source.missingComponents || [];
  }

  return filtered;
}

function buildPerformanceReadinessEmptyState(actor = {}) {
  const readinessScore = calculateReadinessScore({});
  const bottleneck = resolveBottleneck({ readinessScore });
  return {
    contractVersion: RTP_PERFORMANCE_CONTRACT_VERSION,
    writesEnabled: false,
    scoreLabel: READINESS_SCORE_LABEL,
    readinessScore: filterReadinessForActor(readinessScore, actor),
    bottleneck: filterBottleneckForActor(bottleneck, actor),
    exposureTracking: {
      events: [],
      lastCompletedExposure: null,
      nextRequiredExposure: bottleneck.nextRequiredExposure,
      supportedExposureTypes: EXPOSURE_TYPES,
      supportedExposureStatuses: EXPOSURE_STATUSES,
    },
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

module.exports = {
  EXPOSURE_STATUSES,
  EXPOSURE_TYPES,
  READINESS_COMPONENTS,
  READINESS_SCORE_LABEL,
  READINESS_WEIGHTS,
  RTP_PERFORMANCE_CONTRACT_VERSION,
  buildPerformanceReadinessEmptyState,
  calculateReadinessScore,
  canViewExactReadiness,
  canViewPerformanceInternal,
  filterBottleneckForActor,
  filterReadinessForActor,
  readinessBandForScore,
  resolveBottleneck,
};
