import { createDesktopBridge, verifyDeniedNativeCommand } from "/fallback/bridge.mjs";

const buildId = "bundled-fallback-v2";
const bridge = createDesktopBridge(window);
const runtime = await bridge.getRuntimeInfo();
const authority = await bridge.getSessionAuthority();
const context = {
  actorId: authority.actorId,
  organizationId: authority.organizationId,
  partitionKey: authority.partitionKey,
  authEpoch: authority.authEpoch,
  frontendBuildId: buildId,
};
const slice = await bridge.readSelectedSession(context);
const sessionNode = document.getElementById("session");
sessionNode.hidden = false;
sessionNode.innerHTML = `<h2>${slice.session.title}</h2><p>${slice.session.scheduledDate} · revision ${slice.session.revision}</p><ul>${slice.blocks.map((block) => `<li>${block.title} — ${block.durationMinutes} min</li>`).join("")}</ul>`;
document.getElementById("status").textContent = "Read-only local projection opened without the update source.";
document.getElementById("details").textContent = JSON.stringify({ runtime, authorityState: authority.state, excludedFields: slice.excludedFields }, null, 2);
await bridge.recordProbe({
  candidate: "bundled",
  bootMode: "offline",
  shellVersion: buildId,
  cacheVersion: "bundled-recovery",
  payloadBuildId: buildId,
  cachedPayload: true,
  serviceWorkerControlled: false,
  unauthorizedCommandRejected: await verifyDeniedNativeCommand(window),
});
