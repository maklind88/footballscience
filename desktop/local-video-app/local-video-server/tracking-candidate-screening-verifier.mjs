import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { createTrackingCandidateProviderRegistry } from "./tracking-candidate-provider-registry.mjs";
import { validateTrackingCandidateStageRunArtifact } from "./tracking-candidate-stage-run-artifact.mjs";
import {
  createTrackingCandidateScreeningManifest,
  normalizeTrackingCandidateScreeningPack,
  summarizeTrackingCandidateScreeningCase,
  TRACKING_CANDIDATE_SCREENING_PROTOCOL,
} from "./tracking-candidate-screening.mjs";

const MAXIMUM_PACK_BYTES = 4 * 1024 * 1024;
const MAXIMUM_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

export class TrackingCandidateScreeningVerificationError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_SCREENING_VERIFICATION_FAILED") {
    super(message);
    this.name = "TrackingCandidateScreeningVerificationError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateScreeningVerificationError(message, code);
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

async function readStableRegularFile(filePath, maximumBytes, label, options = {}) {
  const lstat = await fs.lstat(filePath).catch(() => invalid(`${label} is unavailable.`));
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > maximumBytes) {
    invalid(`${label} is unsafe.`);
  }
  if (options.readOnly && (lstat.mode & 0o222)) invalid(`${label} is not sealed read-only.`);
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after) || bytes.byteLength !== Number(after.size)) {
      invalid(`${label} changed while reading.`);
    }
    return bytes;
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

async function canonicalRegularFile(requestedPath, maximumBytes, label, options = {}) {
  const resolved = path.resolve(String(requestedPath || ""));
  const canonical = await fs.realpath(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  const bytes = await readStableRegularFile(canonical, maximumBytes, label, options);
  return { bytes, path: canonical };
}

async function canonicalDirectory(requestedPath) {
  const resolved = path.resolve(String(requestedPath || ""));
  const lstat = await fs.lstat(resolved).catch(() => invalid("Screening directory is unavailable."));
  if (!lstat.isDirectory() || lstat.isSymbolicLink()) invalid("Screening directory is unsafe.");
  const canonical = await fs.realpath(resolved);
  if (canonical !== resolved) invalid("Screening directory crossed a linked path.");
  return canonical;
}

function evidenceRelativeFile(value, caseId) {
  const text = String(value || "");
  const expected = `cases/${caseId}.candidate-stage.json`;
  if (text !== expected || path.posix.normalize(text) !== text) invalid("Screening evidence path is invalid.");
  return text;
}

async function evidenceFile(screeningDir, relativeFile, expected = {}) {
  const requested = path.join(screeningDir, ...relativeFile.split("/"));
  const canonical = await fs.realpath(requested).catch(() => invalid("Screening evidence is unavailable."));
  if (!canonical.startsWith(`${screeningDir}${path.sep}`) || canonical !== requested) {
    invalid("Screening evidence crossed its bundle boundary.");
  }
  const bytes = await readStableRegularFile(canonical, MAXIMUM_EVIDENCE_BYTES, "Screening evidence", {
    readOnly: true,
  });
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== Number(expected.bytes) || digest !== sha256(expected.sha256, "screening evidence checksum")) {
    invalid("Screening evidence does not match its manifest.");
  }
  return { bytes, digest };
}

function preliminaryManifest(value = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "id", "benchmarkOnly", "approvalReady", "groundTruthEvaluated",
    "status", "createdAt", "pack", "provider", "policy", "reviewGate", "summary", "limitations",
    "cases", "screeningSha256",
  ], "Screening manifest");
  if (Number(value.schemaVersion) !== 1
    || value.protocol !== TRACKING_CANDIDATE_SCREENING_PROTOCOL
    || value.benchmarkOnly !== true
    || value.approvalReady !== false
    || value.groundTruthEvaluated !== false
    || !Array.isArray(value.cases)
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Screening manifest protocol is invalid.");
  }
  exactKeys(value.provider, [
    "id", "version", "protocol", "stage", "capabilities", "manifestFingerprintSha256",
    "executionFingerprintSha256",
  ], "Screening provider");
  return value;
}

export async function loadVerifiedTrackingCandidateScreeningBundle(options = {}, dependencies = {}) {
  const packFile = await canonicalRegularFile(options.packPath, MAXIMUM_PACK_BYTES, "Annotation pack");
  const pack = normalizeTrackingCandidateScreeningPack(parseJson(packFile.bytes, "Annotation pack"));
  const screeningDir = await canonicalDirectory(options.screeningDir);
  const manifestFile = await canonicalRegularFile(
    path.join(screeningDir, "screening.json"),
    MAXIMUM_MANIFEST_BYTES,
    "Screening manifest",
    { readOnly: true },
  );
  if (path.dirname(manifestFile.path) !== screeningDir) invalid("Screening manifest crossed its bundle boundary.");
  const manifest = preliminaryManifest(parseJson(manifestFile.bytes, "Screening manifest"));
  const providerId = identifier(manifest.provider.id, "provider id");
  const providerVersion = identifier(manifest.provider.version, "provider version");
  const registry = dependencies.registry || createTrackingCandidateProviderRegistry();
  const installation = await registry.resolve(providerId, providerVersion);
  const validateEvidence = dependencies.validateEvidence || validateTrackingCandidateStageRunArtifact;
  if (manifest.cases.length !== pack.cases.length) invalid("Screening cases do not match the annotation pack.");
  const caseResults = [];
  const verifiedCases = [];
  for (let index = 0; index < pack.cases.length; index += 1) {
    const packCase = pack.cases[index];
    const summary = manifest.cases[index];
    if (!summary || summary.id !== packCase.id) invalid("Screening cases do not match the annotation pack.");
    exactKeys(summary.evidence, ["file", "bytes", "sha256", "artifactSha256"], "Screening evidence descriptor");
    const relativeFile = evidenceRelativeFile(summary.evidence.file, packCase.id);
    const file = await evidenceFile(screeningDir, relativeFile, summary.evidence);
    const evidence = validateEvidence(parseJson(file.bytes, "Screening evidence"), installation.provider);
    const rebuiltSummary = summarizeTrackingCandidateScreeningCase({
      packCase,
      evidence,
      evidenceFile: relativeFile,
      evidenceBytes: file.bytes.byteLength,
      evidenceSha256: file.digest,
      sampleDurationMs: summary.sampleDurationMs,
    });
    caseResults.push({ provider: evidence.provider, summary: rebuiltSummary });
    verifiedCases.push(Object.freeze({ packCase, detectionEvidence: evidence }));
  }
  const rebuilt = createTrackingCandidateScreeningManifest(pack, caseResults, {
    id: manifest.id,
    now: () => manifest.createdAt,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(manifest)
    || rebuilt.screeningSha256 !== sha256(manifest.screeningSha256, "screening manifest checksum")) {
    invalid("Screening manifest does not reproduce from its raw evidence.");
  }
  const verification = Object.freeze({
    ok: true,
    protocol: rebuilt.protocol,
    id: rebuilt.id,
    status: rebuilt.status,
    provider: Object.freeze({ id: providerId, version: providerVersion }),
    caseCount: rebuilt.summary.caseCount,
    screeningSha256: rebuilt.screeningSha256,
  });
  return Object.freeze({
    verification,
    pack,
    detectionManifest: rebuilt,
    cases: Object.freeze(verifiedCases),
  });
}

export async function verifyTrackingCandidateScreeningBundle(options = {}, dependencies = {}) {
  return (await loadVerifiedTrackingCandidateScreeningBundle(options, dependencies)).verification;
}
