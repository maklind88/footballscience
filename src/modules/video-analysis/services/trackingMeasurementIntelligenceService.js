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

export function trackingMeasurementIntelligence(evaluation = {}) {
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
  const cases = (Array.isArray(report.cases) ? report.cases : [])
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
