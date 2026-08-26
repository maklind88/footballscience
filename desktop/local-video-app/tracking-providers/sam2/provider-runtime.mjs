import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
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
  "football_science_sam2/resident_worker.py",
  "football_science_sam2/sam2_engine.py",
  "football_science_sam2/track_builder.py",
]);

export const SAM2_UPSTREAM_RUNTIME_ROOTS = Object.freeze([
  "LICENSE",
  "pyproject.toml",
  "setup.py",
  "sam2",
]);

export function readSam2ProviderManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sam2ProviderManifestSha256(manifest = readSam2ProviderManifest()) {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function sam2ProviderPreferredDevice(manifest = readSam2ProviderManifest(), options = {}) {
  const env = options.env || process.env;
  const explicit = String(env.FS_SAM2_DEVICE || "").trim().toLowerCase();
  if (explicit) return explicit;
  const platform = options.platform || process.platform;
  const configured = String(manifest.runtime?.deviceDefaults?.[platform] || "auto").trim().toLowerCase();
  return ["auto", "cpu", "cuda", "mps"].includes(configured) ? configured : "auto";
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
    && marker.sourceRuntimeSha256 === manifest.upstream.runtimeTreeSha256
    && marker.checkpointSha256 === manifest.model.checkpointSha256
    && marker.providerSha256 === manifest.runtime.providerSha256
    && marker.manifestSha256 === sam2ProviderManifestSha256(manifest);
}

function updateDigestFromFile(digest, filePath) {
  const descriptor = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

export function sam2ProviderFileSha256(filePath) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Provider asset must be a regular file.");
  const digest = createHash("sha256");
  updateDigestFromFile(digest, filePath);
  return digest.digest("hex");
}

function sourceRuntimeEntries(rootDir, relativePath, entries) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(absolutePath);
    const resolvedTarget = path.resolve(path.dirname(absolutePath), target);
    const insideApprovedRoot = SAM2_UPSTREAM_RUNTIME_ROOTS.some((entry) => {
      const approvedRoot = path.join(rootDir, entry);
      return resolvedTarget === approvedRoot || resolvedTarget.startsWith(`${approvedRoot}${path.sep}`);
    });
    let targetStat = null;
    try {
      targetStat = lstatSync(resolvedTarget);
    } catch {
      // Invalid links fail through the common boundary below.
    }
    if (!insideApprovedRoot || !targetStat?.isFile() || targetStat.isSymbolicLink()) {
      throw new Error("Provider source link leaves the approved runtime tree.");
    }
    entries.push({ kind: "link", relativePath, target });
    return;
  }
  if (stat.isFile()) {
    if (!relativePath.endsWith(".pyc")) entries.push({ kind: "file", relativePath, absolutePath });
    return;
  }
  if (!stat.isDirectory()) throw new Error("Provider source contains an unsupported entry.");
  for (const entry of readdirSync(absolutePath).sort()) {
    if (entry === "__pycache__") continue;
    sourceRuntimeEntries(rootDir, path.join(relativePath, entry), entries);
  }
}

export function sam2ProviderSourceRuntimeSha256(paths = {}) {
  const rootDir = path.resolve(paths.sourceDir);
  const entries = [];
  for (const relativePath of SAM2_UPSTREAM_RUNTIME_ROOTS) {
    sourceRuntimeEntries(rootDir, relativePath, entries);
  }
  const digest = createHash("sha256");
  for (const entry of entries.sort((first, second) => first.relativePath.localeCompare(second.relativePath))) {
    const normalizedPath = entry.relativePath.split(path.sep).join("/");
    digest.update(entry.kind);
    digest.update("\0");
    digest.update(normalizedPath);
    digest.update("\0");
    if (entry.kind === "link") digest.update(entry.target);
    else updateDigestFromFile(digest, entry.absolutePath);
    digest.update("\0");
  }
  return digest.digest("hex");
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
    const checkpointSha256 = options.checkpointSha256 || sam2ProviderFileSha256;
    const sourceRuntimeSha256 = options.sourceRuntimeSha256 || sam2ProviderSourceRuntimeSha256;
    if (runtimeSha256(paths) !== paths.manifest.runtime.providerSha256
      || checkpointSha256(paths.checkpoint) !== paths.manifest.model.checkpointSha256
      || sourceRuntimeSha256(paths) !== paths.manifest.upstream.runtimeTreeSha256) return null;
  } catch {
    return null;
  }
  const env = options.env || process.env;
  return {
    command: paths.python,
    args: [paths.providerEntry],
    engineName: paths.manifest.providerId,
    displayName: paths.manifest.displayName,
    engineVersion: paths.manifest.providerVersion,
    providerExecutionFingerprintSha256: sam2ProviderExecutionFingerprintSha256(paths.manifest),
    startupTimeoutMs: paths.manifest.runtime.maximumWorkerStartupMs,
    jobTimeoutMs: paths.manifest.runtime.maximumJobWallTimeMs,
    installDir: paths.installDir,
    env: {
      FS_SAM2_CHECKPOINT: paths.checkpoint,
      FS_SAM2_CHECKPOINT_SHA256: paths.manifest.model.checkpointSha256,
      FS_SAM2_CONFIG: paths.manifest.model.config,
      FS_SAM2_DEVICE: sam2ProviderPreferredDevice(paths.manifest, {
        env,
        platform: options.platform,
      }),
      FS_SAM2_MODEL_NAME: paths.manifest.model.displayName,
      FS_SAM2_SAMPLE_FPS: String(paths.manifest.runtime.sampleFps),
      FS_SAM2_MAX_FRAMES: String(paths.manifest.runtime.maximumFrames),
      PYTHONPATH: [paths.sourceDir, env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    },
  };
}
