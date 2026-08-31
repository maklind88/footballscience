import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { importTrackingPreannotationReviewCase } from "../services/trackingPreannotationReviewService.js";
import {
  prioritizeTrackingPreannotationReviewEntries,
  summarizeTrackingPreannotationReviewPriorities,
} from "../services/trackingPreannotationReviewPriorityService.js";
import { trackingSourceFingerprint } from "./trackingGroundTruthController.js";
import {
  createTrackingPreannotationReviewDraftController,
  restoreTrackingPreannotationReviewDecisions,
} from "./trackingPreannotationReviewDraftController.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
  trackingItemById,
} from "./trackingControllerHelpers.js";

function invalid(message) {
  throw new Error(message);
}

function reviewState(value = {}) {
  return {
    status: String(value.status || "idle"),
    caseId: String(value.caseId || ""),
    workspaceSha256: String(value.workspaceSha256 || ""),
    associatedTrackCount: Math.max(0, Number(value.associatedTrackCount) || 0),
    unassociatedObservationCount: Math.max(0, Number(value.unassociatedObservationCount) || 0),
    criticalEntityCount: Math.max(0, Number(value.criticalEntityCount) || 0),
    fragmentCount: Math.max(0, Number(value.fragmentCount) || 0),
    lowConfidenceCount: Math.max(0, Number(value.lowConfidenceCount) || 0),
    pendingCount: Math.max(0, Number(value.pendingCount) || 0),
    acceptedCount: Math.max(0, Number(value.acceptedCount) || 0),
    rejectedCount: Math.max(0, Number(value.rejectedCount) || 0),
    savedCount: Math.max(0, Number(value.savedCount) || 0),
    draftStatus: String(value.draftStatus || "idle"),
    draftError: String(value.draftError || ""),
    restoredDecisionCount: Math.max(0, Number(value.restoredDecisionCount) || 0),
    current: value.current && typeof value.current === "object" ? value.current : null,
    error: String(value.error || ""),
  };
}

async function selectedFiles(win = globalThis.window) {
  if (typeof win?.showOpenFilePicker !== "function") {
    invalid("This browser cannot open a sealed preannotation workspace.");
  }
  const handles = await win.showOpenFilePicker({
    multiple: true,
    types: [{
      description: "FS Player preannotation review",
      accept: {
        "application/json": [".json"],
        "text/plain": [".txt"],
      },
    }],
  });
  if (handles.length !== 4) {
    invalid("Select annotation-pack.json, workspace.json, one track-map JSON, and its MOT suggestion file.");
  }
  const files = await Promise.all(handles.map((handle) => handle.getFile()));
  const pack = files.find((file) => file.name === "annotation-pack.json");
  const workspace = files.find((file) => file.name === "workspace.json");
  const trackMap = files.find((file) => file.name.endsWith(".track-map.json"));
  const suggestion = files.find((file) => file.name.endsWith(".suggestions.mot.txt"));
  const caseId = String(trackMap?.name || "").replace(/\.track-map\.json$/, "");
  if (!pack || !workspace || !trackMap || !suggestion
    || suggestion.name !== `${caseId}.suggestions.mot.txt`) {
    invalid("The selected preannotation files do not describe one matching case.");
  }
  const [packBytes, workspaceBytes, trackMapBytes, suggestionBytes] = await Promise.all([
    pack.arrayBuffer(),
    workspace.arrayBuffer(),
    trackMap.arrayBuffer(),
    suggestion.arrayBuffer(),
  ]);
  return { packBytes, workspaceBytes, trackMapBytes, suggestionBytes, caseId };
}

function previewTrack(track = {}) {
  return normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      preannotationReviewPreview: true,
      preannotationReviewState: "pending",
    },
  });
}

function acceptedTrack(track = {}, state = "accepted-local") {
  return normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      preannotationReviewPreview: false,
      preannotationReviewState: state,
    },
  });
}

function currentReview(entry = {}, overrides = {}) {
  return {
    id: entry.track.id,
    entityType: entry.track.entityType,
    associationStatus: entry.associationStatus,
    atMs: entry.track.startMs,
    confidence: entry.track.confidence,
    pointCount: entry.track.segments.reduce((sum, segment) => sum + segment.points.length, 0),
    priorityCode: entry.priority?.code || "",
    priorityLabel: entry.priority?.label || "",
    ...overrides,
  };
}

export function createTrackingPreannotationReviewController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getWindow = options.getWindow || (() => globalThis.window);
  const importCase = options.importCase || importTrackingPreannotationReviewCase;
  const pickFiles = options.pickFiles || (() => selectedFiles(getWindow()));
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
    return draftController.save(target, (patch) => {
      if (session === target) patchReview(patch);
    });
  }

  function counts() {
    const values = [...(session?.decisions?.values() || [])];
    return {
      pendingCount: Math.max(0, (session?.entries.length || 0) - values.length),
      acceptedCount: values.filter((value) => value === "accepted").length,
      rejectedCount: values.filter((value) => value === "rejected").length,
      savedCount: values.filter((value) => value === "saved").length,
    };
  }

  function entryById(id = "") {
    return session?.entries.find((entry) => entry.track.id === id) || null;
  }

  function pendingIndex(start = 0) {
    if (!session?.entries.length) return -1;
    for (let offset = 0; offset < session.entries.length; offset += 1) {
      const index = (start + offset) % session.entries.length;
      if (!session.decisions.has(session.entries[index].track.id)) return index;
    }
    return -1;
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
    if (!session) return false;
    const previousId = session.currentId;
    const entry = index >= 0 ? session.entries[index] : null;
    session.currentId = entry?.track.id || "";
    updateState((state) => {
      let next = replaceReviewTracks(state, session.itemId, previousId ? [previousId] : [], entry
        ? [previewTrack(entry.track)] : []);
      next = patchTrackingState(next, {
        selectedTrackIds: entry ? [entry.track.id] : [],
        preannotationReview: {
          ...reviewState(state.presentation?.tracking?.preannotationReview),
          ...counts(),
          status: entry ? "review" : "complete",
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
      const files = await pickFiles();
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
      session = {
        itemId: item.id,
        clipId,
        angleId,
        scope,
        sourceSha256: imported.sourceSha256,
        workspaceSha256: imported.workspaceSha256,
        caseId: imported.caseId,
        entries,
        decisions: decisionRestore.decisions,
        history: decisionRestore.history,
        currentId: "",
        draftRevision: 0,
      };
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
    return show(pendingIndex(Math.max(0, currentIndex + 1)));
  }

  async function saveCurrentForCorrection() {
    if (!sync()) return false;
    const current = entryById(session?.currentId);
    if (!session || !current || typeof options.persistTrack !== "function") return false;
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
    let savedAny = false;
    try {
      for (const entry of entries) {
        const requested = acceptedTrack(entry.track, "saved-review");
        const track = normalizeObjectTrack(await options.persistTrack(requested) || requested);
        session.decisions.set(entry.track.id, "saved");
        savedAny = true;
        updateState((state) => replaceReviewTracks(state, session.itemId, [entry.track.id], [track]));
      }
      session.history = session.history.filter((entry) => session.decisions.get(entry.id) !== "saved");
      updateState((state) => {
        const summary = counts();
        return patchTrackingState(state, {
          preannotationReview: {
            ...reviewState(state.presentation?.tracking?.preannotationReview),
            ...summary,
            status: summary.pendingCount ? "review" : "complete",
            error: "",
          },
        });
      });
      await saveDraftProgress();
      options.onEvidenceChanged?.(session.itemId);
      return true;
    } catch (error) {
      session.history = session.history.filter((entry) => session.decisions.get(entry.id) !== "saved");
      patchReview({ status: "error", ...counts(), error: error?.message || "Accepted review tracks could not be saved." });
      await saveDraftProgress();
      if (savedAny) options.onEvidenceChanged?.(session.itemId);
      return false;
    }
  }

  function handleAction(action = "") {
    if (action === "preannotation-open") { void open(); return true; }
    if (action === "preannotation-accept") return decide("accepted");
    if (action === "preannotation-reject") return decide("rejected");
    if (action === "preannotation-next") return next();
    if (action === "preannotation-undo") return undo();
    if (action === "preannotation-save-current") { void saveCurrentForCorrection(); return true; }
    if (action === "preannotation-save") { void saveAccepted(); return true; }
    return false;
  }

  return {
    flushDraft: draftController.flush,
    handleAction,
    open,
    saveAccepted,
    saveCurrentForCorrection,
    sync,
  };
}
