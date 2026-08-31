import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { createTrackingCandidateProviderRegistry } from "./tracking-candidate-provider-registry.mjs";
import {
  createTrackingCandidateAssociationManifest,
  summarizeTrackingCandidateAssociationCase,
  TRACKING_CANDIDATE_ASSOCIATION_SCREENING_PROTOCOL,
  _private as screeningPrivate,
} from "./tracking-candidate-association-screening.mjs";
import { verifyTrackingCandidateScreeningBundle } from "./tracking-candidate-screening-verifier.mjs";
import { normalizeTrackingCandidateScreeningPack } from "./tracking-candidate-screening.mjs";
import { validateTrackingCandidateStageRunArtifact } from "./tracking-candidate-stage-run-artifact.mjs";

const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

export class TrackingCandidateAssociationVerificationError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_ASSOCIATION_VERIFICATION_FAILED") {
    super(message);
    this.name = "TrackingCandidateAssociationVerificationError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateAssociationVerificationError(message, code);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    invalid(`${label} contains unsupported or missing fields.`);
  }
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 120 || !/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

async function canonicalDirectory(requestedPath, label) {
  const resolved = path.resolve(String(requestedPath || ""));
  const lstat = await fs.lstat(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (!lstat.isDirectory() || lstat.isSymbolicLink()) invalid(`${label} is unsafe.`);
  const canonical = await fs.realpath(resolved);
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  return canonical;
}

async function readStableFile(requestedPath, maximumBytes, label, options = {}) {
  const resolved = path.resolve(String(requestedPath || ""));
  const canonical = await fs.realpath(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  const lstat = await fs.lstat(canonical);
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > maximumBytes) {
    invalid(`${label} is unsafe.`);
  }
  if (options.readOnly && (lstat.mode & 0o222)) invalid(`${label} is not sealed read-only.`);
  const handle = await fs.open(canonical, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after) || bytes.byteLength !== Number(after.size)) {
      invalid(`${label} changed while reading.`);
    }
    return { bytes, path: canonical, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    await handle.close();
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid(`${label} is not valid UTF-8 JSON.`);
  }
}

async function readJson(requestedPath, maximumBytes, label, options = {}) {
  const file = await readStableFile(requestedPath, maximumBytes, label, options);
  return { ...file, value: parseJson(file.bytes, label) };
}

function evidenceRelativeFile(value, caseId, label) {
  const text = String(value || "");
  const expected = `cases/${caseId}.candidate-stage.json`;
  if (text !== expected || path.posix.normalize(text) !== text) invalid(`${label} path is invalid.`);
  return text;
}

async function evidenceFile(screeningDir, descriptor, caseId, label) {
  const relativeFile = evidenceRelativeFile(descriptor?.file, caseId, label);
  const requested = path.join(screeningDir, ...relativeFile.split("/"));
  if (!requested.startsWith(`${screeningDir}${path.sep}`)) invalid(`${label} escaped its bundle.`);
  const file = await readJson(requested, MAXIMUM_EVIDENCE_BYTES, label, { readOnly: true });
  if (file.bytes.byteLength !== Number(descriptor.bytes)
    || file.sha256 !== sha256(descriptor.sha256, `${label} checksum`)) {
    invalid(`${label} does not match its manifest.`);
  }
  return { ...file, relativeFile };
}

function preliminaryManifest(value = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "id", "benchmarkOnly", "approvalReady", "groundTruthEvaluated",
    "status", "createdAt", "pack", "input", "provider", "policy", "reviewGate", "summary",
    "limitations", "cases", "screeningSha256",
  ], "Association screening manifest");
  if (Number(value.schemaVersion) !== 1
    || value.protocol !== TRACKING_CANDIDATE_ASSOCIATION_SCREENING_PROTOCOL
    || value.benchmarkOnly !== true
    || value.approvalReady !== false
    || value.groundTruthEvaluated !== false
    || !Array.isArray(value.cases)
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Association screening manifest protocol is invalid.");
  }
  return value;
}

export async function verifyTrackingCandidateAssociationBundle(options = {}, dependencies = {}) {
  const packFile = await readJson(options.packPath, MAXIMUM_JSON_BYTES, "Annotation pack");
  const pack = normalizeTrackingCandidateScreeningPack(packFile.value);
  const detectionDir = await canonicalDirectory(options.detectionScreeningDir, "Detection screening directory");
  const associationDir = await canonicalDirectory(options.screeningDir, "Association screening directory");
  const registry = dependencies.registry || createTrackingCandidateProviderRegistry();
  const verifyDetection = dependencies.verifyDetection || verifyTrackingCandidateScreeningBundle;
  await verifyDetection(
    { packPath: packFile.path, screeningDir: detectionDir },
    { registry, validateEvidence: dependencies.validateDetectionEvidence },
  );
  const detectionManifestFile = await readJson(
    path.join(detectionDir, "screening.json"),
    MAXIMUM_JSON_BYTES,
    "Detection screening manifest",
    { readOnly: true },
  );
  const detectionManifest = detectionManifestFile.value;
  const manifestFile = await readJson(
    path.join(associationDir, "screening.json"),
    MAXIMUM_JSON_BYTES,
    "Association screening manifest",
    { readOnly: true },
  );
  const manifest = preliminaryManifest(manifestFile.value);
  if (manifest.input?.screeningSha256 !== detectionManifest.screeningSha256
    || manifest.input?.id !== detectionManifest.id) {
    invalid("Association manifest is not bound to this detection screening.");
  }
  const detectionInstallation = await registry.resolve(
    detectionManifest.provider?.id,
    detectionManifest.provider?.version,
  );
  const associationInstallation = await registry.resolve(manifest.provider?.id, manifest.provider?.version);
  const validateDetection = dependencies.validateDetectionEvidence || validateTrackingCandidateStageRunArtifact;
  const validateAssociation = dependencies.validateAssociationEvidence || validateTrackingCandidateStageRunArtifact;
  if (manifest.cases.length !== pack.cases.length || detectionManifest.cases?.length !== pack.cases.length) {
    invalid("Screening cases do not match the annotation pack.");
  }
  const caseResults = [];
  for (let index = 0; index < pack.cases.length; index += 1) {
    const packCase = pack.cases[index];
    const detectionCase = detectionManifest.cases[index];
    const summary = manifest.cases[index];
    if (detectionCase?.id !== packCase.id || summary?.id !== packCase.id) {
      invalid("Screening cases do not match the annotation pack.");
    }
    if (screeningPrivate.canonicalJson(summary.input?.detectionEvidence)
      !== screeningPrivate.canonicalJson(detectionCase.evidence)) {
      invalid("Association case is not bound to its detection evidence.");
    }
    const detectionFile = await evidenceFile(
      detectionDir,
      detectionCase.evidence,
      packCase.id,
      "Detection evidence",
    );
    const associationFile = await evidenceFile(
      associationDir,
      summary.evidence,
      packCase.id,
      "Association evidence",
    );
    const detectionEvidence = validateDetection(detectionFile.value, detectionInstallation.provider);
    const associationEvidence = validateAssociation(associationFile.value, associationInstallation.provider);
    const rebuiltSummary = summarizeTrackingCandidateAssociationCase({
      packCase,
      detectionEvidence,
      detectionDescriptor: detectionCase.evidence,
      associationEvidence,
      evidenceFile: associationFile.relativeFile,
      evidenceBytes: associationFile.bytes.byteLength,
      evidenceSha256: associationFile.sha256,
    });
    caseResults.push({ provider: associationEvidence.provider, summary: rebuiltSummary });
  }
  const rebuilt = createTrackingCandidateAssociationManifest(pack, detectionManifest, caseResults, {
    id: manifest.id,
    now: () => manifest.createdAt,
  });
  if (screeningPrivate.canonicalJson(rebuilt) !== screeningPrivate.canonicalJson(manifest)
    || rebuilt.screeningSha256 !== sha256(manifest.screeningSha256, "association screening checksum")) {
    invalid("Association manifest does not reproduce from its raw evidence.");
  }
  return Object.freeze({
    ok: true,
    protocol: rebuilt.protocol,
    id: identifier(rebuilt.id, "association screening id"),
    status: rebuilt.status,
    provider: Object.freeze({ id: associationInstallation.provider.providerId, version: associationInstallation.provider.providerVersion }),
    caseCount: rebuilt.summary.caseCount,
    screeningSha256: rebuilt.screeningSha256,
  });
}
