import {
  TRACKING_CANDIDATE_REGISTRY_PROTOCOL,
  createTrackingCandidateProviderRegistry,
} from "./tracking-candidate-provider-registry.mjs";
import {
  TRACKING_PROVIDER_REGISTRY_PROTOCOL,
  createTrackingProviderRegistry,
} from "./tracking-provider-registry.mjs";
import { createTrackingStageRunner } from "./tracking-stage-runner.mjs";

function blockedRegistry(protocol, reason) {
  return {
    protocol,
    status: "blocked",
    providerCount: 0,
    readyCount: 0,
    blockedCount: 0,
    providers: [],
    reasons: [reason],
  };
}

async function inspectRegistry(registry, runner, protocol, reason) {
  try {
    const value = await registry.inspect?.();
    if (value?.protocol !== protocol) return blockedRegistry(protocol, reason);
    return typeof runner.decorateRegistry === "function"
      ? await runner.decorateRegistry(value)
      : value;
  } catch {
    return blockedRegistry(protocol, reason);
  }
}

export function createTrackingStageRuntime(options = {}) {
  const providerRegistry = options.trackingProviderRegistry
    || createTrackingProviderRegistry(options.trackingProviders || {});
  const candidateRegistry = options.trackingCandidateProviderRegistry
    || createTrackingCandidateProviderRegistry(options.trackingCandidates || {});
  const stageRunner = options.trackingStageRunner || createTrackingStageRunner({
    registry: providerRegistry,
    sandbox: options.trackingStageSandbox || {},
  });
  const candidateStageRunner = options.trackingCandidateStageRunner || createTrackingStageRunner({
    registry: candidateRegistry,
    sandbox: options.trackingCandidateStageSandbox || options.trackingStageSandbox || {},
    executionMode: "benchmark-candidate",
  });

  return {
    providerRegistry,
    candidateRegistry,
    stageRunner,
    candidateStageRunner,
    async inspect() {
      const [approved, candidates] = await Promise.all([
        inspectRegistry(
          providerRegistry,
          stageRunner,
          TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          "provider-registry-unreadable",
        ),
        inspectRegistry(
          candidateRegistry,
          candidateStageRunner,
          TRACKING_CANDIDATE_REGISTRY_PROTOCOL,
          "candidate-registry-unreadable",
        ),
      ]);
      return { providerRegistry: approved, candidateRegistry: candidates };
    },
  };
}

export const _private = Object.freeze({ blockedRegistry, inspectRegistry });
