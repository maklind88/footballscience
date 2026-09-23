const requirements = Object.freeze({
  detection: Object.freeze(["detect:player", "detect:ball", "detect:referee"]),
  association: Object.freeze(["associate:multi-object"]),
  reidentification: Object.freeze(["reidentify:player"]),
  classification: Object.freeze(["classify:team"]),
});

const roleAwareRequirements = Object.freeze({
  detection: Object.freeze(["detect:person", "detect:ball"]),
  association: requirements.association,
  reidentification: requirements.reidentification,
  classification: Object.freeze(["classify:role", "classify:team"]),
});

const labels = Object.freeze({
  detection: "Player, ball and referee detection",
  association: "Multi-object association",
  reidentification: "Player re-identification",
  classification: "Team classification",
});

const versionCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareCandidateVersions(first, second) {
  const left = String(first || "");
  const right = String(second || "");
  const [leftRelease, ...leftPrerelease] = left.split("-");
  const [rightRelease, ...rightPrerelease] = right.split("-");
  const releaseOrder = versionCollator.compare(leftRelease, rightRelease);
  if (releaseOrder) return releaseOrder;
  if (!leftPrerelease.length && rightPrerelease.length) return 1;
  if (leftPrerelease.length && !rightPrerelease.length) return -1;
  return versionCollator.compare(leftPrerelease.join("-"), rightPrerelease.join("-"));
}

function readyCandidate(value = {}, stage = "", required = requirements[stage]) {
  const capabilities = new Set(Array.isArray(value.capabilities) ? value.capabilities.map(String) : []);
  const profile = value.executionProfile || {};
  const genericDetectionIsExclusive = stage !== "detection"
    || !required.includes("detect:person")
    || (!["detect:player", "detect:referee"].some((capability) => capabilities.has(capability)));
  const classificationPathMatches = stage !== "classification"
    || required.includes("classify:role") === capabilities.has("classify:role");
  return value.stage === stage
    && value.protocol === "football-science-tracking-stage-v1"
    && value.benchmarkOnly === true
    && value.status === "candidate-ready"
    && value.available === true
    && value.executionAvailable === true
    && /^[a-f0-9]{64}$/i.test(String(value.providerFingerprintSha256 || ""))
    && /^[a-f0-9]{64}$/i.test(String(value.executionFingerprintSha256 || ""))
    && Boolean(profile.device)
    && Boolean(profile.runtimeMode)
    && Number.isSafeInteger(profile.cpuThreads)
    && profile.cpuThreads > 0
    && Number(profile.sampleFps) > 0
    && typeof profile.modelResident === "boolean"
    && genericDetectionIsExclusive
    && classificationPathMatches
    && required.every((capability) => capabilities.has(capability));
}

function preferredCandidate(values = [], stage = "", required = requirements[stage]) {
  return values.filter((value) => readyCandidate(value, stage, required)).sort((first, second) => (
    Number(second.priority || 0) - Number(first.priority || 0)
    || String(first.id).localeCompare(String(second.id))
    || compareCandidateVersions(second.version, first.version)
  ))[0] || null;
}

export function trackingCandidatePipelineReadiness(tracking = {}) {
  const candidates = Array.isArray(tracking.provider?.candidates) ? tracking.provider.candidates : [];
  const pathProviders = (pathRequirements) => Object.fromEntries(Object.keys(requirements).map((stage) => [
    stage,
    preferredCandidate(candidates, stage, pathRequirements[stage]),
  ]));
  const legacyProviders = pathProviders(requirements);
  const roleAwareProviders = pathProviders(roleAwareRequirements);
  const readyCount = (values) => Object.values(values).filter(Boolean).length;
  const legacyReadyCount = readyCount(legacyProviders);
  const roleAwareReadyCount = readyCount(roleAwareProviders);
  const roleAware = roleAwareReadyCount === Object.keys(requirements).length
    ? legacyReadyCount !== Object.keys(requirements).length
    : roleAwareReadyCount > legacyReadyCount;
  const selectedRequirements = roleAware ? roleAwareRequirements : requirements;
  const selectedLabels = roleAware ? {
    ...labels,
    detection: "Person and ball detection",
    classification: "Football role and team classification",
  } : labels;
  const providers = roleAware ? roleAwareProviders : legacyProviders;
  const stages = Object.keys(requirements).map((stage) => ({
    id: stage,
    label: selectedLabels[stage],
    provider: providers[stage],
    ready: Boolean(providers[stage]),
    requiredCapabilities: [...selectedRequirements[stage]],
  }));
  const issues = [];
  if (tracking.provider?.candidateStageExecutionAvailable !== true) {
    issues.push("The local companion does not expose benchmark-candidate execution.");
  }
  stages.filter((stage) => !stage.ready).forEach((stage) => issues.push(`${stage.label} candidate is missing.`));
  return Object.freeze({
    ready: issues.length === 0,
    providers: Object.freeze(providers),
    stages: Object.freeze(stages),
    issues: Object.freeze(issues),
    candidateCount: candidates.length,
  });
}

export const TRACKING_CANDIDATE_STAGE_REQUIREMENTS = requirements;
export const TRACKING_CANDIDATE_ROLE_AWARE_STAGE_REQUIREMENTS = roleAwareRequirements;
export const _private = Object.freeze({ compareCandidateVersions });
