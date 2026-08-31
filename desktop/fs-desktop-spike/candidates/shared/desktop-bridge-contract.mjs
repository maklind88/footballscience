const allowedCandidates = new Set(["bundled", "hosted"]);
const allowedBootModes = new Set(["online", "offline", "unknown"]);

function requiredText(value, label, maxLength = 120) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${label} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

export function validateRuntimeInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Desktop runtime information must be an object.");
  }
  return Object.freeze({
    nativeAppVersion: requiredText(value.nativeAppVersion, "nativeAppVersion", 40),
    runtime: requiredText(value.runtime, "runtime", 40),
    localSchemaVersion: Number(value.localSchemaVersion) || 0,
    syncProtocolVersion: Number(value.syncProtocolVersion) || 0,
    capabilities: Object.freeze(
      (Array.isArray(value.capabilities) ? value.capabilities : [])
        .map((entry) => requiredText(entry, "capability", 80))
        .sort()
    ),
  });
}

export function validateSpikeProbe(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Spike probe must be an object.");
  }
  const candidate = requiredText(value.candidate, "candidate", 20);
  const bootMode = requiredText(value.bootMode, "bootMode", 20);
  if (!allowedCandidates.has(candidate)) throw new TypeError("Unknown spike candidate.");
  if (!allowedBootModes.has(bootMode)) throw new TypeError("Unknown boot mode.");
  return Object.freeze({
    candidate,
    bootMode,
    shellVersion: requiredText(value.shellVersion, "shellVersion", 40),
    cacheVersion: requiredText(value.cacheVersion, "cacheVersion", 80),
    payloadBuildId: requiredText(value.payloadBuildId, "payloadBuildId", 80),
    cachedPayload: Boolean(value.cachedPayload),
    serviceWorkerControlled: Boolean(value.serviceWorkerControlled),
    unauthorizedCommandRejected: value.unauthorizedCommandRejected === true,
  });
}

export async function verifyDeniedNativeCommand(win = globalThis) {
  const invoke = tauriInvoke(win);
  if (!invoke) return true;
  try {
    await invoke("internal_denied_probe");
    return false;
  } catch {
    return true;
  }
}

function tauriInvoke(win) {
  const invoke = win?.__TAURI__?.core?.invoke;
  return typeof invoke === "function" ? invoke.bind(win.__TAURI__.core) : null;
}

export function createDesktopBridge(win = globalThis) {
  const invoke = tauriInvoke(win);
  return Object.freeze({
    isDesktop: Boolean(invoke),
    async getRuntimeInfo() {
      if (!invoke) {
        return Object.freeze({
          nativeAppVersion: "web",
          runtime: "browser",
          localSchemaVersion: 0,
          syncProtocolVersion: 0,
          capabilities: Object.freeze([]),
        });
      }
      return validateRuntimeInfo(await invoke("desktop_runtime_info"));
    },
    async recordProbe(probe) {
      if (!invoke) return false;
      await invoke("record_spike_probe", { probe: validateSpikeProbe(probe) });
      return true;
    },
  });
}
