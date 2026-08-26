import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "qa/fixtures/video-analysis/tracking-benchmark-selected-player.json");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

async function fixture() {
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

test("tracking benchmark passes a bounded high-quality selected-player case", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/trackingBenchmarkService.js"));
  const report = service.evaluateTrackingBenchmarkCase(await fixture());

  expect(report.verdict).toMatchObject({ passed: true, failureCount: 0 });
  expect(report.metrics.visibleCoverage).toBe(1);
  expect(report.metrics.meanIou).toBeGreaterThan(0.9);
  expect(report.metrics.p95CenterError).toBeLessThan(0.01);
  expect(report.metrics.realtimeFactor).toBe(0.25);
  expect(report.worstSamples).toHaveLength(3);
  expect(JSON.stringify(report)).not.toMatch(/"(?:segments|groundTruth|prediction|filePath)"|blob:/i);
});

test("tracking benchmark fails missing coverage and large geometric error", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/trackingBenchmarkService.js"));
  const input = await fixture();
  input.prediction.track.segments[0].points = [{
    ...input.prediction.track.segments[0].points[0],
    x: 0.6,
    groundX: 0.6,
  }];
  const report = service.evaluateTrackingBenchmarkCase(input);

  expect(report.verdict.passed).toBe(false);
  expect(report.metrics.visibleCoverage).toBeCloseTo(1 / 3, 8);
  expect(report.metrics.maxGapMs).toBe(2000);
  expect(report.verdict.failures.map((failure) => failure.metric)).toEqual(expect.arrayContaining([
    "visibleCoverage",
    "meanIou",
    "maxGapMs",
  ]));
});

test("tracking benchmark never interpolates across continuity segments", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/trackingBenchmarkService.js"));
  const input = await fixture();
  const [first, , last] = input.prediction.track.segments[0].points;
  input.prediction.track.segments = [
    { id: "before-break", startMs: 0, endMs: 0, points: [first] },
    { id: "after-break", startMs: 2000, endMs: 2000, discontinuityBefore: true, points: [last] },
  ];
  const report = service.evaluateTrackingBenchmarkCase(input);

  expect(report.metrics.matchedSamples).toBe(2);
  expect(report.metrics.visibleCoverage).toBeCloseTo(2 / 3, 8);
  expect(report.metrics.continuityBreaks).toBe(1);
});

test("tracking benchmark rejects media paths, URLs and blob data", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/trackingBenchmarkService.js"));
  const pathInput = await fixture();
  pathInput.filePath = "/private/match.mp4";
  expect(() => service.evaluateTrackingBenchmarkCase(pathInput)).toThrow(/media field/i);

  const blobInput = await fixture();
  blobInput.prediction.track.metadata = { preview: "blob:local-video" };
  expect(() => service.evaluateTrackingBenchmarkCase(blobInput)).toThrow(/media references/i);

  const urlInput = await fixture();
  urlInput.prediction.track.metadata = { signedUrl: "https://example.test/video" };
  expect(() => service.evaluateTrackingBenchmarkCase(urlInput)).toThrow(/media field/i);

  const relativeInput = await fixture();
  relativeInput.prediction.track.metadata = { note: "matches/round-1.mp4" };
  expect(() => service.evaluateTrackingBenchmarkCase(relativeInput)).toThrow(/media references/i);
});

test("tracking benchmark suite aggregates cases without copying raw samples", async () => {
  const service = await import(moduleUrl("src/modules/video-analysis/services/trackingBenchmarkService.js"));
  const first = await fixture();
  const second = await fixture();
  second.id = "selected-player-second-case";
  second.sourceFingerprint = "b".repeat(64);
  const report = service.evaluateTrackingBenchmarkSuite({ version: 1, id: "pilot-suite", cases: [first, second] });

  expect(report.summary).toMatchObject({ passed: true, caseCount: 2, passedCaseCount: 2 });
  expect(report.summary.weightedVisibleCoverage).toBe(1);
  expect(JSON.stringify(report)).not.toContain('"points"');
});

test("tracking benchmark CLI returns a private machine-readable report", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    path.join(rootDir, "scripts/fs-player-tracking-benchmark.mjs"),
    "--input",
    fixturePath,
    "--json",
  ], { cwd: rootDir });
  const report = JSON.parse(stdout);

  expect(stderr).toBe("");
  expect(report.verdict.passed).toBe(true);
  expect(stdout).not.toContain(fixturePath);
  expect(stdout).not.toContain("truth-segment-1");
});

test("tracking benchmark CLI separates quality failure from invalid input", async () => {
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-benchmark-"));
  const failedInputPath = path.join(temporaryDir, "failed.json");
  const invalidInputPath = path.join(temporaryDir, "invalid.json");
  const reportPath = path.join(temporaryDir, "report.json");
  const command = path.join(rootDir, "scripts/fs-player-tracking-benchmark.mjs");
  try {
    const failedInput = await fixture();
    failedInput.prediction.track.segments[0].points = [failedInput.prediction.track.segments[0].points[0]];
    await Promise.all([
      fs.writeFile(failedInputPath, JSON.stringify(failedInput)),
      fs.writeFile(invalidInputPath, "{not-json"),
    ]);

    let qualityFailure;
    try {
      await execFileAsync(process.execPath, [command, "--input", failedInputPath, "--output", reportPath, "--json"]);
    } catch (error) {
      qualityFailure = error;
    }
    expect(qualityFailure?.code).toBe(1);
    expect(JSON.parse(qualityFailure.stdout).verdict.passed).toBe(false);
    expect(JSON.parse(await fs.readFile(reportPath, "utf8")).verdict.passed).toBe(false);

    let invalidFailure;
    try {
      await execFileAsync(process.execPath, [command, "--input", invalidInputPath]);
    } catch (error) {
      invalidFailure = error;
    }
    expect(invalidFailure?.code).toBe(2);
    expect(invalidFailure.stderr).toContain("Benchmark input is not valid JSON");
    expect(invalidFailure.stderr).not.toContain(invalidInputPath);
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});
