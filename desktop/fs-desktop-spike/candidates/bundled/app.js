import { createDesktopBridge, verifyDeniedNativeCommand } from "../shared/desktop-bridge-contract.mjs";

const bridge = createDesktopBridge(window);
const runtime = await bridge.getRuntimeInfo();
const unauthorizedCommandRejected = await verifyDeniedNativeCommand(window);
document.getElementById("status").textContent = "Bundled assets opened without a network dependency.";
document.getElementById("details").textContent = JSON.stringify(runtime, null, 2);
await bridge.recordProbe({
  candidate: "bundled",
  bootMode: navigator.onLine === false ? "offline" : "unknown",
  shellVersion: "bundled-spike-v1",
  cacheVersion: "not-applicable",
  payloadBuildId: "bundled-spike-v1",
  cachedPayload: true,
  serviceWorkerControlled: false,
  unauthorizedCommandRejected,
});
