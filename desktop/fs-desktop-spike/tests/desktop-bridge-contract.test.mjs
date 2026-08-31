import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopBridge, validateSpikeProbe, verifyDeniedNativeCommand } from "../candidates/shared/desktop-bridge-contract.mjs";

const runtime = {
  nativeAppVersion: "0.0.1", runtime: "tauri", localSchemaVersion: 2, syncProtocolVersion: 1,
  capabilities: ["runtime.info", "session.read"],
};
const authority = {
  state: "synthetic-offline-authorized", syntheticIdentity: true, actorId: "actor", organizationId: "org",
  tenantId: "tenant", teamId: "team", partitionKey: "partition", authEpoch: 1,
  offlineLeaseExpiresAtUnixMs: Date.now() + 60_000, canReadOffline: true, canSync: false,
};
const context = { actorId: "actor", organizationId: "org", partitionKey: "partition", authEpoch: 1, frontendBuildId: "build-v1" };
const slice = {
  projectionSchema: "projection-v1", partitionKey: "partition", session: { id: "session", revision: 1 },
  blocks: [], players: [], exercises: [], excludedFields: ["video_blob"],
};

test("web fallback exposes no native capabilities", async () => {
  const bridge = createDesktopBridge({});
  assert.equal(bridge.isDesktop, false);
  assert.deepEqual(await bridge.getRuntimeInfo(), { nativeAppVersion: "web", runtime: "browser", localSchemaVersion: 0, syncProtocolVersion: 0, capabilities: [] });
  assert.equal(await bridge.recordProbe({}), false);
  assert.equal("readFile" in bridge, false);
  assert.equal("executeSql" in bridge, false);
});

test("desktop bridge invokes only the enumerated typed commands", async () => {
  const calls = [];
  const responses = {
    desktop_runtime_info: runtime,
    desktop_bootstrap_status: { schema: "status-v1" },
    desktop_prepare_shell_update: { state: "up-to-date" },
    desktop_confirm_shell_candidate: { schema: "status-v1" },
    desktop_session_authority: authority,
    desktop_read_selected_session: slice,
    desktop_apply_session_operation: { operationId: "operation", state: "pending" },
    record_spike_probe: null,
  };
  const bridge = createDesktopBridge({ __TAURI__: { core: { invoke: async (command, payload) => {
    calls.push({ command, payload });
    return responses[command];
  } } } });
  await bridge.getRuntimeInfo();
  await bridge.getBootstrapStatus();
  await bridge.prepareShellUpdate();
  await bridge.confirmShellCandidate({ buildId: "build-v1" });
  await bridge.getSessionAuthority();
  await bridge.readSelectedSession(context);
  await bridge.applySessionOperation({ operationId: "operation" });
  await bridge.recordProbe({ candidate: "hosted", bootMode: "offline", shellVersion: "v1", cacheVersion: "cache-v1", payloadBuildId: "payload-v1", cachedPayload: true, serviceWorkerControlled: false, unauthorizedCommandRejected: true });
  assert.deepEqual(calls.map((call) => call.command), Object.keys(responses));
  assert.equal("readFile" in bridge, false);
  assert.equal("executeSql" in bridge, false);
  assert.equal("runShell" in bridge, false);
  assert.equal("fetchUrl" in bridge, false);
});

test("probe input rejects unbounded candidate values", () => {
  assert.throws(() => validateSpikeProbe({ candidate: "../../etc", bootMode: "offline", shellVersion: "v1" }), /Unknown spike candidate/);
});

test("known but ungranted native command must be rejected", async () => {
  assert.equal(await verifyDeniedNativeCommand({ __TAURI__: { core: { invoke: async (command) => {
    if (command === "internal_denied_probe") throw new Error("not allowed");
    return null;
  } } } }), true);
  assert.equal(await verifyDeniedNativeCommand({ __TAURI__: { core: { invoke: async () => true } } }), false);
});
