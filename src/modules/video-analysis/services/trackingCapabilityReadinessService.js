const groups = Object.freeze([
  Object.freeze({
    id: "selected-object",
    label: "Selected object",
    capabilities: Object.freeze(["segment:selected-object", "propagate:selected-object"]),
  }),
  Object.freeze({
    id: "detection",
    label: "Player / ball / referee",
    capabilities: Object.freeze(["detect:player", "detect:ball", "detect:referee"]),
  }),
  Object.freeze({
    id: "continuity",
    label: "Association / re-ID",
    capabilities: Object.freeze(["associate:multi-object", "reidentify:player"]),
  }),
  Object.freeze({
    id: "classification",
    label: "Team / shirt",
    capabilities: Object.freeze(["classify:team", "classify:shirt-number"]),
  }),
]);

function providersForTracking(tracking = {}) {
  const values = Array.isArray(tracking.providers) && tracking.providers.length
    ? tracking.providers
    : tracking.provider ? [tracking.provider] : [];
  return values.filter((provider) => provider && typeof provider === "object");
}

function providerCapabilities(provider = {}) {
  return new Set(Array.isArray(provider.capabilities) ? provider.capabilities.map(String) : []);
}

function providerReady(provider = {}) {
  return provider.status === "ready" && provider.available !== false;
}

function evidenceProvider(evaluation = {}) {
  return evaluation.report?.providerRunEvidence?.provider || {};
}

function evidenceMatches(provider = {}, evaluation = {}) {
  const evidence = evidenceProvider(evaluation);
  return evaluation.status === "passed"
    && evidence.providerId === (provider.id || provider.providerId)
    && evidence.providerVersion === (provider.version || provider.providerVersion)
    && evidence.executionFingerprintSha256 === provider.executionFingerprintSha256;
}

function groupReadiness(group = {}, providers = [], evaluation = {}) {
  const coveringProviders = group.capabilities.map((capability) => providers.find((provider) => (
    providerReady(provider) && providerCapabilities(provider).has(capability)
  )) || null);
  const coveredCount = coveringProviders.filter(Boolean).length;
  if (!coveredCount) return { ...group, status: "missing", detail: "Not installed" };
  if (coveredCount !== group.capabilities.length) {
    return {
      ...group,
      status: "partial",
      detail: `${coveredCount}/${group.capabilities.length} capabilities installed`,
    };
  }
  const uniqueProviders = [...new Set(coveringProviders)];
  const verified = uniqueProviders.every((provider) => (
    provider.benchmarkStatus === "passed" || evidenceMatches(provider, evaluation)
  ));
  const failed = uniqueProviders.some((provider) => (
    evaluation.status === "failed"
    && evidenceProvider(evaluation).providerId === (provider.id || provider.providerId)
  ));
  return {
    ...group,
    status: verified ? "verified" : failed ? "failed" : "installed",
    detail: verified ? "Match evidence verified" : failed ? "Benchmark below gate" : "Match evidence pending",
  };
}

export function trackingCapabilityReadiness(tracking = {}) {
  const providers = providersForTracking(tracking);
  const evaluation = tracking.benchmarkEvaluation || {};
  const entries = groups.map((group) => groupReadiness(group, providers, evaluation));
  const selected = entries.find((entry) => entry.id === "selected-object");
  const fullScene = entries.filter((entry) => entry.id !== "selected-object");
  const fullSceneInstalled = fullScene.every((entry) => ["installed", "verified"].includes(entry.status));
  const fullSceneVerified = fullScene.every((entry) => entry.status === "verified");
  const fullScenePartial = fullScene.some((entry) => entry.status !== "missing");
  const selectedAvailable = selected && ["installed", "verified"].includes(selected.status);
  const referenceReady = providers.some((provider) => provider.trackEvalAvailable === true)
    || tracking.provider?.trackEvalAvailable === true;
  return {
    mode: fullSceneVerified
      ? "full-scene-verified"
      : fullSceneInstalled
        ? "full-scene-installed"
        : selectedAvailable
          ? "selected-object-only"
          : fullScenePartial ? "full-scene-incomplete" : "manual-only",
    modeLabel: fullSceneVerified
      ? "Full scene verified"
      : fullSceneInstalled
        ? "Full scene evidence pending"
        : selectedAvailable
          ? "Selected object only"
          : fullScenePartial ? "Full scene incomplete" : "Manual tracking only",
    entries: [
      ...entries,
      {
        id: "reference",
        label: "TrackEval reference",
        capabilities: [],
        status: referenceReady ? "verified" : "missing",
        detail: referenceReady ? "Pinned and available" : "Not installed",
      },
    ],
  };
}

export const TRACKING_CAPABILITY_READINESS_GROUPS = groups;
