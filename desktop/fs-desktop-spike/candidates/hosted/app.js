import { createDesktopBridge, verifyDeniedNativeCommand } from "/shared/desktop-bridge-contract.mjs";

const shellVersion = "hosted-spike-v4";
const expectedCacheVersion = "fs-desktop-hosted-shell-v3";
const payloadKey = "fs-desktop-hosted-spike-payload-v1";
const ui = Object.fromEntries(["bootMode", "serviceWorker", "payload", "bridge", "details"].map((id) => [id, document.getElementById(id)]));

async function registerOfflineShell() {
  if (!("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  return Boolean(navigator.serviceWorker.controller);
}

async function readPayload() {
  try {
    const response = await fetch(`/payload.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Payload request failed (${response.status}).`);
    const payload = await response.json();
    const servedFromCache = response.headers.get("X-FS-Spike-Source") === "cache";
    localStorage.setItem(payloadKey, JSON.stringify(payload));
    return { bootMode: servedFromCache ? "offline" : "online", cachedPayload: servedFromCache, payload };
  } catch {
    const cached = JSON.parse(localStorage.getItem(payloadKey) || "null");
    return { bootMode: "offline", cachedPayload: Boolean(cached), payload: cached };
  }
}

async function boot() {
  const serviceWorkerControlled = await registerOfflineShell().catch(() => false);
  const bridge = createDesktopBridge(window);
  const runtime = await bridge.getRuntimeInfo();
  const unauthorizedCommandRejected = await verifyDeniedNativeCommand(window);
  const cacheVersion = (await caches.keys()).find((entry) => entry === expectedCacheVersion) || "missing";
  ui.serviceWorker.textContent = serviceWorkerControlled ? "controlled" : "registered / activating";
  ui.bridge.textContent = bridge.isDesktop ? "restricted native bridge available" : "browser fallback";
  ui.details.textContent = JSON.stringify(runtime, null, 2);
  let lastBootMode = "";
  let checkInFlight = false;
  const updateConnectivity = async () => {
    if (checkInFlight) return;
    checkInFlight = true;
    try {
      const payloadState = await readPayload();
      ui.bootMode.textContent = payloadState.bootMode;
      ui.payload.textContent = payloadState.payload?.message || "unavailable";
      if (payloadState.bootMode !== lastBootMode) {
        lastBootMode = payloadState.bootMode;
        await bridge.recordProbe({
          candidate: "hosted",
          bootMode: payloadState.bootMode,
          shellVersion,
          cacheVersion,
          payloadBuildId: payloadState.payload?.buildId || "missing",
          cachedPayload: payloadState.cachedPayload,
          serviceWorkerControlled,
          unauthorizedCommandRejected,
        });
      }
    } finally {
      checkInFlight = false;
    }
  };
  await updateConnectivity();
  window.setInterval(() => updateConnectivity().catch(() => {}), 1000);
}

boot().catch((error) => {
  ui.details.textContent = error?.stack || error?.message || String(error);
});
