const internalInvoke = globalThis.__TAURI_INTERNALS__?.invoke;

export const nativeBridgeAvailable = typeof internalInvoke === "function";

function requireNativeInvoke() {
  if (typeof internalInvoke !== "function") {
    throw new Error("The typed native bridge is unavailable.");
  }
  return internalInvoke;
}

function call(command, payload) {
  return requireNativeInvoke()(command, payload);
}

export const activeNative = Object.freeze({
  runtimeInfo: () => call("desktop_runtime_info"),
  bootstrapStatus: () => call("desktop_bootstrap_status"),
  prepareShellUpdate: () => call("desktop_prepare_shell_update"),
  openRecovery: () => call("desktop_open_recovery"),
  sessionAuthority: () => call("desktop_session_authority"),
  readSelectedSession: (context) => call("desktop_read_selected_session", { context }),
  sessionSyncStatus: (context) => call("desktop_session_sync_status", { context }),
  applySessionOperation: (request) => call("desktop_apply_session_operation", { request }),
  recordProbe: (probe) => call("record_spike_probe", { probe }),
});

export const bundledNative = Object.freeze({
  runtimeInfo: () => call("desktop_runtime_info"),
  recordProbe: (probe) => call("record_spike_probe", { probe }),
});

export const candidateNative = Object.freeze({
  status: () => call("desktop_candidate_status"),
  confirm: (request) => call("desktop_candidate_confirm", { request }),
  reportFailure: (request) => call("desktop_candidate_report_failure", { request }),
});

export const candidateIsolationProbe = Object.freeze({
  sessionAuthority: () => call("desktop_session_authority"),
  sessionRead: () => call("desktop_read_selected_session", { context: {} }),
  sessionSyncStatus: () => call("desktop_session_sync_status", { context: {} }),
  sessionOperation: () => call("desktop_apply_session_operation", { request: {} }),
  outbox: () => call("desktop_outbox_debug"),
  obsoleteActiveConfirmation: () => call("desktop_confirm_shell_candidate", { request: {} }),
});

export const recoveryNative = Object.freeze({
  status: () => call("desktop_recovery_status"),
  readSelectedSession: () => call("desktop_recovery_read_selected_session"),
});

export const negativeProbeNative = Object.freeze({
  invokeKnownButUngranted: () => call("internal_denied_probe"),
});
