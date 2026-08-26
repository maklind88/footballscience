import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  completeInstall,
  rollbackInstall,
  runCapture,
  runVisible,
  stageInstallDirectory,
  stageVerifiedAsset,
} from "../../tracking-providers/sam2/install-support.mjs";
import {
  readTrackEvalManifest,
  trackEvalInstallDir,
  trackEvalPaths,
} from "./evaluator-runtime.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function parseTrackEvalInstallArguments(values = []) {
  const result = {
    acceptLicense: false,
    force: false,
    installDir: "",
    json: false,
    plan: false,
    python: "",
    sourceArchive: "",
  };
  const valueOptions = new Map([
    ["--install-dir", "installDir"],
    ["--python", "python"],
    ["--source-archive", "sourceArchive"],
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

function supportedPython(value = "") {
  const match = String(value).match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 10 && minor < 13;
}

export async function selectTrackEvalPython(options = {}) {
  const candidates = [...new Set([
    options.command,
    options.env?.FS_TRACKEVAL_PYTHON,
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
  ].filter(Boolean))];
  for (const command of candidates) {
    try {
      const result = await runCapture(command, ["--version"], { allowFailure: true });
      const version = `${result.stdout} ${result.stderr}`.trim();
      if (result.code === 0 && supportedPython(version)) return { command, version };
    } catch {
      // Continue to the next explicit Python candidate.
    }
  }
  return null;
}

export function trackEvalInstallPlan(args = {}, options = {}) {
  const manifest = options.manifest || readTrackEvalManifest();
  const installDir = args.installDir
    ? path.resolve(args.installDir)
    : trackEvalInstallDir({ manifest, env: options.env || process.env, homeDir: options.homeDir });
  return {
    evaluator: `${manifest.displayName} ${manifest.evaluatorVersion}`,
    installDir,
    protocol: manifest.protocol,
    source: {
      commit: manifest.upstream.commit,
      bytes: manifest.upstream.sourceBytes,
      sha256: manifest.upstream.sourceSha256,
      license: manifest.upstream.license,
    },
    metrics: ["HOTA", "DetA", "AssA", "LocA", "MOTA", "IDF1"],
    runtime: {
      python: `${manifest.runtime.pythonMinimum} <= version < ${manifest.runtime.pythonMaximumExclusive}`,
      isolatedVirtualEnvironment: true,
      networkAtEvaluation: false,
    },
  };
}

async function copyRuntimeAndPolicy(stagedDir, sourceDir) {
  await fs.cp(path.join(moduleDir, "runtime"), path.join(stagedDir, "runtime"), { recursive: true });
  const policyDir = path.join(stagedDir, "policy");
  await fs.mkdir(policyDir, { recursive: true });
  for (const fileName of ["manifest.json", "THIRD_PARTY_NOTICES.md", "runtime-requirements.txt"]) {
    await fs.copyFile(path.join(moduleDir, fileName), path.join(policyDir, fileName));
  }
  await fs.copyFile(path.join(sourceDir, "LICENSE"), path.join(policyDir, "UPSTREAM_LICENSE"));
}

async function installRuntime(paths, python, manifest) {
  await runVisible(python.command, ["-m", "venv", path.join(paths.installDir, "venv")]);
  await runVisible(paths.python, [
    "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--only-binary=:all:",
    "-r", path.join(paths.installDir, "policy", "runtime-requirements.txt"),
  ]);
  const packages = await runCapture(paths.python, ["-m", "pip", "freeze", "--all"]);
  await fs.writeFile(path.join(paths.installDir, "installed-packages.txt"), packages.stdout, { mode: 0o600 });
  const preflight = await runCapture(paths.python, [paths.runner, "--preflight", "--json"], {
    env: {
      ...process.env,
      FS_TRACKEVAL_SOURCE_DIR: paths.sourceDir,
      FS_TRACKEVAL_SOURCE_COMMIT: manifest.upstream.commit,
      FS_TRACKEVAL_SOURCE_SHA256: manifest.upstream.sourceSha256,
    },
  });
  const report = JSON.parse(preflight.stdout.trim());
  if (!report.ok) throw new Error("The TrackEval reference preflight did not pass.");
  return report;
}

export async function installTrackEval(args = {}, options = {}) {
  if (!["darwin", "linux"].includes(process.platform)) {
    throw new Error("The approved TrackEval installer currently supports macOS and Linux. Use WSL on Windows.");
  }
  const manifest = options.manifest || readTrackEvalManifest();
  const plan = trackEvalInstallPlan(args, { ...options, manifest });
  if (args.plan) return { ok: true, plan };
  if (!args.acceptLicense) {
    throw new Error("Review THIRD_PARTY_NOTICES.md and rerun with --accept-license before downloading TrackEval.");
  }
  const python = await (options.selectPython || selectTrackEvalPython)({
    command: args.python,
    env: options.env || process.env,
  });
  if (!python) throw new Error("TrackEval requires Python 3.10, 3.11, or 3.12. Install one or pass --python.");

  const installDir = plan.installDir;
  const stagedDir = `${installDir}.staged-${process.pid}-${Date.now()}`;
  const sourceArchive = path.join(stagedDir, "downloads", "trackeval-source.tar.gz");
  let backupDir = "";
  let activated = false;
  await fs.mkdir(stagedDir, { recursive: true, mode: 0o700 });
  try {
    await stageVerifiedAsset({
      destination: sourceArchive,
      expected: { bytes: manifest.upstream.sourceBytes, sha256: manifest.upstream.sourceSha256 },
      localPath: args.sourceArchive,
      maxBytes: manifest.upstream.sourceBytes,
      url: manifest.upstream.sourceUrl,
    });
    const sourceDir = path.join(stagedDir, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    await runVisible("tar", ["-xzf", sourceArchive, "-C", sourceDir, "--strip-components=1"]);
    for (const required of [
      "LICENSE",
      "trackeval/metrics/hota.py",
      "trackeval/metrics/clear.py",
      "trackeval/metrics/identity.py",
    ]) await fs.access(path.join(sourceDir, required));
    await fs.rm(path.join(stagedDir, "downloads"), { recursive: true, force: true });
    await copyRuntimeAndPolicy(stagedDir, sourceDir);

    backupDir = await stageInstallDirectory(stagedDir, installDir, args.force);
    activated = true;
    const paths = trackEvalPaths({ manifest, installDir });
    const preflight = await installRuntime(paths, python, manifest);
    await fs.writeFile(paths.marker, JSON.stringify({
      schemaVersion: 1,
      evaluatorId: manifest.evaluatorId,
      evaluatorVersion: manifest.evaluatorVersion,
      sourceCommit: manifest.upstream.commit,
      sourceSha256: manifest.upstream.sourceSha256,
      installedAt: new Date().toISOString(),
      platform: process.platform,
      pythonVersion: python.version,
    }, null, 2), { flag: "wx", mode: 0o600 });
    activated = false;
    let cleanupWarning = "";
    try {
      await completeInstall(backupDir);
    } catch {
      cleanupWarning = "TrackEval is ready, but its previous backup could not be removed automatically.";
    }
    return {
      ok: true,
      evaluator: manifest.displayName,
      installDir,
      preflight,
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
    args = parseTrackEvalInstallArguments(process.argv.slice(2));
    const result = await installTrackEval(args);
    console.log(args.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(args?.json ? JSON.stringify({ ok: false, error: error.message }) : error.message);
    process.exitCode = 1;
  }
}
