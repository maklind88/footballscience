import { patchTrackingState, trackingItemById } from "./trackingControllerHelpers.js";
import { mediaAnglesForState } from "../services/mediaProductionService.js";

const fingerprintPattern = /^[a-f0-9]{64}$/i;
const identifierPattern = /^[a-z0-9][a-z0-9._:-]*$/i;

function identifier(value = "") {
  const text = String(value || "").trim();
  return text && text.length <= 160 && identifierPattern.test(text) ? text : "";
}

function handoffFromElement(element = null) {
  const data = element?.dataset || {};
  const caseId = identifier(data.videoAnalysisGroundTruthHandoffCaseId);
  const sourceSha256 = String(data.videoAnalysisGroundTruthHandoffSourceSha256 || "").trim().toLowerCase();
  const itemId = identifier(data.videoAnalysisGroundTruthHandoffItemId);
  const clipId = identifier(data.videoAnalysisGroundTruthHandoffClipId);
  const angleId = identifier(data.videoAnalysisGroundTruthHandoffAngleId);
  const contextCount = [itemId, clipId, angleId].filter(Boolean).length;
  if (!caseId || !fingerprintPattern.test(sourceSha256)) {
    throw new Error("The next review case is missing its sealed source identity.");
  }
  if (contextCount && contextCount !== 3) {
    throw new Error("The next review case has an incomplete resume context.");
  }
  return {
    caseId,
    sourceSha256,
    itemId,
    clipId,
    angleId,
    resumeContextReady: contextCount === 3,
    status: "awaiting-source",
  };
}

export function createTrackingGroundTruthHandoffController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const openLocalVideoPicker = options.openLocalVideoPicker || null;

  function fail(message) {
    updateState((state) => patchTrackingState(state, { error: message }));
    return false;
  }

  function validate(value = {}) {
    const state = getState();
    const handoff = state.presentation?.tracking?.groundTruthHandoff;
    if (!handoff) return true;
    if (handoff.sourceSha256 !== String(value.sourceSha256 || "").toLowerCase()) {
      return fail(`Reconnect the sealed ${handoff.caseId} source before opening its review workspace.`);
    }
    if (!handoff.resumeContextReady) return true;
    if (state.presentation?.selectedItemId !== handoff.itemId
      || state.presentation?.selectedClipId !== handoff.clipId
      || String(state.mediaProduction?.activeAngleId || "") !== handoff.angleId) {
      return fail(`Restore the saved ${handoff.caseId} clip context before opening its review workspace.`);
    }
    return true;
  }

  function prepare(value = {}) {
    const state = getState();
    const handoff = state.presentation?.tracking?.groundTruthHandoff;
    if (!handoff) return true;
    if (handoff.sourceSha256 !== String(value.sourceSha256 || "").toLowerCase()) {
      return fail(`Reconnect the sealed ${handoff.caseId} source before opening its review workspace.`);
    }
    if (!handoff.resumeContextReady) return true;
    const item = trackingItemById(state, handoff.itemId);
    const clipId = String(item?.clipId || item?.clip?.id || "");
    if (!item || clipId !== handoff.clipId) {
      return fail(`The saved ${handoff.caseId} presentation item is no longer available.`);
    }
    if (!mediaAnglesForState(state).some((angle) => angle.id === handoff.angleId)) {
      return fail(`The saved ${handoff.caseId} camera angle is no longer available.`);
    }
    updateState((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        selectedItemId: handoff.itemId,
        selectedClipId: handoff.clipId,
        tracking: {
          ...(current.presentation?.tracking || {}),
          error: "",
        },
      },
      mediaProduction: {
        ...(current.mediaProduction || {}),
        activeAngleId: handoff.angleId,
      },
    }));
    return true;
  }

  function start(element = null) {
    let handoff;
    try {
      handoff = handoffFromElement(element);
    } catch (error) {
      fail(error?.message || "The next review case could not be opened.");
      return true;
    }
    if (!openLocalVideoPicker) {
      fail("Local video reconnection is not available.");
      return true;
    }
    updateState((state) => patchTrackingState(state, {
      groundTruthHandoff: handoff,
      error: "",
    }));
    Promise.resolve().then(() => openLocalVideoPicker()).catch((error) => {
      fail(error?.message || "The local video picker could not be opened.");
    });
    return true;
  }

  function complete(value = {}) {
    const handoff = getState().presentation?.tracking?.groundTruthHandoff;
    if (!handoff
      || handoff.caseId !== String(value.caseId || "")
      || handoff.sourceSha256 !== String(value.sourceSha256 || "").toLowerCase()) return false;
    if (handoff.resumeContextReady && (
      handoff.itemId !== String(value.itemId || "")
      || handoff.clipId !== String(value.clipId || "")
      || handoff.angleId !== String(value.angleId || "")
    )) return false;
    updateState((state) => patchTrackingState(state, {
      groundTruthHandoff: null,
      error: "",
    }));
    return true;
  }

  return {
    complete,
    handleAction: (action, element) => (
      action === "ground-truth-handoff-reconnect" ? start(element) : false
    ),
    prepare,
    start,
    validate,
  };
}
