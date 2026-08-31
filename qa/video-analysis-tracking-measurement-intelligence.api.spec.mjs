import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

const thresholds = {
  minHota: 0.65,
  minDetA: 0.75,
  minAssA: 0.65,
  minLocA: 0.75,
  minMota: 0.8,
  minIdf1: 0.85,
};

function metrics(overrides = {}) {
  return {
    HOTA: 0.72,
    DetA: 0.82,
    AssA: 0.64,
    LocA: 0.84,
    MOTA: 0.86,
    IDF1: 0.88,
    IDP: 0.89,
    IDR: 0.87,
    identitySwitches: 7,
    fragmentations: 12,
    ...overrides,
  };
}

function entityReport(overrides = {}) {
  return {
    metrics: metrics(overrides),
    counts: {
      timesteps: 120,
      groundTruthDetections: 500,
      predictionDetections: 490,
      groundTruthIdentities: 22,
      predictionIdentities: 24,
    },
  };
}

function caseEntities(overrides = {}) {
  return {
    player: entityReport({ HOTA: 0.77, DetA: 0.85, AssA: 0.72, LocA: 0.86, MOTA: 0.88, IDF1: 0.91 }),
    ball: entityReport({ HOTA: 0.68, DetA: 0.76, AssA: 0.67, LocA: 0.78, MOTA: 0.81, IDF1: 0.86 }),
    referee: entityReport({ HOTA: 0.7, DetA: 0.79, AssA: 0.68, LocA: 0.8, MOTA: 0.83, IDF1: 0.87 }),
    ...overrides,
  };
}

function benchmarkCase(id, HOTA, passed = true, perEntity = caseEntities()) {
  return {
    benchmarkId: id,
    verdict: { passed },
    referenceValidation: {
      status: "verified",
      reportSha256: "a".repeat(64),
      passed,
      metrics: metrics({ HOTA, AssA: 0.68 }),
      requiredThresholds: thresholds,
      perEntity,
      crossValidation: { passed: true },
    },
  };
}

function evaluation(overrides = {}) {
  return {
    status: "failed",
    report: {
      benchmarkType: "multi-object-suite",
      summary: { providerApprovalReady: false },
      referenceValidation: {
        status: "verified",
        reportSha256: "a".repeat(64),
        metrics: metrics(),
        requiredThresholds: thresholds,
        perEntity: {
          player: entityReport({ HOTA: 0.78, DetA: 0.86, AssA: 0.72, IDF1: 0.91 }),
          ball: entityReport({ HOTA: 0.52, DetA: 0.61, AssA: 0.48, IDF1: 0.64 }),
          referee: entityReport({ HOTA: 0.68, DetA: 0.77, AssA: 0.61, IDF1: 0.8 }),
        },
      },
      cases: [
        benchmarkCase("attacking-third", 0.7),
        benchmarkCase("fast-transition", 0.59, false, caseEntities({
          ball: entityReport({ HOTA: 0.5, DetA: 0.57, AssA: 0.35, LocA: 0.77, MOTA: 0.82, IDF1: 0.6 }),
        })),
      ],
    },
    ...overrides,
  };
}

test("measurement intelligence identifies only measured TrackEval limiters", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js",
  ));
  const result = service.trackingMeasurementIntelligence(evaluation());

  expect(result).toMatchObject({
    status: "failed",
    verified: true,
    providerApprovalReady: false,
    failedMetricCount: 1,
    limiter: { id: "AssA", dimension: "Association continuity" },
    weakestEntity: { id: "ball", label: "Ball" },
    weakestCase: { id: "fast-transition", HOTA: 0.59 },
    crossValidation: { passedCaseCount: 2, caseCount: 2 },
    events: { identitySwitches: 7, fragmentations: 12 },
    diagnostics: {
      status: "ready",
      thresholdUse: "diagnostic-target",
      measuredMetricCellCount: 36,
      expectedMetricCellCount: 36,
      belowTargetCount: 4,
    },
  });
  expect(result.limiter.delta).toBeCloseTo(-0.01, 10);
  expect(result.diagnostics.hotspots[0]).toMatchObject({
    caseId: "fast-transition",
    entityId: "ball",
    metricId: "AssA",
    dimension: "Association continuity",
    status: "failed",
  });
  expect(result.diagnostics.hotspots[0].delta).toBeCloseTo(-0.3, 10);
});

test("measurement intelligence stays incomplete when verified per-entity evidence is absent", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js",
  ));
  const value = evaluation();
  delete value.report.referenceValidation.perEntity.ball;
  const result = service.trackingMeasurementIntelligence(value);

  expect(result.status).toBe("incomplete");
  expect(result.verified).toBe(false);
  expect(result.providerApprovalReady).toBe(false);
  expect(result.diagnostics).toMatchObject({ status: "incomplete", hotspots: [] });
});

test("measurement diagnostics reject crossed report identity and partial case entity evidence", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js",
  ));
  const crossed = evaluation();
  crossed.report.cases[0].referenceValidation.reportSha256 = "f".repeat(64);
  const crossedResult = service.trackingMeasurementIntelligence(crossed);
  expect(crossedResult.verified).toBe(false);
  expect(crossedResult.diagnostics).toMatchObject({ status: "incomplete", hotspots: [] });

  const partial = evaluation();
  delete partial.report.cases[1].referenceValidation.perEntity.referee;
  const partialResult = service.trackingMeasurementIntelligence(partial);
  expect(partialResult.verified).toBe(true);
  expect(partialResult.diagnostics).toMatchObject({
    status: "incomplete",
    measuredMetricCellCount: 30,
    expectedMetricCellCount: 36,
    hotspots: [],
  });
});

test("measurement intelligence derives approval from measured gates instead of the summary claim", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js",
  ));
  const claimed = evaluation();
  claimed.report.summary.providerApprovalReady = true;
  claimed.report.cases.forEach((entry) => {
    entry.verdict.passed = true;
    entry.referenceValidation.passed = true;
  });
  const result = service.trackingMeasurementIntelligence(claimed);

  expect(result.verified).toBe(true);
  expect(result.failedMetricCount).toBe(1);
  expect(result.providerApprovalReady).toBe(false);
  expect(result.status).toBe("failed");
});

test("measurement intelligence keeps a passed report as a target watchlist without false hotspots", async () => {
  const [service, component] = await Promise.all([
    import(moduleUrl("src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js")),
    import(moduleUrl("src/modules/video-analysis/components/TrackingMeasurementIntelligence.js")),
  ]);
  const passed = evaluation();
  passed.status = "passed";
  passed.report.summary.providerApprovalReady = true;
  passed.report.referenceValidation.metrics = metrics({ AssA: 0.7 });
  passed.report.referenceValidation.perEntity = caseEntities();
  passed.report.cases = [
    benchmarkCase("attacking-third", 0.7),
    benchmarkCase("fast-transition", 0.69),
  ];
  const result = service.trackingMeasurementIntelligence(passed);
  const html = component.renderTrackingMeasurementIntelligence(passed);

  expect(result).toMatchObject({
    status: "passed",
    providerApprovalReady: true,
    diagnostics: { status: "ready", belowTargetCount: 0 },
  });
  expect(html).toContain("Tightest verified margins");
  expect(html).toContain("All targets met");
  expect(html).not.toContain("Measured hotspots");
});

test("measurement panel exposes gates, entity profile and evidence-bound next focus", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingMeasurementIntelligence.js",
  ));
  const html = component.renderTrackingMeasurementIntelligence(evaluation());

  expect(html).toContain("Tracking intelligence");
  expect(html).toContain("Below approval gate");
  expect(html).toContain("AssA");
  expect(html).toContain("-1.0 pp");
  expect(html).toContain("Association continuity · AssA");
  expect(html).toContain("Ball");
  expect(html).toContain("fast-transition");
  expect(html).toContain("2/2 cases");
  expect(html).toContain("Measured hotspots");
  expect(html).toContain("fast-transition · Ball");
  expect(html).toContain("Association continuity · AssA");
  expect(html).toContain("-30.0 pp");
  expect(html).not.toContain("data-video-analysis-tracking-action");
});

test("measurement hotspots reconnect only an exact evidence-bound Match 11 case", async () => {
  const [service, component] = await Promise.all([
    import(moduleUrl("src/modules/video-analysis/services/trackingMeasurementIntelligenceService.js")),
    import(moduleUrl("src/modules/video-analysis/components/TrackingMeasurementIntelligence.js")),
  ]);
  const sourceFingerprint = "b".repeat(64);
  const workspaceSha256 = "c".repeat(64);
  const reportSha256 = "d".repeat(64);
  const sourceSignature = "e".repeat(64);
  const range = { startMs: 10_000, endMs: 20_000 };
  const benchmarkId = "locked-attacking-third-provider-1";
  const artifact = {
    id: "locked-attacking-third",
    sourceFingerprint,
    sourceEvidence: { angleId: "wide" },
    range,
    workloadEvidence: {
      workspaceSha256,
      caseId: "attacking-third",
      sourceFingerprint,
      angleId: "wide",
      range,
    },
  };
  const measured = evaluation();
  measured.report.suiteId = "match-11-provider-1";
  measured.report.cases = [benchmarkCase(benchmarkId, 0.59, false, caseEntities({
    ball: entityReport({ HOTA: 0.5, DetA: 0.57, AssA: 0.35, LocA: 0.77, MOTA: 0.82, IDF1: 0.6 }),
  }))];
  measured.report.cases[0].sourceFingerprint = sourceFingerprint;
  measured.report.cases[0].range = range;
  measured.report.cases[0].worstFrames = [{
    atMs: 12_500,
    perEntity: {
      player: { falseNegatives: 0, falsePositives: 0, identitySwitches: 0, fragmentations: 0, meanIou: 0.9 },
      ball: { falseNegatives: 1, falsePositives: 0, identitySwitches: 1, fragmentations: 0, meanIou: 0.42 },
      referee: { falseNegatives: 0, falsePositives: 0, identitySwitches: 0, fragmentations: 0, meanIou: 0.8 },
    },
  }, {
    atMs: 15_000,
    perEntity: {
      player: { falseNegatives: 0, falsePositives: 0, identitySwitches: 0, fragmentations: 0, meanIou: 0.88 },
      ball: { falseNegatives: 0, falsePositives: 1, identitySwitches: 0, fragmentations: 1, meanIou: 0.5 },
      referee: { falseNegatives: 0, falsePositives: 0, identitySwitches: 0, fragmentations: 0, meanIou: 0.82 },
    },
  }];
  measured.reportSha256 = reportSha256;
  measured.sourceSignature = sourceSignature;
  measured.evidenceSet = {
    protocol: "football-science-tracking-benchmark-evidence-set-v1",
    sourceSignature,
    checksums: { reportSha256 },
    inputs: {
      groundTruthSuite: { cases: [artifact] },
      providerRunSuite: { provider: { providerId: "provider-1" } },
    },
    report: measured.report,
  };
  const item = {
    id: "item-attacking-third",
    clipId: "clip-attacking-third",
    startMs: range.startMs,
    endMs: range.endMs,
  };
  const pageState = {
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      tracking: {
        groundTruth: {
          suite: { cases: [artifact] },
          byItemId: {
            [item.id]: {
              status: "locked",
              lockedArtifact: { id: artifact.id },
              sourceFingerprint,
              angleId: "wide",
            },
          },
        },
        preannotationReview: {
          workspaceSha256,
          campaign: {
            cases: [{
              caseId: "attacking-third",
              sourceSha256: sourceFingerprint,
              itemId: item.id,
              clipId: item.clipId,
              angleId: "wide",
              resumeContextReady: true,
            }],
          },
        },
      },
    },
  };
  const result = service.trackingMeasurementIntelligence(measured, pageState);
  const html = component.renderTrackingMeasurementIntelligence(measured, pageState);

  expect(result.diagnostics.hotspots[0]).toMatchObject({
    caseLabel: "attacking-third",
    reviewTarget: {
      benchmarkId,
      caseId: "attacking-third",
      sourceSha256: sourceFingerprint,
      itemId: item.id,
      clipId: item.clipId,
      angleId: "wide",
    },
  });
  expect(result.diagnostics.hotspots[0].checkpoints).toHaveLength(2);
  expect(result.diagnostics.hotspots[0].checkpoints[0]).toEqual({
    atMs: 12_500,
    basis: "internal-event",
    reason: "1 ID switch · 1 miss",
  });
  expect(html).toContain("Measured review focus");
  expect(html).toContain("Internal diagnostic checkpoints, not TrackEval timestamps");
  expect(html).toContain("Review 0:12.50");
  expect(html).toContain('data-video-analysis-ground-truth-handoff-at-ms="12500"');
  expect(html).toContain("Inspect occlusions, camera transitions and fragmented trajectories");
  expect(html).toContain('data-video-analysis-tracking-action="ground-truth-handoff-reconnect"');
  expect(html).toContain(`data-video-analysis-ground-truth-handoff-source-sha256="${sourceFingerprint}"`);
  expect(html).toContain('data-video-analysis-ground-truth-handoff-angle-id="wide"');

  const crossedSource = structuredClone(measured);
  crossedSource.report.cases[0].sourceFingerprint = "f".repeat(64);
  expect(service.trackingMeasurementIntelligence(crossedSource, pageState)
    .diagnostics.hotspots.every((entry) => entry.reviewTarget === null)).toBe(true);

  const crossedEvidence = structuredClone(measured);
  crossedEvidence.evidenceSet.checksums.reportSha256 = "0".repeat(64);
  expect(service.trackingMeasurementIntelligence(crossedEvidence, pageState)
    .diagnostics.hotspots.every((entry) => entry.reviewTarget === null)).toBe(true);

  const crossedAngleState = structuredClone(pageState);
  crossedAngleState.presentation.tracking.preannotationReview.campaign.cases[0].angleId = "tactical";
  const crossedHtml = component.renderTrackingMeasurementIntelligence(measured, crossedAngleState);
  expect(crossedHtml).toContain("Exact case context unavailable");
  expect(crossedHtml).not.toContain('data-video-analysis-tracking-action="ground-truth-handoff-reconnect"');
});

test("measurement panel remains absent before a multi-object TrackEval report exists", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingMeasurementIntelligence.js",
  ));

  expect(component.renderTrackingMeasurementIntelligence({ status: "idle" })).toBe("");
  expect(component.renderTrackingMeasurementIntelligence({
    report: { benchmarkType: "selected-object-suite" },
  })).toBe("");
});

test("benchmark suite mounts measurement intelligence from the verified evaluation state", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingBenchmarkSuitePanel.js",
  ));
  const html = component.renderTrackingBenchmarkSuitePanel({
    presentation: {
      tracking: {
        benchmarkEvaluation: evaluation(),
        provider: { trackEvalAvailable: true },
      },
    },
  });

  expect(html).toContain('aria-label="Real-match benchmark suite"');
  expect(html).toContain('aria-label="TrackEval measurement intelligence"');
  expect(html).toContain("Association continuity · AssA");
});
