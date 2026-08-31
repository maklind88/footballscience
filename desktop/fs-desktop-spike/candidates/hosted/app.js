import { createDesktopBridge, verifyDeniedNativeCommand } from "./bridge.mjs";
import { SessionAuthority } from "./session-authority.mjs";
import { ConnectivityState } from "./connectivity-state.mjs";

const frontendBuildId = "hosted-spike-v11";
const localSchemaVersion = 2;
const syncProtocolVersion = 1;
const bridge = createDesktopBridge(window);
const connectivity = new ConnectivityState();
const authority = new SessionAuthority({ adapter: { readSnapshot: () => bridge.getSessionAuthority() } });
const ui = Object.fromEntries(["shell", "connectivity", "authority", "projection", "bridge", "session", "details"].map((id) => [id, document.getElementById(id)]));
let lastProbeMode = "";
let updateInFlight = false;

async function diagnostic(stage, message) {
  await fetch(`/bootstrap/diagnostic?stage=${encodeURIComponent(stage)}&message=${encodeURIComponent(String(message || "").slice(0, 300))}`, { cache: "no-store" }).catch(() => {});
}

function channel() {
  return window.location.pathname.split("/").filter(Boolean)[0] || "unknown";
}

function renderSession(slice) {
  ui.session.hidden = false;
  ui.session.innerHTML = `<h2>${slice.session.title}</h2><p>${slice.session.scheduledDate} · revision ${slice.session.revision}</p><ul>${slice.blocks.map((block) => `<li>${block.position}. ${block.title} — ${block.durationMinutes} min</li>`).join("")}</ul>`;
}

async function record(mode, unauthorizedCommandRejected) {
  if (mode === lastProbeMode) return;
  try {
    await bridge.recordProbe({
      candidate: "hosted",
      bootMode: mode,
      shellVersion: frontendBuildId,
      cacheVersion: "fs-desktop-native-shell-cache-v1",
      payloadBuildId: frontendBuildId,
      cachedPayload: true,
      serviceWorkerControlled: false,
      unauthorizedCommandRejected,
    });
    lastProbeMode = mode;
  } catch (error) {
    await diagnostic("probe-record-failed", error?.message || error);
    throw error;
  }
}

async function checkUpdate(unauthorizedCommandRejected) {
  if (updateInFlight || channel() !== "active") return;
  updateInFlight = true;
  try {
    connectivity.observe({
      osNetwork: navigator.onLine ? "reported-available" : "reported-unavailable",
      frontendSource: "checking",
      fsApi: "not-probed-in-local-slice",
      supabaseAuth: "not-connected-synthetic-authority",
      synchronization: "test-double-only",
    }, "separate diagnostic surfaces retained before the shell-source check");
    connectivity.transition("online-checking", "native shell source check started");
    ui.connectivity.textContent = connectivity.snapshot().state;
    const result = await bridge.prepareShellUpdate();
    if (result?.state === "candidate-staged" && result.healthNonce) {
      connectivity.observe({ frontendSource: "candidate-staged-for-next-restart" }, "running active shell remains in place");
      connectivity.transition("online-ready", "compatible candidate staged for a controlled restart");
      ui.connectivity.textContent = `${connectivity.snapshot().state} · update ready`;
      await record("online", unauthorizedCommandRejected);
      return;
    }
    connectivity.observe({ frontendSource: "reachable-current" }, "trusted source returned the immutable active build");
    connectivity.transition("online-ready", "trusted shell source reached and current build confirmed");
    ui.connectivity.textContent = connectivity.snapshot().state;
    await record("online", unauthorizedCommandRejected);
  } catch (error) {
    const message = String(error?.message || error);
    const networkUnavailable = /shell source unavailable|error sending request|timed out|connection/i.test(message);
    const compatibilityBlocked = !networkUnavailable && /compatib|unsupported|manifest|integrity|sha-256/i.test(message);
    const probeMode = compatibilityBlocked ? "compatibility-blocked" : "offline";
    connectivity.observe({
      frontendSource: compatibilityBlocked ? "reachable-incompatible" : "unavailable",
      synchronization: "not-attempted",
    }, "shell-source result classified independently from API and auth state");
    connectivity.transition(compatibilityBlocked ? "compatibility-blocked" : "offline-ready", compatibilityBlocked
      ? "candidate rejected by native compatibility or integrity checks; active generation retained"
      : "trusted shell source unavailable; local projection retained");
    ui.connectivity.textContent = connectivity.snapshot().state;
    ui.details.textContent = `${ui.details.textContent}\n\nUpdate source: ${message}`;
    if (probeMode !== lastProbeMode) await diagnostic(compatibilityBlocked ? "compatibility-blocked" : "offline-ready", message);
    await record(probeMode, unauthorizedCommandRejected);
  } finally {
    updateInFlight = false;
  }
}

async function boot() {
  const runtime = await bridge.getRuntimeInfo();
  if (runtime.localSchemaVersion !== localSchemaVersion || runtime.syncProtocolVersion !== syncProtocolVersion) {
    connectivity.transition("compatibility-blocked", "native data compatibility mismatch");
    throw new Error("Native compatibility mismatch.");
  }
  const authoritySnapshot = await authority.snapshot();
  connectivity.observe({
    osNetwork: navigator.onLine ? "reported-available" : "reported-unavailable",
    frontendSource: "native-verified-local-generation",
    fsApi: "not-probed-in-local-slice",
    supabaseAuth: "not-connected-synthetic-authority",
    authenticatedSession: authoritySnapshot.canReadOffline ? "synthetic-offline-lease-valid" : "invalid",
    synchronization: "test-double-only",
  }, "native authority and local shell observations initialized");
  const context = await authority.contextProof(frontendBuildId);
  connectivity.transition("offline-cold-start", "verified local shell and native authority available");
  const slice = await bridge.readSelectedSession(context);
  renderSession(slice);
  connectivity.transition("offline-ready", "selected normalized Session Planner projection loaded");
  const unauthorizedCommandRejected = await verifyDeniedNativeCommand(window);
  ui.shell.textContent = `${frontendBuildId} (${channel()})`;
  ui.connectivity.textContent = connectivity.snapshot().state;
  ui.authority.textContent = `${authoritySnapshot.state} · ${authoritySnapshot.partitionKey}`;
  ui.projection.textContent = `${slice.blocks.length} blocks · ${slice.players.length} player refs · ${slice.exercises.length} exercise refs`;
  ui.bridge.textContent = `${runtime.capabilities.length} typed capabilities; no generic filesystem/SQL/HTTP/shell`;
  ui.details.textContent = JSON.stringify({
    runtime,
    projectionSchema: slice.projectionSchema,
    excludedFields: slice.excludedFields,
    syntheticIdentity: authoritySnapshot.syntheticIdentity,
    connectivity: connectivity.snapshot(),
    unauthorizedCommandRejected,
  }, null, 2);
  if (channel() === "candidate") {
    const healthNonce = new URL(window.location.href).searchParams.get("healthNonce") || "";
    const status = await bridge.confirmShellCandidate({
      buildId: frontendBuildId,
      healthNonce,
      evidence: {
        schema: "fs-desktop-app-ready-v1",
        buildId: frontendBuildId,
        frontendBuildId,
        localSchemaVersion,
        syncProtocolVersion,
        capabilities: runtime.capabilities,
        shellFullyInitialized: true,
      },
    });
    if (status.activeBuildId !== frontendBuildId) throw new Error("Native promotion did not select the initialized candidate.");
    window.location.replace("/active/index.html?promoted=1");
    return;
  }
  await checkUpdate(unauthorizedCommandRejected);
  window.setInterval(() => checkUpdate(unauthorizedCommandRejected).catch(() => {}), 1500);
}

boot().catch((error) => {
  ui.details.textContent = String(error?.stack || error?.message || error);
  diagnostic("shell-boot-failed", error?.message || error).catch(() => {});
});
