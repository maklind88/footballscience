import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, packageRoot), "utf8");
}

test("capabilities grant exactly the two intended native commands", async () => {
  const permissions = await text("src-tauri/permissions/fs-desktop-spike.toml");
  assert.match(permissions, /commands\.allow = \["desktop_runtime_info"\]/);
  assert.match(permissions, /commands\.allow = \["record_spike_probe"\]/);
  assert.doesNotMatch(permissions, /internal_denied_probe/);
  assert.doesNotMatch(permissions, /(read_file|execute|shell|sql|http)/i);
});

test("hosted capability is restricted to one exact loopback origin", async () => {
  const capability = JSON.parse(await text("src-tauri/capabilities/hosted.json"));
  assert.deepEqual(capability.remote.urls, ["http://127.0.0.1:47842/*"]);
  assert.deepEqual(capability.permissions.sort(), ["allow-record-probe", "allow-runtime-info"]);
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
