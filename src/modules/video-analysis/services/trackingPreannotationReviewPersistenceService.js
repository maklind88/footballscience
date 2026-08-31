const durableDraftStatuses = new Set(["ready", "restored"]);

export function trackingPreannotationReviewPersistence(value = {}) {
  const hasWorkspace = Boolean(value.workspaceSha256);
  const draftStatus = String(value.draftStatus || "idle");
  const campaignStatus = String(value.campaign?.status || "idle");
  const error = String(value.draftError || value.campaign?.error || "");
  if (!hasWorkspace) {
    return {
      status: "idle",
      ready: false,
      retryable: false,
      message: "Open the sealed review workspace before preparing ground truth.",
    };
  }
  if (draftStatus === "error" || campaignStatus === "error") {
    return {
      status: "error",
      ready: false,
      retryable: true,
      message: `Review progress could not be protected on this device.${error ? ` ${error}` : " Retry the save before preparing ground truth."}`,
    };
  }
  if (draftStatus === "session-only" || campaignStatus === "session-only") {
    return {
      status: "session-only",
      ready: false,
      retryable: false,
      message: "Sign in and reopen the workspace to protect review progress before preparing ground truth.",
    };
  }
  if (draftStatus === "saving" || campaignStatus === "saving") {
    return {
      status: "saving",
      ready: false,
      retryable: false,
      message: "Wait for review progress to finish saving before preparing ground truth.",
    };
  }
  if (durableDraftStatuses.has(draftStatus) && campaignStatus === "ready") {
    return {
      status: "ready",
      ready: true,
      retryable: false,
      message: "Review decisions are protected on this device.",
    };
  }
  return {
    status: "pending",
    ready: false,
    retryable: false,
    message: "Protect review progress on this device before preparing ground truth.",
  };
}
