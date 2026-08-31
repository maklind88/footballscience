import { expect, test } from "@playwright/test";

test("candidate evidence survives reload, remains scope-isolated and rejects tampering", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?candidate-workspace=1", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("football-science-tracking-candidate-evidence");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    const pipelineService = await import("/src/modules/video-analysis/services/trackingCandidatePipelineService.js");
    const artifactService = await import("/src/modules/video-analysis/services/trackingCandidatePipelineArtifactService.js");
    const store = await import("/src/modules/video-analysis/services/localTrackingCandidateStore.js");
    const sourceFingerprint = "f".repeat(64);
    const range = { startMs: 0, endMs: 2000 };
    const capabilities = {
      detection: ["detect:player", "detect:ball", "detect:referee"],
      association: ["associate:multi-object"],
      reidentification: ["reidentify:player"],
      classification: ["classify:team", "classify:shirt-number"],
    };
    const providers = Object.fromEntries(Object.entries(capabilities).map(([stage, values]) => [stage, {
      id: `candidate-${stage}`,
      version: "0.1.0",
      protocol: "football-science-tracking-stage-v1",
      stage,
      capabilities: values,
      benchmarkOnly: true,
      executionAvailable: true,
      providerFingerprintSha256: "2".repeat(64),
      executionFingerprintSha256: "3".repeat(64),
      executionProfile: {
        device: "cpu",
        runtimeMode: "native-stage-process-v1",
        cpuThreads: 8,
        sampleFps: 12.5,
        modelResident: false,
      },
    }]));

    function canonicalJson(value) {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    }

    async function digest(value) {
      const bytes = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function observation(id, atMs, frameIndex, entityType, left, confidence = 0.9) {
      return {
        id,
        atMs,
        frameIndex,
        entityType,
        box: { left, top: 0.2, width: entityType === "ball" ? 0.02 : 0.08, height: entityType === "ball" ? 0.02 : 0.3 },
        confidence,
      };
    }

    function payload(stage) {
      if (stage === "detection") return { observations: [
        observation("player-a", 0, 0, "player", 0.1, 0.96),
        observation("player-b", 1000, 25, "player", 0.2, 0.94),
        observation("ball-a", 1000, 25, "ball", 0.5, 0.88),
        observation("referee-a", 1000, 25, "referee", 0.7, 0.91),
      ] };
      if (stage === "association") return { trajectories: [
        { id: "trajectory-player", entityType: "player", observationIds: ["player-a", "player-b"], confidence: 0.93, discontinuitiesMs: [1000] },
        { id: "trajectory-ball", entityType: "ball", observationIds: ["ball-a"], confidence: 0.82, discontinuitiesMs: [] },
        { id: "trajectory-referee", entityType: "referee", observationIds: ["referee-a"], confidence: 0.91, discontinuitiesMs: [] },
      ] };
      if (stage === "reidentification") return { identities: [
        { trajectoryId: "trajectory-player", identityKey: "local-cluster-8", confidence: 0.91 },
      ] };
      return { classifications: [
        { trajectoryId: "trajectory-player", teamSide: "home", teamConfidence: 0.97, shirtNumber: "8", shirtNumberConfidence: 0.9 },
      ] };
    }

    async function sealedStageRun(options) {
      const stage = options.provider.stage;
      const request = { sourceFingerprint, ...options.request };
      const stageArtifact = {
        schemaVersion: 1,
        protocol: "football-science-tracking-stage-result-v1",
        provider: {
          id: options.provider.id,
          version: options.provider.version,
          fingerprintSha256: options.provider.providerFingerprintSha256,
        },
        stage,
        capabilities: [...options.provider.capabilities],
        sourceFingerprint,
        requestFingerprint: await digest(canonicalJson({ stage, request })),
        range,
        payload: payload(stage),
      };
      const artifactSha256 = await digest(canonicalJson(stageArtifact));
      const evidence = {
        schemaVersion: 1,
        protocol: "football-science-tracking-candidate-stage-run-v1",
        id: `candidate-${stage}-evidence`,
        benchmarkOnly: true,
        provider: {
          id: options.provider.id,
          version: options.provider.version,
          protocol: "football-science-tracking-stage-v1",
          stage,
          capabilities: [...options.provider.capabilities],
          manifestFingerprintSha256: options.provider.providerFingerprintSha256,
          executionFingerprintSha256: options.provider.executionFingerprintSha256,
        },
        source: { algorithm: "sha256", kind: "exact-local-file-bytes", fingerprintSha256: sourceFingerprint },
        range,
        request: { fingerprintSha256: stageArtifact.requestFingerprint, payload: request },
        result: { artifactSha256, payload: stageArtifact },
        execution: {
          protocol: "football-science-tracking-stage-execution-v1",
          isolation: "test-network-denied-v1",
          wallTimeMs: 100,
          realTimeFactor: 0.05,
          outputBytes: 1024,
          stdoutBytes: 0,
          stderrBytes: 0,
          exitCode: 0,
          ...options.provider.executionProfile,
          workerReused: false,
        },
        createdAt: "2026-08-31T12:00:00.000Z",
      };
      return {
        benchmarkOnly: true,
        artifact: stageArtifact,
        sourceArtifactId: stage === "detection" ? "ca11da7e-0000-0000-0000-000000000001" : "",
        sourceSha256: sourceFingerprint,
        evidence,
        evidenceSha256: await digest(`${JSON.stringify(evidence)}\n`),
      };
    }

    const pipeline = await pipelineService.runTrackingCandidatePipeline({
      providers,
      sourceFingerprint,
      range,
      file: new Blob(["match"]),
      cryptoApi: crypto,
      runStage: sealedStageRun,
    });
    const scope = { organizationId: "org-1", teamId: "team-1", userId: "analyst-1", matchId: "match-1" };
    const artifact = await artifactService.createTrackingCandidatePipelineArtifact({
      scope,
      itemId: "presentation-item-1",
      frame: { width: 1920, height: 1080 },
      ...pipeline,
    }, { cryptoApi: crypto, now: () => "2026-08-31T12:05:00.000Z" });
    const saved = await store.saveLocalTrackingCandidatePipelineRun(artifact, window);
    const listed = await store.listLocalTrackingCandidatePipelineRuns(scope, artifact.itemId, window);
    const isolated = await store.listLocalTrackingCandidatePipelineRuns({ ...scope, userId: "analyst-2" }, artifact.itemId, window);
    const restored = await store.getLocalTrackingCandidatePipelineRun(scope, artifact.itemId, artifact.id, window);

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("football-science-tracking-candidate-evidence", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("pipeline-runs", "readwrite");
      const objectStore = transaction.objectStore("pipeline-runs");
      const getRequest = objectStore.getAll();
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const record = getRequest.result[0];
        record.artifact.rawTracks[0].segments[0].points[0].x = 0.99;
        objectStore.put(record);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    let tamperCode = "";
    try {
      await store.getLocalTrackingCandidatePipelineRun(scope, artifact.itemId, artifact.id, window);
    } catch (error) {
      tamperCode = error.code;
    }
    await store.removeLocalTrackingCandidatePipelineRun(scope, artifact.itemId, artifact.id, window);
    const afterRemove = await store.listLocalTrackingCandidatePipelineRuns(scope, artifact.itemId, window);
    return {
      savedSourceFingerprint: saved.sourceFingerprint,
      listedSourceFingerprint: listed[0]?.sourceFingerprint,
      listedProvider: listed[0]?.providers?.detection?.id,
      restoredContentSha256: restored?.contentSha256,
      expectedContentSha256: artifact.contentSha256,
      isolatedCount: isolated.length,
      tamperCode,
      afterRemoveCount: afterRemove.length,
    };
  });

  expect(result).toEqual({
    savedSourceFingerprint: "f".repeat(64),
    listedSourceFingerprint: "f".repeat(64),
    listedProvider: "candidate-detection",
    restoredContentSha256: result.expectedContentSha256,
    expectedContentSha256: result.expectedContentSha256,
    isolatedCount: 0,
    tamperCode: "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED",
    afterRemoveCount: 0,
  });
  expect(result.expectedContentSha256).toMatch(/^[a-f0-9]{64}$/);
});
