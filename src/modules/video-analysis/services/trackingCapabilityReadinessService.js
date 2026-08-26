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
  const registered = Array.isArray(tracking.provider?.providers) ? tracking.provider.providers : [];
  const values = Array.isArray(tracking.providers) && tracking.providers.length
    ? tracking.providers
    : [tracking.provider, ...registered];
  const seen = new Set();
  return values.filter((provider) => {
    if (!provider || typeof provider !== "object") return false;
    const key = [provider.id || provider.providerId, provider.version || provider.providerVersion, provider.stage].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const claimedCount = group.capabilities.filter((capability) => providers.some((provider) => (
    providerCapabilities(provider).has(capability)
  ))).length;
  if (!coveredCount) return claimedCount
    ? { ...group, status: "failed", detail: "Installed provider blocked" }
    : { ...group, status: "missing", detail: "Not installed" };
  if (coveredCount !== group.capabilities.length) {
    return {
      ...group,
      status: "partial",
      detail: claimedCount > coveredCount
        ? `${coveredCount}/${group.capabilities.length} capabilities ready`
        : `${coveredCount}/${group.capabilities.length} capabilities installed`,
    };
  }
  const uniqueProviders = [...new Set(coveringProviders)];
  const verified = uniqueProviders.every((provider) => (
    provider.benchmarkStatus === "passed" || evidenceMatches(provider, evaluation)
  ));
  const activationPending = verified && uniqueProviders.some((provider) => provider.executionAvailable === false);
  const failed = uniqueProviders.some((provider) => (
    evaluation.status === "failed"
    && evidenceProvider(evaluation).providerId === (provider.id || provider.providerId)
  ));
  return {
    ...group,
    status: verified ? (activationPending ? "installed" : "verified") : failed ? "failed" : "installed",
    detail: verified
      ? (activationPending ? "Verified; activation pending" : "Match evidence verified")
      : failed ? "Benchmark below gate" : "Match evidence pending",
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
  const fullSceneActivationPending = fullSceneInstalled
    && fullScene.some((entry) => entry.detail === "Verified; activation pending");
  const registryIncomplete = ["blocked", "degraded"].includes(tracking.provider?.providerRegistryStatus)
    || Number(tracking.provider?.providerRegistryBlockedCount) > 0;
  const fullScenePartial = registryIncomplete || fullScene.some((entry) => entry.status !== "missing");
  const selectedAvailable = selected && ["installed", "verified"].includes(selected.status);
  const referenceReady = providers.some((provider) => provider.trackEvalAvailable === true)
    || tracking.provider?.trackEvalAvailable === true;
  return {
    mode: fullSceneVerified
      ? "full-scene-verified"
      : fullSceneInstalled
        ? "full-scene-installed"
        : fullScenePartial
          ? "full-scene-incomplete"
          : selectedAvailable ? "selected-object-only" : "manual-only",
    modeLabel: fullSceneVerified
      ? "Full scene verified"
      : fullSceneInstalled
        ? (fullSceneActivationPending ? "Full scene activation pending" : "Full scene evidence pending")
        : fullScenePartial
          ? "Full scene incomplete"
          : selectedAvailable ? "Selected object only" : "Manual tracking only",
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
