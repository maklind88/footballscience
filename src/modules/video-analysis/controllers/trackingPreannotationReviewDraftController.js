import {
  getLocalTrackingPreannotationReviewDraft,
  removeLocalTrackingPreannotationReviewDraft,
  saveLocalTrackingPreannotationReviewDraft,
} from "../services/localTrackingPreannotationReviewStore.js";
import { trackingWorkspaceTarget } from "../services/trackingWorkspaceScopeService.js";

function draftIdentity(value = {}) {
  return {
    itemId: value.itemId,
    clipId: value.clipId,
    angleId: value.angleId,
    sourceSha256: value.sourceSha256,
    workspaceSha256: value.workspaceSha256,
    caseId: value.caseId,
  };
}

function draftSnapshot(value = {}) {
  const active = new Map([...value.decisions].filter(([, decision]) => (
    decision === "accepted" || decision === "rejected"
  )));
  return {
    ...draftIdentity(value),
    totalSuggestionCount: value.entries.length,
    decisions: [...active].map(([trackId, decision]) => ({ trackId, decision })),
    history: value.history.filter((entry) => active.get(entry.id) === entry.decision)
      .map((entry) => ({ trackId: entry.id, decision: entry.decision })),
  };
}

export function createTrackingPreannotationReviewDraftController(options = {}) {
  const getState = options.getState || (() => ({}));
  const getContext = options.getContext || (() => ({}));
  const getWindow = options.getWindow || (() => globalThis.window);
  const getScope = options.getDraftScope || (() => (
    trackingWorkspaceTarget(getState(), getContext())?.scope || null
  ));
  const loadDraft = options.loadDraft || getLocalTrackingPreannotationReviewDraft;
  const saveDraft = options.saveDraft || saveLocalTrackingPreannotationReviewDraft;
  const removeDraft = options.removeDraft || removeLocalTrackingPreannotationReviewDraft;
  const now = options.now || Date.now;
  let writes = Promise.resolve(true);
  let lastOperation = writes;

  async function restore(identity = {}) {
    await lastOperation;
    const scope = getScope();
    if (!scope) {
      return {
        scope: null,
        draft: null,
        error: "Sign in to keep review progress after this browser session.",
      };
    }
    try {
      return { scope, draft: await loadDraft(scope, identity, getWindow()), error: "" };
    } catch (error) {
      return {
        scope,
        draft: null,
        error: error?.message || "Saved review progress could not be restored on this device.",
      };
    }
  }

  function save(session, onStatus = () => {}) {
    if (!session?.scope) {
      onStatus({
        draftStatus: "session-only",
        draftError: "Sign in to keep review progress after this browser session.",
      });
      return Promise.resolve(false);
    }
    const snapshot = draftSnapshot(session);
    const revision = ++session.draftRevision;
    onStatus({ draftStatus: "saving", draftError: "" });
    const write = writes.catch(() => true).then(() => (
      snapshot.decisions.length
        ? saveDraft(session.scope, snapshot, { win: getWindow(), now })
        : removeDraft(session.scope, snapshot, getWindow())
    ));
    writes = write;
    lastOperation = write.then(() => {
      if (revision === session.draftRevision) onStatus({ draftStatus: "ready", draftError: "" });
      return true;
    }).catch((error) => {
      if (revision === session.draftRevision) {
        onStatus({
          draftStatus: "error",
          draftError: error?.message || "Review progress could not be saved on this device.",
        });
      }
      return false;
    });
    return lastOperation;
  }

  return {
    flush: () => lastOperation,
    restore,
    save,
  };
}
