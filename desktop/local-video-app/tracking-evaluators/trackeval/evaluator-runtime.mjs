import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(moduleDir, "manifest.json");

export function readTrackEvalManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function trackEvalInstallDir(options = {}) {
  const env = options.env || process.env;
  const manifest = options.manifest || readTrackEvalManifest();
  const homeDir = options.homeDir || os.homedir();
  return env.FS_TRACKEVAL_INSTALL_DIR
    ? path.resolve(env.FS_TRACKEVAL_INSTALL_DIR)
    : path.join(
      homeDir,
      ".football-science",
      "tracking-evaluators",
      `${manifest.evaluatorId}-${manifest.evaluatorVersion}`,
    );
}

function markerMatches(marker = {}, manifest = {}) {
  return marker.schemaVersion === 1
    && marker.evaluatorId === manifest.evaluatorId
    && marker.evaluatorVersion === manifest.evaluatorVersion
    && marker.sourceCommit === manifest.upstream.commit
    && marker.sourceSha256 === manifest.upstream.sourceSha256;
}

export function trackEvalPaths(options = {}) {
  const manifest = options.manifest || readTrackEvalManifest();
  const installDir = options.installDir || trackEvalInstallDir({ ...options, manifest });
  const python = process.platform === "win32"
    ? path.join(installDir, "venv", "Scripts", "python.exe")
    : path.join(installDir, "venv", "bin", "python");
  return {
    installDir,
    manifest,
    marker: path.join(installDir, "install.json"),
    python,
    runner: path.join(installDir, "runtime", "evaluator.py"),
    sourceDir: path.join(installDir, "source"),
  };
}

export function resolveInstalledTrackEval(options = {}) {
  const paths = trackEvalPaths(options);
  const exists = options.exists || existsSync;
  const readMarker = options.readMarker || ((filePath) => JSON.parse(readFileSync(filePath, "utf8")));
  if (![paths.marker, paths.python, paths.runner, paths.sourceDir].every(exists)) return null;
  let marker;
  try {
    marker = readMarker(paths.marker);
  } catch {
    return null;
  }
  if (!markerMatches(marker, paths.manifest)) return null;
  return {
    command: paths.python,
    args: [paths.runner],
    evaluatorName: paths.manifest.evaluatorId,
    evaluatorVersion: paths.manifest.evaluatorVersion,
    installDir: paths.installDir,
    manifest: paths.manifest,
    env: {
      FS_TRACKEVAL_SOURCE_DIR: paths.sourceDir,
      FS_TRACKEVAL_SOURCE_COMMIT: paths.manifest.upstream.commit,
      FS_TRACKEVAL_SOURCE_SHA256: paths.manifest.upstream.sourceSha256,
    },
  };
}
