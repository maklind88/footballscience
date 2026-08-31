const requirements = Object.freeze({
  detection: Object.freeze(["detect:player", "detect:ball", "detect:referee"]),
  association: Object.freeze(["associate:multi-object"]),
  reidentification: Object.freeze(["reidentify:player"]),
  classification: Object.freeze(["classify:team"]),
});

const labels = Object.freeze({
  detection: "Player, ball and referee detection",
  association: "Multi-object association",
  reidentification: "Player re-identification",
  classification: "Team classification",
});

function readyCandidate(value = {}, stage = "") {
  const capabilities = new Set(Array.isArray(value.capabilities) ? value.capabilities.map(String) : []);
  const profile = value.executionProfile || {};
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
    && requirements[stage].every((capability) => capabilities.has(capability));
}

function preferredCandidate(values = [], stage = "") {
  return values.filter((value) => readyCandidate(value, stage)).sort((first, second) => (
    Number(second.priority || 0) - Number(first.priority || 0)
    || String(first.id).localeCompare(String(second.id))
    || String(first.version).localeCompare(String(second.version))
  ))[0] || null;
}

export function trackingCandidatePipelineReadiness(tracking = {}) {
  const candidates = Array.isArray(tracking.provider?.candidates) ? tracking.provider.candidates : [];
  const providers = Object.fromEntries(Object.keys(requirements).map((stage) => [
    stage,
    preferredCandidate(candidates, stage),
  ]));
  const stages = Object.keys(requirements).map((stage) => ({
    id: stage,
    label: labels[stage],
    provider: providers[stage],
    ready: Boolean(providers[stage]),
    requiredCapabilities: [...requirements[stage]],
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
