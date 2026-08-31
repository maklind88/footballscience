import { createDesktopBridge } from "../shared/desktop-bridge-contract.mjs";

const bridge = createDesktopBridge(window);
const runtime = await bridge.getRuntimeInfo();
document.getElementById("status").textContent = "Bundled assets opened without a network dependency.";
document.getElementById("details").textContent = JSON.stringify(runtime, null, 2);
await bridge.recordProbe({
  candidate: "bundled",
  bootMode: navigator.onLine === false ? "offline" : "unknown",
  shellVersion: "bundled-spike-v1",
  cachedPayload: true,
  serviceWorkerControlled: false,
});
