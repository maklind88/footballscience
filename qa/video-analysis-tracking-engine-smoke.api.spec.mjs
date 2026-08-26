import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function validResult(prompt = {}) {
  return {
    artifact: {
      entityType: "player",
      confidence: 0.91,
      metadata: {
        model: "SAM 2.1 Hiera Tiny",
        device: "mps",
        providerProtocol: "football-science-tracking-v1",
      },
      segments: [{
        id: "segment-1",
        points: [
          { atMs: prompt.startMs, x: 0.2, y: 0.4 },
          { atMs: prompt.startMs + Math.round((prompt.endMs - prompt.startMs) / 2), x: 0.25, y: 0.4 },
          { atMs: prompt.endMs, x: 0.35, y: 0.4 },
        ],
      }],
    },
  };
}

async function temporaryParent() {
  return fs.mkdtemp(path.join(os.tmpdir(), "fs-player-smoke-contract-"));
}

test("tracking engine smoke runs an isolated provider job and retains no media or trajectories", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-engine-smoke.mjs"));
  const parent = await temporaryParent();
  const adapter = {
    available: () => true,
    info: () => ({
      engineName: "sam2.1-hiera-tiny",
      displayName: "Football Science SAM 2.1 Player Tracker",
      engineVersion: "1.0.0",
      protocol: "football-science-tracking-v1",
      source: "approved-packaged",
      installDir: "/private/provider",
    }),
    trackObject: async (inputPath, outputPath, prompt, options) => {
      expect(path.dirname(inputPath)).toBe(path.dirname(outputPath));
      options.onProgress({ stage: "Loading SAM 2.1", ratio: 0.3 });
      options.onProgress({ stage: "Tracking object", ratio: 0.8 });
      return validResult(prompt);
    },
  };
  try {
    const times = [1_000, 2_500];
    const report = await service.runTrackingEngineSmoke({
      adapter,
      now: () => times.shift(),
      temporaryParent: parent,
      generateFixture: async (filePath) => {
        const bytes = Buffer.alloc(2_048, 7);
        await fs.writeFile(filePath, bytes);
        return { byteLength: bytes.byteLength };
      },
    });
    expect(report).toMatchObject({
      ok: true,
      protocol: "football-science-tracking-engine-smoke-v1",
      provider: { engineName: "sam2.1-hiera-tiny", source: "approved-packaged" },
      fixture: { kind: "generated-synthetic-video", byteLength: 2_048 },
      result: { pointCount: 3, segmentCount: 1, observedDurationMs: 1_000 },
      performance: {
        processingMs: 1_500,
        realtimeFactor: 1.5,
        referenceMaximumRealtimeFactor: 1,
        withinReferenceBudget: false,
        coldStartIncluded: true,
      },
      temporaryMediaRetained: false,
      realMatchQualityProven: false,
    });
    expect(report.progressStages).toEqual(["Loading SAM 2.1", "Tracking object"]);
    expect(JSON.stringify(report)).not.toMatch(/private\/provider|synthetic-player\.mp4|segments|points/);
    expect(await fs.readdir(parent)).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("tracking engine smoke fails closed on a non-propagated result and still removes the fixture", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-engine-smoke.mjs"));
  const parent = await temporaryParent();
  const adapter = {
    available: () => true,
    info: () => ({ engineName: "invalid-provider" }),
    trackObject: async (_inputPath, _outputPath, prompt) => {
      const result = validResult(prompt);
      result.artifact.segments[0].points = result.artifact.segments[0].points.slice(0, 1);
      return result;
    },
  };
  try {
    const times = [1_000, 2_500];
    await expect(service.runTrackingEngineSmoke({
      adapter,
      now: () => times.shift(),
      temporaryParent: parent,
      generateFixture: async (filePath) => {
        await fs.writeFile(filePath, Buffer.alloc(2_048, 3));
        return { byteLength: 2_048 };
      },
    })).rejects.toThrow(/valid propagated object track/i);
    expect(await fs.readdir(parent)).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("tracking batch smoke compares one shared video pass with repeated single jobs", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-engine-smoke.mjs"));
  const parent = await temporaryParent();
  const adapter = {
    available: () => true,
    info: () => ({
      engineName: "sam2.1-hiera-tiny",
      displayName: "Football Science SAM 2.1 Object Tracker",
      engineVersion: "1.0.0",
      protocol: "football-science-tracking-v1",
      source: "approved-packaged",
    }),
    trackObjects: async (_inputPath, _outputPath, prompts, options) => {
      options.onProgress({ stage: "Tracking 2 objects", ratio: 0.8 });
      return { artifacts: prompts.map((prompt) => validResult(prompt).artifact) };
    },
    trackObject: async (_inputPath, _outputPath, prompt) => validResult(prompt),
  };
  try {
    const times = [1_000, 5_000, 6_000, 14_000];
    const report = await service.runTrackingEngineBatchSmoke({
      adapter,
      now: () => times.shift(),
      temporaryParent: parent,
      generateFixture: async (filePath) => {
        const bytes = Buffer.alloc(2_048, 9);
        await fs.writeFile(filePath, bytes);
        return { byteLength: bytes.byteLength };
      },
    });
    expect(report).toMatchObject({
      ok: true,
      protocol: "football-science-tracking-engine-batch-smoke-v1",
      fixture: { objectCount: 2, byteLength: 2_048 },
      result: { trackCount: 2, pointCount: 6, repeatedSingleTrackCount: 2 },
      performance: {
        batchProcessingMs: 4_000,
        repeatedSingleProcessingMs: 8_000,
        speedup: 2,
        batchFaster: true,
        providerInvocationsAvoided: 1,
        sharedVideoState: true,
      },
      temporaryMediaRetained: false,
      realMatchQualityProven: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/segments|points|synthetic-players\.mp4/);
    expect(await fs.readdir(parent)).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("tracking warm smoke proves resident model reuse and separates cold from warm latency", async () => {
  const service = await import(moduleUrl("scripts/fs-player-tracking-engine-smoke.mjs"));
  const parent = await temporaryParent();
  let sequence = 0;
  const adapter = {
    available: () => true,
    info: () => ({
      engineName: "sam2.1-hiera-tiny",
      displayName: "Football Science SAM 2.1 Object Tracker",
      engineVersion: "1.3.0",
      protocol: "football-science-tracking-v1",
      source: "approved-packaged",
      runtime: {
        mode: "football-science-tracking-worker-v1",
        status: "ready",
        modelResident: true,
        cpuThreads: 8,
        sampleFps: 3,
        generation: 1,
        completedJobs: sequence,
        reusedJobs: Math.max(0, sequence - 1),
        coldStartMs: 4_000,
        modelLoadMs: 3_500,
        lastJobTelemetry: {
          samplingMs: 20,
          stateInitMs: 100,
          promptMs: 50,
          forwardPropagationMs: 600,
          reversePropagationMs: 0,
          cleanupMs: 20,
          trackingMs: 770,
          sampledFrameCount: 3,
          propagatedFrameCount: 3,
          sampleFps: 3,
        },
      },
    }),
    trackObject: async (_inputPath, _outputPath, prompt, options) => {
      sequence += 1;
      options.onProgress({ stage: sequence === 1 ? "Loading resident SAM 2.1" : "Using resident SAM 2.1", ratio: 0.7 });
      return {
        ...validResult(prompt),
        runtime: {
          mode: "football-science-tracking-worker-v1",
          generation: 1,
          workerJobSequence: sequence,
          workerReused: sequence > 1,
          modelResident: true,
          cpuThreads: 8,
          workerColdStartMs: 4_000,
          modelLoadMs: 3_500,
          jobProcessingMs: sequence === 1 ? 900 : 800,
          telemetry: {
            samplingMs: 20,
            stateInitMs: 100,
            promptMs: 50,
            forwardPropagationMs: 600,
            reversePropagationMs: 0,
            cleanupMs: 20,
            trackingMs: 770,
            trackBuildMs: 1,
            writeMs: 1,
            sampledFrameCount: 3,
            propagatedFrameCount: 3,
            objectCount: 1,
            sampleFps: 3,
          },
        },
      };
    },
  };
  try {
    const times = [1_000, 6_000, 7_000, 8_000];
    const report = await service.runTrackingEngineWarmSmoke({
      adapter,
      now: () => times.shift(),
      temporaryParent: parent,
      generateFixture: async (filePath) => {
        const bytes = Buffer.alloc(2_048, 5);
        await fs.writeFile(filePath, bytes);
        return { byteLength: bytes.byteLength };
      },
    });
    expect(report).toMatchObject({
      ok: true,
      protocol: "football-science-tracking-engine-warm-smoke-v1",
      provider: {
        engineVersion: "1.3.0",
        runtime: { modelResident: true, completedJobs: 2, reusedJobs: 1 },
      },
      result: {
        first: { pointCount: 3, observedDurationMs: 1_000 },
        warm: { pointCount: 3, observedDurationMs: 1_000 },
      },
      performance: {
        firstEndToEndMs: 5_000,
        warmEndToEndMs: 1_000,
        coldStartMs: 4_000,
        modelLoadMs: 3_500,
        warmTelemetry: {
          samplingMs: 20,
          trackingMs: 770,
          sampledFrameCount: 3,
          propagatedFrameCount: 3,
        },
        warmProviderMs: 800,
        warmRealtimeFactor: 1,
        warmWithinReferenceBudget: true,
        coldToWarmSpeedup: 5,
        sameWorkerGeneration: true,
        modelResident: true,
      },
      temporaryMediaRetained: false,
      realMatchQualityProven: false,
    });
    expect(report.progressStages).toEqual(["Loading resident SAM 2.1", "Using resident SAM 2.1"]);
    expect(JSON.stringify(report)).not.toMatch(/segments|points|synthetic-player\.mp4/);
    expect(await fs.readdir(parent)).toEqual([]);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
