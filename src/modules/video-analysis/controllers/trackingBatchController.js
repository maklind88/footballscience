import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { initialTrackingPromptChunk } from "../services/trackingExtensionService.js";
import { normalizeTrackingJobProgress } from "../services/trackingProgressService.js";
import { trackingPrompt } from "../services/trackingReviewService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
  trackingItemById,
  trackingLocalId,
} from "./trackingControllerHelpers.js";

export const MAX_TRACKING_BATCH_OBJECTS = 8;

const sharedPromptFields = ["startMs", "endMs", "promptAtMs"];

function pendingPrompts(state = {}) {
  return Array.isArray(state.presentation?.tracking?.pendingPrompts)
    ? state.presentation.tracking.pendingPrompts
    : [];
}

export function trackingBatchTargets(state = {}) {
  const current = state.presentation?.tracking?.prompt;
  return [
    ...pendingPrompts(state),
    ...(current?.box ? [current] : []),
  ].map(trackingPrompt);
}

export function trackingBatchCompatibility(prompts = []) {
  if (!Array.isArray(prompts) || prompts.length < 2) return { compatible: true, error: "" };
  const normalized = prompts.map(trackingPrompt);
  const anchor = normalized[0];
  const compatible = normalized.slice(1).every((prompt) => (
    sharedPromptFields.every((field) => prompt[field] === anchor[field])
  ));
  return {
    compatible,
    error: compatible ? "" : "All targets in one batch must use the same range and video frame.",
  };
}

function nextPrompt(current = {}) {
  return {
    ...trackingPrompt({
      ...current,
      id: trackingLocalId("prompt"),
      playerId: "",
      playerLabel: "",
      shirtNumber: "",
    }),
    box: null,
  };
}

export function createTrackingBatchController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const now = options.now || Date.now;

  function queueCurrent() {
    const state = getState();
    const tracking = state.presentation?.tracking || {};
    const current = tracking.prompt;
    const queued = pendingPrompts(state);
    const maximum = Math.min(
      MAX_TRACKING_BATCH_OBJECTS,
      Math.max(1, Number(tracking.provider?.maxObjectsPerJob) || MAX_TRACKING_BATCH_OBJECTS),
    );
    if (!current?.box) return false;
    if (queued.length >= maximum) {
      updateState((value) => patchTrackingState(value, { error: `One batch supports at most ${maximum} targets.` }));
      return false;
    }
    const target = trackingPrompt(current);
    const compatibility = trackingBatchCompatibility([...queued, target]);
    if (!compatibility.compatible) {
      updateState((value) => patchTrackingState(value, { error: compatibility.error }));
      return false;
    }
    updateState((value) => patchTrackingState(value, {
      pendingPrompts: [...queued, target],
      prompt: nextPrompt(target),
      error: "",
    }));
    return true;
  }

  function remove(promptId = "") {
    updateState((state) => patchTrackingState(state, {
      pendingPrompts: pendingPrompts(state).filter((prompt) => prompt.id !== promptId),
      error: "",
    }));
    return true;
  }

  function clearCurrent() {
    updateState((state) => patchTrackingState(state, {
      prompt: { ...(state.presentation?.tracking?.prompt || {}), box: null },
      error: "",
    }));
    return true;
  }

  function anchorAtMs() {
    return Number(pendingPrompts(getState())[0]?.promptAtMs);
  }

  async function run() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const targets = trackingBatchTargets(state);
    const compatibility = trackingBatchCompatibility(targets);
    if (!item || targets.length < 2 || options.trackingJob?.isActive()) return false;
    if (!compatibility.compatible) {
      updateState((value) => patchTrackingState(value, { error: compatibility.error }));
      return false;
    }
    if (!options.trackObjects || state.presentation?.tracking?.provider?.batchAvailable !== true) {
      updateState((value) => patchTrackingState(value, {
        error: "Update the local tracking companion to track several targets in one pass.",
      }));
      return false;
    }
    const targetRange = { startMs: targets[0].startMs, endMs: targets[0].endMs };
    const prompts = targets.map((prompt) => initialTrackingPromptChunk(prompt, {
      maxDurationMs: state.presentation?.tracking?.provider?.maxDurationMs,
    }));
    const frame = options.getProviderRunFrame?.();
    updateState((value) => patchTrackingState(value, {
      job: normalizeTrackingJobProgress({
        stage: `Preparing ${prompts.length} tracking targets`,
        ratio: 0.02,
      }, {}, { nowMs: now() }),
      error: "",
    }));
    try {
      const tracked = await options.trackingJob.run({
        videoRef: state.videoRef,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        prompts,
        onProgress: (progress = {}) => updateState((value) => patchTrackingState(value, {
          job: normalizeTrackingJobProgress(
            progress,
            value.presentation?.tracking?.job || {},
            { nowMs: now() },
          ),
        })),
      });
      if (!Array.isArray(tracked) || tracked.length !== prompts.length) {
        throw new Error("The local tracker returned an incomplete target batch.");
      }
      const normalized = tracked.map((track, index) => normalizeObjectTrack({
        ...track,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        entityType: prompts[index].entityType || track.entityType,
        playerId: prompts[index].playerId || track.playerId,
        playerLabel: prompts[index].playerLabel || track.playerLabel,
        teamSide: prompts[index].teamSide || track.teamSide,
        shirtNumber: prompts[index].shirtNumber || track.shirtNumber,
        status: "review",
        metadata: {
          ...(track.metadata || {}),
          targetStartMs: targetRange.startMs,
          targetEndMs: targetRange.endMs,
        },
      }));
      options.captureProviderRun?.({
        itemId: item.id,
        provider: state.presentation?.tracking?.provider || {},
        frame,
        range: targetRange,
        tracks: normalized,
      });
      const persisted = await Promise.all(normalized.map((track) => options.persistTrack(track)));
      updateState((current) => {
        const liveItem = trackingItemById(current, item.id);
        if (!liveItem) return patchTrackingState(current, { job: null });
        const replacedIds = new Set(persisted.map((track) => track.id));
        return patchTrackingState(replacePresentationItem(current, liveItem.id, {
          objectTracks: [
            ...(liveItem.objectTracks || []).filter((track) => !replacedIds.has(track.id)),
            ...persisted,
          ],
        }), {
          selectedTrackIds: persisted.slice(0, 2).map((track) => track.id),
          pendingPrompts: [],
          captureMode: "",
          prompt: { ...state.presentation?.tracking?.prompt, ...targetRange, box: null },
          job: null,
          error: "",
        });
      });
      void options.refreshProvider?.();
      return true;
    } catch (error) {
      updateState((current) => patchTrackingState(current, {
        job: null,
        error: error?.name === "AbortError" ? "" : error?.message || "Local batch tracking could not be completed.",
      }));
      return false;
    }
  }

  return { anchorAtMs, clearCurrent, queueCurrent, remove, run };
}
