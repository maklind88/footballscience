import { createHash } from "node:crypto";
import path from "node:path";

export const TRACKING_CANDIDATE_SCREENING_PROTOCOL = "football-science-tracking-candidate-screening-v1";
export const TRACKING_ANNOTATION_PACK_PROTOCOL = "football-science-tracking-annotation-pack-v1";
const candidateEvidenceProtocol = "football-science-tracking-candidate-stage-run-v1";
const supportedEntities = Object.freeze(["person", "player", "ball", "referee"]);

export class TrackingCandidateScreeningError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_SCREENING_INVALID") {
    super(message);
    this.name = "TrackingCandidateScreeningError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateScreeningError(message, code);
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

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function finiteNumber(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function safeRelativeFile(value, prefix, extension, label) {
  const text = String(value || "");
  if (text.length > 240 || text.includes("\\") || path.posix.normalize(text) !== text
    || !text.startsWith(`${prefix}/`) || !text.endsWith(extension) || text.split("/").includes("..")) {
    invalid(`Invalid ${label}.`);
  }
  return text;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizeProviderIdentity(value = {}) {
  exactKeys(value, [
    "id", "version", "protocol", "stage", "capabilities", "manifestFingerprintSha256",
    "executionFingerprintSha256",
  ], "Screening provider");
  if (!Array.isArray(value.capabilities) || !value.capabilities.length || value.capabilities.length > 20) {
    invalid("Screening provider capabilities are invalid.");
  }
  const capabilities = [...new Set(value.capabilities.map((entry) => identifier(entry, "provider capability")))].sort();
  if (capabilities.length !== value.capabilities.length) invalid("Screening provider capabilities are duplicated.");
  return {
    id: identifier(value.id, "provider id"),
    version: identifier(value.version, "provider version"),
    protocol: identifier(value.protocol, "provider protocol"),
    stage: identifier(value.stage, "provider stage"),
    capabilities,
    manifestFingerprintSha256: sha256(value.manifestFingerprintSha256, "provider manifest fingerprint"),
    executionFingerprintSha256: sha256(value.executionFingerprintSha256, "provider execution fingerprint"),
  };
}

export function normalizeTrackingCandidateScreeningPack(value = {}) {
  exactKeys(value, ["version", "protocol", "id", "createdAt", "source", "extraction", "summary", "cases"], "Pack");
  if (Number(value.version) !== 1 || value.protocol !== TRACKING_ANNOTATION_PACK_PROTOCOL) {
    invalid("Unsupported annotation pack protocol.");
  }
  exactKeys(value.source, ["bytes", "sha256"], "Pack source");
  exactKeys(value.extraction, ["ffmpegSha256", "width", "height", "frameRate", "crf"], "Pack extraction");
  exactKeys(value.summary, ["caseCount", "uniqueDurationMs", "scenarioIds", "reviewStatus"], "Pack summary");
  const ids = new Set();
  const cases = (Array.isArray(value.cases) ? value.cases : []).map((entry, index) => {
    exactKeys(entry, [
      "id", "startMs", "endMs", "durationMs", "scenarioTags", "expectedFrames",
      "clipFile", "annotationFile", "clip",
    ], `Pack case ${index + 1}`);
    exactKeys(entry.clip, ["bytes", "sha256"], `Pack case ${index + 1} clip`);
    const id = identifier(entry.id, `pack case ${index + 1} id`);
    if (ids.has(id)) invalid("Pack case ids must be unique.");
    ids.add(id);
    const startMs = boundedInteger(entry.startMs, "pack case start", 0, 24 * 60 * 60 * 1000);
    const endMs = boundedInteger(entry.endMs, "pack case end", startMs + 1000, 24 * 60 * 60 * 1000);
    const durationMs = boundedInteger(entry.durationMs, "pack case duration", 1000, 4 * 60 * 1000);
    if (endMs - startMs !== durationMs) invalid("Pack case duration does not match its range.");
    const scenarioTags = [...new Set((Array.isArray(entry.scenarioTags) ? entry.scenarioTags : [])
      .map((tag) => identifier(tag, "scenario tag")))];
    if (!scenarioTags.length || scenarioTags.length !== entry.scenarioTags.length) {
      invalid("Pack case scenario tags are empty or duplicated.");
    }
    return {
      id,
      startMs,
      endMs,
      durationMs,
      scenarioTags,
      expectedFrames: boundedInteger(entry.expectedFrames, "pack case frame count", 1, 1_000_000),
      clipFile: safeRelativeFile(entry.clipFile, "clips", ".mp4", "pack clip file"),
      annotationFile: safeRelativeFile(entry.annotationFile, "annotations", ".txt", "pack annotation file"),
      clip: {
        bytes: boundedInteger(entry.clip.bytes, "pack clip bytes", 1, 16 * 1024 * 1024 * 1024),
        sha256: sha256(entry.clip.sha256, "pack clip checksum"),
      },
    };
  });
  const caseCount = boundedInteger(value.summary.caseCount, "pack case count", 1, 100);
  if (cases.length !== caseCount) invalid("Pack case count does not match its cases.");
  const scenarioIds = [...new Set((Array.isArray(value.summary.scenarioIds) ? value.summary.scenarioIds : [])
    .map((tag) => identifier(tag, "pack scenario id")))].sort();
  const actualScenarios = [...new Set(cases.flatMap((entry) => entry.scenarioTags))].sort();
  if (JSON.stringify(scenarioIds) !== JSON.stringify(actualScenarios)) invalid("Pack scenario summary does not match its cases.");
  const createdAt = new Date(value.createdAt);
  if (!Number.isFinite(createdAt.getTime())) invalid("Invalid pack creation date.");
  return deepFreeze({
    version: 1,
    protocol: TRACKING_ANNOTATION_PACK_PROTOCOL,
    id: identifier(value.id, "pack id"),
    createdAt: createdAt.toISOString(),
    source: {
      bytes: boundedInteger(value.source.bytes, "pack source bytes", 1, Number.MAX_SAFE_INTEGER),
      sha256: sha256(value.source.sha256, "pack source checksum"),
    },
    extraction: {
      ffmpegSha256: sha256(value.extraction.ffmpegSha256, "pack FFmpeg checksum"),
      width: boundedInteger(value.extraction.width, "pack width", 1, 16_384),
      height: boundedInteger(value.extraction.height, "pack height", 1, 16_384),
      frameRate: finiteNumber(value.extraction.frameRate, "pack frame rate", 1, 240),
      crf: boundedInteger(value.extraction.crf, "pack CRF", 0, 51),
    },
    summary: {
      caseCount,
      uniqueDurationMs: boundedInteger(value.summary.uniqueDurationMs, "pack duration", 1000, 60 * 60 * 1000),
      scenarioIds,
      reviewStatus: identifier(value.summary.reviewStatus, "pack review status"),
    },
    cases,
  });
}

function percentile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))];
}

export function summarizeTrackingCandidateScreeningCase(value = {}) {
  const packCase = value.packCase || {};
  const evidence = value.evidence || {};
  if (evidence.protocol !== candidateEvidenceProtocol || evidence.benchmarkOnly !== true) {
    invalid("Candidate case evidence protocol is invalid.");
  }
  if (evidence.source?.fingerprintSha256 !== packCase.clip?.sha256
    || Number(evidence.range?.startMs) !== 0
    || Number(evidence.range?.endMs) !== Number(value.sampleDurationMs)) {
    invalid("Candidate case evidence does not match its pack clip and sample range.");
  }
  const observations = evidence.result?.payload?.payload?.observations;
  if (!Array.isArray(observations)) invalid("Candidate case has no detection observations.");
  const entityCounts = Object.fromEntries(supportedEntities.map((entity) => [entity, 0]));
  const frameIds = new Set();
  const confidences = [];
  observations.forEach((observation) => {
    if (!supportedEntities.includes(observation.entityType)) invalid("Candidate case contains an unsupported entity.");
    entityCounts[observation.entityType] += 1;
    frameIds.add(boundedInteger(observation.frameIndex, "candidate frame index", 0, 100_000_000));
    confidences.push(finiteNumber(observation.confidence, "candidate confidence", 0, 1));
  });
  const sampledFrames = frameIds.size;
  const realTimeFactor = finiteNumber(evidence.execution?.realTimeFactor, "candidate real-time factor", 0.000001, 10_000);
  return deepFreeze({
    id: identifier(packCase.id, "screening case id"),
    scenarioTags: [...packCase.scenarioTags],
    sampleDurationMs: boundedInteger(value.sampleDurationMs, "sample duration", 1000, packCase.durationMs),
    evidence: {
      file: safeRelativeFile(value.evidenceFile, "cases", ".candidate-stage.json", "candidate evidence file"),
      bytes: boundedInteger(value.evidenceBytes, "candidate evidence bytes", 1, 160 * 1024 * 1024),
      sha256: sha256(value.evidenceSha256, "candidate evidence checksum"),
      artifactSha256: sha256(evidence.result?.artifactSha256, "candidate artifact checksum"),
    },
    observations: {
      total: observations.length,
      entities: entityCounts,
      sampledFrames,
      detectionsPerSampledFrame: sampledFrames ? Number((observations.length / sampledFrames).toFixed(6)) : 0,
      confidence: {
        minimum: confidences.length ? Math.min(...confidences) : 0,
        p05: percentile(confidences, 0.05),
        mean: confidences.length
          ? Number((confidences.reduce((sum, entry) => sum + entry, 0) / confidences.length).toFixed(6))
          : 0,
      },
    },
    execution: {
      wallTimeMs: boundedInteger(evidence.execution?.wallTimeMs, "candidate wall time", 1, 24 * 60 * 60 * 1000),
      realTimeFactor,
      withinRealtimePolicy: realTimeFactor <= 1,
      isolation: identifier(evidence.execution?.isolation, "candidate isolation"),
      runtimeMode: identifier(evidence.execution?.runtimeMode, "candidate runtime mode"),
    },
  });
}

export function createTrackingCandidateScreeningManifest(packValue = {}, cases = [], options = {}) {
  const pack = normalizeTrackingCandidateScreeningPack(packValue);
  if (cases.length !== pack.cases.length
    || cases.some((entry, index) => entry.summary?.id !== pack.cases[index].id)) {
    invalid("Screening cases do not match the annotation pack.");
  }
  const providerValues = cases.map((entry) => normalizeProviderIdentity(entry.provider));
  const provider = providerValues[0];
  if (!provider || providerValues.some((entry) => canonicalJson(entry) !== canonicalJson(provider))) {
    invalid("Screening cases do not use one exact provider.");
  }
  if (provider.stage !== "detection") invalid("Screening provider must own the detection stage.");
  const capabilities = provider.capabilities;
  const requiredEntities = capabilities.filter((entry) => entry.startsWith("detect:"))
    .map((entry) => entry.slice("detect:".length));
  if (!requiredEntities.length || requiredEntities.some((entry) => !supportedEntities.includes(entry))) {
    invalid("Screening provider has unsupported detection capabilities.");
  }
  const entityTotals = Object.fromEntries(supportedEntities.map((entity) => [
    entity,
    cases.reduce((sum, entry) => sum + entry.summary.observations.entities[entity], 0),
  ]));
  const missingCapabilities = requiredEntities
    .filter((entity) => entityTotals[entity] < 1)
    .map((entity) => `detect:${entity}`);
  const realTimePassed = cases.every((entry) => entry.summary.execution.withinRealtimePolicy);
  const screeningPassed = realTimePassed && !missingCapabilities.length;
  const createdAt = new Date(options.now?.() ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) invalid("Invalid screening creation date.");
  const payload = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_SCREENING_PROTOCOL,
    id: identifier(options.id || `${pack.id}-${provider.id}-${provider.version}`, "screening id"),
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: screeningPassed ? "screening-pass-awaiting-ground-truth" : "failed-screening",
    createdAt: createdAt.toISOString(),
    pack: {
      id: pack.id,
      sourceSha256: pack.source.sha256,
      caseCount: pack.summary.caseCount,
      scenarioIds: [...pack.summary.scenarioIds],
      reviewStatus: pack.summary.reviewStatus,
    },
    provider,
    policy: {
      maxRealtimeFactor: 1,
      realTimePassed,
      missingCapabilities,
      declaredCapabilityCoveragePassed: missingCapabilities.length === 0,
    },
    reviewGate: {
      suggestionLayerAllowed: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      providerApprovalBlocked: !screeningPassed,
      nextStep: screeningPassed
        ? "independent-ground-truth-review"
        : "replace-or-optimize-candidate-before-approval",
    },
    summary: {
      sampleDurationMs: cases.reduce((sum, entry) => sum + entry.summary.sampleDurationMs, 0),
      wallTimeMs: cases.reduce((sum, entry) => sum + entry.summary.execution.wallTimeMs, 0),
      worstRealtimeFactor: Math.max(...cases.map((entry) => entry.summary.execution.realTimeFactor)),
      entityTotals,
      caseCount: cases.length,
    },
    limitations: [
      "ground-truth-not-reviewed",
      "precision-recall-not-measured",
      "identity-continuity-not-measured",
      "team-classification-not-measured",
    ],
    cases: cases.map((entry) => entry.summary),
  };
  return deepFreeze({ ...payload, screeningSha256: hashValue(payload) });
}
