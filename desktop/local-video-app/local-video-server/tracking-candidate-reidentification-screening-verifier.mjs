import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { createTrackingCandidateProviderRegistry } from "./tracking-candidate-provider-registry.mjs";
import { verifyTrackingCandidateAssociationBundle } from "./tracking-candidate-association-screening-verifier.mjs";
import {
  createTrackingCandidateReidentificationManifest,
  summarizeTrackingCandidateReidentificationCase,
  TRACKING_CANDIDATE_REIDENTIFICATION_SCREENING_PROTOCOL,
  _private as screeningPrivate,
} from "./tracking-candidate-reidentification-screening.mjs";
import { normalizeTrackingCandidateScreeningPack } from "./tracking-candidate-screening.mjs";
import { validateTrackingCandidateStageRunArtifact } from "./tracking-candidate-stage-run-artifact.mjs";

const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

export class TrackingCandidateReidentificationVerificationError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_REIDENTIFICATION_VERIFICATION_FAILED") {
    super(message);
    this.name = "TrackingCandidateReidentificationVerificationError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateReidentificationVerificationError(message, code);
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
  ], "Re-identification screening manifest");
  if (Number(value.schemaVersion) !== 1
    || value.protocol !== TRACKING_CANDIDATE_REIDENTIFICATION_SCREENING_PROTOCOL
    || value.benchmarkOnly !== true
    || value.approvalReady !== false
    || value.groundTruthEvaluated !== false
    || !Array.isArray(value.cases)
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Re-identification screening manifest protocol is invalid.");
  }
  return value;
}

export async function verifyTrackingCandidateReidentificationBundle(options = {}, dependencies = {}) {
  const packFile = await readJson(options.packPath, MAXIMUM_JSON_BYTES, "Annotation pack");
  const pack = normalizeTrackingCandidateScreeningPack(packFile.value);
  const detectionDir = await canonicalDirectory(options.detectionScreeningDir, "Detection screening directory");
  const associationDir = await canonicalDirectory(options.associationScreeningDir, "Association screening directory");
  const reidentificationDir = await canonicalDirectory(options.screeningDir, "Re-identification screening directory");
  const registry = dependencies.registry || createTrackingCandidateProviderRegistry();
  const verifyAssociation = dependencies.verifyAssociation || verifyTrackingCandidateAssociationBundle;
  await verifyAssociation({
    packPath: packFile.path,
    detectionScreeningDir: detectionDir,
    screeningDir: associationDir,
  }, {
    registry,
    verifyDetection: dependencies.verifyDetection,
    validateDetectionEvidence: dependencies.validateDetectionEvidence,
    validateAssociationEvidence: dependencies.validateAssociationEvidence,
  });
  const associationManifestFile = await readJson(
    path.join(associationDir, "screening.json"),
    MAXIMUM_JSON_BYTES,
    "Association screening manifest",
    { readOnly: true },
  );
  const associationManifest = associationManifestFile.value;
  const manifestFile = await readJson(
    path.join(reidentificationDir, "screening.json"),
    MAXIMUM_JSON_BYTES,
    "Re-identification screening manifest",
    { readOnly: true },
  );
  const manifest = preliminaryManifest(manifestFile.value);
  if (manifest.input?.screeningSha256 !== associationManifest.screeningSha256
    || manifest.input?.id !== associationManifest.id) {
    invalid("Re-identification manifest is not bound to this association screening.");
  }
  const associationInstallation = await registry.resolve(
    associationManifest.provider?.id,
    associationManifest.provider?.version,
  );
  const reidentificationInstallation = await registry.resolve(manifest.provider?.id, manifest.provider?.version);
  const validateAssociation = dependencies.validateAssociationEvidence || validateTrackingCandidateStageRunArtifact;
  const validateReidentification = dependencies.validateReidentificationEvidence || validateTrackingCandidateStageRunArtifact;
  if (manifest.cases.length !== pack.cases.length || associationManifest.cases?.length !== pack.cases.length) {
    invalid("Screening cases do not match the annotation pack.");
  }
  const caseResults = [];
  for (let index = 0; index < pack.cases.length; index += 1) {
    const packCase = pack.cases[index];
    const associationCase = associationManifest.cases[index];
    const summary = manifest.cases[index];
    if (associationCase?.id !== packCase.id || summary?.id !== packCase.id) {
      invalid("Screening cases do not match the annotation pack.");
    }
    if (screeningPrivate.canonicalJson(summary.input?.associationEvidence)
      !== screeningPrivate.canonicalJson(associationCase.evidence)) {
      invalid("Re-identification case is not bound to its association evidence.");
    }
    const associationFile = await evidenceFile(
      associationDir,
      associationCase.evidence,
      packCase.id,
      "Association evidence",
    );
    const reidentificationFile = await evidenceFile(
      reidentificationDir,
      summary.evidence,
      packCase.id,
      "Re-identification evidence",
    );
    const associationEvidence = validateAssociation(associationFile.value, associationInstallation.provider);
    const reidentificationEvidence = validateReidentification(
      reidentificationFile.value,
      reidentificationInstallation.provider,
    );
    const rebuiltSummary = summarizeTrackingCandidateReidentificationCase({
      packCase,
      associationEvidence,
      associationDescriptor: associationCase.evidence,
      reidentificationEvidence,
      evidenceFile: reidentificationFile.relativeFile,
      evidenceBytes: reidentificationFile.bytes.byteLength,
      evidenceSha256: reidentificationFile.sha256,
    });
    caseResults.push({ provider: reidentificationEvidence.provider, summary: rebuiltSummary });
  }
  const rebuilt = createTrackingCandidateReidentificationManifest(pack, associationManifest, caseResults, {
    id: manifest.id,
    now: () => manifest.createdAt,
  });
  if (screeningPrivate.canonicalJson(rebuilt) !== screeningPrivate.canonicalJson(manifest)
    || rebuilt.screeningSha256 !== sha256(manifest.screeningSha256, "re-identification screening checksum")) {
    invalid("Re-identification manifest does not reproduce from its raw evidence.");
  }
  return Object.freeze({
    ok: true,
    protocol: rebuilt.protocol,
    id: identifier(rebuilt.id, "re-identification screening id"),
    status: rebuilt.status,
    provider: Object.freeze({
      id: reidentificationInstallation.provider.providerId,
      version: reidentificationInstallation.provider.providerVersion,
    }),
    caseCount: rebuilt.summary.caseCount,
    screeningSha256: rebuilt.screeningSha256,
  });
}
