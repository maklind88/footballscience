import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function points(startMs, endMs, offset = 0) {
  const values = [];
  for (let atMs = startMs; atMs <= endMs; atMs += 500) {
    const ratio = (atMs - startMs) / Math.max(1, endMs - startMs);
    values.push({
      atMs,
      x: 0.2 + offset + (ratio * 0.1),
      y: 0.45 + offset,
      width: 0.05,
      height: 0.14,
      groundX: 0.2 + offset + (ratio * 0.1),
      groundY: 0.52 + offset,
      confidence: 0.99,
      identityConfidence: 0.99,
      source: "manual",
    });
  }
  return values;
}

function reviewedTrack(entityType, id, startMs, endMs, sourceFingerprint, angleId, offset = 0) {
  return {
    id,
    entityType,
    playerId: entityType === "player" ? id : "",
    playerLabel: entityType === "player" ? "Home 8" : entityType === "ball" ? "Ball" : "Referee",
    teamSide: entityType === "player" ? "home" : "",
    shirtNumber: entityType === "player" ? "8" : "",
    status: "verified",
    startMs,
    endMs,
    confidence: 0.99,
    identityConfidence: 0.99,
    segments: [{ id: `${id}-segment`, startMs, endMs, points: points(startMs, endMs, offset) }],
    metadata: { localSourceSha256: sourceFingerprint, angleId },
    corrections: [],
  };
}

async function groundTruthArtifact(index, scenarios, overrides = {}) {
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const startMs = Number(overrides.startMs ?? index * 120_000);
  const endMs = Number(overrides.endMs ?? startMs + 120_000);
  const sourceFingerprint = String(overrides.sourceFingerprint || "a".repeat(64));
  const angleId = String(overrides.angleId || "tactical-main");
  const tracks = [
    reviewedTrack("player", `home-8-${index}`, startMs, endMs, sourceFingerprint, angleId, 0),
    reviewedTrack("ball", `ball-${index}`, startMs, endMs, sourceFingerprint, angleId, 0.2),
    reviewedTrack("referee", `referee-${index}`, startMs, endMs, sourceFingerprint, angleId, 0.4),
  ];
  return groundTruth.createGroundTruthArtifact({
    tracks,
    selectedTrackIds: tracks.map((track) => track.id),
    sourceFingerprint,
    angleId,
    frame: { width: 1920, height: 1080 },
    range: { startMs, endMs },
    reviewedBy: "analyst-1",
    attested: true,
    scenarioTags: scenarios,
  }, { now: () => 1_800_000_000_000 + index });
}

function predictions(artifact) {
  return artifact.groundTruth.tracks.map((track) => ({
    ...track,
    status: "review",
    confidence: 0.99,
    identityConfidence: 0.99,
    corrections: [],
    segments: track.segments.map((segment) => ({
      ...segment,
      points: segment.points.map((point) => ({
        ...point,
        confidence: 0.99,
        identityConfidence: 0.99,
      })),
    })),
  }));
}

async function readySuite() {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthSuiteService.js",
  ));
  const scenarioGroups = [
    ["transition"],
    ["crowded-box"],
    ["occlusion"],
    ["camera-motion"],
    ["set-piece", "compact-unit", "difficult-visuals"],
  ];
  let suite = service.trackingGroundTruthSuiteEntry({});
  for (let index = 0; index < scenarioGroups.length; index += 1) {
    suite = service.addGroundTruthSuiteCase(suite, await groundTruthArtifact(index, scenarioGroups[index]));
  }
  return { service, suite };
}

test("real-match suite counts unique time, scenarios and produces a benchmark-ready artifact", async () => {
  const { service, suite } = await readySuite();
  const readiness = service.groundTruthSuiteReadiness(suite);
  expect(readiness).toMatchObject({
    ready: true,
    caseCount: 5,
    sourceCount: 1,
    uniqueDurationMs: 600_000,
    overlapDurationMs: 0,
    missingScenarioIds: [],
  });
  const artifact = service.createGroundTruthSuiteArtifact(suite, { now: () => 1_800_000_010_000 });
  expect(Object.isFrozen(artifact.cases[0].groundTruth.tracks)).toBe(true);
  expect(artifact.summary).toMatchObject({ caseCount: 5, uniqueDurationMs: 600_000 });
  expect(service.groundTruthSuiteArtifactJson(artifact)).not.toMatch(/private\/match|https?:|blob:/);

  const runs = Object.fromEntries(artifact.cases.map((entry) => [entry.id, {
    predictionTracks: predictions(entry),
    performance: { processingMs: 60_000 },
  }]));
  const benchmarkSuite = service.buildMultiObjectSuiteFromGroundTruthSuite(artifact, runs);
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const report = benchmark.evaluateMultiObjectTrackingBenchmarkSuite(benchmarkSuite);
  expect(report.summary).toMatchObject({
    passed: true,
    caseCount: 5,
    realMatchCaseCount: 5,
    realMatchDurationMs: 600_000,
  });
});

test("suite replaces the same source range and excludes overlap from approval time", async () => {
  const { service, suite } = await readySuite();
  const replacement = await groundTruthArtifact(9, ["transition"], { startMs: 0, endMs: 120_000 });
  const replaced = service.addGroundTruthSuiteCase(suite, replacement);
  expect(replaced.cases).toHaveLength(5);
  expect(replaced.cases.some((entry) => entry.id === replacement.id)).toBe(true);

  const overlapping = await groundTruthArtifact(10, ["transition"], { startMs: 540_000, endMs: 660_000 });
  const extended = service.addGroundTruthSuiteCase(replaced, overlapping);
  expect(service.groundTruthSuiteReadiness(extended)).toMatchObject({
    ready: true,
    rawDurationMs: 720_000,
    uniqueDurationMs: 660_000,
    overlapDurationMs: 60_000,
  });
});

test("suite rejects forged sparse references and reports missing scenario coverage", async () => {
  const { service, suite } = await readySuite();
  const sparse = structuredClone(suite.cases[0]);
  sparse.id = "forged-sparse-case";
  sparse.range.endMs = sparse.range.startMs + 120_000;
  sparse.groundTruth.tracks.forEach((track) => {
    track.segments[0].points = [track.segments[0].points[0], track.segments[0].points.at(-1)];
  });
  expect(() => service.addGroundTruthSuiteCase(suite, sparse)).toThrow(/500 ms/i);

  const reduced = service.removeGroundTruthSuiteCase(suite, suite.cases.at(-1).id);
  expect(service.groundTruthSuiteReadiness(reduced)).toMatchObject({
    ready: false,
    caseCount: 4,
    missingScenarioIds: expect.arrayContaining(["set-piece", "compact-unit"]),
  });
});

test("imported suite evidence is revalidated before export or provider execution", async () => {
  const { service, suite } = await readySuite();
  const artifact = service.createGroundTruthSuiteArtifact(suite, { now: () => 1_800_000_010_000 });
  const mismatchedSummary = structuredClone(artifact);
  mismatchedSummary.summary.uniqueDurationMs += 500;
  expect(() => service.groundTruthSuiteArtifactJson(mismatchedSummary)).toThrow(/does not match/i);
  expect(() => service.buildMultiObjectSuiteFromGroundTruthSuite(mismatchedSummary, {})).toThrow(/does not match/i);

  const missingScenarioEvidence = structuredClone(artifact);
  missingScenarioEvidence.cases.at(-1).reviewEvidence.scenarioTags = [];
  expect(() => service.groundTruthSuiteArtifactJson(missingScenarioEvidence)).toThrow(/does not match/i);
});

test("suite panel exposes progress, scenario state and reversible case removal", async () => {
  const { suite } = await readySuite();
  const { renderTrackingBenchmarkSuitePanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingBenchmarkSuitePanel.js",
  ));
  const html = renderTrackingBenchmarkSuitePanel({
    presentation: { tracking: { groundTruth: { suite } } },
  });
  expect(html).toContain("Ready for provider benchmark");
  expect(html).toContain("10.0 min unique / 10.0 min");
  expect(html).toMatch(/ground-truth-suite-download"(?! disabled)/);
  expect(html).toContain("data-video-analysis-ground-truth-case-id");
  expect(html).toContain("is-covered");
});
