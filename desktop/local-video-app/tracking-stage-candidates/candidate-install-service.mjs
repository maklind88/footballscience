import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTrackingCandidateProviderRegistry,
  trackingCandidatePolicyReasons,
  trackingCandidateRegistryDir,
} from "../local-video-server/tracking-candidate-provider-registry.mjs";
import { normalizeTrackingProviderManifest } from "../local-video-server/tracking-provider-contract.mjs";
import {
  trackingProviderExecutionFingerprint,
  trackingProviderFingerprint,
} from "../local-video-server/tracking-provider-evidence.mjs";
import { createTrackingStageSandboxExecutor } from "../local-video-server/tracking-stage-sandbox-executor.mjs";

const MAXIMUM_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;
const MAXIMUM_MODEL_BYTES = 100 * 1024 * 1024 * 1024;
const INSTALLATION_PROTOCOL = "football-science-tracking-candidate-installation-v1";

export class TrackingCandidateInstallError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_INSTALL_FAILED", options = {}) {
    super(message, options);
    this.name = "TrackingCandidateInstallError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateInstallError(message, code);
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

function exactArtifactPath(value, label) {
  const filePath = path.resolve(String(value || ""));
  if (!value || filePath.length > 4096) invalid(`Invalid ${label}.`, "TRACKING_CANDIDATE_ARTIFACT_INVALID");
  return filePath;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function openRegularFile(filePath, label) {
  let handle;
  try {
    const lstat = await fs.lstat(filePath);
    if (!lstat.isFile() || lstat.isSymbolicLink()) {
      invalid(`${label} must be one regular non-link file.`, "TRACKING_CANDIDATE_ARTIFACT_UNSAFE");
    }
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) invalid(`${label} is not a regular file.`, "TRACKING_CANDIDATE_ARTIFACT_UNSAFE");
    return { handle, stat };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof TrackingCandidateInstallError) throw error;
    invalid(`${label} could not be opened safely.`, "TRACKING_CANDIDATE_ARTIFACT_UNREADABLE");
  }
}

async function readStableJson(filePath, label) {
  const source = await openRegularFile(filePath, label);
  try {
    const bytes = Number(source.stat.size);
    if (!Number.isSafeInteger(bytes) || bytes < 2 || bytes > MAXIMUM_MANIFEST_BYTES) {
      invalid(`${label} is outside the size limit.`, "TRACKING_CANDIDATE_MANIFEST_LIMIT");
    }
    const buffer = await source.handle.readFile();
    const after = await source.handle.stat({ bigint: true });
    if (statSignature(source.stat) !== statSignature(after) || buffer.byteLength !== bytes) {
      invalid(`${label} changed while it was read.`, "TRACKING_CANDIDATE_ARTIFACT_CHANGED");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      invalid(`${label} must use valid UTF-8.`, "TRACKING_CANDIDATE_MANIFEST_INVALID");
    }
    try {
      return JSON.parse(text);
    } catch {
      invalid(`${label} is not valid JSON.`, "TRACKING_CANDIDATE_MANIFEST_INVALID");
    }
  } finally {
    await source.handle.close();
  }
}

export async function readTrackingCandidateManifest(manifestPath) {
  const raw = await readStableJson(exactArtifactPath(manifestPath, "candidate manifest"), "Candidate manifest");
  let provider;
  try {
    provider = normalizeTrackingProviderManifest(raw);
  } catch (error) {
    invalid(error.message || "Candidate manifest is invalid.", "TRACKING_CANDIDATE_MANIFEST_INVALID");
  }
  if (canonicalJson(raw) !== canonicalJson(provider)) {
    invalid("Candidate manifest contains hidden or non-canonical fields.", "TRACKING_CANDIDATE_MANIFEST_NON_CANONICAL");
  }
  const reasons = trackingCandidatePolicyReasons(provider);
  if (reasons.length) {
    invalid(`Candidate policy is incomplete: ${reasons.join(", ")}.`, "TRACKING_CANDIDATE_POLICY_BLOCKED");
  }
  return provider;
}

async function copyVerifiedArtifact(options = {}) {
  const sourcePath = exactArtifactPath(options.sourcePath, options.label);
  const source = await openRegularFile(sourcePath, options.label);
  let destination;
  try {
    const bytes = Number(source.stat.size);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > options.maximumBytes
      || (options.expectedBytes && bytes !== options.expectedBytes)) {
      invalid(`${options.label} byte size does not match the manifest.`, "TRACKING_CANDIDATE_ARTIFACT_SIZE_MISMATCH");
    }
    destination = await fs.open(options.destination, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    const digest = createHash("sha256");
    const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, bytes));
    let position = 0;
    while (position < bytes) {
      const { bytesRead } = await source.handle.read(chunk, 0, Math.min(chunk.length, bytes - position), position);
      if (!bytesRead) invalid(`${options.label} ended unexpectedly.`, "TRACKING_CANDIDATE_ARTIFACT_CHANGED");
      const value = chunk.subarray(0, bytesRead);
      digest.update(value);
      await destination.write(value, 0, bytesRead, position);
      position += bytesRead;
    }
    await destination.sync();
    const after = await source.handle.stat({ bigint: true });
    if (statSignature(source.stat) !== statSignature(after)) {
      invalid(`${options.label} changed while it was copied.`, "TRACKING_CANDIDATE_ARTIFACT_CHANGED");
    }
    const sha256 = digest.digest("hex");
    if (sha256 !== options.expectedSha256) {
      invalid(`${options.label} checksum does not match the manifest.`, "TRACKING_CANDIDATE_ARTIFACT_CHECKSUM_MISMATCH");
    }
    await destination.chmod(options.executable ? 0o555 : 0o444);
    return { bytes, sha256 };
  } finally {
    await destination?.close().catch(() => {});
    await source.handle.close();
  }
}

async function writeSealedJson(filePath, value) {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  const handle = await fs.open(filePath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(0o444);
  } finally {
    await handle.close();
  }
  return { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function normalizeModelSources(provider, modelSources = {}) {
  const entries = modelSources instanceof Map ? [...modelSources] : Object.entries(modelSources || {});
  const sources = new Map(entries.map(([id, filePath]) => [String(id || "").trim(), String(filePath || "")]));
  const expected = new Set(provider.models.map((model) => model.id));
  if (sources.size !== entries.length || sources.size !== expected.size
    || [...sources.keys()].some((id) => !expected.has(id))) {
    invalid("Candidate model files must match the manifest model ids exactly.", "TRACKING_CANDIDATE_MODEL_SET_MISMATCH");
  }
  return sources;
}

function installDirectoryName(provider = {}) {
  return `${provider.providerId}-${provider.providerVersion}`;
}

export function trackingCandidateInstallPlan(provider, options = {}) {
  const rootDir = path.resolve(options.registryDir || trackingCandidateRegistryDir(options));
  return {
    protocol: INSTALLATION_PROTOCOL,
    provider: {
      id: provider.providerId,
      version: provider.providerVersion,
      name: provider.displayName,
      stage: provider.stage,
      capabilities: [...provider.capabilities],
      approval: provider.approval.status,
    },
    source: {
      repository: provider.upstream.repository,
      commit: provider.upstream.commit,
      sha256: provider.upstream.sourceSha256,
      license: provider.upstream.license,
    },
    runtime: {
      sha256: provider.runtime.providerSha256,
      device: provider.runtime.device,
      mode: provider.runtime.runtimeMode,
      networkAtInference: provider.approval.networkAtInference,
    },
    models: provider.models.map((model) => ({
      id: model.id,
      bytes: model.bytes,
      sha256: model.sha256,
      license: model.license,
      datasets: model.provenance.datasets.map((dataset) => dataset.id),
    })),
    installDir: path.join(rootDir, installDirectoryName(provider)),
    activation: "benchmark-only",
  };
}

async function acquireInstallLock(rootDir) {
  const lockDir = path.join(rootDir, ".candidate-install-lock");
  try {
    await fs.mkdir(lockDir, { mode: 0o700 });
    return lockDir;
  } catch (error) {
    if (error?.code === "EEXIST") {
      invalid("Another tracking candidate installation is active.", "TRACKING_CANDIDATE_INSTALL_LOCKED");
    }
    throw error;
  }
}

async function assertRegistryBoundary(rootDir) {
  await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(rootDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    invalid("Candidate registry boundary is unsafe.", "TRACKING_CANDIDATE_REGISTRY_UNSAFE");
  }
}

export async function installTrackingCandidate(options = {}) {
  if (options.acceptLicense !== true) {
    invalid("Review the provider and model licences, then pass --accept-license.", "TRACKING_CANDIDATE_LICENSE_NOT_ACCEPTED");
  }
  const provider = await readTrackingCandidateManifest(options.manifestPath);
  const plan = trackingCandidateInstallPlan(provider, options);
  const modelSources = normalizeModelSources(provider, options.modelSources);
  const rootDir = path.dirname(plan.installDir);
  await assertRegistryBoundary(rootDir);
  const lockDir = await acquireInstallLock(rootDir);
  const stagedDir = path.join(rootDir, `.candidate-staged-${process.pid}-${Date.now()}`);
  let installed = false;
  try {
    try {
      await fs.lstat(plan.installDir);
      invalid("This exact tracking candidate is already installed.", "TRACKING_CANDIDATE_ALREADY_INSTALLED");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.mkdir(path.join(stagedDir, "runtime"), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(stagedDir, "models"), { recursive: true, mode: 0o700 });
    const runtimePath = path.join(stagedDir, "runtime", "provider");
    const runtime = await copyVerifiedArtifact({
      sourcePath: options.runtimePath,
      destination: runtimePath,
      expectedSha256: provider.runtime.providerSha256,
      maximumBytes: MAXIMUM_RUNTIME_BYTES,
      executable: true,
      label: "Candidate runtime",
    });
    const models = [];
    for (const model of provider.models) {
      const relativePath = path.posix.join("models", `${model.id}.bin`);
      const artifact = await copyVerifiedArtifact({
        sourcePath: modelSources.get(model.id),
        destination: path.join(stagedDir, relativePath),
        expectedBytes: model.bytes,
        expectedSha256: model.sha256,
        maximumBytes: MAXIMUM_MODEL_BYTES,
        label: `Candidate model ${model.id}`,
      });
      models.push({ id: model.id, path: relativePath, ...artifact });
    }
    const manifestFile = await writeSealedJson(path.join(stagedDir, "manifest.json"), provider);
    const marker = {
      schemaVersion: 1,
      protocol: INSTALLATION_PROTOCOL,
      provider: {
        id: provider.providerId,
        version: provider.providerVersion,
        fingerprintSha256: trackingProviderFingerprint(provider),
        executionFingerprintSha256: trackingProviderExecutionFingerprint(provider),
      },
      files: {
        manifest: { path: "manifest.json", ...manifestFile },
        runtime: { path: "runtime/provider", ...runtime },
        models,
      },
    };
    await writeSealedJson(path.join(stagedDir, "installation.json"), marker);
    await fs.chmod(path.join(stagedDir, "runtime"), 0o500);
    await fs.chmod(path.join(stagedDir, "models"), 0o500);
    await fs.rename(stagedDir, plan.installDir);
    installed = true;

    const registry = createTrackingCandidateProviderRegistry({ rootDir });
    const installation = await registry.resolve(provider.providerId, provider.providerVersion);
    const isolation = await createTrackingStageSandboxExecutor(options.sandbox || {}).inspect(installation);
    if (!isolation.ready) {
      invalid(
        `Candidate sandbox preflight failed: ${isolation.reasons.join(", ")}.`,
        "TRACKING_CANDIDATE_PREFLIGHT_FAILED",
      );
    }
    await fs.chmod(plan.installDir, 0o500);
    return { ok: true, plan, isolation };
  } catch (error) {
    if (installed) await fs.chmod(plan.installDir, 0o700).catch(() => {});
    await fs.rm(installed ? plan.installDir : stagedDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await fs.rmdir(lockDir).catch(() => {});
  }
}

export async function inspectTrackingCandidateInstallations(options = {}) {
  const rootDir = path.resolve(options.registryDir || trackingCandidateRegistryDir(options));
  const registry = createTrackingCandidateProviderRegistry({ rootDir });
  const snapshot = await registry.inspect();
  const executor = createTrackingStageSandboxExecutor(options.sandbox || {});
  const providers = [];
  for (const provider of snapshot.providers) {
    let isolation = { ready: false, status: "blocked", reasons: [...provider.reasons] };
    if (provider.status === "candidate-ready") {
      try {
        isolation = await executor.inspect(await registry.resolve(provider.id, provider.version));
      } catch (error) {
        isolation = { ready: false, status: "blocked", reasons: [String(error?.code || "candidate-preflight-failed")] };
      }
    }
    providers.push({
      ...provider,
      executionAvailable: isolation.ready === true,
      activationStatus: isolation.ready === true ? "benchmark-only" : "blocked",
      activationProtocol: String(isolation.protocol || ""),
      activationIsolation: String(isolation.isolation || ""),
      isolation,
    });
  }
  return {
    ok: snapshot.status === "ready" && providers.every((provider) => provider.isolation.ready),
    protocol: snapshot.protocol,
    registryStatus: snapshot.status,
    providerCount: providers.length,
    readyCount: providers.filter((provider) => provider.isolation.ready).length,
    blockedCount: providers.filter((provider) => !provider.isolation.ready).length,
    providers,
  };
}

export const _private = Object.freeze({
  canonicalJson,
  copyVerifiedArtifact,
  normalizeModelSources,
  statSignature,
});
