import assert from "node:assert/strict";
import test from "node:test";
import { ConflictReviewController } from "../candidates/shared/conflict-controller.mjs";
import { createDesktopBridge } from "../candidates/shared/desktop-bridge-contract.mjs";
import { validateConflictReview } from "../candidates/shared/conflict-contract.mjs";
import { readFile } from "node:fs/promises";

const review = JSON.parse(await readFile(new URL("./fixtures/conflict-review.json", import.meta.url)));
const context = { actorId: "actor", organizationId: "organization", partitionKey: review.partitionKey, authEpoch: 2, frontendBuildId: "test" };
const receipt = { schema: "fs-desktop-conflict-recovered-v1", partitionKey: review.partitionKey,
  recoveryId: "00000000-0000-4000-8000-000000009901", requeuedOperationCount: 1, uploaded: false };
function fixture() {
  let authority = { ...context, canSync: true, canReadOffline: true };
  const calls = [];
  const bridge = {
    async getSessionAuthority() { return authority; },
    async getBootstrapStatus() { return { activeBuildId: "test" }; },
    async reviewSessionConflict() { calls.push("review"); return review; },
    async recoverSessionConflict(proof, token) { calls.push({ proof, token }); return receipt; },
  };
  return { bridge, calls, controller: new ConflictReviewController(bridge), revoke() { authority = { ...authority, canReadOffline: false }; } };
}

test("review/cancel do not mutate and recovery requires explicit confirmation", async () => {
  const f = fixture();
  await f.controller.review();
  await f.controller.recover();
  assert.deepEqual(f.calls, ["review"]);
  f.controller.cancel();
  await f.controller.recover(true);
  assert.deepEqual(f.calls, ["review"]);
  await f.controller.review();
  const result = await f.controller.recover(true);
  assert.equal(result.receipt.uploaded, false);
  assert.equal(result.review, null);
  assert.deepEqual(f.calls[2], { proof: context, token: review.reviewToken });
  await f.controller.recover(true);
  assert.equal(f.calls.length, 3);
});

test("late review after cancel is discarded and access loss clears visible data", async () => {
  const f = fixture();
  let release;
  f.bridge.reviewSessionConflict = () => new Promise((resolve) => { release = resolve; });
  const pending = f.controller.review();
  while (!release) await Promise.resolve();
  f.controller.cancel(); release(review);
  await pending;
  assert.equal(f.controller.snapshot().review, null);
  f.bridge.reviewSessionConflict = async () => review;
  await f.controller.review(); f.revoke();
  assert.equal(await f.controller.guard(), false);
  assert.equal(f.controller.snapshot().review, null);
  await f.controller.recover(true);
  assert.equal(f.calls.length, 0);
});

test("failed or stale recovery invalidates confirmation without silently retrying", async () => {
  const f = fixture();
  let attempts = 0;
  f.bridge.recoverSessionConflict = async () => { attempts += 1; throw new Error("review changed"); };
  await f.controller.review();
  const result = await f.controller.recover(true);
  assert.equal(result.review, null);
  assert.equal(result.receipt, null);
  assert.match(result.message, /not confirmed/);
  await f.controller.recover(true);
  assert.equal(attempts, 1);
});

test("typed bridge scopes results, bounds input, and remains inert in browsers", async () => {
  const calls = [];
  const bridge = createDesktopBridge({ isDesktop: true, native: { sessionConflict: async (...args) => {
    calls.push(args); return args[1] ? receipt : review;
  } } });
  assert.equal((await bridge.reviewSessionConflict(context)).serverRevision, 10);
  assert.equal((await bridge.recoverSessionConflict(context, review.reviewToken)).uploaded, false);
  await assert.rejects(() => bridge.recoverSessionConflict(context, "invalid"));
  assert.equal(calls.length, 2);
  const browser = createDesktopBridge({ isDesktop: false, native: {} });
  assert.equal(await browser.reviewSessionConflict(context), null);
  assert.equal(await browser.recoverSessionConflict(context, review.reviewToken), null);
  assert.throws(() => validateConflictReview(review, "another partition"));
  assert.throws(() => validateConflictReview({ ...review, operations: Array(201).fill(review.operations[0]) }, review.partitionKey));
});

test("conflict surface is signed-bundle-only and native mutation remains build/window gated", async () => {
  const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const source = await text("src-tauri/src/lib.rs");
  const command = source.slice(source.indexOf("async fn desktop_session_conflict("), source.indexOf("fn record_spike_probe("));
  for (const check of [/require_window\(&window, windows::WebviewRole::Active\)/, /FS_DESKTOP_TEST_BUILD/,
    /FS_DESKTOP_SESSION_SYNC_EXPERIMENT/, /is_loopback_sync_origin/, /validate_active_frontend_build/]) assert.match(command, check);
  assert.doesNotMatch(command, /snapshot:|url:|sql:|body:|access_token:/);
  for (const name of ["bundled", "candidate", "recovery"]) {
    assert.equal(JSON.parse(await text(`src-tauri/capabilities/${name}.json`)).permissions.includes("allow-session-conflict"), false);
  }
  assert.match(await text("tools/generate-test-releases.mjs"), /"desktop\/conflict-entry.js"/);
  assert.match(await text("candidates/shared/conflict-entry.js"), /capabilities.includes\("session.conflict-review"\)/);
  assert.doesNotMatch(await text("candidates/shared/conflict-panel.mjs"), /innerHTML|outerHTML/);
});
