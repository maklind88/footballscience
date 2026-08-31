import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { importTrackingPreannotationReviewCase } from "../services/trackingPreannotationReviewService.js";
import {
  createTrackingPreannotationReviewBatch,
  findTrackingPreannotationReviewBatchIndex,
  prioritizeTrackingPreannotationReviewEntries,
  summarizeTrackingPreannotationReviewPriorities,
} from "../services/trackingPreannotationReviewPriorityService.js";
import { trackingSourceFingerprint } from "./trackingGroundTruthController.js";
import { shouldIgnoreShortcutTarget } from "../services/codingTemplateService.js";
import {
  acceptedTrackingPreannotationTrack as acceptedTrack,
  currentTrackingPreannotationReview as currentReview,
  normalizeTrackingPreannotationReviewState as reviewState,
  previewTrackingPreannotationTrack as previewTrack,
  selectTrackingPreannotationReviewFiles,
  summarizeTrackingPreannotationReviewSession,
  TRACKING_PREANNOTATION_SHORTCUT_ACTIONS,
} from "./trackingPreannotationReviewControllerHelpers.js";
import { createTrackingPreannotationContextReplayController } from "./trackingPreannotationContextReplayController.js";
import {
  createTrackingPreannotationReviewDraftController,
  restoreTrackingPreannotationReviewDecisions,
} from "./trackingPreannotationReviewDraftController.js";
import { createTrackingPreannotationCampaignController } from "./trackingPreannotationCampaignController.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
  trackingItemById,
} from "./trackingControllerHelpers.js";

function invalid(message) {
  throw new Error(message);
}

export function createTrackingPreannotationReviewController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getWindow = options.getWindow || (() => globalThis.window);
  const importCase = options.importCase || importTrackingPreannotationReviewCase;
  const pickFiles = options.pickFiles || ((context) => (
    selectTrackingPreannotationReviewFiles(getWindow(), context)
  ));
  const draftController = createTrackingPreannotationReviewDraftController({
    getState,
    getContext: options.getContext,
    getWindow,
    getDraftScope: options.getDraftScope,
    loadDraft: options.loadDraft,
    saveDraft: options.saveDraft,
    removeDraft: options.removeDraft,
    now: options.now,
  });
  const campaignController = createTrackingPreannotationCampaignController({
    getWindow,
    loadCampaignCases: options.loadCampaignCases,
    saveCampaignCase: options.saveCampaignCase,
    now: options.now,
  });
  const contextReplay = createTrackingPreannotationContextReplayController(options);
  let session = null;

  function patchReview(patch = {}) {
    updateState((state) => patchTrackingState(state, {
      preannotationReview: {
        ...reviewState(state.presentation?.tracking?.preannotationReview),
        ...patch,
      },
    }));
  }

  function saveDraftProgress() {
    const target = session;
    const summary = counts();
    const campaign = campaignController.preview(target, summary);
    if (campaign) patchReview({ campaign });
    return draftController.save(target, (patch) => {
      if (session === target) patchReview(patch);
    }).then((saved) => {
      if (target?.scope && !saved) {
        const failedCampaign = campaignController.failed(target, summary);
        if (session === target && failedCampaign) patchReview({ campaign: failedCampaign });
        return false;
      }
      return campaignController.save(target, summary).then((nextCampaign) => {
        if (session === target && nextCampaign) patchReview({ campaign: nextCampaign });
        return true;
      });
    });
  }

  function counts() {
    return summarizeTrackingPreannotationReviewSession(session);
  }

  function entryById(id = "") {
    return session?.entries.find((entry) => entry.track.id === id) || null;
  }

  function pendingIndex(start = 0) {
    return findTrackingPreannotationReviewBatchIndex(session, start);
  }

  function refreshBatch(options = {}) {
    if (!session) return false;
    Object.assign(session, createTrackingPreannotationReviewBatch(
      session.entries,
      session.decisions,
      {
        reviewScope: options.reviewScope ?? session.reviewScope,
        batchSize: options.batchSize ?? session.batchSize,
      },
    ));
    return show(pendingIndex(0));
  }

  function replaceReviewTracks(state, itemId, removeIds, additions = []) {
    const item = trackingItemById(state, itemId);
    if (!item) return state;
    const remove = new Set(removeIds);
    const addIds = new Set(additions.map((track) => track.id));
    return replacePresentationItem(state, itemId, {
      objectTracks: [
        ...(item.objectTracks || []).filter((track) => !remove.has(track.id) && !addIds.has(track.id)),
        ...additions,
      ],
    });
  }

  function sync() {
    const state = getState();
    const selected = selectedTrackingItem(state);
    const sourceSha256 = trackingSourceFingerprint(state);
    const clipId = String(selected?.clipId || selected?.clip?.id || "");
    const angleId = String(state.mediaProduction?.activeAngleId || "primary");
    if (session && selected?.id === session.itemId && clipId === session.clipId
      && angleId === session.angleId && sourceSha256 === session.sourceSha256) return true;
    contextReplay.stop();
    const stale = session;
    session = null;
    updateState((state) => {
      const withoutPreview = stale?.currentId
        ? replaceReviewTracks(state, stale.itemId, [stale.currentId], [])
        : state;
      return patchTrackingState(withoutPreview, {
        selectedTrackIds: (state.presentation?.tracking?.selectedTrackIds || []).filter(
          (trackId) => trackId !== stale?.currentId,
        ),
        preannotationReview: reviewState(),
      });
    });
    return false;
  }

  function show(index) {
    contextReplay.stop();
    if (!session) return false;
    const previousId = session.currentId;
    const entry = index >= 0 ? session.entries[index] : null;
    session.currentId = entry?.track.id || "";
    updateState((state) => {
      let next = replaceReviewTracks(state, session.itemId, previousId ? [previousId] : [], entry
        ? [previewTrack(entry.track)] : []);
      const summary = counts();
      next = patchTrackingState(next, {
        selectedTrackIds: entry ? [entry.track.id] : [],
        preannotationReview: {
          ...reviewState(state.presentation?.tracking?.preannotationReview),
          ...summary,
          status: entry ? "review" : summary.pendingCount ? "batch-complete" : "complete",
          current: entry ? currentReview(entry) : null,
          error: "",
        },
      });
      return next;
    });
    if (entry) options.seekToMatchMs?.(entry.track.startMs);
    return true;
  }

  async function open() {
    contextReplay.stop();
    const state = getState();
    const item = selectedTrackingItem(state);
    const sourceSha256 = trackingSourceFingerprint(state);
    const clipId = String(item?.clipId || item?.clip?.id || "");
    const angleId = String(state.mediaProduction?.activeAngleId || "primary");
    if (!item || !clipId || !sourceSha256) {
      patchReview({
        status: "error",
        error: !item
          ? "Select one presentation clip first."
          : !clipId
            ? "The selected presentation item has no clip identity."
          : "Reconnect and prepare the exact normalized benchmark clip first.",
      });
      return false;
    }
    patchReview({ status: "loading", error: "" });
    try {
      const files = await pickFiles({ sourceSha256 });
      const imported = await importCase({
        ...files,
        sourceSha256,
        itemId: item.id,
        clipId,
        angleId,
      }, { cryptoApi: getWindow()?.crypto || globalThis.crypto });
      const currentState = getState();
      const currentItem = selectedTrackingItem(currentState);
      if (currentItem?.id !== item.id
        || String(currentItem?.clipId || currentItem?.clip?.id || "") !== clipId
        || String(currentState.mediaProduction?.activeAngleId || "primary") !== angleId
        || trackingSourceFingerprint(currentState) !== sourceSha256) {
        invalid("The selected clip or video source changed while preannotation was opening.");
      }
      const entries = prioritizeTrackingPreannotationReviewEntries([
        ...imported.tracks.map((track) => ({ track, associationStatus: "associated" })),
        ...imported.queue.map((entry) => ({ track: entry.track, associationStatus: "unassociated" })),
      ]);
      const prioritySummary = summarizeTrackingPreannotationReviewPriorities(entries);
      const identity = {
        itemId: item.id,
        clipId,
        angleId,
        sourceSha256: imported.sourceSha256,
        workspaceSha256: imported.workspaceSha256,
        caseId: imported.caseId,
      };
      const restored = await draftController.restore(identity);
      const scope = restored.scope;
      let restoredDraft = restored.draft;
      let draftError = restored.error;
      const latestState = getState();
      const latestItem = selectedTrackingItem(latestState);
      if (latestItem?.id !== item.id
        || String(latestItem?.clipId || latestItem?.clip?.id || "") !== clipId
        || String(latestState.mediaProduction?.activeAngleId || "primary") !== angleId
        || trackingSourceFingerprint(latestState) !== sourceSha256) {
        invalid("The selected clip or video source changed while preannotation was opening.");
      }
      const previousSession = session;
      if (previousSession?.currentId) {
        updateState((current) => replaceReviewTracks(
          current,
          previousSession.itemId,
          [previousSession.currentId],
          [],
        ));
      }
      const savedTracks = (latestItem.objectTracks || []).filter((track) => (
        track.metadata?.preannotationWorkspaceSha256 === imported.workspaceSha256
        && track.metadata?.preannotationCaseId === imported.caseId
        && track.metadata?.preannotationReviewState === "saved-review"
      ));
      const savedSuggestionIds = new Set(savedTracks.map((track) => track.metadata?.preannotationSuggestionId));
      const existingSavedIds = new Set(entries.filter((entry) => (
        savedTracks.some((track) => track.id === entry.track.id)
        || savedSuggestionIds.has(entry.track.metadata?.preannotationSuggestionId)
      )).map((entry) => entry.track.id));
      let decisionRestore;
      try {
        decisionRestore = restoreTrackingPreannotationReviewDecisions(entries, existingSavedIds, restoredDraft);
      } catch (error) {
        restoredDraft = null;
        decisionRestore = restoreTrackingPreannotationReviewDecisions(entries, existingSavedIds, null);
        draftError = error?.message || "Saved review progress could not be matched to this workspace.";
      }
      const batch = createTrackingPreannotationReviewBatch(entries, decisionRestore.decisions);
      session = {
        itemId: item.id,
        clipId,
        angleId,
        scope,
        sourceSha256: imported.sourceSha256,
        workspaceSha256: imported.workspaceSha256,
        caseId: imported.caseId,
        campaign: imported.campaign || null,
        entries,
        decisions: decisionRestore.decisions,
        history: decisionRestore.history,
        ...batch,
        currentId: "",
        draftRevision: 0,
      };
      const campaign = await campaignController.open(session, counts());
      const openedState = getState();
      const openedItem = selectedTrackingItem(openedState);
      if (openedItem?.id !== item.id
        || String(openedItem?.clipId || openedItem?.clip?.id || "") !== clipId
        || String(openedState.mediaProduction?.activeAngleId || "primary") !== angleId
        || trackingSourceFingerprint(openedState) !== sourceSha256) {
        invalid("The selected clip or video source changed while preannotation was opening.");
      }
      patchReview({
        status: "review",
        caseId: imported.caseId,
        workspaceSha256: imported.workspaceSha256,
        associatedTrackCount: imported.summary.associatedTrackCount,
        unassociatedObservationCount: imported.summary.unassociatedObservationCount,
        ...prioritySummary,
        ...counts(),
        draftStatus: scope ? draftError ? "error" : restoredDraft ? "restored" : "ready" : "session-only",
        draftError: draftError || (scope ? "" : "Sign in to keep review progress after this browser session."),
        restoredDecisionCount: decisionRestore.restoredDecisionCount,
        campaign,
        current: null,
        error: "",
      });
      return show(pendingIndex(0));
    } catch (error) {
      if (error?.name === "AbortError") {
        patchReview({ status: session ? "review" : "idle", error: "" });
        return false;
      }
      patchReview({ status: "error", error: error?.message || "Preannotation review could not be opened." });
      return false;
    }
  }

  function decide(decision) {
    if (!sync()) return false;
    const current = entryById(session?.currentId);
    if (!session || !current || !["accepted", "rejected"].includes(decision)) return false;
    session.decisions.set(current.track.id, decision);
    session.history.push({ id: current.track.id, decision });
    campaignController.record(session, decision === "accepted" ? "accept" : "reject");
    updateState((state) => {
      const addition = decision === "accepted" ? [acceptedTrack(current.track)] : [];
      return replaceReviewTracks(state, session.itemId, [current.track.id], addition);
    });
    const currentIndex = session.entries.indexOf(current);
    const shown = show(pendingIndex(currentIndex + 1));
    void saveDraftProgress();
    return shown;
  }

  function undo() {
    if (!sync()) return false;
    if (!session?.history.length) return false;
    let previous = null;
    while (session.history.length && !previous) {
      const candidate = session.history.pop();
      if (session.decisions.get(candidate.id) !== "saved") previous = candidate;
    }
    if (!previous) return false;
    session.decisions.delete(previous.id);
    campaignController.record(session, "undo");
    updateState((state) => replaceReviewTracks(state, session.itemId, [previous.id], []));
    const index = session.entries.findIndex((entry) => entry.track.id === previous.id);
    const shown = show(index);
    void saveDraftProgress();
    return shown;
  }

  function next() {
    if (!sync()) return false;
    if (!session) return false;
    const currentIndex = session.entries.findIndex((entry) => entry.track.id === session.currentId);
    const shown = show(pendingIndex(Math.max(0, currentIndex + 1)));
    if (shown && currentIndex >= 0) campaignController.record(session, "defer");
    if (shown && currentIndex >= 0) void saveDraftProgress();
    return shown;
  }

  function previewContext() {
    if (!sync()) return false;
    const current = entryById(session?.currentId);
    return contextReplay.start(current?.track || null);
  }

  function handleField(field = "", element = null) {
    if (field === "preannotation-scope") return sync() && refreshBatch({ reviewScope: element?.value });
    if (field === "preannotation-batch-size") return sync() && refreshBatch({ batchSize: element?.value });
    return false;
  }

  async function saveCurrentForCorrection() {
    if (!sync()) return false;
    const current = entryById(session?.currentId);
    if (!session || !current || typeof options.persistTrack !== "function") return false;
    contextReplay.stop();
    patchReview({ status: "saving", error: "" });
    try {
      const requested = acceptedTrack(current.track, "saved-review");
      const saved = normalizeObjectTrack(await options.persistTrack(requested) || requested);
      session.decisions.set(current.track.id, "saved");
      session.history = session.history.filter((entry) => entry.id !== current.track.id);
      session.currentId = "";
      updateState((state) => {
        const next = replaceReviewTracks(state, session.itemId, [current.track.id], [saved]);
        return patchTrackingState(next, {
          selectedTrackIds: [saved.id],
          preannotationReview: {
            ...reviewState(state.presentation?.tracking?.preannotationReview),
            ...counts(),
            status: "correcting",
            current: currentReview(current, { id: saved.id, savedForCorrection: true }),
            error: "",
          },
        });
      });
      campaignController.record(session, "correction-handoff");
      await saveDraftProgress();
      options.onEvidenceChanged?.(session.itemId);
      return true;
    } catch (error) {
      patchReview({
        status: "error",
        ...counts(),
        error: error?.message || "The current review track could not be saved for correction.",
      });
      return false;
    }
  }

  async function saveAccepted() {
    if (!sync()) return false;
    if (!session || typeof options.persistTrack !== "function") return false;
    const entries = session.entries.filter((entry) => session.decisions.get(entry.track.id) === "accepted");
    if (!entries.length) return false;
    patchReview({ status: "saving", error: "" });
    let savedTrackCount = 0;
    try {
      for (const entry of entries) {
        const requested = acceptedTrack(entry.track, "saved-review");
        const track = normalizeObjectTrack(await options.persistTrack(requested) || requested);
        session.decisions.set(entry.track.id, "saved");
        savedTrackCount += 1;
        updateState((state) => replaceReviewTracks(state, session.itemId, [entry.track.id], [track]));
      }
      session.history = session.history.filter((entry) => session.decisions.get(entry.id) !== "saved");
      updateState((state) => {
        const summary = counts();
        return patchTrackingState(state, {
          preannotationReview: {
            ...reviewState(state.presentation?.tracking?.preannotationReview),
            ...summary,
            status: session.currentId ? "review" : summary.pendingCount ? "batch-complete" : "complete",
            error: "",
          },
        });
      });
      campaignController.record(session, "batch-save", { savedTrackCount: entries.length });
      await saveDraftProgress();
      options.onEvidenceChanged?.(session.itemId);
      return true;
    } catch (error) {
      session.history = session.history.filter((entry) => session.decisions.get(entry.id) !== "saved");
      patchReview({ status: "error", ...counts(), error: error?.message || "Accepted review tracks could not be saved." });
      if (savedTrackCount) campaignController.record(session, "batch-save", { savedTrackCount });
      await saveDraftProgress();
      if (savedTrackCount) options.onEvidenceChanged?.(session.itemId);
      return false;
    }
  }

  function handleAction(action = "") {
    if (action === "preannotation-open") { void open(); return true; }
    if (action === "preannotation-accept") return decide("accepted");
    if (action === "preannotation-reject") return decide("rejected");
    if (action === "preannotation-next") return next();
    if (action === "preannotation-preview-context") return previewContext();
    if (action === "preannotation-next-batch") return sync() && refreshBatch();
    if (action === "preannotation-undo") return undo();
    if (action === "preannotation-save-current") { void saveCurrentForCorrection(); return true; }
    if (action === "preannotation-save") { void saveAccepted(); return true; }
    return false;
  }

  function handleShortcut(event = {}) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey
      || event.altKey || event.shiftKey || shouldIgnoreShortcutTarget(event.target)) return false;
    const action = TRACKING_PREANNOTATION_SHORTCUT_ACTIONS[String(event.key || "").toLowerCase()];
    if (!action) return false;
    const review = reviewState(getState().presentation?.tracking?.preannotationReview);
    if (!review.workspaceSha256 || ["idle", "loading", "saving"].includes(review.status)) return false;
    if (["preannotation-accept", "preannotation-reject", "preannotation-next", "preannotation-preview-context", "preannotation-save-current"]
      .includes(action) && !review.current) return false;
    if (action === "preannotation-save" && Number(review.acceptedCount) <= 0) return false;
    if (!handleAction(action)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  return {
    flushDraft: async () => (await draftController.flush()) && Boolean(await campaignController.flush()),
    handleAction,
    handleField,
    handleShortcut,
    open,
    previewContext,
    saveAccepted,
    saveCurrentForCorrection,
    stopContextPreview: contextReplay.stop,
    sync,
  };
}
