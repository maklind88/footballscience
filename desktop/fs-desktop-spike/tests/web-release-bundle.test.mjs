import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  WEB_BUNDLE_MAX_TOTAL_BYTES,
  buildWebReleaseBundle,
  parseWebReleaseBundle,
} from "../tools/web-release-bundle.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const sharedRoot = resolve(packageRoot, "candidates/shared");

function build() {
  const virtualFiles = new Map([
    ["desktop/candidate-readiness.js", readFileSync(resolve(sharedRoot, "full-platform-candidate-readiness.js"))],
    ["desktop/platform-bootstrap.js", readFileSync(resolve(sharedRoot, "full-platform-bootstrap.js"))],
  ]);
  return buildWebReleaseBundle({
    repositoryRoot,
    virtualFiles,
    bootstrapScripts: ["desktop/candidate-readiness.js", "desktop/platform-bootstrap.js"],
  });
}

test("full web release bundle is deterministic, bounded and covers the current platform", () => {
  const first = build();
  const second = build();
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(first.contract, second.contract);
  assert.ok(first.contract.fileCount > 900);
  assert.ok(first.contract.unpackedBytes > 10 * 1024 * 1024);
  assert.ok(first.contract.unpackedBytes < WEB_BUNDLE_MAX_TOTAL_BYTES);

  const parsed = parseWebReleaseBundle(first.bytes);
  assert.equal(parsed.indexSha256, first.contract.indexSha256);
  assert.equal(parsed.files.size, first.contract.fileCount);
  for (const required of [
    "index.html",
    "app.js",
    "app-runtime.js",
    "platform-auth-boot.js",
    "scouting-database-worker.js",
    "scouting-import-data.js",
    "src/modules/session-planner/index.mjs",
    "src/modules/video-analysis/index.js",
    "assets/football-science-logo.png",
    "desktop/candidate-readiness.js",
    "desktop/platform-bootstrap.js",
  ]) assert.ok(parsed.files.has(required), `missing ${required}`);
  const index = parsed.files.get("index.html").body.toString("utf8");
  assert.match(index, /desktop\/candidate-readiness\.js/);
  assert.match(index, /desktop\/platform-bootstrap\.js/);
  assert.match(index, /desktop-inline-\d{2}-[a-f0-9]{16}\.js/);
  assert.doesNotMatch(index, /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i);
});

test("full web release inventory excludes server, schema, docs and secret-bearing files", () => {
  const parsed = parseWebReleaseBundle(build().bytes);
  for (const path of parsed.files.keys()) {
    assert.doesNotMatch(path, /^(?:api|supabase|docs|qa|scripts|\.github|\.vercel)\//);
    assert.doesNotMatch(path, /(?:^|\/)(?:\.env|package-lock\.json|vercel\.json)$/);
    assert.doesNotMatch(path, /(?:private|secret|credential|\.pem$)/i);
  }
});

test("web release parser rejects payload tampering and structural ambiguity", () => {
  const original = build().bytes;
  const tampered = Buffer.from(original);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => parseWebReleaseBundle(tampered), /integrity failed/);

  const trailing = Buffer.concat([original, Buffer.from([0])]);
  assert.throws(() => parseWebReleaseBundle(trailing), /trailing or unindexed/);

  const badMagic = Buffer.from(original);
  badMagic[0] ^= 0xff;
  assert.throws(() => parseWebReleaseBundle(badMagic), /magic is invalid/);
});
