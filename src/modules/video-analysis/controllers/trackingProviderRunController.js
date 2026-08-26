import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  addTrackingProviderRun,
  createTrackingProviderRunArtifact,
  trackingProviderRunWorkspaceEntry,
} from "../services/trackingProviderRunService.js";
import { emptyTrackingBenchmarkEvaluation } from "../services/trackingBenchmarkStateService.js";
import {
  patchTrackingState,
  trackingLocalId,
} from "./trackingControllerHelpers.js";

const providerEvidenceIdentityFields = Object.freeze([
  "id", "version", "protocol", "stage", "capabilities", "executionFingerprintSha256",
  "referenceEvaluator", "referenceEvaluatorVersion", "referenceEvaluatorCommit", "referenceSourceSha256",
]);

export function preserveTrackingProviderEvidenceIdentity(previous = {}, current = {}) {
  if (current.available === true
    || current.executionFingerprintSha256
    || !previous.executionFingerprintSha256) return current;
  return {
    ...current,
    ...Object.fromEntries(providerEvidenceIdentityFields.map((field) => [field, previous[field]])),
  };
}

function providerBenchmarkIdentity(value = {}) {
  return JSON.stringify([
    value.id,
    value.version,
    value.protocol,
    value.stage,
    [...(value.capabilities || [])].map(String).sort(),
    value.executionFingerprintSha256,
    value.referenceEvaluator,
    value.referenceEvaluatorVersion,
    value.referenceEvaluatorCommit,
    value.referenceSourceSha256,
  ]);
}

export function trackingProviderRunFrame(video = null) {
  return {
    width: Math.max(0, Math.round(Number(video?.videoWidth) || 0)),
    height: Math.max(0, Math.round(Number(video?.videoHeight) || 0)),
  };
}

export function createTrackingProviderRunController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const now = options.now || Date.now;
  let refreshId = 0;

  function frame() {
    return trackingProviderRunFrame(getVideoElement());
  }

  function capture(value = {}) {
    const tracks = (value.tracks || []).map(normalizeObjectTrack);
    const firstTrack = tracks[0];
    const provider = value.provider || getState().presentation?.tracking?.provider || {};
    try {
      const artifact = createTrackingProviderRunArtifact({
        id: firstTrack?.metadata?.localArtifactId || trackingLocalId("provider-run"),
        provider: {
          providerId: provider.id,
          providerVersion: provider.version,
          protocol: provider.protocol,
          stage: provider.stage,
          capabilities: provider.capabilities,
          executionFingerprintSha256: provider.executionFingerprintSha256,
        },
        sourceFingerprint: firstTrack?.metadata?.localSourceSha256,
        angleId: firstTrack?.metadata?.angleId,
        frame: value.frame,
        range: value.range,
        tracks,
        performance: {
          processingMs: Math.max(0, Number(firstTrack?.metadata?.providerProcessingMs) || 0),
          device: firstTrack?.metadata?.device || "",
        },
      }, { now });
      updateState((state) => patchTrackingState(state, {
        providerRuns: addTrackingProviderRun(
          state.presentation?.tracking?.providerRuns,
          value.itemId,
          artifact,
        ),
        benchmarkEvaluation: emptyTrackingBenchmarkEvaluation(),
      }));
      options.onEvidenceChanged?.();
      return true;
    } catch (error) {
      updateState((state) => patchTrackingState(state, {
        providerRuns: {
          ...trackingProviderRunWorkspaceEntry(state.presentation?.tracking?.providerRuns),
          error: error?.message || "The raw provider run could not be retained for benchmarking.",
        },
      }));
      return false;
    }
  }

  async function refresh() {
    if (!options.inspectProvider) return false;
    const requestId = ++refreshId;
    updateState((state) => patchTrackingState(state, {
      provider: {
        ...(state.presentation?.tracking?.provider || {}),
        status: "checking",
        available: false,
        error: "",
      },
    }));
    let provider;
    try {
      provider = await options.inspectProvider();
    } catch (error) {
      provider = {
        status: "offline",
        available: false,
        name: "Local tracking companion",
        error: error?.message || "The local tracking companion is offline.",
      };
    }
    if (requestId !== refreshId) return false;
    let benchmarkIdentityChanged = false;
    updateState((state) => {
      const previous = state.presentation?.tracking?.provider || {};
      const next = preserveTrackingProviderEvidenceIdentity(previous, provider);
      benchmarkIdentityChanged = providerBenchmarkIdentity(previous) !== providerBenchmarkIdentity(next);
      return patchTrackingState(state, {
        provider: next,
        ...(benchmarkIdentityChanged ? {
          benchmarkEvaluation: emptyTrackingBenchmarkEvaluation(),
        } : {}),
      });
    });
    if (benchmarkIdentityChanged) options.onEvidenceChanged?.();
    return provider.available === true;
  }

  return { capture, frame, refresh };
}
