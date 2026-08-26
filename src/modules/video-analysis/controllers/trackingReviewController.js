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
  splitTrackingTrack,
  swapTrackingTrackContinuations,
} from "../services/trackingStructuralCorrectionService.js";
import {
  currentTrackingAtMs,
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
} from "./trackingControllerHelpers.js";
import {
  compoundHistory,
  historyDescriptor,
  historyEntry,
  latestHistoryCandidate,
  pushCompoundHistory,
  pushHistory,
  trackSnapshots,
} from "./trackingReviewHistory.js";
import { createTrackingStructuralReviewRuntime } from "./trackingStructuralReviewRuntime.js";

const reviewActions = new Set([
  "review-previous",
  "review-next",
  "review-continuity",
  "review-identity",
  "review-visibility",
  "review-split",
  "review-identity-swap",
  "review-undo",
  "review-redo",
]);
function correctionOperationId(prefix = "correction") {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 14)}`;
}

function selectedContext(state = {}) {
  const item = selectedTrackingItem(state);
  const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
  const track = (item?.objectTracks || []).find((entry) => entry.id === trackId) || null;
  return { item, trackId, track: track ? normalizeObjectTrack(track) : null };
}

export function createTrackingReviewController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getCurrentMatchMs = options.getCurrentMatchMs || null;
  const seekToMatchMs = options.seekToMatchMs || (() => {});
  const undoByTrackId = new Map();
  const redoByTrackId = new Map();
  const compoundUndoByItemId = new Map();
  const compoundRedoByItemId = new Map();
  const revisionByTrackId = new Map();
  const persistenceTasks = [];
  let persistenceActive = false;
  let operationSequence = 0;

  function nextSequence() {
    operationSequence += 1;
    return operationSequence;
  }

  function drainPersistenceTasks() {
    if (persistenceActive || !persistenceTasks.length) return;
    persistenceActive = true;
    const entry = persistenceTasks.shift();
    let task;
    try { task = entry.task(); } catch (error) { task = Promise.reject(error); }
    Promise.resolve(task)
      .catch(entry.onError)
      .finally(() => {
        persistenceActive = false;
        drainPersistenceTasks();
      });
  }

  function enqueuePersistence(task, onError) {
    persistenceTasks.push({ task, onError });
    drainPersistenceTasks();
  }

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
      const selectedTrackIds = (state.presentation?.tracking?.selectedTrackIds || [])
        .map((id) => id === trackId ? track.id : id);
      const dynamicGraphics = (item.dynamicGraphics || []).map((graphic) => ({
        ...graphic,
        bindings: (graphic.bindings || []).map((binding) => (
          binding.trackId === trackId ? { ...binding, trackId: track.id } : binding
        )),
      }));
      return patchTrackingState(replacePresentationItem(state, item.id, {
        objectTracks: (item.objectTracks || []).map((entry) => entry.id === trackId ? track : entry),
        dynamicGraphics,
      }), {
        selectedTrackIds: [...new Set(selectedTrackIds)],
        reviewHistory: historyDescriptor(
          item.id,
          track.id || trackId,
          undoByTrackId,
          redoByTrackId,
          compoundUndoByItemId,
          compoundRedoByItemId,
        ),
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
    const operationId = audit.operationId
      || track.corrections.at(-1)?.id
      || correctionOperationId();
    const task = async () => {
      let savedTrack = track;
      if (options.persistTrack) {
        const saved = await options.persistTrack(track);
        savedTrack = normalizeObjectTrack(saved || track);
        if (revisionByTrackId.get(previousTrackId) === revision) {
          replaceTrack(itemId, previousTrackId, savedTrack);
        }
      }
      if (options.persistCorrection) await options.persistCorrection({
        operationId,
        objectTrackId: savedTrack.id,
        localWorkspaceTrackKey: savedTrack.metadata?.localWorkspaceTrackKey || "",
        localWorkspaceStatus: savedTrack.metadata?.localWorkspaceStatus || "",
        atMs: audit.atMs ?? currentAtMs(),
        correctionType: audit.correctionType || "position",
        box: audit.box || {},
        playerId: audit.playerId || "",
        playerLabel: audit.playerLabel || "",
        reason: audit.reason || "Manual review",
        metadata: audit.metadata || {},
      });
    };
    if (options.persistTrack || options.persistCorrection) {
      enqueuePersistence(task, (error) => {
        if (revisionByTrackId.get(previousTrackId) === revision) {
          setError(`${error?.message || "Correction metadata could not be saved."} The correction remains local.`);
        }
      });
    }
  }

  function commitTrackChange(context = {}, nextTrackValue = {}, audit = {}) {
    if (!context.item || !context.track) return false;
    const nextTrack = normalizeObjectTrack(nextTrackValue);
    const sequence = nextSequence();
    pushHistory(undoByTrackId, context.track.id, context.track, sequence);
    redoByTrackId.clear();
    compoundRedoByItemId.clear();
    const revision = bumpRevision(context.track.id);
    replaceTrack(context.item.id, context.track.id, nextTrack);
    options.invalidateGroundTruth?.(context.item.id);
    persistChange(context.item.id, context.track.id, nextTrack, audit, revision);
    return true;
  }

  const structuralRuntime = createTrackingStructuralReviewRuntime({
    updateState,
    historyDescriptor: (itemId, trackId) => historyDescriptor(
      itemId,
      trackId,
      undoByTrackId,
      redoByTrackId,
      compoundUndoByItemId,
      compoundRedoByItemId,
    ),
    persistTrack: options.persistTrack,
    persistCorrection: options.persistCorrection,
    bumpRevision,
    getRevision: (trackId) => revisionByTrackId.get(trackId),
    replaceTrack,
    enqueuePersistence,
    setError,
    createOperationId: correctionOperationId,
  });

  function commitCompound(transaction) {
    pushCompoundHistory(compoundUndoByItemId, transaction.itemId, transaction);
    redoByTrackId.clear();
    compoundRedoByItemId.clear();
    structuralRuntime.applyState(transaction, "after");
    options.invalidateGroundTruth?.(transaction.itemId);
    structuralRuntime.persist(transaction, "after", true);
    return true;
  }

  function splitAtPlayhead() {
    const state = getState();
    const context = selectedContext(state);
    if (!context.item || !context.track) return false;
    try {
      const atMs = currentAtMs(state);
      const operationId = correctionOperationId("split");
      const result = splitTrackingTrack(context.track, {
        atMs,
        operationId,
        correctedBy: options.getReviewer?.() || "",
      });
      const index = context.item.objectTracks.findIndex((track) => track.id === context.track.id);
      return commitCompound({
        id: operationId,
        itemId: context.item.id,
        type: "split",
        atMs,
        sequence: nextSequence(),
        affectedTrackIds: [result.prefix.id, result.suffix.id],
        before: trackSnapshots(context.item, [context.track], [index]),
        after: trackSnapshots(context.item, [result.prefix, result.suffix], [index, index + 1]),
        selectedBefore: [...(state.presentation?.tracking?.selectedTrackIds || [])],
        selectedAfter: [result.suffix.id],
        bindingFallbacks: { [result.suffix.id]: result.prefix.id },
        audits: [
          {
            operationId: `${operationId}:prefix`,
            trackId: result.prefix.id,
            atMs,
            correctionType: "split",
            reason: "Split trajectory at reviewed frame",
            metadata: { operationGroupId: operationId, structuralRole: "prefix", partnerTrackId: result.suffix.id },
          },
          {
            operationId: `${operationId}:suffix`,
            trackId: result.suffix.id,
            atMs,
            correctionType: "split",
            reason: "Created unassigned continuation from split",
            metadata: { operationGroupId: operationId, structuralRole: "suffix", partnerTrackId: result.prefix.id },
          },
        ],
      });
    } catch (error) {
      setError(error?.message || "The selected trajectory could not be split.");
      return true;
    }
  }

  function swapSelectedIdentities() {
    const state = getState();
    const context = selectedContext(state);
    const selectedIds = state.presentation?.tracking?.selectedTrackIds || [];
    const selectedTracks = selectedIds
      .map((trackId) => context.item?.objectTracks?.find((track) => track.id === trackId))
      .filter(Boolean);
    if (!context.item || selectedTracks.length !== 2) return false;
    try {
      const atMs = currentAtMs(state);
      const operationId = correctionOperationId("identity-swap");
      const result = swapTrackingTrackContinuations(selectedTracks[0], selectedTracks[1], {
        atMs,
        operationId,
        correctedBy: options.getReviewer?.() || "",
      });
      const indexes = result.tracks.map((track) => context.item.objectTracks.findIndex((entry) => entry.id === track.id));
      return commitCompound({
        id: operationId,
        itemId: context.item.id,
        type: "identity-swap",
        atMs,
        sequence: nextSequence(),
        affectedTrackIds: result.tracks.map((track) => track.id),
        before: trackSnapshots(context.item, selectedTracks, indexes),
        after: trackSnapshots(context.item, result.tracks, indexes),
        selectedBefore: [...selectedIds],
        selectedAfter: [...selectedIds],
        bindingFallbacks: {},
        audits: result.tracks.map((track, index) => ({
          operationId: `${operationId}:${index + 1}`,
          trackId: track.id,
          atMs,
          correctionType: "identity-swap",
          reason: "Swapped crossed player trajectories",
          metadata: {
            operationGroupId: operationId,
            partnerTrackId: result.tracks[index === 0 ? 1 : 0].id,
          },
        })),
      });
    } catch (error) {
      setError(error?.message || "The selected player identities could not be swapped.");
      return true;
    }
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
    const compoundSource = direction === "redo" ? compoundRedoByItemId : compoundUndoByItemId;
    const compoundTarget = direction === "redo" ? compoundUndoByItemId : compoundRedoByItemId;
    const candidate = latestHistoryCandidate(
      context.track.id,
      context.item.id,
      source,
      compoundSource,
    );
    if (!candidate) return true;
    if (candidate.kind === "compound") {
      const entries = compoundHistory(compoundSource, context.item.id);
      compoundSource.set(context.item.id, entries.slice(0, -1));
      const transaction = { ...candidate.value, sequence: nextSequence() };
      pushCompoundHistory(compoundTarget, context.item.id, transaction);
      const targetDirection = direction === "redo" ? "after" : "before";
      structuralRuntime.applyState(transaction, targetDirection);
      options.invalidateGroundTruth?.(context.item.id);
      structuralRuntime.persist(transaction, targetDirection, false);
      return true;
    }
    const entries = historyEntry(source, context.track.id);
    const restored = candidate.value.track;
    source.set(context.track.id, entries.slice(0, -1));
    pushHistory(target, context.track.id, context.track, nextSequence());
    const revision = bumpRevision(context.track.id);
    replaceTrack(context.item.id, context.track.id, restored);
    options.invalidateGroundTruth?.(context.item.id);
    persistChange(context.item.id, context.track.id, restored, {
      atMs: currentAtMs(state),
      correctionType: "position",
      reason: direction === "redo" ? "Redid local tracking correction" : "Undid local tracking correction",
      operationId: correctionOperationId(`history-${direction}`),
      metadata: { historyAction: direction },
    }, revision);
    return true;
  }

  function syncHistory() {
    const context = selectedContext(getState());
    updateState((state) => patchTrackingState(state, {
      reviewHistory: historyDescriptor(
        context.item?.id || "",
        context.trackId,
        undoByTrackId,
        redoByTrackId,
        compoundUndoByItemId,
        compoundRedoByItemId,
      ),
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
    if (action === "review-split") return splitAtPlayhead();
    if (action === "review-identity-swap") return swapSelectedIdentities();
    if (action === "review-undo") return restoreHistory("undo");
    return restoreHistory("redo");
  }

  return {
    applyPositionCorrection,
    handleAction,
    syncHistory,
  };
}
