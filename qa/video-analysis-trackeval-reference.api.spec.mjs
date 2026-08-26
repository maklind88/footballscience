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

test("TrackEval cancellation waits for process exit and removes its temporary evidence", async () => {
  const adapter = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-adapter.mjs",
  ));
  const runtimeService = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const before = new Set((await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith("fs-trackeval-")));
  const abortController = new AbortController();
  const evaluation = adapter.evaluateTrackEvalReference(await fixture(), {
    manifest: runtimeService.readTrackEvalManifest(),
    runtime: {
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60000)", "--"],
      env: {},
    },
    signal: abortController.signal,
    timeoutMs: 5_000,
  });
  setTimeout(() => abortController.abort(), 50);
  await expect(evaluation).rejects.toMatchObject({ code: "ABORT_ERR" });
  const after = (await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith("fs-trackeval-"));
  expect(after.filter((entry) => !before.has(entry))).toEqual([]);
});

test("TrackEval attachment makes approval explicit and gates internal-reference drift", async () => {
  const adapter = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-adapter.mjs",
  ));
  const requestModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-request.mjs",
  ));
  const runtime = await import(moduleUrl(
    "desktop/local-video-app/tracking-evaluators/trackeval/evaluator-runtime.mjs",
  ));
  const benchmarkService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const suite = { version: 1, id: "trackeval-approval-suite", cases: [await fixture()] };
  const internal = benchmarkService.evaluateMultiObjectTrackingBenchmarkSuite(suite);
  const manifest = runtime.readTrackEvalManifest();
  const request = requestModule.buildTrackEvalRequest(suite, manifest);
  const validated = requestModule.validateTrackEvalReport(referenceReport(request, manifest), request, manifest);
  const reference = { ...validated, reportSha256: adapter.trackEvalReportSha256(validated) };
  const approved = await adapter.attachTrackEvalReference(suite, internal, { reference });
  expect(approved).toMatchObject({
    summary: { passed: true, providerApprovalReady: true },
    referenceValidation: { passed: true },
    cases: [{
      verdict: { passed: true, providerApprovalReady: true, referencePassed: true },
      referenceValidation: { crossValidation: { passed: true } },
    }],
  });

  const drifted = structuredClone(internal);
  drifted.cases[0].metrics.mota = 0.9;
  const rejected = await adapter.attachTrackEvalReference(suite, drifted, { reference });
  expect(rejected).toMatchObject({
    summary: { passed: false, providerApprovalReady: false },
    cases: [{
      verdict: { passed: false, providerApprovalReady: false, referencePassed: false },
      referenceValidation: { crossValidation: { passed: false } },
    }],
  });
});

test("local benchmark jobs require a secure session and return bounded reference evidence", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const benchmarkService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-benchmark-job-test-"));
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 2,
  };
  let evaluated = 0;
  const localServer = serverModule.createLocalVideoServer({
    config,
    engine: { preparePlaybackCopy: async () => ({ mode: "remux" }) },
    trackingEngine: { available: () => false, info: () => ({ available: false }) },
    trackingBenchmark: {
      evaluateBenchmark: async (suite) => {
        evaluated += 1;
        const report = benchmarkService.evaluateMultiObjectTrackingBenchmarkSuite(suite);
        return {
          ...report,
          referenceValidation: { evaluator: "TrackEval", status: "verified", reportSha256: "a".repeat(64) },
        };
      },
    },
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const benchmark = { version: 1, id: "local-reference-suite", cases: [await fixture()] };
    const unauthorized = await fetch(`${baseUrl}/jobs/evaluate-tracking-benchmark`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(benchmark),
    });
    expect(unauthorized.status).toBe(401);

    const session = await (await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { origin },
    })).json();
    const headers = {
      origin,
      "content-type": "application/json",
      "x-football-science-session": session.sessionToken,
    };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toEqual(expect.arrayContaining([
      "evaluate-tracking-benchmark",
      "tracking-reference:trackeval",
    ]));
    expect(capabilities.trackingBenchmark).toMatchObject({
      available: true,
      referenceAvailable: true,
      evaluator: "trackeval",
      evaluatorVersion: "1.0.0",
    });

    const queuedResponse = await fetch(`${baseUrl}/jobs/evaluate-tracking-benchmark`, {
      method: "POST",
      headers,
      body: JSON.stringify(benchmark),
    });
    const queued = await queuedResponse.json();
    expect(queuedResponse.status).toBe(202);
    await expect.poll(async () => (
      await (await fetch(queued.statusUrl, { headers })).json()
    ).job?.status).toBe("succeeded");
    const completed = await (await fetch(queued.statusUrl, { headers })).json();
    expect(completed.job).toMatchObject({
      type: "evaluate-tracking-benchmark",
      metadata: { benchmarkType: "multi-object", caseCount: 1 },
      result: {
        report: {
          benchmarkType: "multi-object-suite",
          referenceValidation: { evaluator: "TrackEval", status: "verified" },
        },
      },
    });
    expect(evaluated).toBe(1);
    expect(JSON.stringify(completed.job.result)).not.toMatch(/sourcePath|file:|\.mp4|videoBytes/i);

    const retained = localServer.jobs.stats().retained;
    const unsafe = await fetch(`${baseUrl}/jobs/evaluate-tracking-benchmark`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...benchmark, sourcePath: "/private/match.mp4" }),
    });
    expect(unsafe.status).toBe(400);
    expect(localServer.jobs.stats().retained).toBe(retained);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("browser benchmark client opens one secure session and polls metadata-only evidence", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingBenchmarkService.js",
  ));
  const benchmark = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const calls = [];
  const expectedReport = {
    benchmarkType: "multi-object-suite",
    summary: { passed: true, providerApprovalReady: true },
  };
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/session")) {
      return { ok: true, json: async () => ({ sessionToken: "benchmark-session", expiresAt: "2099-01-01T00:00:00.000Z" }) };
    }
    if (url.endsWith("/capabilities")) {
      return {
        ok: true,
        json: async () => ({ capabilities: ["evaluate-tracking-benchmark", "tracking-reference:trackeval"] }),
      };
    }
    if (url.endsWith("/jobs/evaluate-tracking-benchmark")) {
      return {
        ok: true,
        json: async () => ({ job: { id: "benchmark-job-browser" }, statusUrl: "http://127.0.0.1:47991/jobs/benchmark-job-browser" }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        job: {
          status: "succeeded",
          stage: "completed",
          progress: { ratio: 1 },
          result: { report: expectedReport },
        },
      }),
    };
  };
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47991",
    fetch: fetcher,
    setTimeout,
  };
  let queued = null;
  const report = await service.evaluateLocalTrackingBenchmark(benchmark, {
    win,
    fetcher,
    onQueued: (job) => { queued = job; },
  });
  expect(report).toEqual(expectedReport);
  expect(queued).toMatchObject({ jobId: "benchmark-job-browser", sessionToken: "benchmark-session" });
  expect(calls.map((entry) => new URL(entry.url).pathname)).toEqual([
    "/session",
    "/capabilities",
    "/jobs/evaluate-tracking-benchmark",
    "/jobs/benchmark-job-browser",
  ]);
  expect(calls.slice(1).every((entry) => (
    entry.options.headers?.["x-football-science-session"] === "benchmark-session"
  ))).toBe(true);
  expect(calls[2].options.body).not.toMatch(/sourcePath|videoUrl|blob:|https?:\/\//i);
});

test("browser benchmark cancellation removes a job queued during the abort race", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingBenchmarkService.js",
  ));
  const benchmark = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const abortController = new AbortController();
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/session")) {
      return { ok: true, json: async () => ({ sessionToken: "abort-session", expiresAt: "2099-01-01T00:00:00.000Z" }) };
    }
    if (url.endsWith("/capabilities")) {
      return {
        ok: true,
        json: async () => ({ capabilities: ["evaluate-tracking-benchmark", "tracking-reference:trackeval"] }),
      };
    }
    if (url.endsWith("/jobs/evaluate-tracking-benchmark")) {
      abortController.abort();
      return {
        ok: true,
        json: async () => ({ job: { id: "benchmark-job-abort" }, statusUrl: "http://127.0.0.1:47992/jobs/benchmark-job-abort" }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47992",
    fetch: fetcher,
    setTimeout,
  };
  await expect(service.evaluateLocalTrackingBenchmark(benchmark, {
    win,
    fetcher,
    signal: abortController.signal,
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(calls.map((entry) => [new URL(entry.url).pathname, entry.options.method || "GET"])).toEqual([
    ["/session", "POST"],
    ["/capabilities", "GET"],
    ["/jobs/evaluate-tracking-benchmark", "POST"],
    ["/jobs/benchmark-job-abort", "DELETE"],
  ]);
});

test("browser benchmark failures remove the queued local job", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingBenchmarkService.js",
  ));
  const benchmark = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/session")) {
      return { ok: true, json: async () => ({ sessionToken: "failure-session", expiresAt: "2099-01-01T00:00:00.000Z" }) };
    }
    if (url.endsWith("/capabilities")) {
      return {
        ok: true,
        json: async () => ({ capabilities: ["evaluate-tracking-benchmark", "tracking-reference:trackeval"] }),
      };
    }
    if (url.endsWith("/jobs/evaluate-tracking-benchmark")) {
      return {
        ok: true,
        json: async () => ({ job: { id: "benchmark-job-failed" }, statusUrl: "http://127.0.0.1:47993/jobs/benchmark-job-failed" }),
      };
    }
    if (options.method === "DELETE") return { ok: true, json: async () => ({ ok: true }) };
    return {
      ok: true,
      json: async () => ({ job: { status: "failed", error: "Reference evaluation failed." } }),
    };
  };
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47993",
    fetch: fetcher,
    setTimeout,
  };
  await expect(service.evaluateLocalTrackingBenchmark(benchmark, { win, fetcher }))
    .rejects.toThrow("Reference evaluation failed.");
  expect(calls.map((entry) => [new URL(entry.url).pathname, entry.options.method || "GET"])).toEqual([
    ["/session", "POST"],
    ["/capabilities", "GET"],
    ["/jobs/evaluate-tracking-benchmark", "POST"],
    ["/jobs/benchmark-job-failed", "GET"],
    ["/jobs/benchmark-job-failed", "DELETE"],
  ]);
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
