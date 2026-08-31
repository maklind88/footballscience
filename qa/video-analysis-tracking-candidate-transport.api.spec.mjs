import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function request(sourceFingerprint = "f".repeat(64)) {
  return { sourceFingerprint, range: { startMs: 0, endMs: 1000 } };
}

function artifact(stageRequest) {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: { id: "candidate-player-detector", version: "0.1.0", fingerprintSha256: "a".repeat(64) },
    stage: "detection",
    capabilities: ["detect:player"],
    sourceFingerprint: stageRequest.sourceFingerprint,
    requestFingerprint: "b".repeat(64),
    range: { ...stageRequest.range },
    payload: { observations: [] },
  };
}

function candidateEvidence(stageRequest, stageArtifact, overrides = {}) {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-candidate-stage-run-v1",
    id: "candidate-stage-evidence-1",
    benchmarkOnly: true,
    provider: {
      id: "candidate-player-detector",
      version: "0.1.0",
      protocol: "football-science-tracking-stage-v1",
      stage: "detection",
      capabilities: ["detect:player"],
      manifestFingerprintSha256: "a".repeat(64),
      executionFingerprintSha256: "d".repeat(64),
    },
    source: {
      algorithm: "sha256",
      kind: "exact-local-file-bytes",
      fingerprintSha256: stageRequest.sourceFingerprint,
    },
    range: { ...stageRequest.range },
    request: { fingerprintSha256: stageArtifact.requestFingerprint, payload: stageRequest },
    result: { artifactSha256: "c".repeat(64), payload: stageArtifact },
    execution: {
      protocol: "football-science-tracking-stage-execution-v1",
      isolation: "test-network-denied-v1",
      wallTimeMs: 25,
      realTimeFactor: 0.025,
      outputBytes: 256,
      stdoutBytes: 0,
      stderrBytes: 0,
      exitCode: 0,
      device: "cpu",
      runtimeMode: "native-stage-process-v1",
      cpuThreads: 8,
      sampleFps: 12.5,
      modelResident: false,
      workerReused: false,
    },
    createdAt: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

async function waitForJob(baseUrl, id, headers) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/jobs/${id}`, { headers });
    const payload = await response.json();
    if (["succeeded", "failed", "cancelled"].includes(payload.job?.status)) return payload.job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Candidate tracking job did not complete.");
}

test("browser candidate client uses only the benchmark endpoint and requires its boundary marker", async () => {
  const localTracking = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingService.js",
  ));
  const requests = [];
  const candidateJobId = "ca11da7e-0000-0000-0000-000000000001";
  const stageRequest = request();
  const stageArtifact = artifact(stageRequest);
  const stageEvidence = candidateEvidence(stageRequest, stageArtifact);
  const evidenceBytes = Buffer.from(`${JSON.stringify(stageEvidence)}\n`);
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47924",
    btoa: globalThis.btoa,
    crypto: globalThis.crypto,
    setTimeout,
    fetch: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/session") {
        return Response.json({ sessionToken: "candidate-session" }, { status: 201 });
      }
      if (parsed.pathname === "/jobs/run-tracking-candidate-stage") {
        requests.push({ url: parsed.pathname, options });
        return Response.json({ job: { id: candidateJobId }, statusUrl: `${parsed.origin}/jobs/${candidateJobId}` }, { status: 202 });
      }
      if (parsed.pathname === `/jobs/${candidateJobId}`) {
        return Response.json({ job: {
          status: "succeeded",
          startedAt: "2026-08-31T12:00:00.000Z",
          completedAt: "2026-08-31T12:00:00.050Z",
          result: {
            benchmarkOnly: true,
            sourceSha256: stageRequest.sourceFingerprint,
            resultUrl: `${parsed.origin}/tracking-candidate-stage/${candidateJobId}/result.json?access=token`,
            evidenceUrl: `${parsed.origin}/tracking-candidate-stage/${candidateJobId}/evidence.json?access=token`,
            evidenceSha256: sha256(evidenceBytes),
            artifactSha256: stageEvidence.result.artifactSha256,
            execution: { isolation: "darwin-sandbox-exec-network-denied-v1" },
          },
        } });
      }
      if (parsed.pathname === `/tracking-candidate-stage/${candidateJobId}/result.json`) {
        return Response.json(stageArtifact);
      }
      if (parsed.pathname === `/tracking-candidate-stage/${candidateJobId}/evidence.json`) {
        return new Response(evidenceBytes, {
          status: 200,
          headers: { "content-length": String(evidenceBytes.byteLength), "content-type": "application/json" },
        });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  };
  const result = await localTracking.runLocalTrackingCandidateStage({
    win,
    provider: {
      id: "candidate-player-detector",
      version: "0.1.0",
      protocol: "football-science-tracking-stage-v1",
      stage: "detection",
      capabilities: ["detect:player"],
      providerFingerprintSha256: "a".repeat(64),
      executionFingerprintSha256: "d".repeat(64),
      executionProfile: {
        device: "cpu",
        runtimeMode: "native-stage-process-v1",
        cpuThreads: 8,
        sampleFps: 12.5,
        modelResident: false,
      },
    },
    request: stageRequest,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe("/jobs/run-tracking-candidate-stage");
  expect(result).toMatchObject({
    benchmarkOnly: true,
    processingMs: 50,
    artifact: { stage: "detection" },
    evidence: { protocol: "football-science-tracking-candidate-stage-run-v1", benchmarkOnly: true },
  });
});

test("local companion keeps candidate execution separate from activated tracking", async () => {
  const configModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/config.mjs",
  ));
  const serverModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/server.mjs",
  ));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-candidate-server-"));
  const origin = "http://localhost:4173";
  const video = Buffer.from("private-candidate-match-video");
  const fingerprint = sha256(video);
  const candidateRegistrySnapshot = {
    protocol: "football-science-tracking-candidate-registry-v1",
    status: "ready",
    providerCount: 1,
    readyCount: 1,
    blockedCount: 0,
    providers: [{
      id: "candidate-player-detector",
      version: "0.1.0",
      stage: "detection",
      capabilities: ["detect:player"],
      status: "candidate-ready",
      available: true,
      benchmarkOnly: true,
      reasons: [],
    }],
    reasons: [],
  };
  const candidateRunner = {
    info: () => ({ executionMode: "benchmark-candidate" }),
    decorateRegistry: async (snapshot) => ({
      ...snapshot,
      executableCount: 1,
      activationBlockedCount: 0,
      providers: snapshot.providers.map((provider) => ({
        ...provider,
        executionAvailable: true,
        benchmarkOnly: true,
        activationStatus: "benchmark-only",
        activationIsolation: "test-network-denied-v1",
      })),
    }),
    run: async (value) => {
      expect(value.source.sha256).toBe(fingerprint);
      expect(await fs.readFile(value.source.filePath)).toEqual(video);
      const stageArtifact = artifact(value.request);
      return {
        benchmarkOnly: true,
        artifact: stageArtifact,
        evidence: candidateEvidence(value.request, stageArtifact),
        telemetry: {
          protocol: "football-science-tracking-stage-execution-v1",
          isolation: "test-network-denied-v1",
          wallTimeMs: 25,
          outputBytes: 256,
          stdoutBytes: 0,
          stderrBytes: 0,
          exitCode: 0,
        },
      };
    },
  };
  const approvedSnapshot = {
    protocol: "football-science-tracking-provider-registry-v1",
    status: "ready",
    providerCount: 0,
    readyCount: 0,
    blockedCount: 0,
    providers: [],
    reasons: [],
  };
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    cacheDir,
    port: 0,
    maxInputBytes: 1024 * 1024,
    maxCacheBytes: 16 * 1024 * 1024,
  };
  const localServer = serverModule.createLocalVideoServer({
    config,
    engine: {},
    trackingEngine: { available: () => false, info: () => ({ available: false }), close: async () => {} },
    trackingProviderRegistry: { inspect: async () => approvedSnapshot },
    trackingStageRunner: {
      decorateRegistry: async (snapshot) => ({ ...snapshot, executableCount: 0, activationBlockedCount: 0 }),
    },
    trackingCandidateProviderRegistry: { inspect: async () => candidateRegistrySnapshot },
    trackingCandidateStageRunner: candidateRunner,
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { Origin: origin } })).json();
    const headers = { Origin: origin, "x-football-science-session": session.sessionToken };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toContain("run-tracking-candidate-stage");
    expect(capabilities.capabilities).not.toContain("run-tracking-stage");
    expect(capabilities.trackingCandidateRegistry.providers[0]).toMatchObject({
      benchmarkOnly: true,
      activationStatus: "benchmark-only",
    });
    expect(JSON.stringify(capabilities)).not.toContain(cacheDir);

    const stageRequest = { range: { startMs: 0, endMs: 1000 } };
    const response = await fetch(`${baseUrl}/jobs/run-tracking-candidate-stage`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/octet-stream",
        "x-football-science-file-name": "match.mp4",
        "x-football-science-tracking-provider-id": "candidate-player-detector",
        "x-football-science-tracking-provider-version": "0.1.0",
        "x-football-science-tracking-stage-request": Buffer.from(JSON.stringify(stageRequest)).toString("base64url"),
      },
      body: video,
    });
    expect(response.status).toBe(202);
    const created = await response.json();
    const completed = await waitForJob(baseUrl, created.job.id, headers);
    expect(completed).toMatchObject({
      type: "run-tracking-candidate-stage",
      status: "succeeded",
      result: { benchmarkOnly: true, stage: "detection" },
    });
    expect(completed.result.resultUrl).toContain("/tracking-candidate-stage/");
    expect(completed.result.evidenceUrl).toContain("/tracking-candidate-stage/");
    expect(completed.result.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    const evidenceResponse = await fetch(completed.result.evidenceUrl, { headers });
    expect(evidenceResponse.status).toBe(200);
    expect((await evidenceResponse.json()).protocol).toBe("football-science-tracking-candidate-stage-run-v1");
    expect(JSON.stringify(completed)).not.toContain(cacheDir);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
