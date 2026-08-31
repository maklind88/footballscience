import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopBridge, validateSpikeProbe } from "../candidates/shared/desktop-bridge-contract.mjs";

test("web fallback exposes no native capabilities", async () => {
  const bridge = createDesktopBridge({});
  assert.equal(bridge.isDesktop, false);
  assert.deepEqual(await bridge.getRuntimeInfo(), {
    nativeAppVersion: "web",
    runtime: "browser",
    localSchemaVersion: 0,
    syncProtocolVersion: 0,
    capabilities: [],
  });
  assert.equal(await bridge.recordProbe({}), false);
});

test("desktop bridge invokes only the two named commands", async () => {
  const calls = [];
  const bridge = createDesktopBridge({
    __TAURI__: { core: { invoke: async (command, payload) => {
      calls.push({ command, payload });
      return command === "desktop_runtime_info" ? {
        nativeAppVersion: "0.0.1",
        runtime: "tauri",
        localSchemaVersion: 0,
        syncProtocolVersion: 0,
        capabilities: ["runtime.info", "spike.probe"],
      } : null;
    } } },
  });
  await bridge.getRuntimeInfo();
  await bridge.recordProbe({ candidate: "hosted", bootMode: "offline", shellVersion: "v1", cachedPayload: true, serviceWorkerControlled: true });
  assert.deepEqual(calls.map((call) => call.command), ["desktop_runtime_info", "record_spike_probe"]);
  assert.equal("readFile" in bridge, false);
  assert.equal("executeSql" in bridge, false);
  assert.equal("runShell" in bridge, false);
});

test("probe input rejects unbounded candidate values", () => {
  assert.throws(() => validateSpikeProbe({ candidate: "../../etc", bootMode: "offline", shellVersion: "v1" }), /Unknown spike candidate/);
});
