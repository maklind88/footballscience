import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  adjacentTrackingReviewEvent,
  applyTrackingContinuityCorrection,
  applyTrackingIdentityCorrection,
  applyTrackingVisibilityCorrection,
  trackingPointVisibility,
  trackingReviewEvents,
} from "../services/trackingCorrectionService.js";
import { applyManualTrackingCorrection } from "../services/trackingReviewService.js";
import {
  currentTrackingAtMs,
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
} from "./trackingControllerHelpers.js";

const reviewActions = new Set([
  "review-previous",
  "review-next",
  "review-continuity",
  "review-identity",
  "review-visibility",
  "review-undo",
  "review-redo",
]);
const maximumHistoryEntries = 20;

function selectedContext(state = {}) {
  const item = selectedTrackingItem(state);
  const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
  const track = (item?.objectTracks || []).find((entry) => entry.id === trackId) || null;
  return { item, trackId, track: track ? normalizeObjectTrack(track) : null };
}

function historyEntry(map, trackId = "") {
  return map.get(trackId) || [];
}

function pushHistory(map, trackId = "", track = {}) {
  const entries = [...historyEntry(map, trackId), normalizeObjectTrack(track)].slice(-maximumHistoryEntries);
  map.set(trackId, entries);
}

function historyDescriptor(trackId, undoByTrackId, redoByTrackId) {
  return {
    trackId,
    undoCount: historyEntry(undoByTrackId, trackId).length,
    redoCount: historyEntry(redoByTrackId, trackId).length,
  };
}

export function createTrackingReviewController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getCurrentMatchMs = options.getCurrentMatchMs || null;
  const seekToMatchMs = options.seekToMatchMs || (() => {});
  const undoByTrackId = new Map();
  const redoByTrackId = new Map();
  const revisionByTrackId = new Map();

  function currentAtMs(state = getState()) {
    return currentTrackingAtMs(getVideoElement, state, getCurrentMatchMs);
  }

  function setError(message = "") {
    updateState((state) => patchTrackingState(state, { error: String(message || "") }));
  }

  function replaceTrack(itemId = "", trackId = "", track = {}) {
    updateState((state) => {
      const item = selectedTrackingItem(state);
      if (!item || item.id !== itemId) return state;
      return patchTrackingState(replacePresentationItem(state, item.id, {
        objectTracks: (item.objectTracks || []).map((entry) => entry.id === trackId ? track : entry),
      }), {
        reviewHistory: historyDescriptor(track.id || trackId, undoByTrackId, redoByTrackId),
        error: "",
      });
    });
  }

  function bumpRevision(trackId = "") {
    const revision = (revisionByTrackId.get(trackId) || 0) + 1;
    revisionByTrackId.set(trackId, revision);
    return revision;
  }

  function persistChange(itemId, previousTrackId, track, audit = {}, revision = 0) {
    const tasks = [];
    if (options.persistTrack) {
      tasks.push(Promise.resolve(options.persistTrack(track)).then((saved) => {
        if (revisionByTrackId.get(previousTrackId) === revision) {
          replaceTrack(itemId, previousTrackId, normalizeObjectTrack(saved || track));
        }
      }));
    }
    if (options.persistCorrection) {
      tasks.push(Promise.resolve(options.persistCorrection({
        objectTrackId: track.id,
        atMs: audit.atMs ?? currentAtMs(),
        correctionType: audit.correctionType || "position",
        box: audit.box || {},
        playerId: audit.playerId || "",
        playerLabel: audit.playerLabel || "",
        reason: audit.reason || "Manual review",
        metadata: audit.metadata || {},
      })));
    }
    if (tasks.length) {
      void Promise.all(tasks).catch((error) => {
        if (revisionByTrackId.get(previousTrackId) === revision) {
          setError(`${error?.message || "Correction metadata could not be saved."} The correction remains local.`);
        }
      });
    }
  }

  function commitTrackChange(context = {}, nextTrackValue = {}, audit = {}) {
    if (!context.item || !context.track) return false;
    const nextTrack = normalizeObjectTrack(nextTrackValue);
    pushHistory(undoByTrackId, context.track.id, context.track);
    redoByTrackId.delete(context.track.id);
    const revision = bumpRevision(context.track.id);
    replaceTrack(context.item.id, context.track.id, nextTrack);
    options.invalidateGroundTruth?.(context.item.id);
    persistChange(context.item.id, context.track.id, nextTrack, audit, revision);
    return true;
  }

  function applyPositionCorrection(value = {}) {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    const requestedAtMs = Number(value.atMs);
    const atMs = Math.max(0, Math.round(Number.isFinite(requestedAtMs) ? requestedAtMs : currentAtMs(state)));
    const corrected = applyManualTrackingCorrection(context.track, { ...value, atMs });
    return commitTrackChange(context, corrected, {
      atMs,
      box: value.box,
      correctionType: "position",
      reason: "Manual keyframe",
    });
  }

  function applyIdentity() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    try {
      const prompt = state.presentation?.tracking?.prompt || {};
      const corrected = applyTrackingIdentityCorrection(context.track, prompt, { atMs: currentAtMs(state) });
      return commitTrackChange(context, corrected, {
        atMs: currentAtMs(state),
        correctionType: "identity",
        playerId: corrected.playerId,
        playerLabel: corrected.playerLabel,
        reason: "Assigned player identity",
        metadata: { teamSide: corrected.teamSide, shirtNumber: corrected.shirtNumber },
      });
    } catch (error) {
      setError(error?.message || "Player identity could not be applied.");
      return true;
    }
  }

  function toggleVisibility() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    const atMs = currentAtMs(state);
    try {
      const visibility = trackingPointVisibility(context.track, atMs);
      if (!visibility.available) throw new Error("No tracking sample exists at this frame. Correct the box first.");
      const corrected = applyTrackingVisibilityCorrection(context.track, {
        atMs,
        occluded: !visibility.occluded,
      });
      return commitTrackChange(context, corrected, {
        atMs,
        correctionType: "occlusion",
        reason: visibility.occluded ? "Marked visible" : "Marked occluded",
        metadata: { occluded: !visibility.occluded },
      });
    } catch (error) {
      setError(error?.message || "Visibility could not be corrected.");
      return true;
    }
  }

  function confirmContinuity() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    try {
      const corrected = applyTrackingContinuityCorrection(context.track, { atMs: currentAtMs(state) });
      const correction = corrected.corrections.at(-1);
      return commitTrackChange(context, corrected, {
        atMs: correction?.startMs ?? currentAtMs(state),
        correctionType: "merge",
        reason: "Confirmed segment continuity",
        metadata: { joinedSegments: true },
      });
    } catch (error) {
      setError(error?.message || "Continuity could not be confirmed.");
      return true;
    }
  }

  function navigate(direction = "later") {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    const next = adjacentTrackingReviewEvent(
      trackingReviewEvents(context.track),
      currentAtMs(state),
      direction,
    );
    if (!next) return true;
    seekToMatchMs(next.atMs);
    return true;
  }

  function restoreHistory(direction = "undo") {
    const state = getState();
    const context = selectedContext(state);
    if (!context.track) return false;
    const source = direction === "redo" ? redoByTrackId : undoByTrackId;
    const target = direction === "redo" ? undoByTrackId : redoByTrackId;
    const entries = historyEntry(source, context.track.id);
    if (!entries.length) return true;
    const restored = entries.at(-1);
    source.set(context.track.id, entries.slice(0, -1));
    pushHistory(target, context.track.id, context.track);
    const revision = bumpRevision(context.track.id);
    replaceTrack(context.item.id, context.track.id, restored);
    options.invalidateGroundTruth?.(context.item.id);
    persistChange(context.item.id, context.track.id, restored, {
      atMs: currentAtMs(state),
      correctionType: "position",
      reason: direction === "redo" ? "Redid local tracking correction" : "Undid local tracking correction",
      metadata: { historyAction: direction },
    }, revision);
    return true;
  }

  function syncHistory() {
    const context = selectedContext(getState());
    updateState((state) => patchTrackingState(state, {
      reviewHistory: historyDescriptor(context.trackId, undoByTrackId, redoByTrackId),
    }));
    return true;
  }

  function handleAction(action = "") {
    if (!reviewActions.has(action)) return false;
    if (action === "review-previous") return navigate("earlier");
    if (action === "review-next") return navigate("later");
    if (action === "review-continuity") return confirmContinuity();
    if (action === "review-identity") return applyIdentity();
    if (action === "review-visibility") return toggleVisibility();
    if (action === "review-undo") return restoreHistory("undo");
    return restoreHistory("redo");
  }

  return {
    applyPositionCorrection,
    handleAction,
    syncHistory,
  };
}
