import assert from "node:assert/strict";
import test from "node:test";
import { ConnectivityState } from "../candidates/shared/connectivity-state.mjs";

test("connectivity diagnostics keep transport, services, auth and sync separate", () => {
  const connectivity = new ConnectivityState();
  connectivity.observe({
    osNetwork: "reported-available",
    frontendSource: "reachable-current",
    fsApi: "unavailable",
    supabaseAuth: "reachable",
    authenticatedSession: "offline-lease-valid",
    synchronization: "degraded",
  });
  connectivity.transition("offline-cold-start", "verified local shell opened");
  connectivity.transition("offline-ready", "local projection loaded");
  const snapshot = connectivity.snapshot();
  assert.equal(snapshot.state, "offline-ready");
  assert.equal(snapshot.signals.frontendSource, "reachable-current");
  assert.equal(snapshot.signals.fsApi, "unavailable");
  assert.equal(snapshot.signals.synchronization, "degraded");
});

test("unknown connectivity dimensions are rejected", () => {
  const connectivity = new ConnectivityState();
  assert.throws(() => connectivity.observe({ navigatorOnline: "true" }), /Unknown connectivity signal/);
});
