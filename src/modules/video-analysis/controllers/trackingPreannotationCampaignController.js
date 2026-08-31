import {
  listLocalTrackingPreannotationCampaignCases,
  saveLocalTrackingPreannotationCampaignCase,
} from "../services/localTrackingPreannotationCampaignStore.js";
import { trackingPreannotationCampaignProgress } from "../services/trackingPreannotationCampaignService.js";

function caseSnapshot(session = {}, summary = {}, updatedAt = "") {
  return {
    workspaceSha256: session.campaign.workspaceSha256,
    packId: session.campaign.packId,
    caseId: session.caseId,
    itemId: session.itemId,
    clipId: session.clipId,
    angleId: session.angleId,
    sourceSha256: session.sourceSha256,
    totalSuggestionCount: session.entries.length,
    pendingCount: summary.pendingCount,
    acceptedCount: summary.acceptedCount,
    rejectedCount: summary.rejectedCount,
    savedCount: summary.savedCount,
    updatedAt,
  };
}

export function createTrackingPreannotationCampaignController(options = {}) {
  const getWindow = options.getWindow || (() => globalThis.window);
  const loadCases = options.loadCampaignCases || listLocalTrackingPreannotationCampaignCases;
  const saveCase = options.saveCampaignCase || saveLocalTrackingPreannotationCampaignCase;
  const now = options.now || Date.now;
  let records = [];
  let lastOperation = Promise.resolve(true);

  function view(session, summary, status = "ready", error = "", updatedAt = "") {
    if (!session?.campaign) return null;
    return trackingPreannotationCampaignProgress(session.campaign, records, {
      activeCaseId: session.caseId,
      current: caseSnapshot(session, summary, updatedAt),
      status,
      error,
    });
  }

  function replaceRecord(record) {
    records = [...records.filter((entry) => entry.caseId !== record.caseId), record];
  }

  async function persist(session, summary) {
    const record = await saveCase(session.scope, caseSnapshot(session, summary), {
      win: getWindow(),
      now,
    });
    replaceRecord(record);
    return view(session, summary, "ready", "", record.updatedAt);
  }

  async function open(session, summary) {
    if (!session?.campaign) return null;
    if (!session.scope) return view(session, summary, "session-only");
    try {
      await lastOperation;
      records = await loadCases(session.scope, session.campaign.workspaceSha256, getWindow());
      return await persist(session, summary);
    } catch (error) {
      return view(
        session,
        summary,
        "error",
        error?.message || "Campaign progress could not be restored on this device.",
      );
    }
  }

  function preview(session, summary) {
    return view(session, summary, session?.scope ? "saving" : "session-only");
  }

  function failed(session, summary) {
    return view(
      session,
      summary,
      "error",
      "Campaign progress was not saved because local review progress failed.",
    );
  }

  function save(session, summary) {
    if (!session?.campaign) return Promise.resolve(null);
    if (!session.scope) return Promise.resolve(view(session, summary, "session-only"));
    const target = session;
    const snapshot = { ...summary };
    lastOperation = lastOperation.catch(() => true).then(() => persist(target, snapshot));
    return lastOperation.catch((error) => view(
      target,
      snapshot,
      "error",
      error?.message || "Campaign progress could not be saved on this device.",
    ));
  }

  return {
    flush: () => lastOperation,
    failed,
    open,
    preview,
    save,
  };
}
