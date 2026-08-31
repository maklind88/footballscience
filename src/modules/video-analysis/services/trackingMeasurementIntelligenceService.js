import { presentationQueue } from "./presentationService.js";

const benchmarkEvidenceSetProtocol = "football-science-tracking-benchmark-evidence-set-v1";
const fingerprintPattern = /^[a-f0-9]{64}$/i;

const metricDefinitions = Object.freeze([
  Object.freeze({
    id: "HOTA",
    label: "HOTA",
    threshold: "minHota",
    dimension: "Overall tracking",
    recommendation: "Inspect both detection misses and trajectory continuity in the weakest case.",
  }),
  Object.freeze({
    id: "DetA",
    label: "DetA",
    threshold: "minDetA",
    dimension: "Detection accuracy",
    recommendation: "Inspect missed and false player, ball and referee observations before tuning association.",
  }),
  Object.freeze({
    id: "AssA",
    label: "AssA",
    threshold: "minAssA",
    dimension: "Association continuity",
    recommendation: "Inspect occlusions, camera transitions and fragmented trajectories in the weakest case.",
  }),
  Object.freeze({
    id: "LocA",
    label: "LocA",
    threshold: "minLocA",
    dimension: "Box localization",
    recommendation: "Inspect box placement and scale around the lowest-overlap checkpoints.",
  }),
  Object.freeze({
    id: "MOTA",
    label: "MOTA",
    threshold: "minMota",
    dimension: "Tracking errors",
    recommendation: "Inspect false positives, misses and identity switches together in the weakest case.",
  }),
  Object.freeze({
    id: "IDF1",
    label: "IDF1",
    threshold: "minIdf1",
    dimension: "Identity continuity",
    recommendation: "Inspect identity swaps and long occlusions before changing re-identification thresholds.",
  }),
]);

const entityDefinitions = Object.freeze([
  Object.freeze({ id: "player", label: "Players" }),
  Object.freeze({ id: "ball", label: "Ball" }),
  Object.freeze({ id: "referee", label: "Referees" }),
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function count(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function identityRange(value = {}) {
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  return Number.isSafeInteger(startMs) && Number.isSafeInteger(endMs) && startMs >= 0 && endMs > startMs
    ? { startMs, endMs }
    : null;
}

function sameRange(first = {}, second = {}) {
  const left = identityRange(first);
  const right = identityRange(second);
  return Boolean(left && right && left.startMs === right.startMs && left.endMs === right.endMs);
}

function exactEvidenceSet(evaluation = {}) {
  const evidence = evaluation.evidenceSet || {};
  const reportSha256 = String(evaluation.reportSha256 || "").toLowerCase();
  const sourceSignature = String(evaluation.sourceSignature || "").toLowerCase();
  const suiteId = String(evaluation.report?.suiteId || "");
  return evidence.protocol === benchmarkEvidenceSetProtocol
    && fingerprintPattern.test(reportSha256)
    && fingerprintPattern.test(sourceSignature)
    && suiteId
    && evidence.checksums?.reportSha256 === reportSha256
    && evidence.sourceSignature === sourceSignature
    && evidence.report?.benchmarkType === evaluation.report?.benchmarkType
    && evidence.report?.suiteId === suiteId
    ? evidence
    : null;
}

function exactBenchmarkArtifact(evidence = {}, entry = {}) {
  const providerId = String(evidence.inputs?.providerRunSuite?.provider?.providerId || "");
  const cases = evidence.inputs?.groundTruthSuite?.cases || [];
  if (!providerId || !entry.id || !fingerprintPattern.test(entry.sourceFingerprint) || !entry.range) return null;
  const matches = cases.filter((artifact) => (
    `${String(artifact.id || "")}-${providerId}`.slice(0, 120) === entry.id
    && artifact.sourceFingerprint === entry.sourceFingerprint
    && sameRange(artifact.range, entry.range)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function currentArtifactMatches(tracking = {}, artifact = {}) {
  const workload = artifact.workloadEvidence || {};
  const angleId = String(artifact.sourceEvidence?.angleId || "");
  return (tracking.groundTruth?.suite?.cases || []).some((entry) => (
    entry.id === artifact.id
    && entry.sourceFingerprint === artifact.sourceFingerprint
    && entry.sourceEvidence?.angleId === angleId
    && sameRange(entry.range, artifact.range)
    && entry.workloadEvidence?.workspaceSha256 === workload.workspaceSha256
    && entry.workloadEvidence?.caseId === workload.caseId
    && entry.workloadEvidence?.sourceFingerprint === workload.sourceFingerprint
    && entry.workloadEvidence?.angleId === workload.angleId
  ));
}

function campaignReviewTarget(evaluation = {}, state = {}, entry = {}) {
  const evidence = exactEvidenceSet(evaluation);
  const artifact = exactBenchmarkArtifact(evidence || {}, entry);
  const tracking = state.presentation?.tracking || {};
  const review = tracking.preannotationReview || {};
  const workload = artifact?.workloadEvidence || {};
  const angleId = String(artifact?.sourceEvidence?.angleId || "");
  if (!artifact
    || !currentArtifactMatches(tracking, artifact)
    || !fingerprintPattern.test(String(workload.workspaceSha256 || ""))
    || workload.workspaceSha256 !== review.workspaceSha256
    || workload.sourceFingerprint !== artifact.sourceFingerprint
    || workload.angleId !== angleId
    || !sameRange(workload.range, artifact.range)) return null;
  const campaignMatches = (review.campaign?.cases || []).filter((value) => (
    value.caseId === workload.caseId
    && value.sourceSha256 === artifact.sourceFingerprint
    && value.angleId === angleId
    && value.resumeContextReady === true
    && value.itemId
    && value.clipId
  ));
  if (campaignMatches.length !== 1) return null;
  const campaign = campaignMatches[0];
  const items = presentationQueue(state.presentation?.current).filter((item) => (
    item.id === campaign.itemId && String(item.clipId || item.clip?.id || "") === campaign.clipId
  ));
  const localTruth = tracking.groundTruth?.byItemId?.[campaign.itemId] || {};
  if (items.length !== 1
    || localTruth.status !== "locked"
    || localTruth.lockedArtifact?.id !== artifact.id
    || localTruth.sourceFingerprint !== artifact.sourceFingerprint
    || localTruth.angleId !== angleId) return null;
  return {
    benchmarkId: entry.id,
    caseId: workload.caseId,
    sourceSha256: artifact.sourceFingerprint,
    itemId: campaign.itemId,
    clipId: campaign.clipId,
    angleId,
  };
}

function metricEntry(definition, metrics = {}, thresholds = {}) {
  const actual = finite(metrics[definition.id]);
  const expected = finite(thresholds[definition.threshold]);
  const available = actual !== null && expected !== null;
  return {
    ...definition,
    actual,
    expected,
    delta: available ? actual - expected : null,
    status: !available ? "missing" : actual >= expected ? "passed" : "failed",
  };
}

function metricEntries(metrics = {}, thresholds = {}) {
  return metricDefinitions.map((definition) => metricEntry(definition, metrics, thresholds));
}

function metricProfileStatus(entries = []) {
  if (entries.some((entry) => entry.status === "missing")) return "missing";
  return entries.some((entry) => entry.status === "failed") ? "failed" : "passed";
}

function weakestMetric(entries = []) {
  return entries
    .filter((entry) => entry.delta !== null)
    .slice()
    .sort((first, second) => first.delta - second.delta || first.id.localeCompare(second.id))[0] || null;
}

function entityEntry(definition, reference = {}, thresholds = {}) {
  const report = reference.perEntity?.[definition.id] || {};
  const values = report.metrics || {};
  const counts = report.counts || {};
  const metrics = metricEntries(values, thresholds);
  return {
    ...definition,
    HOTA: finite(values.HOTA),
    DetA: finite(values.DetA),
    AssA: finite(values.AssA),
    LocA: finite(values.LocA),
    MOTA: finite(values.MOTA),
    IDF1: finite(values.IDF1),
    metrics,
    limiter: weakestMetric(metrics),
    status: metricProfileStatus(metrics),
    identitySwitches: count(values.identitySwitches),
    fragmentations: count(values.fragmentations),
    groundTruthDetections: count(counts.groundTruthDetections),
    predictionDetections: count(counts.predictionDetections),
  };
}

function weakestEntity(entries = []) {
  return entries
    .filter((entry) => Number.isFinite(entry.limiter?.delta))
    .slice()
    .sort((first, second) => (
      first.limiter.delta - second.limiter.delta || first.id.localeCompare(second.id)
    ))[0] || null;
}

function caseEntry(value = {}, expectedReportSha256 = "") {
  const reference = value.referenceValidation || {};
  const values = reference.metrics || {};
  const thresholds = reference.requiredThresholds || {};
  const metrics = metricEntries(values, thresholds);
  const entities = entityDefinitions.map((definition) => entityEntry(definition, reference, thresholds));
  const HOTA = finite(values.HOTA);
  const expectedHOTA = finite(thresholds.minHota);
  const reportSha256 = String(reference.reportSha256 || "").toLowerCase();
  return {
    id: String(value.benchmarkId || ""),
    sourceFingerprint: fingerprintPattern.test(String(value.sourceFingerprint || ""))
      ? String(value.sourceFingerprint).toLowerCase()
      : "",
    range: identityRange(value.range),
    passed: value.verdict?.passed === true,
    referencePassed: reference.passed === true,
    referenceVerified: reference.status === "verified"
      && /^[a-f0-9]{64}$/i.test(reportSha256)
      && reportSha256 === expectedReportSha256,
    crossValidationPassed: reference.crossValidation?.passed === true,
    HOTA,
    expectedHOTA,
    hotaDelta: HOTA !== null && expectedHOTA !== null ? HOTA - expectedHOTA : null,
    metrics,
    limiter: weakestMetric(metrics),
    metricStatus: metricProfileStatus(metrics),
    entities,
    diagnosticReady: metricProfileStatus(metrics) !== "missing"
      && entities.every((entry) => entry.status !== "missing"),
    identitySwitches: count(values.identitySwitches),
    fragmentations: count(values.fragmentations),
  };
}

function weakestCase(entries = []) {
  return entries
    .filter((entry) => entry.id && Number.isFinite(entry.limiter?.delta))
    .slice()
    .sort((first, second) => (
      first.limiter.delta - second.limiter.delta || first.id.localeCompare(second.id)
    ))[0] || null;
}

function measurementDiagnostics(cases = [], verified = false) {
  const expectedMetricCellCount = cases.length * entityDefinitions.length * metricDefinitions.length;
  const entries = cases.flatMap((entry) => entry.entities.flatMap((entity) => (
    entity.metrics
      .filter((metric) => metric.status !== "missing")
      .map((metric) => ({
        caseId: entry.id,
        caseLabel: entry.reviewTarget?.caseId || entry.id,
        entityId: entity.id,
        entityLabel: entity.label,
        metricId: metric.id,
        metricLabel: metric.label,
        dimension: metric.dimension,
        recommendation: metric.recommendation,
        actual: metric.actual,
        expected: metric.expected,
        delta: metric.delta,
        status: metric.status,
        identitySwitches: entity.identitySwitches,
        fragmentations: entity.fragmentations,
        reviewTarget: entry.reviewTarget,
      }))
  )));
  const ready = verified
    && expectedMetricCellCount > 0
    && entries.length === expectedMetricCellCount
    && cases.every((entry) => entry.id && entry.diagnosticReady);
  const hotspots = ready ? entries.slice().sort((first, second) => (
    first.delta - second.delta
      || first.caseId.localeCompare(second.caseId)
      || first.entityId.localeCompare(second.entityId)
      || first.metricId.localeCompare(second.metricId)
  )) : [];
  return {
    status: ready ? "ready" : "incomplete",
    thresholdUse: "diagnostic-target",
    measuredMetricCellCount: entries.length,
    expectedMetricCellCount,
    belowTargetCount: hotspots.filter((entry) => entry.status === "failed").length,
    hotspots,
  };
}

export function trackingMeasurementIntelligence(evaluation = {}, state = {}) {
  const report = evaluation.report || {};
  if (report.benchmarkType !== "multi-object-suite") return null;
  const reference = report.referenceValidation || {};
  const reportSha256 = String(reference.reportSha256 || "").toLowerCase();
  const metrics = metricEntries(reference.metrics, reference.requiredThresholds);
  const entities = entityDefinitions.map((definition) => entityEntry(
    definition,
    reference,
    reference.requiredThresholds,
  ));
  let cases = (Array.isArray(report.cases) ? report.cases : [])
    .map((entry) => caseEntry(entry, reportSha256));
  const missingMetricCount = metrics.filter((entry) => entry.status === "missing").length;
  const failedMetricCount = metrics.filter((entry) => entry.status === "failed").length;
  const verified = reference.status === "verified"
    && /^[a-f0-9]{64}$/i.test(reportSha256)
    && missingMetricCount === 0
    && entities.every((entry) => entry.status !== "missing")
    && cases.length > 0
    && cases.every((entry) => (
      entry.referenceVerified
      && entry.crossValidationPassed
      && entry.metricStatus !== "missing"
    ));
  cases = cases.map((entry) => ({
    ...entry,
    reviewTarget: verified ? campaignReviewTarget(evaluation, state, entry) : null,
  }));
  const limiter = weakestMetric(metrics);
  const weakestEntityValue = weakestEntity(entities);
  const weakestCaseValue = weakestCase(cases);
  const diagnostics = measurementDiagnostics(cases, verified);
  const providerApprovalReady = verified
    && failedMetricCount === 0
    && cases.every((entry) => (
      entry.metricStatus === "passed"
      && entry.passed
      && entry.referencePassed
    ))
    && report.summary?.providerApprovalReady === true;
  return {
    status: !verified ? "incomplete" : providerApprovalReady ? "passed" : "failed",
    verified,
    providerApprovalReady,
    metrics,
    entities,
    cases,
    missingMetricCount,
    failedMetricCount,
    limiter,
    weakestEntity: weakestEntityValue,
    weakestCase: weakestCaseValue,
    diagnostics,
    crossValidation: {
      passedCaseCount: cases.filter((entry) => entry.crossValidationPassed).length,
      caseCount: cases.length,
    },
    events: {
      identitySwitches: count(reference.metrics?.identitySwitches),
      fragmentations: count(reference.metrics?.fragmentations),
    },
  };
}

export const TRACKING_MEASUREMENT_METRICS = metricDefinitions;
