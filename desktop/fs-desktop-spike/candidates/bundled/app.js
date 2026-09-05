import { bundledNative, negativeProbeNative, activeNative } from "../shared/tauri-invoke.mjs";

const runtime = await bundledNative.runtimeInfo();
let unauthorizedCommandRejected = false;
try {
  await negativeProbeNative.invokeKnownButUngranted();
} catch {
  unauthorizedCommandRejected = true;
}
let activeAuthorityRejected = false;
try {
  await activeNative.sessionAuthority();
} catch {
  activeAuthorityRejected = true;
}
unauthorizedCommandRejected = unauthorizedCommandRejected && activeAuthorityRejected;
document.getElementById("status").textContent = "Bundled assets opened without a network dependency.";
document.getElementById("details").textContent = JSON.stringify(runtime, null, 2);
await bundledNative.recordProbe({
  candidate: "bundled",
  bootMode: navigator.onLine === false ? "offline" : "unknown",
  shellVersion: "bundled-spike-v2",
  cacheVersion: "not-applicable",
  payloadBuildId: "bundled-spike-v2",
  cachedPayload: true,
  serviceWorkerControlled: false,
  unauthorizedCommandRejected,
});
