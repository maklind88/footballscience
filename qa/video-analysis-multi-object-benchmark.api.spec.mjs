import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "qa/fixtures/video-analysis/tracking-benchmark-football-scene.json");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

async function fixture() {
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

test("multi-object benchmark measures a clean football scene by entity and identity", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const report = service.evaluateMultiObjectTrackingBenchmarkCase(await fixture());

  expect(report.verdict).toMatchObject({ passed: true, providerApprovalReady: false, failureCount: 0 });
  expect(report.metrics).toMatchObject({
    evaluatedFrames: 3,
    truthDetections: 12,
    predictionDetections: 12,
    truePositives: 12,
    falsePositives: 0,
    falseNegatives: 0,
    detectionPrecision: 1,
    detectionRecall: 1,
    identityF1: 1,
    identitySwitches: 0,
    ballRecall: 1,
    refereeRecall: 1,
  });
  expect(report.referenceValidation).toMatchObject({
    evaluator: "TrackEval",
    status: "required-before-provider-approval",
  });
  expect(JSON.stringify(report)).not.toMatch(/"(?:tracks|segments|points|groundTruth|prediction)"/i);
});

test("multi-object benchmark fails missed referees and false-positive players", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const input = await fixture();
  input.prediction.tracks = input.prediction.tracks.filter((track) => track.entityType !== "referee");
  const falsePositive = structuredClone(input.prediction.tracks[0]);
  falsePositive.id = "prediction-false-positive";
  falsePositive.segments[0].id = "prediction-false-positive-segment";
  falsePositive.segments[0].points = falsePositive.segments[0].points.map((point) => ({
    ...point,
    x: 0.9,
    groundX: 0.9,
  }));
  input.prediction.tracks.push(falsePositive);
  const report = service.evaluateMultiObjectTrackingBenchmarkCase(input);

  expect(report.verdict.passed).toBe(false);
  expect(report.metrics).toMatchObject({
    truePositives: 9,
    falsePositives: 3,
    falseNegatives: 3,
    detectionPrecision: 0.75,
    detectionRecall: 0.75,
    refereeRecall: 0,
  });
  expect(report.verdict.failures.map((failure) => failure.metric)).toEqual(expect.arrayContaining([
    "detectionPrecision",
    "detectionRecall",
    "refereeRecall",
    "mota",
  ]));
});

test("multi-object benchmark exposes identity switches and reacquisition fragments", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const input = await fixture();
  const original = input.prediction.tracks.shift();
  const first = structuredClone(original);
  first.id = "prediction-home-before-occlusion";
  first.endMs = 0;
  first.segments[0].id = "prediction-home-before-occlusion-segment";
  first.segments[0].endMs = 0;
  first.segments[0].points = [first.segments[0].points[0]];
  const second = structuredClone(original);
  second.id = "prediction-home-after-occlusion";
  second.startMs = 2000;
  second.segments[0].id = "prediction-home-after-occlusion-segment";
  second.segments[0].startMs = 2000;
  second.segments[0].points = [second.segments[0].points[2]];
  input.prediction.tracks.push(first, second);
  const report = service.evaluateMultiObjectTrackingBenchmarkCase(input);

  expect(report.metrics.identitySwitches).toBe(1);
  expect(report.metrics.fragmentations).toBe(1);
  expect(report.metrics.identityF1).toBeLessThan(1);
  expect(report.verdict.failures.map((failure) => failure.metric)).toEqual(expect.arrayContaining([
    "identitySwitchesPerMinute",
    "fragmentationsPerMinute",
  ]));
});

test("multi-object benchmark separates spatial detection from wrong class, team and player identity", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const input = await fixture();
  const ball = input.prediction.tracks.find((track) => track.entityType === "ball");
  ball.entityType = "player";
  const home = input.prediction.tracks.find((track) => track.playerId === "home-8");
  home.teamId = "away";
  home.teamSide = "away";
  home.playerId = "away-99";
  const report = service.evaluateMultiObjectTrackingBenchmarkCase(input);

  expect(report.metrics.detectionRecall).toBe(1);
  expect(report.metrics.entityTypeAccuracy).toBe(0.75);
  expect(report.metrics.ballRecall).toBe(0);
  expect(report.metrics.teamAccuracy).toBe(0.5);
  expect(report.metrics.playerIdentityAccuracy).toBe(0.5);
  expect(report.verdict.passed).toBe(false);
});

test("Hungarian frame assignment maximizes the full scene instead of greedy pairs", async () => {
  const assignment = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingAssignmentMetrics.js",
  ));
  const pairs = assignment.maximumWeightAssignment([
    [0.9, 0.8],
    [0.85, 0.1],
  ], 0.5);

  expect(pairs).toEqual([
    { rowIndex: 0, columnIndex: 1, weight: 0.8 },
    { rowIndex: 1, columnIndex: 0, weight: 0.85 },
  ]);
});

test("multi-object benchmark rejects duplicate trajectory ids", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const input = await fixture();
  input.prediction.tracks[1].id = input.prediction.tracks[0].id;

  expect(() => service.evaluateMultiObjectTrackingBenchmarkCase(input)).toThrow(/track ids must be unique/i);
});

test("tracking benchmark CLI dispatches multi-object cases and suites", async () => {
  const command = path.join(rootDir, "scripts/fs-player-tracking-benchmark.mjs");
  const { stdout } = await execFileAsync(process.execPath, [command, "--input", fixturePath, "--json"], { cwd: rootDir });
  const report = JSON.parse(stdout);

  expect(report).toMatchObject({ benchmarkType: "multi-object", verdict: { passed: true } });
  expect(report.metrics.identityF1).toBe(1);
  expect(stdout).not.toContain(fixturePath);

  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const first = await fixture();
  const second = await fixture();
  second.id = "football-scene-second-case";
  second.sourceFingerprint = "d".repeat(64);
  const suite = service.evaluateMultiObjectTrackingBenchmarkSuite({
    version: 1,
    id: "football-scene-suite",
    cases: [first, second],
  });
  expect(suite.summary).toMatchObject({
    passed: true,
    providerApprovalReady: false,
    caseCount: 2,
    passedCaseCount: 2,
    detectionPrecision: 1,
    detectionRecall: 1,
  });
});
