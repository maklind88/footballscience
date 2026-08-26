import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeTrackingProviderManifest,
  trackingProviderReadiness,
} from "./tracking-provider-contract.mjs";
import {
  trackingProviderExecutionFingerprint,
  trackingProviderFingerprint,
} from "./tracking-provider-evidence.mjs";

export const TRACKING_PROVIDER_INSTALLATION_PROTOCOL = "football-science-tracking-provider-installation-v1";
export const TRACKING_PROVIDER_REGISTRY_PROTOCOL = "football-science-tracking-provider-registry-v1";

const MAXIMUM_PROVIDERS = 50;
const MAXIMUM_MODELS = 32;
const MAXIMUM_MARKER_BYTES = 256 * 1024;
const MAXIMUM_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;
const MAXIMUM_MODEL_BYTES = 100 * 1024 * 1024 * 1024;

class TrackingProviderInstallationError extends Error {
  constructor(code) {
    super(code);
    this.name = "TrackingProviderInstallationError";
    this.code = code;
  }
}

function invalid(code = "provider-installation-invalid") {
  throw new TrackingProviderInstallationError(code);
}

function exactKeys(value, keys, code = "provider-installation-invalid") {
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
      || !/^[a-zA-Z0-9._-]+$/.test(segment))) invalid("provider-artifact-path-invalid");
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
  if (Number(value.schemaVersion) !== 1 || value.protocol !== TRACKING_PROVIDER_INSTALLATION_PROTOCOL) invalid();
  exactKeys(value.provider, [
    "id", "version", "fingerprintSha256", "executionFingerprintSha256",
  ]);
  exactKeys(value.files, ["manifest", "report", "evidence", "runtime", "models"]);
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
      report: fileDescriptor(value.files.report, MAXIMUM_EVIDENCE_BYTES),
      evidence: fileDescriptor(value.files.evidence, MAXIMUM_EVIDENCE_BYTES),
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
    if (stat.isSymbolicLink()) invalid("provider-artifact-link-blocked");
    if (current !== path.join(root, relativePath) && !stat.isDirectory()) invalid("provider-artifact-path-invalid");
  }
  const resolved = await fs.realpath(current);
  if (!resolved.startsWith(`${root}${path.sep}`)) invalid("provider-artifact-path-invalid");
  return current;
}

async function openRegularArtifact(rootDir, descriptor) {
  const filePath = await verifiedArtifactPath(rootDir, descriptor.path);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0);
  const handle = await fs.open(filePath, flags);
  const stat = await handle.stat({ bigint: true });
  if (!stat.isFile() || stat.size !== BigInt(descriptor.bytes)) {
    await handle.close();
    invalid("provider-artifact-size-mismatch");
  }
  return { filePath, handle, stat };
}

async function artifactSha256(rootDir, descriptor, digestCache) {
  const opened = await openRegularArtifact(rootDir, descriptor);
  try {
    const signature = statSignature(opened.stat);
    const cached = digestCache.get(opened.filePath);
    if (cached?.signature === signature) return cached.sha256;
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < descriptor.bytes) {
      const length = Math.min(buffer.length, descriptor.bytes - position);
      const { bytesRead } = await opened.handle.read(buffer, 0, length, position);
      if (!bytesRead) invalid("provider-artifact-size-mismatch");
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const sha256 = digest.digest("hex");
    digestCache.set(opened.filePath, { signature, sha256 });
    return sha256;
  } finally {
    await opened.handle.close();
  }
}

async function readVerifiedJson(rootDir, descriptor, digestCache) {
  const opened = await openRegularArtifact(rootDir, descriptor);
  try {
    const buffer = Buffer.alloc(descriptor.bytes);
    const { bytesRead } = await opened.handle.read(buffer, 0, descriptor.bytes, 0);
    if (bytesRead !== descriptor.bytes) invalid("provider-artifact-size-mismatch");
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== descriptor.sha256) invalid("provider-artifact-checksum-mismatch");
    digestCache.set(opened.filePath, {
      signature: statSignature(opened.stat),
      sha256: actualSha256,
    });
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    if (error instanceof TrackingProviderInstallationError) throw error;
    invalid("provider-artifact-json-invalid");
  } finally {
    await opened.handle.close();
  }
}

async function readInstallationMarker(providerDir) {
  const descriptor = { path: "installation.json", bytes: 0 };
  const markerPath = await verifiedArtifactPath(providerDir, descriptor.path);
  const stat = await fs.stat(markerPath);
  descriptor.bytes = positiveBytes(stat.size, MAXIMUM_MARKER_BYTES);
  const opened = await openRegularArtifact(providerDir, descriptor);
  try {
    const value = JSON.parse(await opened.handle.readFile("utf8"));
    return normalizeInstallation(value);
  } catch (error) {
    if (error instanceof TrackingProviderInstallationError) throw error;
    invalid("provider-installation-invalid");
  } finally {
    await opened.handle.close();
  }
}

function publicProvider(provider = {}, readiness = {}, reasons = []) {
  const ready = readiness.ready === true && reasons.length === 0;
  const hasIdentity = Boolean(provider.protocol && provider.stage && provider.runtime);
  return {
    id: provider.providerId || "",
    version: provider.providerVersion || "",
    name: provider.displayName || provider.providerId || "Blocked local provider",
    protocol: provider.protocol || "",
    stage: provider.stage || "",
    priority: Number(provider.priority) || 0,
    capabilities: Array.isArray(provider.capabilities) ? [...provider.capabilities] : [],
    status: ready ? "ready" : "blocked",
    available: ready,
    executionAvailable: false,
    activationStatus: "not-configured",
    benchmarkStatus: ready ? "passed" : String(provider.benchmark?.status || "blocked"),
    providerFingerprintSha256: hasIdentity ? trackingProviderFingerprint(provider) : "",
    executionFingerprintSha256: hasIdentity ? trackingProviderExecutionFingerprint(provider) : "",
    source: ready ? "verified-local-registry" : "local-registry-blocked",
    reasons: [...new Set(reasons.length ? reasons : readiness.reasons || [])].slice(0, 20),
  };
}

async function inspectProviderDirectory(providerDir, digestCache) {
  let marker = null;
  let provider = {};
  try {
    marker = await readInstallationMarker(providerDir);
    const [manifestValue, report, evidence] = await Promise.all([
      readVerifiedJson(providerDir, marker.files.manifest, digestCache),
      readVerifiedJson(providerDir, marker.files.report, digestCache),
      readVerifiedJson(providerDir, marker.files.evidence, digestCache),
    ]);
    provider = normalizeTrackingProviderManifest(manifestValue);
    if (canonicalJson(manifestValue) !== canonicalJson(provider)) invalid("provider-manifest-not-canonical");
    if (provider.providerId !== marker.provider.id || provider.providerVersion !== marker.provider.version
      || trackingProviderFingerprint(provider) !== marker.provider.fingerprintSha256
      || trackingProviderExecutionFingerprint(provider) !== marker.provider.executionFingerprintSha256) {
      invalid("provider-installation-identity-mismatch");
    }
    if (marker.files.runtime.sha256 !== provider.runtime.providerSha256
      || await artifactSha256(providerDir, marker.files.runtime, digestCache) !== provider.runtime.providerSha256) {
      invalid("provider-runtime-checksum-mismatch");
    }
    const modelFiles = new Map(marker.files.models.map((entry) => [entry.id, entry]));
    if (modelFiles.size !== marker.files.models.length || modelFiles.size !== provider.models.length) {
      invalid("provider-model-set-mismatch");
    }
    for (const model of provider.models) {
      const artifact = modelFiles.get(model.id);
      if (!artifact || artifact.bytes !== model.bytes || artifact.sha256 !== model.sha256
        || await artifactSha256(providerDir, artifact, digestCache) !== model.sha256) {
        invalid("provider-model-checksum-mismatch");
      }
    }
    const readiness = trackingProviderReadiness(provider, { report, evidence });
    return publicProvider(provider, readiness);
  } catch (error) {
    const reasons = [error instanceof TrackingProviderInstallationError
      ? error.code
      : "provider-installation-invalid"];
    if (!provider.providerId && marker?.provider) {
      provider = { providerId: marker.provider.id, providerVersion: marker.provider.version };
    }
    return publicProvider(provider, {}, reasons);
  }
}

function blockDuplicateProviderIds(providers = []) {
  const counts = new Map();
  for (const provider of providers) {
    if (provider.id) counts.set(provider.id, (counts.get(provider.id) || 0) + 1);
  }
  return providers.map((provider) => counts.get(provider.id) > 1 ? {
    ...provider,
    status: "blocked",
    available: false,
    benchmarkStatus: "blocked",
    reasons: [...new Set([...provider.reasons, "duplicate-provider-id"])],
  } : provider);
}

export function trackingProviderRegistryDir(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  return path.resolve(env.FS_TRACKING_PROVIDER_REGISTRY_DIR
    || path.join(homeDir, ".football-science", "tracking-stage-providers"));
}

export function createTrackingProviderRegistry(options = {}) {
  const rootDir = path.resolve(options.rootDir || trackingProviderRegistryDir(options));
  const digestCache = new Map();
  return {
    async inspect() {
      let rootStat;
      try {
        rootStat = await fs.lstat(rootDir);
      } catch (error) {
        if (error?.code === "ENOENT") return {
          protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          status: "ready",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: [],
        };
        return {
          protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          status: "blocked",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: ["provider-registry-unreadable"],
        };
      }
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        return {
          protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          status: "blocked",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: ["provider-registry-boundary-invalid"],
        };
      }
      let entries;
      try {
        entries = (await fs.readdir(rootDir, { withFileTypes: true }))
          .filter((entry) => !entry.name.startsWith("."));
      } catch {
        return {
          protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          status: "blocked",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: ["provider-registry-unreadable"],
        };
      }
      const maximumProviders = Math.max(
        1,
        Math.min(MAXIMUM_PROVIDERS, Math.round(Number(options.maximumProviders) || MAXIMUM_PROVIDERS)),
      );
      if (entries.length > maximumProviders) {
        return {
          protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
          status: "blocked",
          providerCount: 0,
          readyCount: 0,
          blockedCount: 0,
          providers: [],
          reasons: ["provider-registry-limit-exceeded"],
        };
      }
      const providers = [];
      for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          providers.push(publicProvider({}, {}, ["provider-directory-invalid"]));
          continue;
        }
        providers.push(await inspectProviderDirectory(path.join(rootDir, entry.name), digestCache));
      }
      const safeProviders = blockDuplicateProviderIds(providers).sort((first, second) => (
        first.stage.localeCompare(second.stage)
        || second.priority - first.priority
        || first.id.localeCompare(second.id)
      ));
      const readyCount = safeProviders.filter((provider) => provider.status === "ready").length;
      const blockedCount = safeProviders.length - readyCount;
      return {
        protocol: TRACKING_PROVIDER_REGISTRY_PROTOCOL,
        status: blockedCount ? (readyCount ? "degraded" : "blocked") : "ready",
        providerCount: safeProviders.length,
        readyCount,
        blockedCount,
        providers: safeProviders,
        reasons: [],
      };
    },
  };
}
