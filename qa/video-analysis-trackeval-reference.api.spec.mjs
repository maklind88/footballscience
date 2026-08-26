import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "qa/fixtures/video-analysis/tracking-benchmark-football-scene.json");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

async function fixture() {
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

function perfectMetrics() {
  return {
    HOTA: 1,
    DetA: 1,
    AssA: 1,
    LocA: 1,
    MOTA: 1,
    IDF1: 1,
    IDP: 1,
    IDR: 1,
    identitySwitches: 0,
    fragmentations: 0,
  };
}

function countsFor(sequence, entityType = "") {
  const truth = sequence.timesteps.flatMap((entry) => entry.truth)
    .filter((entry) => !entityType || entry.entityType === entityType);
  const prediction = sequence.timesteps.flatMap((entry) => entry.prediction)
    .filter((entry) => !entityType || entry.entityType === entityType);
  return {
    timesteps: sequence.timesteps.length,
    groundTruthDetections: truth.length,
    predictionDetections: prediction.length,
    groundTruthIdentities: new Set(truth.map((entry) => entry.id)).size,
    predictionIdentities: new Set(prediction.map((entry) => entry.id)).size,
  };
}

function resultBundle(sequence) {
  return {
    metrics: perfectMetrics(),
    counts: countsFor(sequence),
    perEntity: Object.fromEntries(["player", "ball", "referee"].map((entityType) => [entityType, {
      metrics: perfectMetrics(),
      counts: countsFor(sequence, entityType),
    }])),
  };
}

function referenceReport(request, manifest) {
  const sequences = request.sequences.map((sequence) => ({
    benchmarkId: sequence.benchmarkId,
    sourceFingerprint: sequence.sourceFingerprint,
    ...resultBundle(sequence),
  }));
  return {
    schemaVersion: 1,
    protocol: manifest.protocol,
    evaluator: {
      name: "TrackEval",
      commit: manifest.upstream.commit,
      sourceSha256: manifest.upstream.sourceSha256,
    },
    threshold: 0.5,
    sequenceCount: sequences.length,
    summary: resultBundle(request.sequences[0]),
    sequences,
  };
}

test("TrackEval manifest pins immutable official source and an offline bounded runtime", async () => {
  const runtime = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const manifest = runtime.readTrackEvalManifest();

  expect(manifest).toMatchObject({
    evaluatorId: "trackeval",
    evaluatorVersion: "1.0.0",
    protocol: "football-science-trackeval-reference-v1",
    approval: { status: "approved-local-optional", networkAtEvaluation: false },
    upstream: {
      commit: "12c8791b303e0a0b50f753af204249e622d0281a",
      sourceBytes: 168312,
      sourceSha256: "435f0e6d865918332155f8104a98a04d50c2c3de5b985b96c8a71a0f5b62a0ac",
      license: "MIT",
    },
    runtime: { maximumSequences: 100, maximumObservations: 500000, maximumEvaluationMs: 120000 },
  });
  expect(manifest.upstream.sourceUrl).toMatch(/^https:\/\/codeload\.github\.com\//);
});

test("TrackEval installer exposes a reviewable plan and refuses unverified source", async () => {
  const installer = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/install-evaluator.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-trackeval-install-test-"));
  const invalidArchive = path.join(temporaryDir, "source.tar.gz");
  await fs.writeFile(invalidArchive, "not-trackeval");
  try {
    const plan = installer.trackEvalInstallPlan({ installDir: path.join(temporaryDir, "install") });
    expect(plan).toMatchObject({
      protocol: "football-science-trackeval-reference-v1",
      source: { license: "MIT", bytes: 168312 },
      runtime: { isolatedVirtualEnvironment: true, networkAtEvaluation: false },
    });
    await expect(installer.installTrackEval({
      acceptLicense: true,
      installDir: path.join(temporaryDir, "install"),
      sourceArchive: invalidArchive,
    }, {
      selectPython: async () => ({ command: process.execPath, version: "Python 3.12.0" }),
    })).rejects.toThrow(/checksum|size mismatch/i);
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("TrackEval runtime resolves only a marker matching the pinned source", async () => {
  const runtime = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const manifest = runtime.readTrackEvalManifest();
  const installDir = "/tmp/fs-trackeval-contract";
  const paths = runtime.trackEvalPaths({ manifest, installDir });
  const files = new Set([paths.marker, paths.python, paths.runner, paths.sourceDir]);
  const matching = {
    schemaVersion: 1,
    evaluatorId: manifest.evaluatorId,
    evaluatorVersion: manifest.evaluatorVersion,
    sourceCommit: manifest.upstream.commit,
    sourceSha256: manifest.upstream.sourceSha256,
  };

  expect(runtime.resolveInstalledTrackEval({
    manifest,
    installDir,
    exists: (entry) => files.has(entry),
    readMarker: () => matching,
  })).toMatchObject({ evaluatorName: "trackeval", evaluatorVersion: "1.0.0" });
  expect(runtime.resolveInstalledTrackEval({
    manifest,
    installDir,
    exists: (entry) => files.has(entry),
    readMarker: () => ({ ...matching, sourceSha256: "0".repeat(64) }),
  })).toBeNull();
});

test("TrackEval request contains bounded trajectories but no source or identity metadata", async () => {
  const requestModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-request.mjs",
  ));
  const runtime = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const request = requestModule.buildTrackEvalRequest(await fixture(), runtime.readTrackEvalManifest());
  const serialized = JSON.stringify(request);

  expect(request).toMatchObject({
    protocol: "football-science-trackeval-reference-v1",
    threshold: 0.5,
    sequences: [{ benchmarkId: "football-scene-clean-motion" }],
  });
  expect(request.sequences[0].timesteps).toHaveLength(3);
  expect(request.sequences[0].timesteps[0].truth).toHaveLength(4);
  expect(serialized).not.toMatch(/playerId|teamId|shirtNumber|confidence|device|processingMs|\.mp4|file:|https?:/i);
  const invalidCase = await fixture();
  expect(() => requestModule.buildTrackEvalRequest({
    version: 2,
    id: "invalid-suite",
    cases: [invalidCase],
  }, runtime.readTrackEvalManifest())).toThrow(/suite version/i);
});

test("TrackEval report validator accepts exact evidence and rejects source or output drift", async () => {
  const requestModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-request.mjs",
  ));
  const runtime = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const manifest = runtime.readTrackEvalManifest();
  const request = requestModule.buildTrackEvalRequest(await fixture(), manifest);
  const report = referenceReport(request, manifest);

  expect(requestModule.validateTrackEvalReport(report, request, manifest)).toMatchObject({
    sequenceCount: 1,
    summary: { metrics: { HOTA: 1, MOTA: 1, IDF1: 1 } },
  });
  expect(() => requestModule.validateTrackEvalReport({
    ...report,
    evaluator: { ...report.evaluator, sourceSha256: "0".repeat(64) },
  }, request, manifest)).toThrow(/pinned evaluator/i);
  expect(() => requestModule.validateTrackEvalReport({
    ...report,
    outputPath: "/tmp/leak.json",
  }, request, manifest)).toThrow(/forbidden|unexpected/i);
});

test("TrackEval evidence hashing is canonical and changes with metric evidence", async () => {
  const adapter = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-adapter.mjs",
  ));
  const first = { evaluator: { name: "TrackEval" }, metrics: { HOTA: 0.8, IDF1: 0.7 } };
  const reordered = { metrics: { IDF1: 0.7, HOTA: 0.8 }, evaluator: { name: "TrackEval" } };
  const changed = { metrics: { IDF1: 0.71, HOTA: 0.8 }, evaluator: { name: "TrackEval" } };

  expect(adapter.trackEvalReportSha256(first)).toBe(adapter.trackEvalReportSha256(reordered));
  expect(adapter.trackEvalReportSha256(first)).not.toBe(adapter.trackEvalReportSha256(changed));
  expect(adapter.trackEvalReportSha256(first)).toMatch(/^[a-f0-9]{64}$/);
});

test("tracking benchmark CLI makes official reference evaluation explicit", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-benchmark.mjs"));
  expect(cli.parseTrackingBenchmarkArguments(["--input", fixturePath, "--trackeval", "--json"])).toMatchObject({
    input: fixturePath,
    trackEval: true,
    json: true,
  });
  expect(cli.trackingBenchmarkHelp()).toContain("--trackeval");
});
