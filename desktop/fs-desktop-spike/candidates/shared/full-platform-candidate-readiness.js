(() => {
  const candidateOrigin = location.protocol === "fs-candidate:"
    || location.hostname === "fs-candidate.localhost";
  if (!candidateOrigin) return;
  const invoke = globalThis.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") return;

  const denied = async (command, payload = {}) => {
    try {
      await invoke(command, payload);
      return false;
    } catch {
      return true;
    }
  };

  (async () => {
    let status;
    try {
      status = await invoke("desktop_candidate_status");
      if (status?.candidateBuildId?.includes("hanging")) return;
      const expected = ["candidate.confirm", "candidate.failure", "candidate.status"];
      if (JSON.stringify(status?.candidateCapabilities) !== JSON.stringify(expected)
        || status?.localSchemaVersion !== 3
        || status?.syncProtocolVersion !== 1) {
        throw new Error("candidate-compatibility-mismatch");
      }
      const negativeChecks = {
        apiRequestDenied: await denied("desktop_api_request", { request: {} }),
        authSessionDenied: await denied("desktop_auth_status"),
        sessionAuthorityDenied: await denied("desktop_session_authority"),
        sessionReadDenied: await denied("desktop_read_selected_session", { context: {} }),
        sessionSyncStatusDenied: await denied("desktop_session_sync_status", { context: {} }),
        sessionOperationDenied: await denied("desktop_apply_session_operation", { request: {} }),
        outboxDenied: await denied("desktop_outbox_debug"),
        activeConfirmationDenied: await denied("desktop_confirm_shell_candidate", { request: {} }),
      };
      if (!Object.values(negativeChecks).every(Boolean)) throw new Error("candidate-isolation-proof-failed");
      await invoke("desktop_candidate_confirm", {
        request: {
          schema: "fs-desktop-candidate-ready-v3",
          healthNonce: status.healthNonce,
          shellFullyInitialized: true,
          negativeChecks,
        },
      });
    } catch {
      if (status?.healthNonce) {
        await invoke("desktop_candidate_report_failure", {
          request: { healthNonce: status.healthNonce, failureCode: "initialization-failed" },
        }).catch(() => {});
      }
    }
  })();
})();
