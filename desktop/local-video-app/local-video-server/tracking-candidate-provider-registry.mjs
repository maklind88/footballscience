import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeTrackingProviderManifest,
  trackingProviderLicencePolicyReasons,
} from "./tracking-provider-contract.mjs";
import {
  trackingProviderExecutionFingerprint,
  trackingProviderFingerprint,
} from "./tracking-provider-evidence.mjs";

export const TRACKING_CANDIDATE_INSTALLATION_PROTOCOL = "football-science-tracking-candidate-installation-v1";
export const TRACKING_CANDIDATE_REGISTRY_PROTOCOL = "football-science-tracking-candidate-registry-v1";

const MAXIMUM_PROVIDERS = 20;
const MAXIMUM_MODELS = 32;
const MAXIMUM_MARKER_BYTES = 256 * 1024;
const MAXIMUM_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;
const MAXIMUM_MODEL_BYTES = 100 * 1024 * 1024 * 1024;
const versionCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export class TrackingCandidateInstallationError extends Error {
  constructor(code = "candidate-installation-invalid") {
    super(code);
    this.name = "TrackingCandidateInstallationError";
    this.code = code;
  }
}

function invalid(code = "candidate-installation-invalid") {
  throw new TrackingCandidateInstallationError(code);
}

function exactKeys(value, keys, code = "candidate-installation-invalid") {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(code);
}

function identifier(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) invalid();
  return text;
}

function checksum(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid();
  return text;
}

function positiveBytes(value, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) invalid();
  return number;
}

function relativeArtifactPath(value) {
  const text = String(value || "").trim();
  const segments = text.split("/");
  if (!text || text.length > 240 || path.isAbsolute(text) || text.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === ".."
      || !/^[a-zA-Z0-9._-]+$/.test(segment))) invalid("candidate-artifact-path-invalid");
  return segments.join(path.sep);
}

function fileDescriptor(value, maximumBytes, model = false) {
  exactKeys(value, model ? ["id", "path", "bytes", "sha256"] : ["path", "bytes", "sha256"]);
  return {
    ...(model ? { id: identifier(value.id) } : {}),
    path: relativeArtifactPath(value.path),
    bytes: positiveBytes(value.bytes, maximumBytes),
    sha256: checksum(value.sha256),
  };
}

function normalizeInstallation(value = {}) {
  exactKeys(value, ["schemaVersion", "protocol", "provider", "files"]);
  if (Number(value.schemaVersion) !== 1 || value.protocol !== TRACKING_CANDIDATE_INSTALLATION_PROTOCOL) invalid();
  exactKeys(value.provider, [
    "id", "version", "fingerprintSha256", "executionFingerprintSha256",
  ]);
  exactKeys(value.files, ["manifest", "runtime", "models"]);
  if (!Array.isArray(value.files.models) || value.files.models.length > MAXIMUM_MODELS) invalid();
  return {
    provider: {
      id: identifier(value.provider.id),
      version: identifier(value.provider.version),
      fingerprintSha256: checksum(value.provider.fingerprintSha256),
      executionFingerprintSha256: checksum(value.provider.executionFingerprintSha256),
    },
    files: {
      manifest: fileDescriptor(value.files.manifest, MAXIMUM_MANIFEST_BYTES),
      runtime: fileDescriptor(value.files.runtime, MAXIMUM_RUNTIME_BYTES),
      models: value.files.models.map((entry) => fileDescriptor(entry, MAXIMUM_MODEL_BYTES, true)),
    },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function statSignature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((value) => String(value)).join(":");
}

async function verifiedArtifactPath(rootDir, relativePath) {
  const root = await fs.realpath(path.resolve(rootDir));
  let current = root;
  for (const segment of relativePath.split(path.sep)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) invalid("candidate-artifact-link-blocked");
    if (current !== path.join(root, relativePath) && !stat.isDirectory()) invalid("candidate-artifact-path-invalid");
  }
  const resolved = await fs.realpath(current);
  if (!resolved.startsWith(`${root}${path.sep}`)) invalid("candidate-artifact-path-invalid");
  return current;
}

async function readArtifact(rootDir, descriptor, json = false, digestCache = new Map()) {
  const filePath = await verifiedArtifactPath(rootDir, descriptor.path);
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.size !== BigInt(descriptor.bytes)) invalid("candidate-artifact-size-mismatch");
    const signature = statSignature(stat);
    const cached = digestCache.get(filePath);
    if (!json && cached?.signature === signature && cached.sha256 === descriptor.sha256) return filePath;
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, descriptor.bytes));
    const jsonChunks = json ? [] : null;
    let position = 0;
    while (position < descriptor.bytes) {
      const length = Math.min(buffer.length, descriptor.bytes - position);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead < 1) invalid("candidate-artifact-size-mismatch");
      const chunk = buffer.subarray(0, bytesRead);
      digest.update(chunk);
      jsonChunks?.push(Buffer.from(chunk));
      position += bytesRead;
    }
    const sha256 = digest.digest("hex");
    if (sha256 !== descriptor.sha256) invalid("candidate-artifact-checksum-mismatch");
    digestCache.set(filePath, { signature, sha256 });
    return json ? JSON.parse(Buffer.concat(jsonChunks).toString("utf8")) : filePath;
  } catch (error) {
    if (error instanceof TrackingCandidateInstallationError) throw error;
    invalid(json ? "candidate-artifact-json-invalid" : "candidate-artifact-unreadable");
  } finally {
    await handle.close();
  }
}

async function installationMarker(providerDir) {
  const markerPath = await verifiedArtifactPath(providerDir, "installation.json");
  const handle = await fs.open(markerPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat({ bigint: true });
    positiveBytes(Number(stat.size), MAXIMUM_MARKER_BYTES);
    if (!stat.isFile()) invalid();
    return normalizeInstallation(JSON.parse(await handle.readFile("utf8")));
  } catch (error) {
    if (error instanceof TrackingCandidateInstallationError) throw error;
    invalid();
  } finally {
    await handle.close();
  }
}

export function trackingCandidatePolicyReasons(provider = {}) {
  const reasons = trackingProviderLicencePolicyReasons(provider);
  if (provider.approval?.status !== "candidate") reasons.push("candidate-status-required");
  if (provider.approval?.networkAtInference) reasons.push("inference-network-enabled");
  if (!provider.approval?.licenseReviewed) reasons.push("licence-not-reviewed");
  if (provider.benchmark?.status === "passed") reasons.push("approved-provider-registry-required");
  if (!provider.runtime?.device
    || !provider.runtime?.runtimeMode
    || !Number.isSafeInteger(provider.runtime?.cpuThreads)
    || provider.runtime.cpuThreads < 1
    || !(Number(provider.runtime?.sampleFps) > 0)) {
    reasons.push("candidate-execution-profile-incomplete");
  }
  for (const model of provider.models || []) {
    if (!model.provenance?.trainingDataReviewed) reasons.push("model-training-data-not-reviewed");
    if (model.provenance?.datasets?.some((dataset) => !dataset.rightsReviewed)) {
      reasons.push("model-dataset-rights-not-reviewed");
    }
    if (provider.capabilities?.some((capability) => /^(?:reidentify:|classify:shirt-number)/.test(capability))
      && model.provenance?.datasets?.some((dataset) => !dataset.identityUseReviewed)) {
      reasons.push("model-identity-use-not-reviewed");
    }
  }
  return [...new Set(reasons)];
}

function publicCandidate(provider = {}, reasons = []) {
  const ready = Boolean(provider.protocol && !reasons.length);
  return {
    id: provider.providerId || "",
    version: provider.providerVersion || "",
    name: provider.displayName || provider.providerId || "Blocked local candidate",
    protocol: provider.protocol || "",
    stage: provider.stage || "",
    priority: Number(provider.priority) || 0,
    capabilities: Array.isArray(provider.capabilities) ? [...provider.capabilities] : [],
    status: ready ? "candidate-ready" : "blocked",
    available: ready,
    executionAvailable: false,
    benchmarkOnly: true,
    providerFingerprintSha256: provider.protocol ? trackingProviderFingerprint(provider) : "",
    executionFingerprintSha256: provider.protocol ? trackingProviderExecutionFingerprint(provider) : "",
    executionProfile: provider.protocol ? {
      device: provider.runtime.device,
      runtimeMode: provider.runtime.runtimeMode,
      cpuThreads: provider.runtime.cpuThreads,
      sampleFps: provider.runtime.sampleFps,
      modelResident: provider.runtime.modelResident,
    } : null,
    source: ready ? "verified-local-candidate-registry" : "local-candidate-registry-blocked",
    reasons: [...new Set(reasons)].slice(0, 20),
  };
}

async function inspectCandidateDirectory(providerDir, digestCache, includeExecution = false) {
  let provider = {};
  try {
    const marker = await installationMarker(providerDir);
    const manifestValue = await readArtifact(providerDir, marker.files.manifest, true, digestCache);
    provider = normalizeTrackingProviderManifest(manifestValue);
    if (canonicalJson(manifestValue) !== canonicalJson(provider)
      || provider.providerId !== marker.provider.id
      || provider.providerVersion !== marker.provider.version
      || trackingProviderFingerprint(provider) !== marker.provider.fingerprintSha256
      || trackingProviderExecutionFingerprint(provider) !== marker.provider.executionFingerprintSha256) {
      invalid("candidate-installation-identity-mismatch");
    }
    if (provider.runtime.providerSha256 !== marker.files.runtime.sha256) {
      invalid("candidate-runtime-checksum-mismatch");
    }
    const runtimePath = await readArtifact(providerDir, marker.files.runtime, false, digestCache);
    const modelFiles = new Map(marker.files.models.map((entry) => [entry.id, entry]));
    if (modelFiles.size !== marker.files.models.length || modelFiles.size !== provider.models.length) {
      invalid("candidate-model-set-mismatch");
    }
    const models = [];
    for (const model of provider.models) {
      const artifact = modelFiles.get(model.id);
      if (!artifact || artifact.bytes !== model.bytes || artifact.sha256 !== model.sha256) {
        invalid("candidate-model-checksum-mismatch");
      }
      models.push({ ...artifact, filePath: await readArtifact(providerDir, artifact, false, digestCache) });
    }
    const reasons = trackingCandidatePolicyReasons(provider);
    const publicValue = publicCandidate(provider, reasons);
    return {
      publicValue,
      execution: includeExecution && !reasons.length ? {
        provider,
        providerDir: await fs.realpath(providerDir),
        runtime: { ...marker.files.runtime, filePath: runtimePath },
        models,
      } : null,
    };
  } catch (error) {
    return {
      publicValue: publicCandidate(provider, [error instanceof TrackingCandidateInstallationError
        ? error.code
        : "candidate-installation-invalid"]),
      execution: null,
    };
  }
}

function blockDuplicateIdentities(values = []) {
  const counts = new Map();
  const identity = (entry) => entry.id && entry.version ? `${entry.id}\u0000${entry.version}` : "";
  values.forEach((entry) => {
    const key = identity(entry);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return values.map((entry) => counts.get(identity(entry)) > 1 ? {
    ...entry,
    status: "blocked",
    available: false,
    reasons: [...new Set([...entry.reasons, "duplicate-candidate-identity"])],
  } : entry);
}

function compareProviderVersions(first, second) {
  const [leftRelease, ...leftPrerelease] = String(first || "").split("-");
  const [rightRelease, ...rightPrerelease] = String(second || "").split("-");
  const releaseOrder = versionCollator.compare(leftRelease, rightRelease);
  if (releaseOrder) return releaseOrder;
  if (!leftPrerelease.length && rightPrerelease.length) return 1;
  if (leftPrerelease.length && !rightPrerelease.length) return -1;
  return versionCollator.compare(leftPrerelease.join("-"), rightPrerelease.join("-"));
}

export function trackingCandidateRegistryDir(options = {}) {
  const env = options.env || process.env;
  return path.resolve(env.FS_TRACKING_CANDIDATE_REGISTRY_DIR
    || path.join(options.homeDir || os.homedir(), ".football-science", "tracking-stage-candidates"));
}

export function createTrackingCandidateProviderRegistry(options = {}) {
  const rootDir = path.resolve(options.rootDir || trackingCandidateRegistryDir(options));
  const digestCache = new Map();

  async function entries() {
    try {
      const stat = await fs.lstat(rootDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) invalid("candidate-registry-boundary-invalid");
      const values = (await fs.readdir(rootDir, { withFileTypes: true })).filter((entry) => !entry.name.startsWith("."));
      if (values.length > MAXIMUM_PROVIDERS) invalid("candidate-registry-limit-exceeded");
      return values.sort((first, second) => first.name.localeCompare(second.name));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  return {
    async resolve(providerId, providerVersion = "") {
      const id = identifier(providerId);
      const version = providerVersion ? identifier(providerVersion) : "";
      const matches = [];
      for (const entry of await entries()) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const record = await inspectCandidateDirectory(path.join(rootDir, entry.name), digestCache, true);
        if (record.publicValue.id === id && (!version || record.publicValue.version === version)) matches.push(record);
      }
      if (matches.length !== 1) invalid(matches.length
        ? "candidate-installation-ambiguous"
        : "candidate-installation-not-found");
      if (!matches[0].execution || matches[0].publicValue.status !== "candidate-ready") {
        invalid("candidate-installation-not-ready");
      }
      return matches[0].execution;
    },
    async inspect() {
      let providerEntries;
      try {
        providerEntries = await entries();
      } catch (error) {
        return {
          protocol: TRACKING_CANDIDATE_REGISTRY_PROTOCOL,
          status: "blocked",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: [error instanceof TrackingCandidateInstallationError
            ? error.code
            : "candidate-registry-unreadable"],
        };
      }
      const providers = [];
      for (const entry of providerEntries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          providers.push(publicCandidate({}, ["candidate-directory-invalid"]));
        } else {
          providers.push((await inspectCandidateDirectory(path.join(rootDir, entry.name), digestCache)).publicValue);
        }
      }
      const deduplicated = blockDuplicateIdentities(providers).sort((first, second) => (
        first.stage.localeCompare(second.stage)
        || second.priority - first.priority
        || first.id.localeCompare(second.id)
        || compareProviderVersions(second.version, first.version)
      ));
      return {
        protocol: TRACKING_CANDIDATE_REGISTRY_PROTOCOL,
        status: "ready",
        providerCount: deduplicated.length,
        readyCount: deduplicated.filter((provider) => provider.status === "candidate-ready").length,
        blockedCount: deduplicated.filter((provider) => provider.status === "blocked").length,
        providers: deduplicated,
        reasons: [],
      };
    },
  };
}
