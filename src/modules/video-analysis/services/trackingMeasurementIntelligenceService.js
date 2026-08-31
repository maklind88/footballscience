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

function weakestMetric(entries = []) {
  return entries
    .filter((entry) => entry.delta !== null)
    .slice()
    .sort((first, second) => first.delta - second.delta || first.id.localeCompare(second.id))[0] || null;
}

function entityEntry(definition, reference = {}) {
  const report = reference.perEntity?.[definition.id] || {};
  const metrics = report.metrics || {};
  const counts = report.counts || {};
  return {
    ...definition,
    HOTA: finite(metrics.HOTA),
    DetA: finite(metrics.DetA),
    AssA: finite(metrics.AssA),
    IDF1: finite(metrics.IDF1),
    identitySwitches: count(metrics.identitySwitches),
    fragmentations: count(metrics.fragmentations),
    groundTruthDetections: count(counts.groundTruthDetections),
    predictionDetections: count(counts.predictionDetections),
  };
}

function entityQuality(entry = {}) {
  return [entry.HOTA, entry.DetA, entry.AssA, entry.IDF1]
    .filter((value) => value !== null)
    .reduce((lowest, value) => Math.min(lowest, value), Number.POSITIVE_INFINITY);
}

function weakestEntity(entries = []) {
  return entries
    .filter((entry) => Number.isFinite(entityQuality(entry)))
    .slice()
    .sort((first, second) => entityQuality(first) - entityQuality(second) || first.id.localeCompare(second.id))[0] || null;
}

function caseEntry(value = {}) {
  const reference = value.referenceValidation || {};
  const metrics = reference.metrics || {};
  const thresholds = reference.requiredThresholds || {};
  const HOTA = finite(metrics.HOTA);
  const expectedHOTA = finite(thresholds.minHota);
  return {
    id: String(value.benchmarkId || ""),
    passed: value.verdict?.passed === true,
    referencePassed: reference.passed === true,
    crossValidationPassed: reference.crossValidation?.passed === true,
    HOTA,
    expectedHOTA,
    hotaDelta: HOTA !== null && expectedHOTA !== null ? HOTA - expectedHOTA : null,
    identitySwitches: count(metrics.identitySwitches),
    fragmentations: count(metrics.fragmentations),
  };
}

function weakestCase(entries = []) {
  return entries
    .filter((entry) => entry.id && entry.hotaDelta !== null)
    .slice()
    .sort((first, second) => first.hotaDelta - second.hotaDelta || first.id.localeCompare(second.id))[0] || null;
}

export function trackingMeasurementIntelligence(evaluation = {}) {
  const report = evaluation.report || {};
  if (report.benchmarkType !== "multi-object-suite") return null;
  const reference = report.referenceValidation || {};
  const metrics = metricDefinitions.map((definition) => metricEntry(
    definition,
    reference.metrics,
    reference.requiredThresholds,
  ));
  const entities = entityDefinitions.map((definition) => entityEntry(definition, reference));
  const cases = (Array.isArray(report.cases) ? report.cases : []).map(caseEntry);
  const missingMetricCount = metrics.filter((entry) => entry.status === "missing").length;
  const failedMetricCount = metrics.filter((entry) => entry.status === "failed").length;
  const verified = reference.status === "verified"
    && /^[a-f0-9]{64}$/i.test(String(reference.reportSha256 || ""))
    && missingMetricCount === 0
    && entities.every((entry) => [entry.HOTA, entry.DetA, entry.AssA, entry.IDF1].every((value) => value !== null))
    && cases.length > 0
    && cases.every((entry) => entry.crossValidationPassed);
  const limiter = weakestMetric(metrics);
  const weakestEntityValue = weakestEntity(entities);
  const weakestCaseValue = weakestCase(cases);
  return {
    status: !verified ? "incomplete" : report.summary?.providerApprovalReady === true ? "passed" : "failed",
    verified,
    providerApprovalReady: verified && report.summary?.providerApprovalReady === true,
    metrics,
    entities,
    cases,
    missingMetricCount,
    failedMetricCount,
    limiter,
    weakestEntity: weakestEntityValue,
    weakestCase: weakestCaseValue,
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
