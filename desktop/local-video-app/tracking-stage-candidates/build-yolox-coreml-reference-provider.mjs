#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PYINSTALLER_VERSION = "6.15.0";
const PYINSTALLER_SDIST_SHA256 = "a48fc4644ee4aa2aa2a35e7b51f496f8fbd7eecf6a2150646bbf1613ad07bc2d";
const PYINSTALLER_WSCRIPT_SHA256 = "db57aff976c609146fef15451587cc333895eb620c531f0a77013e287de51b4f";
const NO_SYSV_PATCH_SHA256 = "14ec28aebf1e7ae4318dcdb1ebfa5c384210e9cd48d20c67e3b9d35fb1523b34";
const PROVIDER_SOURCE_SHA256 = "30c2d5f438be1d750dc877272d3d49078a4fd53cc1c1271b4224cd9c820b9d38";
const BASE_PROVIDER_SOURCE_SHA256 = "6c156bac230a2d5899ed6087977a5910211f4de8fc7fc986e16e5b1e68329a7a";
const EXPECTED_RUNTIME_SHA256 = "b3f0fe475d453269954db034cca1ca0881e29849cd0d35b55db0d33dcf272224";
const EXPECTED_RUNTIME_BYTES = 52_022_320;
const MAXIMUM_SDIST_BYTES = 16 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 256 * 1024 * 1024;
const commandOutputLimit = 512 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const providerSourcePath = path.join(scriptDir, "providers", "yolox-coreml-reference-detection-provider.py");
const baseProviderSourcePath = path.join(scriptDir, "providers", "yolox-reference-detection-provider.py");
const patchPath = path.join(scriptDir, "providers", "pyinstaller-6.15.0-darwin-no-sysv.patch");

export class TrackingCandidateBuildError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_BUILD_FAILED", options = {}) {
    super(message, options);
    this.name = "TrackingCandidateBuildError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateBuildError(message, code);
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-commandOutputLimit);
}

function reproducibleEnvironment(extra = {}) {
  return {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    PYTHONHASHSEED: "0",
    SOURCE_DATE_EPOCH: "315532800",
    ZERO_AR_DATE: "1",
    ...extra,
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || reproducibleEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) resolve({ stdout, stderr });
      else reject(new TrackingCandidateBuildError(
        `${path.basename(command)} failed: ${(stderr || stdout).trim() || `exit ${code ?? signal}`}`,
        "TRACKING_CANDIDATE_BUILD_PROCESS_FAILED",
      ));
    });
  });
}

async function regularFile(filePath, maximumBytes, label, options = {}) {
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    throw new TrackingCandidateBuildError(`${label} is unavailable.`, "TRACKING_CANDIDATE_BUILD_INPUT_MISSING", {
      cause: error,
    });
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    invalid(`${label} is not one bounded regular file.`, "TRACKING_CANDIDATE_BUILD_INPUT_UNSAFE");
  }
  if (options.executable && !(stat.mode & 0o111)) {
    invalid(`${label} is not executable.`, "TRACKING_CANDIDATE_BUILD_INPUT_UNSAFE");
  }
  return stat;
}

async function fileSha256(filePath, maximumBytes, label) {
  await regularFile(filePath, maximumBytes, label);
  const handle = await fs.open(filePath, "r");
  try {
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    const stat = await handle.stat({ bigint: true });
    const bytes = Number(stat.size);
    while (position < bytes) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, bytes - position), position);
      if (!bytesRead) invalid(`${label} changed while hashing.`, "TRACKING_CANDIDATE_BUILD_INPUT_CHANGED");
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const finalStat = await handle.stat({ bigint: true });
    if (stat.dev !== finalStat.dev || stat.ino !== finalStat.ino || stat.size !== finalStat.size
      || stat.mtimeNs !== finalStat.mtimeNs || stat.ctimeNs !== finalStat.ctimeNs) {
      invalid(`${label} changed while hashing.`, "TRACKING_CANDIDATE_BUILD_INPUT_CHANGED");
    }
    return { bytes, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function exactSha256(filePath, expected, maximumBytes, label) {
  const value = await fileSha256(filePath, maximumBytes, label);
  if (value.sha256 !== expected) {
    invalid(`${label} checksum does not match the reviewed build input.`, "TRACKING_CANDIDATE_BUILD_CHECKSUM_MISMATCH");
  }
  return value;
}

export function parseTrackingCandidateBuildArguments(values = []) {
  const options = { json: false, outputPath: "", pythonPath: "", sdistPath: "" };
  const valueOptions = new Map([
    ["--output", "outputPath"],
    ["--python", "pythonPath"],
    ["--pyinstaller-sdist", "sdistPath"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else invalid(`Unknown build option: ${argument}`);
  }
  if (!options.outputPath || !options.pythonPath || !options.sdistPath) {
    invalid("--python, --pyinstaller-sdist, and --output are required.");
  }
  return options;
}

async function assertOutputAvailable(outputPath) {
  try {
    await fs.lstat(outputPath);
    invalid("Build output already exists.", "TRACKING_CANDIDATE_BUILD_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof TrackingCandidateBuildError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

async function verifyRuntime(runtimePath) {
  const architecture = await run("/usr/bin/lipo", ["-archs", runtimePath]);
  if (architecture.stdout.trim() !== "arm64") {
    invalid("Tracking runtime must be one arm64 executable.", "TRACKING_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  const symbols = await run("/usr/bin/nm", ["-u", runtimePath]);
  if (/\b_?(?:semctl|semget|semop)\b/.test(symbols.stdout)) {
    invalid("Tracking runtime still imports SysV semaphore operations.", "TRACKING_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  await run("/usr/bin/codesign", ["--verify", runtimePath]);
  const runtime = await fileSha256(runtimePath, MAXIMUM_RUNTIME_BYTES, "Built provider runtime");
  if (runtime.sha256 !== EXPECTED_RUNTIME_SHA256 || runtime.bytes !== EXPECTED_RUNTIME_BYTES) {
    invalid(
      "Tracking runtime is not bit-reproducible from the reviewed toolchain.",
      "TRACKING_CANDIDATE_BUILD_RUNTIME_MISMATCH",
    );
  }
  return runtime;
}

export async function buildYoloxCoremlReferenceProvider(options = {}) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    invalid("This reference build supports arm64 macOS only.", "TRACKING_CANDIDATE_BUILD_PLATFORM_UNSUPPORTED");
  }
  const sdistPath = path.resolve(options.sdistPath || "");
  const requestedPythonPath = path.resolve(options.pythonPath || "");
  const outputPath = path.resolve(options.outputPath || "");
  await assertOutputAvailable(outputPath);
  let resolvedPythonPath;
  try {
    resolvedPythonPath = await fs.realpath(requestedPythonPath);
  } catch (error) {
    throw new TrackingCandidateBuildError(
      "Python runtime is unavailable.",
      "TRACKING_CANDIDATE_BUILD_INPUT_MISSING",
      { cause: error },
    );
  }
  await regularFile(resolvedPythonPath, 1024 * 1024 * 1024, "Python runtime", { executable: true });
  const pythonPath = requestedPythonPath;
  const sdist = await exactSha256(
    sdistPath,
    PYINSTALLER_SDIST_SHA256,
    MAXIMUM_SDIST_BYTES,
    "PyInstaller source distribution",
  );
  const providerSource = await exactSha256(
    providerSourcePath,
    PROVIDER_SOURCE_SHA256,
    1024 * 1024,
    "YOLOX CoreML provider source",
  );
  const baseProviderSource = await exactSha256(
    baseProviderSourcePath,
    BASE_PROVIDER_SOURCE_SHA256,
    1024 * 1024,
    "YOLOX base provider source",
  );
  const patch = await exactSha256(patchPath, NO_SYSV_PATCH_SHA256, 1024 * 1024, "No-SysV patch");
  const stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-provider-build-"));
  try {
    await run("/usr/bin/tar", ["-xzf", sdistPath, "-C", stagedDir]);
    const sourceDir = path.join(stagedDir, `pyinstaller-${PYINSTALLER_VERSION}`);
    await exactSha256(
      path.join(sourceDir, "bootloader", "wscript"),
      PYINSTALLER_WSCRIPT_SHA256,
      1024 * 1024,
      "PyInstaller bootloader build script",
    );
    await run("/usr/bin/patch", ["-p1", "-i", patchPath], { cwd: sourceDir });
    const bootloader = await run(pythonPath, ["waf", "all"], {
      cwd: path.join(sourceDir, "bootloader"),
      env: reproducibleEnvironment(),
    });
    if (!/Using semaphore API\s+: none/.test(`${bootloader.stdout}\n${bootloader.stderr}`)) {
      invalid("PyInstaller bootloader did not disable its semaphore API.", "TRACKING_CANDIDATE_BUILD_RUNTIME_UNSAFE");
    }
    const distDir = path.join(stagedDir, "dist");
    const buildDir = path.join(stagedDir, "build");
    const specDir = path.join(stagedDir, "spec");
    await run(pythonPath, [
      "-m", "PyInstaller", "--onefile", "--clean", "--noconfirm",
      "--name", "fs-yolox-coreml-reference-detection",
      "--distpath", distDir,
      "--workpath", buildDir,
      "--specpath", specDir,
      "--add-data", `${baseProviderSourcePath}:.`,
      "--hidden-import", "cv2",
      "--hidden-import", "numpy",
      providerSourcePath,
    ], {
      cwd: stagedDir,
      env: reproducibleEnvironment({
        PYTHONPATH: sourceDir,
        PYINSTALLER_CONFIG_DIR: path.join(stagedDir, "cache"),
      }),
    });
    const runtimePath = path.join(distDir, "fs-yolox-coreml-reference-detection");
    const runtime = await verifyRuntime(runtimePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await fs.chmod(runtimePath, 0o555);
    await fs.rename(runtimePath, outputPath);
    return Object.freeze({
      ok: true,
      outputPath,
      runtime: { ...runtime, architecture: "arm64", sysvSemaphoreImports: false },
      source: {
        providerSha256: providerSource.sha256,
        baseProviderSha256: baseProviderSource.sha256,
        pyinstallerSdistSha256: sdist.sha256,
        noSysvPatchSha256: patch.sha256,
      },
    });
  } finally {
    await fs.rm(stagedDir, { recursive: true, force: true });
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingCandidateBuildArguments(values);
    const result = await buildYoloxCoremlReferenceProvider(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_BUILD_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
