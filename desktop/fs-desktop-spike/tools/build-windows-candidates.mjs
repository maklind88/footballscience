import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.argv.includes("--load-check")) {
  console.log("Windows build helper loaded.");
  process.exit(0);
}

if (process.platform !== "win32") {
  throw new Error("Windows candidate builds must run on a Windows runner.");
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(packageRoot, "artifacts", "windows");
const logsRoot = resolve(artifactsRoot, "logs");
const releaseBinary = resolve(packageRoot, "src-tauri", "target", "release", "fs-desktop-architecture-spike.exe");
const tauriCli = resolve(packageRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
mkdirSync(logsRoot, { recursive: true });

const generated = spawnSync(process.execPath, [resolve(packageRoot, "tools", "generate-test-releases.mjs"), "--quiet"], {
  cwd: packageRoot,
  encoding: "utf8",
  env: process.env,
});
if (generated.status !== 0) throw new Error(generated.stderr || "Synthetic signed release generation failed.");
const publicEnvironment = JSON.parse(readFileSync(resolve(packageRoot, "generated", "test-release-public-env.json"), "utf8"));

const candidates = [
  { name: "bundled", config: null },
  { name: "hosted", config: "src-tauri/tauri.hosted.conf.json" },
  { name: "unauthorized-origin", config: "src-tauri/tauri.unauthorized-origin.conf.json" },
];

function runBuild(candidate) {
  const args = [tauriCli, "build", "--no-bundle"];
  if (candidate.config) args.push("--config", candidate.config);
  const env = {
    ...process.env,
    FS_DESKTOP_DELIVERY_MODE: candidate.name,
  };
  if (candidate.name === "hosted") {
    Object.assign(env, {
      FS_DESKTOP_RELEASE_KEY_ID: publicEnvironment.releaseKeyId,
      FS_DESKTOP_RELEASE_PUBLIC_KEY_B64: publicEnvironment.releasePublicKeyBase64,
      FS_DESKTOP_RECOVERY_KEY_ID: publicEnvironment.recoveryKeyId,
      FS_DESKTOP_RECOVERY_PUBLIC_KEY_B64: publicEnvironment.recoveryPublicKeyBase64,
    });
  }
  const result = spawnSync(process.execPath, args, {
    cwd: packageRoot,
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const log = [result.stdout || "", result.stderr || ""].join("");
  writeFileSync(resolve(logsRoot, `${candidate.name}-build.log`), log, "utf8");
  process.stdout.write(log);
  if (result.status !== 0) {
    throw new Error(`${candidate.name} Windows release compilation failed with exit code ${result.status}.`);
  }
  const target = resolve(artifactsRoot, `fs-desktop-${candidate.name}.exe`);
  copyFileSync(releaseBinary, target);
  const bytes = readFileSync(target);
  return {
    candidate: candidate.name,
    file: target.slice(artifactsRoot.length + 1).replaceAll("\\", "/"),
    bytes: statSync(target).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const manifest = {
  schema: "fs-desktop-windows-build-manifest-v1",
  commit: process.env.GITHUB_SHA || "local",
  runner: process.env.ImageOS || "windows",
  architecture: process.env.PROCESSOR_ARCHITECTURE || process.arch,
  bundlePublished: false,
  installerGenerated: false,
  productionCredentialsUsed: false,
  privateSigningKeysArtifacted: false,
  releaseVerificationKeyId: publicEnvironment.releaseKeyId,
  expectedNormalBuildId: publicEnvironment.releases.normal.buildId,
  expectedNegativeBuildIds: {
    incompatible: publicEnvironment.releases.incompatible.buildId,
    hanging: publicEnvironment.releases.hanging.buildId,
    unknownKey: publicEnvironment.releases.unknownKey.buildId,
    modifiedAsset: publicEnvironment.releases.modifiedAsset.buildId,
  },
  credentialBackend: "Windows Credential Manager adapter compiled; physical round trip not executed",
  candidates: candidates.map(runBuild),
};

writeFileSync(resolve(artifactsRoot, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Built ${manifest.candidates.length} unsigned, unbundled Windows architecture-probe binaries.`);
