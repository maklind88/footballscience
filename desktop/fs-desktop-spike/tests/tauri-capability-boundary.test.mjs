import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, packageRoot), "utf8");
}

test("permissions contain only the enumerated role-specific commands", async () => {
  const permissions = await text("src-tauri/permissions/fs-desktop-spike.toml");
  const commands = [...permissions.matchAll(/commands\.allow = \["([^"]+)"\]/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(commands, [
    "desktop_apply_session_operation",
    "desktop_bootstrap_status",
    "desktop_candidate_confirm",
    "desktop_candidate_report_failure",
    "desktop_candidate_status",
    "desktop_open_recovery",
    "desktop_prepare_shell_update",
    "desktop_read_selected_session",
    "desktop_recovery_read_selected_session",
    "desktop_recovery_status",
    "desktop_runtime_info",
    "desktop_session_authority",
    "record_spike_probe",
  ]);
  assert.equal(commands.includes("internal_denied_probe"), false);
  assert.equal(commands.some((command) => /(read_file|execute|shell_command|sql|http_request|filesystem)/i.test(command)), false);
});

test("active, candidate and recovery capabilities are disjoint and window-scoped", async () => {
  const active = JSON.parse(await text("src-tauri/capabilities/active.json"));
  const candidate = JSON.parse(await text("src-tauri/capabilities/candidate.json"));
  const recovery = JSON.parse(await text("src-tauri/capabilities/recovery.json"));
  assert.deepEqual(active.windows, ["main"]);
  assert.equal("remote" in active, false);
  assert.deepEqual(candidate.windows, ["candidate"]);
  assert.deepEqual(candidate.permissions, [
    "allow-candidate-status",
    "allow-candidate-confirm",
    "allow-candidate-failure",
  ]);
  assert.equal(candidate.permissions.some((value) => /session|authority|outbox|recovery|operation/.test(value)), false);
  assert.deepEqual(recovery.windows, ["recovery"]);
  assert.deepEqual(recovery.permissions.sort(), ["allow-recovery-read", "allow-recovery-status"]);
});

test("bundled fallback and recovery cannot mutate Session Planner state", async () => {
  const bundled = JSON.parse(await readFile(new URL("../src-tauri/capabilities/bundled.json", import.meta.url), "utf8"));
  const recovery = JSON.parse(await readFile(new URL("../src-tauri/capabilities/recovery.json", import.meta.url), "utf8"));
  for (const capability of [bundled, recovery]) {
    assert.equal(capability.permissions.some((permission) => /operation|outbox|bootstrap-update|candidate-confirm/.test(permission)), false);
  }
  assert.deepEqual(recovery.permissions, ["allow-recovery-status", "allow-recovery-read"]);
});

test("all native windows are created under exact roles without a global Tauri API", async () => {
  for (const configPath of [
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.hosted.conf.json",
    "src-tauri/tauri.unauthorized-origin.conf.json",
  ]) {
    const config = JSON.parse(await text(configPath));
    assert.equal(config.app.withGlobalTauri, false, configPath);
    assert.deepEqual(config.app.windows, [], configPath);
    assert.equal(config.app.security.freezePrototype, true, configPath);
  }
  const windows = await text("src-tauri/src/windows.rs");
  assert.match(windows, /fs-active:\/\/localhost\/bootstrap\/index\.html/);
  assert.match(windows, /fs-candidate:\/\/localhost\/index\.html/);
  assert.match(windows, /fs-recovery:\/\/localhost\/index\.html/);
  assert.match(windows, /on_new_window[\s\S]*NewWindowResponse::Deny/);
  assert.match(windows, /on_download\(\|_, _\| false\)/);
  const nativeSources = [
    await text("src-tauri/src/windows.rs"),
    await text("src-tauri/src/protocol.rs"),
    await text("src-tauri/tauri.hosted.conf.json"),
  ].join("\n");
  assert.doesNotMatch(nativeSources, /47844/);
});

test("generated test release binds exact manifest bytes, signature and every immutable asset", async () => {
  const environment = JSON.parse(await text("generated/test-release-public-env.json"));
  const buildId = environment.releases.normal.buildId;
  const manifestBytes = await readFile(new URL(`generated/releases/${buildId}/manifest.json`, packageRoot));
  const signatureBytes = await readFile(new URL(`generated/releases/${buildId}/manifest.sig`, packageRoot));
  const manifest = JSON.parse(manifestBytes);
  const envelope = JSON.parse(signatureBytes);
  const rawKey = Buffer.from(environment.releasePublicKeyBase64, "base64");
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const publicKey = createPublicKey({ key: Buffer.concat([spkiPrefix, rawKey]), format: "der", type: "spki" });
  const signature = Buffer.from(envelope.signatureBase64, "base64");
  assert.equal(verify(null, manifestBytes, publicKey, signature), true);
  assert.equal(verify(null, Buffer.concat([manifestBytes, Buffer.from(" ")]), publicKey, signature), false);
  assert.equal(manifest.buildId, buildId);
  assert.equal(manifest.releaseId, buildId);
  assert.equal(manifest.frontendBuildId, buildId);
  assert.equal(manifest.signingKeyId, environment.releaseKeyId);
  for (const asset of manifest.assets) {
    const bytes = await readFile(new URL(`generated/releases/${buildId}/${asset.path}`, packageRoot));
    assert.equal(asset.bytes, bytes.length, asset.path);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
  const generatedFiles = await readdir(new URL("generated/", packageRoot), { recursive: true });
  assert.equal(generatedFiles.some((path) => /private|\.pem$/i.test(path)), false);
  assert.equal(environment.privateKeysArtifacted, false);
  assert.equal(environment.testKeyDirectory.startsWith(fileURLToPath(packageRoot)), false);
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

test("Windows CI and signed-release helpers load successfully", () => {
  for (const helper of [
    "generate-test-releases.mjs",
    "hosted-server.mjs",
    "build-local-candidate.mjs",
    "build-windows-candidates.mjs",
    "windows-ci-verifier.mjs",
    "macos-packaged-verifier.mjs",
  ]) {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL(`../tools/${helper}`, import.meta.url)),
      "--load-check",
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, `${helper}: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /SyntaxError/);
  }
});
