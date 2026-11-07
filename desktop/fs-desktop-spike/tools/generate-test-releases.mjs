import { createHash, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--load-check")) {
  console.log("test release generator loaded");
  process.exit(0);
}

if (process.env.FS_DESKTOP_PRODUCTION_RELEASE === "true") {
  throw new Error("The isolated test signer cannot create production releases.");
}

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const generatedRoot = join(packageRoot, "generated");
const releasesRoot = join(generatedRoot, "releases");
const pointersRoot = join(generatedRoot, "pointers");
const keyNamespace = createHash("sha256").update(resolve(packageRoot)).digest("hex").slice(0, 16);
const testKeyRoot = join(process.env.RUNNER_TEMP || tmpdir(), `fs-desktop-test-keys-${keyNamespace}`);
const statePath = join(generatedRoot, "test-release-state.json");

const sources = new Map([
  ["index.html", join(packageRoot, "candidates", "hosted", "index.html")],
  ["styles.css", join(packageRoot, "candidates", "hosted", "styles.css")],
  ["app.js", join(packageRoot, "candidates", "hosted", "app.js")],
  ["bridge.mjs", join(packageRoot, "candidates", "shared", "desktop-bridge-contract.mjs")],
  ["session-authority.mjs", join(packageRoot, "candidates", "shared", "session-authority.mjs")],
  ["connectivity-state.mjs", join(packageRoot, "candidates", "shared", "connectivity-state.mjs")],
  ["session-planner-offline.mjs", join(packageRoot, "candidates", "shared", "session-planner-offline.mjs")],
  ["tauri-invoke.mjs", join(packageRoot, "candidates", "shared", "tauri-invoke.mjs")],
]);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactJson(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function loadOrCreateKey(name) {
  mkdirSync(testKeyRoot, { recursive: true, mode: 0o700 });
  chmodSync(testKeyRoot, 0o700);
  const privatePath = join(testKeyRoot, `${name}.private.pem`);
  const publicPath = join(testKeyRoot, `${name}.public.pem`);
  if (!existsSync(privatePath) || !existsSync(publicPath)) {
    const pair = generateKeyPairSync("ed25519");
    writeFileSync(privatePath, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    writeFileSync(publicPath, pair.publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
  }
  chmodSync(privatePath, 0o600);
  chmodSync(publicPath, 0o600);
  const privateKey = readFileSync(privatePath, "utf8");
  const publicKey = readFileSync(publicPath, "utf8");
  return { privateKey, publicKey, privatePath };
}

function rawPublicKeyBase64(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  if (der.length < 32) throw new Error("Unexpected Ed25519 public key encoding.");
  return der.subarray(der.length - 32).toString("base64");
}

const releaseKey = loadOrCreateKey("release");
const recoveryKey = loadOrCreateKey("recovery");
const unknownKey = loadOrCreateKey("unknown");

const sourceDigest = createHash("sha256");
for (const [path, source] of sources) {
  sourceDigest.update(path).update("\0").update(readFileSync(source));
}
const assetSetHash = sourceDigest.digest("hex");
let state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { normalSequence: 11, assetSetHash: "" };
if (state.assetSetHash !== assetSetHash) {
  state = {
    schema: "fs-desktop-test-release-state-v1",
    // Reserve room above every synthetic negative candidate from the prior asset set.
    normalSequence: Number(state.normalSequence || 11) + 10,
    assetSetHash,
    issuedAtUnixMs: Date.now(),
  };
}

mkdirSync(releasesRoot, { recursive: true });
mkdirSync(pointersRoot, { recursive: true });

const releaseKeyId = "fs-local-test-release-key-v1";
const recoveryKeyId = "fs-local-test-recovery-key-v1";

function assets() {
  return [...sources].map(([path, source]) => {
    const bytes = readFileSync(source);
    const extension = path.slice(path.lastIndexOf("."));
    return {
      path,
      sha256: sha256(bytes),
      bytes: bytes.length,
      contentType: contentTypes.get(extension),
    };
  });
}

function writeRelease({ kind, sequence, localSchemaVersion = 3, key = releaseKey, keyId = releaseKeyId, recoveryAuthorization = null }) {
  const buildId = `hosted-test-${kind}-s${sequence}-${assetSetHash.slice(0, 12)}`;
  const releaseRoot = join(releasesRoot, buildId);
  rmSync(releaseRoot, { recursive: true, force: true });
  mkdirSync(releaseRoot, { recursive: true });
  for (const [path, source] of sources) copyFileSync(source, join(releaseRoot, path));
  const manifest = {
    schema: "fs-desktop-shell-manifest-v2",
    releaseId: buildId,
    buildId,
    frontendBuildId: buildId,
    releaseSequence: sequence,
    issuedAtUnixMs: state.issuedAtUnixMs,
    nativeVersionRequirement: ">=0.0.1, <0.1.0",
    localSchemaVersion,
    syncProtocolVersion: 1,
    requiredCapabilities: [
      "bootstrap.status",
      "bootstrap.update",
      "runtime.info",
      "session.authority",
      "session.operation",
      "session.read",
      "session.sync-status",
      "spike.probe",
    ],
    entrypoint: "index.html",
    appReadySchema: "fs-desktop-candidate-ready-v2",
    signingKeyId: keyId,
    recoveryAuthorization,
    assets: assets(),
  };
  const manifestBytes = exactJson(manifest);
  const signature = sign(null, manifestBytes, key.privateKey).toString("base64");
  const envelope = exactJson({
    schema: "fs-desktop-manifest-signature-v1",
    algorithm: "Ed25519",
    signingKeyId: keyId,
    signatureBase64: signature,
  });
  writeFileSync(join(releaseRoot, "manifest.json"), manifestBytes);
  writeFileSync(join(releaseRoot, "manifest.sig"), envelope);
  writeFileSync(join(pointersRoot, `${kind}.json`), exactJson({
    schema: "fs-desktop-test-release-pointer-v1",
    kind,
    buildId,
  }));
  return { kind, buildId, releaseSequence: sequence, manifestSha256: sha256(manifestBytes) };
}

const normal = writeRelease({ kind: "normal", sequence: state.normalSequence });
const incompatible = writeRelease({
  kind: "incompatible",
  sequence: state.normalSequence + 1,
  localSchemaVersion: 999,
});
const hanging = writeRelease({ kind: "hanging", sequence: state.normalSequence + 2 });
const unknownKeyRelease = writeRelease({
  kind: "unknown-key",
  sequence: state.normalSequence + 3,
  key: unknownKey,
  keyId: "fs-local-test-unknown-key-v1",
});
const modifiedAsset = writeRelease({ kind: "modified-asset", sequence: state.normalSequence + 4 });
const rollbackSequence = Math.max(1, state.normalSequence - 1);
const rollback = writeRelease({
  kind: "rollback",
  sequence: rollbackSequence,
  key: recoveryKey,
  keyId: recoveryKeyId,
  recoveryAuthorization: {
    schema: "fs-desktop-signed-recovery-v1",
    targetReleaseSequence: rollbackSequence,
    authorizedFromSequence: state.normalSequence,
    expiresAtUnixMs: state.issuedAtUnixMs + 86_400_000,
    reasonCode: "synthetic-local-recovery-test",
  },
});

const publicEnvironment = {
  schema: "fs-desktop-test-public-build-environment-v1",
  productionCredentialsUsed: false,
  productionDataUsed: false,
  privateKeysArtifacted: false,
  releaseKeyId,
  releasePublicKeyBase64: rawPublicKeyBase64(releaseKey.publicKey),
  recoveryKeyId,
  recoveryPublicKeyBase64: rawPublicKeyBase64(recoveryKey.publicKey),
  testKeyDirectory: testKeyRoot,
  releases: { normal, incompatible, hanging, unknownKey: unknownKeyRelease, modifiedAsset, rollback },
};

writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
writeFileSync(
  join(generatedRoot, "test-release-public-env.json"),
  `${JSON.stringify(publicEnvironment, null, 2)}\n`,
  "utf8",
);
if (!process.argv.includes("--quiet")) console.log(JSON.stringify(publicEnvironment, null, 2));
