import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackingProviderExecutionFingerprintSha256 } from "../provider-execution-fingerprint.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(moduleDir, "manifest.json");

export const SAM2_PROVIDER_RUNTIME_FILES = Object.freeze([
  "provider.py",
  "football_science_sam2/__init__.py",
  "football_science_sam2/cli.py",
  "football_science_sam2/media.py",
  "football_science_sam2/protocol.py",
  "football_science_sam2/sam2_engine.py",
  "football_science_sam2/track_builder.py",
]);

export function readSam2ProviderManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function sam2ProviderInstallDir(options = {}) {
  const env = options.env || process.env;
  const manifest = options.manifest || readSam2ProviderManifest();
  const homeDir = options.homeDir || os.homedir();
  return env.FS_SAM2_INSTALL_DIR
    ? path.resolve(env.FS_SAM2_INSTALL_DIR)
    : path.join(homeDir, ".football-science", "tracking-providers", `${manifest.providerId}-${manifest.providerVersion}`);
}

function markerMatches(marker = {}, manifest = {}) {
  return marker.schemaVersion === 1
    && marker.providerId === manifest.providerId
    && marker.providerVersion === manifest.providerVersion
    && marker.sourceCommit === manifest.upstream.commit
    && marker.sourceSha256 === manifest.upstream.sourceSha256
    && marker.checkpointSha256 === manifest.model.checkpointSha256
    && marker.providerSha256 === manifest.runtime.providerSha256;
}

export function sam2ProviderPaths(options = {}) {
  const manifest = options.manifest || readSam2ProviderManifest();
  const installDir = options.installDir || sam2ProviderInstallDir({ ...options, manifest });
  const python = process.platform === "win32"
    ? path.join(installDir, "venv", "Scripts", "python.exe")
    : path.join(installDir, "venv", "bin", "python");
  return {
    installDir,
    manifest,
    marker: path.join(installDir, "install.json"),
    python,
    providerEntry: path.join(installDir, "runtime", "provider.py"),
    runtimeDir: path.join(installDir, "runtime"),
    checkpoint: path.join(installDir, "checkpoints", manifest.model.fileName),
    sourceDir: path.join(installDir, "source"),
  };
}

export function sam2ProviderRuntimeSha256(paths = {}, options = {}) {
  const readFile = options.readFile || readFileSync;
  const digest = createHash("sha256");
  for (const relativePath of SAM2_PROVIDER_RUNTIME_FILES) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(readFile(path.join(paths.runtimeDir, relativePath)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function sam2ProviderExecutionFingerprintSha256(manifest = readSam2ProviderManifest()) {
  return trackingProviderExecutionFingerprintSha256({
    providerId: manifest.providerId,
    providerVersion: manifest.providerVersion,
    protocol: "football-science-tracking-stage-v1",
    stage: "segmentation",
    capabilities: ["segment:selected-object", "propagate:selected-object"],
    sourceCommit: manifest.upstream?.commit,
    sourceSha256: manifest.upstream?.sourceSha256,
    modelSha256s: [manifest.model?.checkpointSha256],
    runtimeSha256: manifest.runtime?.providerSha256,
  });
}

export const sam2ProviderFingerprintSha256 = sam2ProviderExecutionFingerprintSha256;

export function resolveInstalledSam2Provider(options = {}) {
  const paths = sam2ProviderPaths(options);
  const exists = options.exists || existsSync;
  const readMarker = options.readMarker || ((filePath) => JSON.parse(readFileSync(filePath, "utf8")));
  if (![paths.marker, paths.python, paths.providerEntry, paths.checkpoint, paths.sourceDir].every(exists)) return null;
  let marker;
  try {
    marker = readMarker(paths.marker);
  } catch {
    return null;
  }
  if (!markerMatches(marker, paths.manifest)) return null;
  try {
    const runtimeSha256 = options.runtimeSha256 || sam2ProviderRuntimeSha256;
    if (runtimeSha256(paths) !== paths.manifest.runtime.providerSha256) return null;
  } catch {
    return null;
  }
  return {
    command: paths.python,
    args: [paths.providerEntry],
    engineName: paths.manifest.providerId,
    displayName: paths.manifest.displayName,
    engineVersion: paths.manifest.providerVersion,
    providerExecutionFingerprintSha256: sam2ProviderExecutionFingerprintSha256(paths.manifest),
    installDir: paths.installDir,
    env: {
      FS_SAM2_CHECKPOINT: paths.checkpoint,
      FS_SAM2_CHECKPOINT_SHA256: paths.manifest.model.checkpointSha256,
      FS_SAM2_CONFIG: paths.manifest.model.config,
      FS_SAM2_MODEL_NAME: paths.manifest.model.displayName,
      FS_SAM2_SAMPLE_FPS: String(paths.manifest.runtime.sampleFps),
      FS_SAM2_MAX_FRAMES: String(paths.manifest.runtime.maximumFrames),
    },
  };
}
