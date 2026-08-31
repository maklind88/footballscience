import assert from "node:assert/strict";
import test from "node:test";
import { classifyShellUpdateFailure, ConnectivityState } from "../candidates/shared/connectivity-state.mjs";

test("release trust failures are compatibility-blocked while transport failures are offline", () => {
  assert.equal(classifyShellUpdateFailure("unknown frontend signing key"), "compatibility-blocked");
  assert.equal(classifyShellUpdateFailure("frontend release verification key was not pinned at build time"), "compatibility-blocked");
  assert.equal(classifyShellUpdateFailure("invalid detached signature"), "compatibility-blocked");
  assert.equal(classifyShellUpdateFailure("shell source body exceeds declared boundary"), "compatibility-blocked");
  assert.equal(classifyShellUpdateFailure("asset integrity failed for app.js"), "compatibility-blocked");
  assert.equal(classifyShellUpdateFailure("connection refused"), "offline");
  assert.equal(
    classifyShellUpdateFailure("shell source unavailable: error sending request for url (http://127.0.0.1:47842/manifest.json)"),
    "offline",
  );
});

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
