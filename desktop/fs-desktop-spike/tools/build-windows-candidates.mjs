import { copyFileSync, createHash, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32") {
  throw new Error("Windows candidate builds must run on a Windows runner.");
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(packageRoot, "artifacts", "windows");
const logsRoot = resolve(artifactsRoot, "logs");
const releaseBinary = resolve(packageRoot, "src-tauri", "target", "release", "fs-desktop-architecture-spike.exe");
const tauriCli = resolve(packageRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
mkdirSync(logsRoot, { recursive: true });

const candidates = [
  { name: "bundled", config: null },
  { name: "hosted", config: "src-tauri/tauri.hosted.conf.json" },
  { name: "unauthorized-origin", config: "src-tauri/tauri.unauthorized-origin.conf.json" },
];

function runBuild(candidate) {
  const args = [tauriCli, "build", "--no-bundle"];
  if (candidate.config) args.push("--config", candidate.config);
  const result = spawnSync(process.execPath, args, {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
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
  candidates: candidates.map(runBuild),
};

writeFileSync(resolve(artifactsRoot, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Built ${manifest.candidates.length} unsigned, unbundled Windows architecture-probe binaries.`);
