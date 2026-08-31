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

function benchmarkCase(id, HOTA, passed = true) {
  return {
    benchmarkId: id,
    verdict: { passed },
    referenceValidation: {
      passed,
      metrics: metrics({ HOTA }),
      requiredThresholds: thresholds,
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
        benchmarkCase("fast-transition", 0.59, false),
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
  });
  expect(result.limiter.delta).toBeCloseTo(-0.01, 10);
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
  expect(html).not.toContain("data-video-analysis-tracking-action");
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
