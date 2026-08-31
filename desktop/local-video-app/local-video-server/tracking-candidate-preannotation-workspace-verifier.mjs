import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { loadVerifiedTrackingCandidateAssociationBundle } from "./tracking-candidate-association-screening-verifier.mjs";
import {
  TRACKING_CANDIDATE_PREANNOTATION_WORKSPACE_PROTOCOL,
  createTrackingCandidatePreannotationCase,
  createTrackingCandidatePreannotationWorkspace,
  _private as workspacePrivate,
} from "./tracking-candidate-preannotation-workspace.mjs";

const MAXIMUM_WORKSPACE_BYTES = 4 * 1024 * 1024;
const MAXIMUM_CASE_BYTES = 512 * 1024 * 1024;

export class TrackingCandidatePreannotationVerificationError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_PREANNOTATION_VERIFICATION_FAILED") {
    super(message);
    this.name = "TrackingCandidatePreannotationVerificationError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidatePreannotationVerificationError(message, code);
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

async function readStableFile(requestedPath, maximumBytes, label) {
  const resolved = path.resolve(String(requestedPath || ""));
  const canonical = await fs.realpath(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  const lstat = await fs.lstat(canonical);
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > maximumBytes
    || (lstat.mode & 0o222)) {
    invalid(`${label} is unsafe or not sealed read-only.`);
  }
  const handle = await fs.open(canonical, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after) || bytes.byteLength !== Number(after.size)) {
      invalid(`${label} changed while reading.`);
    }
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
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

function descriptor(relativeFile, file) {
  return { file: relativeFile, bytes: file.bytes.byteLength, sha256: file.sha256 };
}

function preliminaryWorkspace(value = {}) {
  if (Number(value.schemaVersion) !== 1
    || value.protocol !== TRACKING_CANDIDATE_PREANNOTATION_WORKSPACE_PROTOCOL
    || value.benchmarkOnly !== true
    || value.suggestionOnly !== true
    || value.approvalReady !== false
    || value.groundTruthEvaluated !== false
    || !Array.isArray(value.cases)
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Preannotation workspace protocol is invalid.");
  }
  return value;
}

export async function verifyTrackingCandidatePreannotationWorkspace(options = {}, dependencies = {}) {
  const loaded = await (dependencies.loadBundle || loadVerifiedTrackingCandidateAssociationBundle)({
    packPath: path.resolve(String(options.packPath || "")),
    detectionScreeningDir: path.resolve(String(options.detectionScreeningDir || "")),
    screeningDir: path.resolve(String(options.associationScreeningDir || "")),
  }, dependencies.verifierDependencies);
  const workspaceDir = await canonicalDirectory(options.workspaceDir, "Preannotation workspace directory");
  const workspaceFile = await readStableFile(
    path.join(workspaceDir, "workspace.json"),
    MAXIMUM_WORKSPACE_BYTES,
    "Preannotation workspace manifest",
  );
  const manifest = preliminaryWorkspace(parseJson(workspaceFile.bytes, "Preannotation workspace manifest"));
  if (manifest.cases.length !== loaded.cases.length) invalid("Preannotation workspace case count changed.");
  const cases = [];
  for (let index = 0; index < loaded.cases.length; index += 1) {
    const prepared = createTrackingCandidatePreannotationCase({
      ...loaded.cases[index],
      extraction: loaded.pack.extraction,
    });
    if (manifest.cases[index]?.id !== prepared.id) invalid("Preannotation workspace cases changed.");
    const suggestionFile = `cases/${prepared.id}.suggestions.mot.txt`;
    const trackMapFile = `cases/${prepared.id}.track-map.json`;
    const suggestion = await readStableFile(
      path.join(workspaceDir, ...suggestionFile.split("/")),
      MAXIMUM_CASE_BYTES,
      `Preannotation suggestion ${prepared.id}`,
    );
    const trackMap = await readStableFile(
      path.join(workspaceDir, ...trackMapFile.split("/")),
      MAXIMUM_CASE_BYTES,
      `Preannotation track map ${prepared.id}`,
    );
    const expectedSuggestion = Buffer.from(prepared.motText, "utf8");
    const expectedTrackMap = Buffer.from(`${JSON.stringify(prepared.trackMap, null, 2)}\n`, "utf8");
    if (!suggestion.bytes.equals(expectedSuggestion) || !trackMap.bytes.equals(expectedTrackMap)) {
      invalid(`Preannotation case ${prepared.id} does not reproduce from raw evidence.`);
    }
    cases.push({
      id: prepared.id,
      suggestion: descriptor(suggestionFile, suggestion),
      trackMap: descriptor(trackMapFile, trackMap),
      summary: prepared.summary,
    });
  }
  const rebuilt = createTrackingCandidatePreannotationWorkspace(
    loaded.pack,
    loaded.associationManifest,
    cases,
    { id: manifest.id, now: () => manifest.createdAt },
  );
  if (workspacePrivate.canonicalJson(rebuilt) !== workspacePrivate.canonicalJson(manifest)
    || rebuilt.workspaceSha256 !== sha256(manifest.workspaceSha256, "preannotation workspace checksum")) {
    invalid("Preannotation workspace manifest does not reproduce from sealed evidence.");
  }
  return Object.freeze({
    ok: true,
    protocol: rebuilt.protocol,
    id: rebuilt.id,
    caseCount: rebuilt.summary.caseCount,
    observationCount: rebuilt.summary.observationCount,
    workspaceSha256: rebuilt.workspaceSha256,
  });
}
