import { promises as fs } from "node:fs";
import path from "node:path";
import {
  TRACKING_ANNOTATION_PACK_PROTOCOL,
} from "../../../scripts/fs-player-tracking-benchmark-prepare.mjs";
import {
  TRACKING_MOT_IMPORT_MANIFEST_PROTOCOL,
  auditMotGroundTruthManifest,
} from "../../../scripts/fs-player-tracking-mot-import.mjs";
import { preflightTrackEval } from "../tracking-evaluators/trackeval/preflight.mjs";
import {
  verifyTrackingCandidatePreannotationWorkspace,
} from "./tracking-candidate-preannotation-workspace-verifier.mjs";

export const TRACKING_GROUND_TRUTH_REVIEW_PREFLIGHT_PROTOCOL =
  "football-science-ground-truth-review-preflight-v1";

const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;

export class TrackingGroundTruthReviewPreflightError extends Error {
  constructor(message, code = "TRACKING_GROUND_TRUTH_REVIEW_PREFLIGHT_FAILED") {
    super(message);
    this.name = "TrackingGroundTruthReviewPreflightError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingGroundTruthReviewPreflightError(message, code);
}

function fingerprint(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) invalid(`${label} must be a SHA-256 hash.`);
  return normalized;
}

function gitCommit(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) invalid(`${label} must be a full Git commit.`);
  return normalized;
}

function bounded(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

async function readStableJson(filePath, label) {
  const requested = path.resolve(String(filePath || ""));
  const canonical = await fs.realpath(requested).catch(() => invalid(`${label} is unavailable.`));
  if (canonical !== requested) invalid(`${label} crossed a linked path.`);
  const before = await fs.lstat(canonical);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAXIMUM_JSON_BYTES) {
    invalid(`${label} is not a bounded regular file.`);
  }
  const bytes = await fs.readFile(canonical);
  const after = await fs.lstat(canonical);
  if (fileIdentity(before) !== fileIdentity(after) || bytes.byteLength !== after.size) {
    invalid(`${label} changed while reading.`);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid(`${label} is not valid UTF-8 JSON.`);
  }
}

function normalizedTags(value = []) {
  if (!Array.isArray(value)) invalid("Scenario tags must be an array.");
  return [...new Set(value.map((entry) => bounded(entry, "scenario tag", 80)))].sort();
}

function sameValues(first = [], second = []) {
  return first.length === second.length && first.every((entry, index) => entry === second[index]);
}

function validatePack(pack = {}) {
  if (Number(pack.version) !== 1
    || pack.protocol !== TRACKING_ANNOTATION_PACK_PROTOCOL
    || !Array.isArray(pack.cases)
    || !pack.cases.length
    || Number(pack.summary?.caseCount) !== pack.cases.length) {
    invalid("Tracking annotation pack contract is invalid.");
  }
  return pack;
}

function validateReviewManifest(review = {}) {
  if (Number(review.version) !== 1
    || review.protocol !== TRACKING_MOT_IMPORT_MANIFEST_PROTOCOL
    || !Array.isArray(review.sequences)
    || !review.sequences.length) {
    invalid("Ground-truth review manifest contract is invalid.");
  }
  return review;
}

function validateCaseBinding(packCase = {}, sequence = {}, auditCase = {}, extraction = {}) {
  const id = bounded(packCase.id, "pack case id", 120);
  if (bounded(sequence.id, "review case id", 120) !== id || bounded(auditCase.id, "audit case id", 120) !== id) {
    invalid(`Ground-truth review case order or identity changed at ${id}.`);
  }
  const expectedSource = fingerprint(packCase.clip?.sha256, `source ${id}`);
  if (fingerprint(auditCase.sourceFingerprint, `audited source ${id}`) !== expectedSource
    || sequence.sourceFile !== packCase.clipFile
    || sequence.annotationFile !== packCase.annotationFile
    || Number(sequence.sourceStartMs) !== Number(packCase.startMs)
    || Number(sequence.sequenceLengthFrames) !== Number(packCase.expectedFrames)
    || Number(sequence.frame?.width) !== Number(extraction.width)
    || Number(sequence.frame?.height) !== Number(extraction.height)
    || Number(sequence.frameRate) !== Number(extraction.frameRate)
    || !sameValues(normalizedTags(sequence.scenarioTags), normalizedTags(packCase.scenarioTags))) {
    invalid(`Ground-truth review case ${id} crossed its sealed annotation-pack evidence.`);
  }
  return {
    id,
    status: auditCase.structurallyReady === true ? "reviewed" : "pending-human-review",
    annotationRows: Math.max(0, Number(auditCase.rowCount) || 0),
    trackCount: Math.max(0, Number(auditCase.trackCount) || 0),
    annotatedFrameRatio: Math.max(0, Math.min(1, Number(auditCase.annotatedFrameRatio) || 0)),
    sceneCoverageRatio: Math.max(0, Math.min(1, Number(auditCase.sceneCoverageRatio) || 0)),
    entityCounts: {
      player: Math.max(0, Number(auditCase.entityCounts?.player) || 0),
      ball: Math.max(0, Number(auditCase.entityCounts?.ball) || 0),
      referee: Math.max(0, Number(auditCase.entityCounts?.referee) || 0),
    },
    issues: (auditCase.issues || []).map((entry) => ({
      code: bounded(entry.code, `issue code ${id}`, 100),
      message: bounded(entry.message, `issue message ${id}`, 240),
    })),
  };
}

function evaluatorSummary(value = {}) {
  return {
    ready: value.ok === true && value.status === "ready",
    name: bounded(value.evaluator || "TrackEval", "evaluator name", 80),
    status: bounded(value.status || "unavailable", "evaluator status", 80),
    commit: value.commit ? gitCommit(value.commit, "TrackEval commit") : "",
    sourceSha256: value.sourceSha256 ? fingerprint(value.sourceSha256, "TrackEval source") : "",
    python: String(value.python || "").slice(0, 40),
  };
}

export async function preflightTrackingGroundTruthReviewCampaign(options = {}, dependencies = {}) {
  const verifyWorkspace = dependencies.verifyWorkspace
    || verifyTrackingCandidatePreannotationWorkspace;
  const readJson = dependencies.readJson || readStableJson;
  const auditManifest = dependencies.auditManifest || auditMotGroundTruthManifest;
  const preflightEvaluator = dependencies.preflightEvaluator || preflightTrackEval;
  const [workspace, packDocument, reviewDocument, evaluatorResult] = await Promise.all([
    verifyWorkspace(options, dependencies.workspaceDependencies),
    readJson(options.packPath, "Tracking annotation pack"),
    readJson(options.reviewManifestPath, "Ground-truth review manifest"),
    preflightEvaluator(dependencies.evaluatorOptions || {}),
  ]);
  const pack = validatePack(packDocument);
  const review = validateReviewManifest(reviewDocument);
  const audit = await auditManifest(review, path.dirname(path.resolve(options.reviewManifestPath)));
  if (workspace.ok !== true
    || Number(workspace.caseCount) !== pack.cases.length
    || Number(audit.sequenceCount) !== pack.cases.length
    || audit.sequences?.length !== pack.cases.length) {
    invalid("Ground-truth campaign case counts do not match the sealed workspace.");
  }
  const cases = pack.cases.map((entry, index) => validateCaseBinding(
    entry,
    review.sequences[index],
    audit.sequences[index],
    pack.extraction,
  ));
  const evaluator = evaluatorSummary(evaluatorResult);
  const reviewReady = audit.readyForImport === true && cases.every((entry) => entry.status === "reviewed");
  const technicalReady = evaluator.ready && audit.rightsReady === true;
  const status = !technicalReady
    ? "blocked"
    : reviewReady ? "ready-for-measurement" : "ready-for-human-review";
  const blockers = [
    ...(!evaluator.ready ? [{ code: "trackeval-unavailable", message: "Pinned TrackEval preflight did not pass." }] : []),
    ...(audit.issues || []).map((entry) => ({
      code: bounded(entry.code, "campaign issue code", 100),
      message: bounded(entry.message, "campaign issue message", 240),
    })),
    ...cases.flatMap((entry) => entry.issues.map((issue) => ({ ...issue, caseId: entry.id }))),
  ];
  return Object.freeze({
    schemaVersion: 1,
    protocol: TRACKING_GROUND_TRUTH_REVIEW_PREFLIGHT_PROTOCOL,
    ok: technicalReady,
    status,
    campaign: {
      id: bounded(pack.id, "campaign id", 120),
      caseCount: cases.length,
      uniqueDurationMs: Math.max(0, Number(pack.summary?.uniqueDurationMs) || 0),
      observationCount: Math.max(0, Number(workspace.observationCount) || 0),
      workspaceSha256: fingerprint(workspace.workspaceSha256, "workspace checksum"),
    },
    review: {
      rightsReady: audit.rightsReady === true,
      humanReviewReady: audit.reviewReady === true,
      structurallyReadyCaseCount: cases.filter((entry) => entry.status === "reviewed").length,
      annotationRowCount: cases.reduce((total, entry) => total + entry.annotationRows, 0),
      readyForImport: reviewReady,
      cases,
    },
    evaluator,
    blockers,
    nextAction: status === "ready-for-measurement"
      ? "Import and lock the reviewed suite, then run the independent benchmark."
      : status === "ready-for-human-review"
        ? "Complete exhaustive human review for every case before changing any attestation."
        : "Repair the failed technical preflight before human review begins.",
  });
}
