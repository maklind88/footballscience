import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, packageRoot), "utf8");
}

test("capabilities grant only the enumerated bootstrap and domain commands", async () => {
  const permissions = await text("src-tauri/permissions/fs-desktop-spike.toml");
  const commands = [...permissions.matchAll(/commands\.allow = \["([^"]+)"\]/g)].map((match) => match[1]).sort();
  assert.deepEqual(commands, [
    "desktop_apply_session_operation",
    "desktop_bootstrap_status",
    "desktop_confirm_shell_candidate",
    "desktop_prepare_shell_update",
    "desktop_read_selected_session",
    "desktop_runtime_info",
    "desktop_session_authority",
    "record_spike_probe",
  ]);
  assert.equal(commands.includes("internal_denied_probe"), false);
  assert.equal(commands.some((command) => /(read_file|execute|shell_command|sql|http_request|filesystem)/i.test(command)), false);
});

test("hosted capability is restricted to one exact loopback origin", async () => {
  const capability = JSON.parse(await text("src-tauri/capabilities/hosted.json"));
  assert.deepEqual(capability.remote.urls, ["http://127.0.0.1:47844/*"]);
  assert.deepEqual(capability.permissions.sort(), [
    "allow-bootstrap-confirm", "allow-bootstrap-status", "allow-bootstrap-update", "allow-record-probe",
    "allow-runtime-info", "allow-session-authority", "allow-session-operation", "allow-session-read",
  ]);
});

test("hosted manifest matches every immutable shell asset", async () => {
  const manifest = JSON.parse(await text("candidates/hosted/manifest.json"));
  const source = new Map([
    ["index.html", "candidates/hosted/index.html"],
    ["styles.css", "candidates/hosted/styles.css"],
    ["app.js", "candidates/hosted/app.js"],
    ["bridge.mjs", "candidates/shared/desktop-bridge-contract.mjs"],
    ["session-authority.mjs", "candidates/shared/session-authority.mjs"],
    ["connectivity-state.mjs", "candidates/shared/connectivity-state.mjs"],
  ]);
  assert.deepEqual(manifest.assets.map((asset) => asset.path).sort(), [...source.keys()].sort());
  for (const asset of manifest.assets) {
    const bytes = await readFile(new URL(source.get(asset.path), packageRoot));
    assert.equal(asset.bytes, bytes.length, asset.path);
    assert.equal(asset.sha256, createHash("sha256").update(bytes).digest("hex"), asset.path);
  }
  assert.equal(manifest.assets.some((asset) => /payload|session|medical|auth/i.test(asset.path) && !asset.path.includes("session-authority")), false);
});

test("negative build uses an origin outside the hosted capability", async () => {
  const config = JSON.parse(await text("src-tauri/tauri.unauthorized-origin.conf.json"));
  assert.equal(config.app.windows[0].url, "http://127.0.0.1:47843/");
  assert.deepEqual(config.app.security.capabilities, ["hosted"]);
});

test("known negative command is compiled but never granted", async () => {
  const build = await text("src-tauri/build.rs");
  const runtime = await text("src-tauri/src/lib.rs");
  assert.match(build, /"internal_denied_probe"/);
  assert.match(runtime, /fn internal_denied_probe\(\)/);
  assert.match(runtime, /generate_handler![\s\S]*internal_denied_probe/);
});

test("Windows resource icon is a valid multi-image ICO", async () => {
  const config = JSON.parse(await text("src-tauri/tauri.conf.json"));
  const icon = await readFile(new URL("src-tauri/icons/icon.ico", packageRoot));
  assert.ok(config.bundle.icon.includes("icons/icon.ico"));
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(icon.readUInt16LE(4) > 1);
});

test("Windows CI helpers load successfully before the platform guard", () => {
  for (const helper of ["build-windows-candidates.mjs", "windows-ci-verifier.mjs"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../tools/${helper}`, import.meta.url)), "--load-check"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /helper loaded|verifier loaded/);
    assert.doesNotMatch(result.stderr, /SyntaxError/);
  }
});
