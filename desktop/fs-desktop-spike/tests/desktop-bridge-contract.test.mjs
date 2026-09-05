import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopBridge, validateSpikeProbe, verifyDeniedNativeCommand } from "../candidates/shared/desktop-bridge-contract.mjs";

const runtime = {
  nativeAppVersion: "0.0.1", runtime: "tauri", localSchemaVersion: 3, syncProtocolVersion: 1,
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
const syncStatus = {
  schema: "fs-session-sync-status-v1", partitionKey: "partition", state: "synced",
  pendingOperationCount: 0, quarantinedOperationCount: 0, blockedReason: null,
};

test("web fallback exposes no native capabilities", async () => {
  const bridge = createDesktopBridge({ isDesktop: false });
  assert.equal(bridge.isDesktop, false);
  assert.deepEqual(await bridge.getRuntimeInfo(), { nativeAppVersion: "web", runtime: "browser", localSchemaVersion: 0, syncProtocolVersion: 0, capabilities: [] });
  assert.equal(await bridge.recordProbe({}), false);
  assert.equal(await bridge.getSessionSyncStatus(context), null);
  assert.equal("readFile" in bridge, false);
  assert.equal("executeSql" in bridge, false);
});

test("desktop bridge invokes only the enumerated typed commands", async () => {
  const calls = [];
  const response = {
    runtimeInfo: runtime,
    bootstrapStatus: { schema: "status-v2" },
    prepareShellUpdate: { state: "up-to-date" },
    openRecovery: null,
    sessionAuthority: authority,
    readSelectedSession: slice,
    sessionSyncStatus: syncStatus,
    applySessionOperation: { operationId: "operation", state: "pending", resultingRevision: 2, durableLocally: true },
    recordProbe: null,
  };
  const native = Object.fromEntries(Object.keys(response).map((command) => [command, async (payload) => {
    calls.push({ command, payload });
    return response[command];
  }]));
  const bridge = createDesktopBridge({ native, isDesktop: true });
  await bridge.getRuntimeInfo();
  await bridge.getBootstrapStatus();
  await bridge.prepareShellUpdate();
  await bridge.openRecovery();
  await bridge.getSessionAuthority();
  await bridge.readSelectedSession(context);
  await bridge.getSessionSyncStatus(context);
  await bridge.applySessionOperation({ operationId: "operation" });
  await bridge.recordProbe({ candidate: "hosted", bootMode: "offline", shellVersion: "v1", cacheVersion: "cache-v1", payloadBuildId: "payload-v1", cachedPayload: true, serviceWorkerControlled: false, unauthorizedCommandRejected: true });
  assert.deepEqual(calls.map((call) => call.command), Object.keys(response));
  assert.equal("readFile" in bridge, false);
  assert.equal("executeSql" in bridge, false);
  assert.equal("runShell" in bridge, false);
  assert.equal("fetchUrl" in bridge, false);
});

test("probe input rejects unbounded candidate values", () => {
  assert.throws(() => validateSpikeProbe({ candidate: "../../etc", bootMode: "offline", shellVersion: "v1" }), /Unknown spike candidate/);
});

test("session reads and status cannot cross the authorized partition", async () => {
  const bridge = createDesktopBridge({
    isDesktop: true,
    native: {
      readSelectedSession: async () => ({ ...slice, partitionKey: "another-partition" }),
      sessionSyncStatus: async () => ({ ...syncStatus, partitionKey: "another-partition" }),
    },
  });
  await assert.rejects(bridge.readSelectedSession(context), /authorized partition/);
  await assert.rejects(bridge.getSessionSyncStatus(context), /authorized partition/);
});

test("known but ungranted native command must be rejected", async () => {
  assert.equal(await verifyDeniedNativeCommand({
    isDesktop: true,
    native: { invokeKnownButUngranted: async () => { throw new Error("not allowed"); } },
  }), true);
  assert.equal(await verifyDeniedNativeCommand({
    isDesktop: true,
    native: { invokeKnownButUngranted: async () => true },
  }), false);
});
