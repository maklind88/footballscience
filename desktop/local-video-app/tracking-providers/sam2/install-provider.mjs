import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import {
  completeInstall,
  rollbackInstall,
  runCapture,
  runVisible,
  selectPython,
  stageInstallDirectory,
  stageVerifiedAsset,
} from "./install-support.mjs";
import {
  readSam2ProviderManifest,
  sam2ProviderInstallDir,
  sam2ProviderPaths,
} from "./provider-runtime.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function parseInstallArguments(values = []) {
  const result = {
    acceptLicense: false,
    checkpoint: "",
    force: false,
    installDir: "",
    json: false,
    plan: false,
    python: "",
    sourceArchive: "",
    torchIndexUrl: "",
  };
  const valueOptions = new Map([
    ["--checkpoint", "checkpoint"],
    ["--install-dir", "installDir"],
    ["--python", "python"],
    ["--source-archive", "sourceArchive"],
    ["--torch-index-url", "torchIndexUrl"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--accept-license") result.acceptLicense = true;
    else if (argument === "--force") result.force = true;
    else if (argument === "--json") result.json = true;
    else if (argument === "--plan") result.plan = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      result[valueOptions.get(argument)] = value;
      index += 1;
    } else {
      const [name, ...parts] = argument.split("=");
      if (!valueOptions.has(name) || !parts.length) throw new Error(`Unknown installer option: ${argument}`);
      result[valueOptions.get(name)] = parts.join("=");
    }
  }
  return result;
}

function validateTorchIndex(url = "") {
  if (!url) return "";
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("The PyTorch package index must be an HTTPS URL without credentials.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function providerInstallPlan(args = {}, options = {}) {
  const manifest = options.manifest || readSam2ProviderManifest();
  const installDir = args.installDir
    ? path.resolve(args.installDir)
    : sam2ProviderInstallDir({ manifest, env: options.env || process.env, homeDir: options.homeDir });
  return {
    provider: `${manifest.displayName} ${manifest.providerVersion}`,
    installDir,
    protocol: manifest.protocol,
    source: {
      commit: manifest.upstream.commit,
      bytes: manifest.upstream.sourceBytes,
      sha256: manifest.upstream.sourceSha256,
      license: manifest.upstream.license,
    },
    model: {
      name: manifest.model.displayName,
      bytes: manifest.model.checkpointBytes,
      sha256: manifest.model.checkpointSha256,
      license: manifest.model.license,
    },
    runtime: {
      python: `${manifest.runtime.pythonMinimum} <= version < ${manifest.runtime.pythonMaximumExclusive}`,
      isolatedVirtualEnvironment: true,
      networkAtInference: false,
    },
  };
}

async function copyProviderPolicy(stagedDir) {
  await fs.cp(path.join(moduleDir, "provider"), path.join(stagedDir, "runtime"), { recursive: true });
  await fs.mkdir(path.join(stagedDir, "policy"), { recursive: true });
  for (const fileName of [
    "manifest.json",
    "THIRD_PARTY_NOTICES.md",
    "runtime-constraints.txt",
    "runtime-requirements.txt",
    "torch-requirements.txt",
  ]) {
    await fs.copyFile(path.join(moduleDir, fileName), path.join(stagedDir, "policy", fileName));
  }
}

async function installPythonRuntime(paths, args, python, manifest) {
  await runVisible(python.command, ["-m", "venv", paths.installDir + "/venv"]);
  const environment = { ...process.env, SAM2_BUILD_CUDA: "0" };
  await runVisible(paths.python, [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
    "setuptools==75.1.0", "wheel==0.44.0",
  ], { env: environment });
  const constraints = path.join(moduleDir, "runtime-constraints.txt");
  await runVisible(paths.python, [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
    "-c", constraints,
    "-r", path.join(moduleDir, "runtime-requirements.txt"),
  ], { env: environment });
  const torchIndex = validateTorchIndex(
    args.torchIndexUrl || (process.platform === "linux" ? "https://download.pytorch.org/whl/cpu" : ""),
  );
  const torchArguments = [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
    "-c", constraints,
    "-r", path.join(moduleDir, "torch-requirements.txt"),
  ];
  if (torchIndex) torchArguments.push("--index-url", torchIndex);
  await runVisible(paths.python, torchArguments, { env: environment });
  await runVisible(paths.python, [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
    "--no-deps", "--no-build-isolation", paths.sourceDir,
  ], { env: environment });
  const packages = await runCapture(paths.python, ["-m", "pip", "freeze", "--all"], { env: environment });
  await fs.writeFile(path.join(paths.installDir, "installed-packages.txt"), packages.stdout, { mode: 0o600 });

  const providerEnvironment = {
    ...process.env,
    FS_SAM2_CHECKPOINT: paths.checkpoint,
    FS_SAM2_CHECKPOINT_SHA256: manifest.model.checkpointSha256,
    FS_SAM2_CONFIG: manifest.model.config,
    FS_SAM2_FFMPEG_PATH: ffmpegStaticPath || "ffmpeg",
    FS_SAM2_MAX_FRAMES: String(manifest.runtime.maximumFrames),
    FS_SAM2_MODEL_NAME: manifest.model.displayName,
    FS_SAM2_SAMPLE_FPS: String(manifest.runtime.sampleFps),
  };
  const preflight = await runCapture(paths.python, [paths.providerEntry, "--preflight", "--json"], {
    env: providerEnvironment,
  });
  const report = JSON.parse(preflight.stdout.trim());
  if (!report.ok) throw new Error(report.error || "The tracking provider preflight did not pass.");
  return report;
}

export async function installSam2Provider(args = {}, options = {}) {
  if (!["darwin", "linux"].includes(process.platform)) {
    throw new Error("The approved provider installer currently supports macOS and Linux. Use WSL on Windows.");
  }
  const manifest = options.manifest || readSam2ProviderManifest();
  const plan = providerInstallPlan(args, { ...options, manifest });
  if (args.plan) return { ok: true, plan };
  if (!args.acceptLicense) {
    throw new Error("Review THIRD_PARTY_NOTICES.md and rerun with --accept-license before downloading third-party assets.");
  }
  const python = await selectPython({ command: args.python, env: options.env || process.env });
  if (!python) {
    throw new Error("SAM 2 requires Python 3.10, 3.11, or 3.12. Install one of those versions or pass --python.");
  }

  const installDir = plan.installDir;
  const stagedDir = `${installDir}.staged-${process.pid}-${Date.now()}`;
  const stagedSourceArchive = path.join(stagedDir, "downloads", "sam2-source.tar.gz");
  const stagedCheckpoint = path.join(stagedDir, "checkpoints", manifest.model.fileName);
  let backupDir = "";
  let activated = false;
  await fs.mkdir(stagedDir, { recursive: true, mode: 0o700 });
  try {
    await stageVerifiedAsset({
      destination: stagedSourceArchive,
      expected: { bytes: manifest.upstream.sourceBytes, sha256: manifest.upstream.sourceSha256 },
      localPath: args.sourceArchive,
      maxBytes: manifest.upstream.sourceBytes,
      url: manifest.upstream.sourceUrl,
    });
    await stageVerifiedAsset({
      destination: stagedCheckpoint,
      expected: { bytes: manifest.model.checkpointBytes, sha256: manifest.model.checkpointSha256 },
      localPath: args.checkpoint,
      maxBytes: manifest.model.checkpointBytes,
      url: manifest.model.checkpointUrl,
    });
    const stagedSource = path.join(stagedDir, "source");
    await fs.mkdir(stagedSource, { recursive: true });
    await runVisible("tar", ["-xzf", stagedSourceArchive, "-C", stagedSource, "--strip-components=1"]);
    await fs.access(path.join(stagedSource, "LICENSE"));
    await fs.access(path.join(stagedSource, "setup.py"));
    await fs.rm(path.join(stagedDir, "downloads"), { recursive: true, force: true });
    await copyProviderPolicy(stagedDir);

    backupDir = await stageInstallDirectory(stagedDir, installDir, args.force);
    activated = true;
    const paths = sam2ProviderPaths({ manifest, installDir });
    const preflight = await installPythonRuntime(paths, args, python, manifest);
    await fs.writeFile(paths.marker, JSON.stringify({
      schemaVersion: 1,
      providerId: manifest.providerId,
      providerVersion: manifest.providerVersion,
      sourceCommit: manifest.upstream.commit,
      sourceSha256: manifest.upstream.sourceSha256,
      checkpointSha256: manifest.model.checkpointSha256,
      installedAt: new Date().toISOString(),
      platform: process.platform,
      pythonVersion: python.version,
    }, null, 2), { flag: "wx", mode: 0o600 });
    activated = false;
    let cleanupWarning = "";
    try {
      await completeInstall(backupDir);
    } catch {
      cleanupWarning = "The new provider is ready, but its previous backup could not be removed automatically.";
    }
    return {
      ok: true,
      installDir,
      preflight,
      provider: manifest.displayName,
      ...(cleanupWarning ? { warning: cleanupWarning } : {}),
    };
  } catch (error) {
    if (activated) await rollbackInstall(installDir, backupDir);
    else await fs.rm(stagedDir, { recursive: true, force: true });
    throw error;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  let args;
  try {
    args = parseInstallArguments(process.argv.slice(2));
    const result = await installSam2Provider(args);
    console.log(args.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(args?.json ? JSON.stringify({ ok: false, error: error.message }) : error.message);
    process.exitCode = 1;
  }
}
