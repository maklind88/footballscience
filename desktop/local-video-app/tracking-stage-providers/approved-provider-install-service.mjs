import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import {
  createTrackingCandidateProviderRegistry,
  trackingCandidateRegistryDir,
} from "../local-video-server/tracking-candidate-provider-registry.mjs";
import {
  createTrackingProviderRegistry,
  trackingProviderRegistryDir,
} from "../local-video-server/tracking-provider-registry.mjs";
import {
  normalizeTrackingProviderManifest,
  trackingProviderReadiness,
} from "../local-video-server/tracking-provider-contract.mjs";
import {
  trackingProviderBenchmarkFromEvidence,
  trackingProviderExecutionFingerprint,
  trackingProviderFingerprint,
} from "../local-video-server/tracking-provider-evidence.mjs";
import { createTrackingStageSandboxExecutor } from "../local-video-server/tracking-stage-sandbox-executor.mjs";

export const TRACKING_APPROVED_PROVIDER_INSTALLATION_PROTOCOL =
  "football-science-tracking-provider-installation-v1";

const MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 4 * 1024 * 1024 * 1024;
const MAXIMUM_MODEL_BYTES = 100 * 1024 * 1024 * 1024;

export class TrackingApprovedProviderInstallError extends Error {
  constructor(message, code = "TRACKING_APPROVED_PROVIDER_INSTALL_FAILED", options = {}) {
    super(message, options);
    this.name = "TrackingApprovedProviderInstallError";
    this.code = code;
  }
}

function invalid(message, code, cause) {
  throw new TrackingApprovedProviderInstallError(message, code, cause ? { cause } : {});
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

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) {
    invalid(`Invalid ${label}.`, "TRACKING_APPROVED_PROVIDER_IDENTITY_INVALID");
  }
  return text;
}

function sourcePath(value, label) {
  const filePath = path.resolve(String(value || ""));
  if (!value || filePath.length > 4096) {
    invalid(`Invalid ${label}.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_INVALID");
  }
  return filePath;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function openRegularFile(filePath, label) {
  let handle;
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      invalid(`${label} must be one regular non-link file.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_UNSAFE");
    }
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const openedStat = await handle.stat({ bigint: true });
    if (!openedStat.isFile()) {
      invalid(`${label} is not a regular file.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_UNSAFE");
    }
    return { handle, stat: openedStat };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof TrackingApprovedProviderInstallError) throw error;
    invalid(`${label} could not be opened safely.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_UNREADABLE", error);
  }
}

async function readStableJson(filePath, label) {
  const resolved = sourcePath(filePath, label);
  const source = await openRegularFile(resolved, label);
  try {
    const bytes = Number(source.stat.size);
    if (!Number.isSafeInteger(bytes) || bytes < 2 || bytes > MAXIMUM_JSON_BYTES) {
      invalid(`${label} is outside the size limit.`, "TRACKING_APPROVED_PROVIDER_JSON_LIMIT");
    }
    const buffer = await source.handle.readFile();
    const after = await source.handle.stat({ bigint: true });
    if (statSignature(source.stat) !== statSignature(after) || buffer.byteLength !== bytes) {
      invalid(`${label} changed while it was read.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_CHANGED");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      invalid(`${label} must use valid UTF-8.`, "TRACKING_APPROVED_PROVIDER_JSON_INVALID");
    }
    try {
      return JSON.parse(text);
    } catch {
      invalid(`${label} is not valid JSON.`, "TRACKING_APPROVED_PROVIDER_JSON_INVALID");
    }
  } finally {
    await source.handle.close();
  }
}

async function copyVerifiedArtifact(options = {}) {
  const source = await openRegularFile(sourcePath(options.sourcePath, options.label), options.label);
  let destination;
  try {
    const bytes = Number(source.stat.size);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > options.maximumBytes
      || bytes !== Number(options.expectedBytes)) {
      invalid(`${options.label} byte size changed.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_SIZE_MISMATCH");
    }
    destination = await fs.open(
      options.destination,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    const digest = createHash("sha256");
    const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, bytes));
    let position = 0;
    while (position < bytes) {
      const { bytesRead } = await source.handle.read(
        chunk,
        0,
        Math.min(chunk.length, bytes - position),
        position,
      );
      if (!bytesRead) {
        invalid(`${options.label} ended unexpectedly.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_CHANGED");
      }
      const value = chunk.subarray(0, bytesRead);
      digest.update(value);
      await destination.write(value, 0, bytesRead, position);
      position += bytesRead;
    }
    await destination.sync();
    const after = await source.handle.stat({ bigint: true });
    if (statSignature(source.stat) !== statSignature(after)) {
      invalid(`${options.label} changed while it was copied.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_CHANGED");
    }
    const sha256 = digest.digest("hex");
    if (sha256 !== options.expectedSha256) {
      invalid(`${options.label} checksum changed.`, "TRACKING_APPROVED_PROVIDER_ARTIFACT_CHECKSUM_MISMATCH");
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

function rootsOverlap(first, second) {
  const a = path.resolve(first);
  const b = path.resolve(second);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}

async function canonicalProspectivePath(filePath) {
  let current = path.resolve(filePath);
  const missing = [];
  while (true) {
    try {
      return path.join(await fs.realpath(current), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

async function assertSeparateRegistryRoots(candidateRoot, providerRoot) {
  const [candidateCanonical, providerCanonical] = await Promise.all([
    canonicalProspectivePath(candidateRoot),
    canonicalProspectivePath(providerRoot),
  ]);
  if (rootsOverlap(candidateCanonical, providerCanonical)) {
    invalid(
      "Candidate and approved provider registries must be separate.",
      "TRACKING_APPROVED_PROVIDER_REGISTRY_OVERLAP",
    );
  }
}

async function assertRegistryBoundary(rootDir) {
  await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(rootDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    invalid("Approved provider registry boundary is unsafe.", "TRACKING_APPROVED_PROVIDER_REGISTRY_UNSAFE");
  }
}

async function acquireInstallLock(rootDir) {
  const lockDir = path.join(rootDir, ".approved-provider-install-lock");
  try {
    await fs.mkdir(lockDir, { mode: 0o700 });
    return lockDir;
  } catch (error) {
    if (error?.code === "EEXIST") {
      invalid("Another approved provider installation is active.", "TRACKING_APPROVED_PROVIDER_INSTALL_LOCKED");
    }
    throw error;
  }
}

async function makeTreeWritable(target) {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch {
    return;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    await fs.chmod(target, 0o600).catch(() => {});
    return;
  }
  await fs.chmod(target, 0o700).catch(() => {});
  for (const entry of await fs.readdir(target)) await makeTreeWritable(path.join(target, entry));
}

function installDirectoryName(provider = {}) {
  return `${provider.providerId}-${provider.providerVersion}`;
}

async function approvedInputs(options = {}) {
  const candidateId = identifier(options.candidateId, "candidate provider id");
  const candidateVersion = identifier(options.candidateVersion, "candidate provider version");
  const candidateRoot = path.resolve(options.candidateRegistryDir || trackingCandidateRegistryDir(options));
  const providerRoot = path.resolve(options.providerRegistryDir || trackingProviderRegistryDir(options));
  if (rootsOverlap(candidateRoot, providerRoot)) {
    invalid(
      "Candidate and approved provider registries must be separate.",
      "TRACKING_APPROVED_PROVIDER_REGISTRY_OVERLAP",
    );
  }
  await assertSeparateRegistryRoots(candidateRoot, providerRoot);
  const candidateRegistry = createTrackingCandidateProviderRegistry({ rootDir: candidateRoot });
  let candidate;
  try {
    candidate = await candidateRegistry.resolve(candidateId, candidateVersion);
  } catch (error) {
    invalid(
      "The exact verified candidate installation is unavailable.",
      "TRACKING_APPROVED_PROVIDER_CANDIDATE_INVALID",
      error,
    );
  }
  const report = await readStableJson(options.reportPath, "Benchmark report");
  const evidence = await readStableJson(options.evidencePath, "Provider evidence");
  const provider = normalizeTrackingProviderManifest({
    ...candidate.provider,
    approval: { ...candidate.provider.approval, status: "approved-local-optional" },
    benchmark: trackingProviderBenchmarkFromEvidence(evidence),
  });
  const readiness = trackingProviderReadiness(provider, { report, evidence });
  if (!readiness.ready) {
    invalid(
      `Approved provider evidence is incomplete: ${readiness.reasons.join(", ")}.`,
      "TRACKING_APPROVED_PROVIDER_EVIDENCE_BLOCKED",
    );
  }
  if (trackingProviderFingerprint(provider) !== trackingProviderFingerprint(candidate.provider)
    || trackingProviderExecutionFingerprint(provider) !== trackingProviderExecutionFingerprint(candidate.provider)) {
    invalid(
      "Approved provider artifacts do not match the candidate installation.",
      "TRACKING_APPROVED_PROVIDER_IDENTITY_MISMATCH",
    );
  }
  return { candidate, candidateRegistry, candidateRoot, evidence, provider, providerRoot, report };
}

export function trackingApprovedProviderInstallPlan(inputs = {}) {
  return {
    protocol: TRACKING_APPROVED_PROVIDER_INSTALLATION_PROTOCOL,
    provider: {
      id: inputs.provider.providerId,
      version: inputs.provider.providerVersion,
      name: inputs.provider.displayName,
      stage: inputs.provider.stage,
      capabilities: [...inputs.provider.capabilities],
    },
    candidate: {
      fingerprintSha256: trackingProviderFingerprint(inputs.candidate.provider),
      executionFingerprintSha256: trackingProviderExecutionFingerprint(inputs.candidate.provider),
    },
    benchmark: {
      profileId: inputs.provider.benchmark.profileId,
      caseCount: inputs.provider.benchmark.caseCount,
      realMatchDurationMs: inputs.provider.benchmark.realMatchDurationMs,
      reportSha256: inputs.provider.benchmark.reportSha256,
      evidenceSha256: inputs.provider.benchmark.evidenceSha256,
    },
    installDir: path.join(inputs.providerRoot, installDirectoryName(inputs.provider)),
    activation: "approved-local-optional",
  };
}

export async function planApprovedTrackingProviderInstallation(options = {}) {
  const inputs = await approvedInputs(options);
  return { ok: true, plan: trackingApprovedProviderInstallPlan(inputs) };
}

export async function installApprovedTrackingProvider(options = {}) {
  if (options.acceptLicense !== true) {
    invalid(
      "Review the provider, model, and dataset terms, then pass --accept-license.",
      "TRACKING_APPROVED_PROVIDER_LICENSE_NOT_ACCEPTED",
    );
  }
  if (options.approveActivation !== true) {
    invalid(
      "Pass --approve-local-activation to create a normal tracking provider installation.",
      "TRACKING_APPROVED_PROVIDER_ACTIVATION_NOT_ACCEPTED",
    );
  }
  const inputs = await approvedInputs(options);
  const plan = trackingApprovedProviderInstallPlan(inputs);
  await assertRegistryBoundary(inputs.providerRoot);
  await assertSeparateRegistryRoots(inputs.candidateRoot, inputs.providerRoot);
  const lockDir = await acquireInstallLock(inputs.providerRoot);
  const stagedDir = path.join(inputs.providerRoot, `.approved-staged-${process.pid}-${Date.now()}`);
  let installed = false;
  try {
    try {
      await fs.lstat(plan.installDir);
      invalid(
        "This exact approved provider is already installed.",
        "TRACKING_APPROVED_PROVIDER_ALREADY_INSTALLED",
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.mkdir(path.join(stagedDir, "runtime"), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(stagedDir, "models"), { recursive: true, mode: 0o700 });
    const runtime = await copyVerifiedArtifact({
      sourcePath: inputs.candidate.runtime.filePath,
      destination: path.join(stagedDir, "runtime", "provider"),
      expectedBytes: inputs.candidate.runtime.bytes,
      expectedSha256: inputs.provider.runtime.providerSha256,
      maximumBytes: MAXIMUM_RUNTIME_BYTES,
      executable: true,
      label: "Candidate runtime",
    });
    const models = [];
    const candidateModels = new Map(inputs.candidate.models.map((model) => [model.id, model]));
    for (const model of inputs.provider.models) {
      const source = candidateModels.get(model.id);
      if (!source) {
        invalid("Candidate model set changed.", "TRACKING_APPROVED_PROVIDER_MODEL_SET_MISMATCH");
      }
      const relativePath = path.posix.join("models", `${model.id}.bin`);
      const artifact = await copyVerifiedArtifact({
        sourcePath: source.filePath,
        destination: path.join(stagedDir, relativePath),
        expectedBytes: model.bytes,
        expectedSha256: model.sha256,
        maximumBytes: MAXIMUM_MODEL_BYTES,
        label: `Candidate model ${model.id}`,
      });
      models.push({ id: model.id, path: relativePath, ...artifact });
    }
    const manifestFile = await writeSealedJson(path.join(stagedDir, "manifest.json"), inputs.provider);
    const reportFile = await writeSealedJson(path.join(stagedDir, "benchmark-report.json"), inputs.report);
    const evidenceFile = await writeSealedJson(path.join(stagedDir, "provider-evidence.json"), inputs.evidence);
    const marker = {
      schemaVersion: 1,
      protocol: TRACKING_APPROVED_PROVIDER_INSTALLATION_PROTOCOL,
      provider: {
        id: inputs.provider.providerId,
        version: inputs.provider.providerVersion,
        fingerprintSha256: trackingProviderFingerprint(inputs.provider),
        executionFingerprintSha256: trackingProviderExecutionFingerprint(inputs.provider),
      },
      files: {
        manifest: { path: "manifest.json", ...manifestFile },
        report: { path: "benchmark-report.json", ...reportFile },
        evidence: { path: "provider-evidence.json", ...evidenceFile },
        runtime: { path: "runtime/provider", ...runtime },
        models,
      },
    };
    await writeSealedJson(path.join(stagedDir, "installation.json"), marker);
    await fs.chmod(path.join(stagedDir, "runtime"), 0o500);
    await fs.chmod(path.join(stagedDir, "models"), 0o500);
    await fs.rename(stagedDir, plan.installDir);
    installed = true;

    const providerRegistry = createTrackingProviderRegistry({ rootDir: inputs.providerRoot });
    const installation = await providerRegistry.resolve(inputs.provider.providerId, inputs.provider.providerVersion);
    const isolation = await createTrackingStageSandboxExecutor(options.sandbox || {}).inspect(installation);
    if (!isolation.ready) {
      invalid(
        `Approved provider sandbox preflight failed: ${isolation.reasons.join(", ")}.`,
        "TRACKING_APPROVED_PROVIDER_PREFLIGHT_FAILED",
      );
    }
    const candidateAfter = await inputs.candidateRegistry.resolve(
      inputs.provider.providerId,
      inputs.provider.providerVersion,
    );
    if (trackingProviderFingerprint(candidateAfter.provider) !== marker.provider.fingerprintSha256
      || trackingProviderExecutionFingerprint(candidateAfter.provider)
        !== marker.provider.executionFingerprintSha256) {
      invalid(
        "Candidate installation changed during approved provider installation.",
        "TRACKING_APPROVED_PROVIDER_CANDIDATE_CHANGED",
      );
    }
    await fs.chmod(plan.installDir, 0o500);
    return { ok: true, plan, isolation };
  } catch (error) {
    const target = installed ? plan.installDir : stagedDir;
    await makeTreeWritable(target);
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await fs.rmdir(lockDir).catch(() => {});
  }
}

export const _private = Object.freeze({
  canonicalProspectivePath,
  canonicalJson,
  copyVerifiedArtifact,
  readStableJson,
  rootsOverlap,
  statSignature,
});
