import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function descriptor(overrides = {}) {
  return {
    protocol: "football-science-mot-ground-truth-import-v1",
    version: 1,
    sequenceId: "SNMOT-001",
    sourceFingerprint: "a".repeat(64),
    angleId: "main-camera",
    frame: { width: 1000, height: 500 },
    frameRate: 10,
    sequenceLengthFrames: 20,
    firstFrameNumber: 1,
    sourceStartMs: 0,
    coordinateOrigin: "one-based",
    maximumContinuousGapFrames: 5,
    scenarioTags: ["transition"],
    reviewedBy: "analyst-1",
    reviewedAt: "2026-08-31T12:00:00.000Z",
    attested: true,
    exhaustiveSceneAttested: true,
    trackMap: {
      1: { entityType: "player", playerLabel: "Home 8", teamSide: "home", shirtNumber: "8" },
      2: { entityType: "ball" },
      3: { entityType: "referee" },
    },
    referenceEvidence: {
      datasetName: "SoccerNet-Tracking",
      datasetVersion: "2023",
      annotationSha256: "b".repeat(64),
      videoUseReviewed: true,
      annotationUseReviewed: true,
      localBenchmarkOnly: true,
    },
    ...overrides,
  };
}

function rows(options = {}) {
  const playerFrames = options.playerFrames || [1, 6, 11, 16, 20];
  const otherFrames = options.otherFrames || [1, 6, 11, 16, 20];
  return [
    ...playerFrames.map((frame) => `${frame},1,101,101,100,200,1,-1,-1,-1`),
    ...otherFrames.map((frame) => `${frame},2,451,201,20,20,1,-1,-1,-1`),
    ...otherFrames.map((frame) => `${frame},3,701,101,80,180,1,-1,-1,-1`),
  ].join("\n");
}

test("SoccerNet/MOT import creates strict metadata-only full-scene evidence", async () => {
  const importer = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMotGroundTruthImportService.js",
  ));
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const artifact = importer.createGroundTruthArtifactFromMotAnnotations(rows(), descriptor());

  expect(groundTruth.validateGroundTruthArtifact(artifact)).toBe(artifact);
  expect(artifact).toMatchObject({
    protocol: "football-science-ground-truth-v1",
    profileId: "football-scene-pilot-v1",
    sourceFingerprint: "a".repeat(64),
    frame: { width: 1000, height: 500 },
    range: { startMs: 0, endMs: 2000 },
    sourceEvidence: {
      kind: "exact-local-file-bytes",
      reference: {
        protocol: "football-science-ground-truth-reference-v1",
        datasetName: "SoccerNet-Tracking",
        datasetVersion: "2023",
        sequenceId: "SNMOT-001",
        annotationProtocol: "motchallenge-10",
        annotationSha256: "b".repeat(64),
        frameRate: 10,
        sequenceLengthFrames: 20,
        firstFrameNumber: 1,
        coordinateOrigin: "one-based",
        maximumContinuousGapFrames: 5,
        videoUseReviewed: true,
        annotationUseReviewed: true,
        localBenchmarkOnly: true,
      },
    },
    reviewEvidence: {
      benchmarkType: "multi-object",
      exhaustiveSceneAttested: true,
      selectedTrackCount: 3,
      entityCounts: { player: 1, ball: 1, referee: 1 },
      sceneCoverageRatio: 0.95,
    },
  });
  expect(artifact.groundTruth.tracks.map((track) => track.entityType).sort()).toEqual([
    "ball", "player", "referee",
  ]);
  expect(JSON.stringify(artifact)).not.toContain("sourceFile");
  expect(JSON.stringify(artifact)).not.toContain("annotationFile");

  const legacyReadable = JSON.parse(JSON.stringify(artifact));
  delete legacyReadable.reviewEvidence.sceneCoverageRatio;
  expect(groundTruth.validateGroundTruthArtifact(legacyReadable)).toBe(legacyReadable);
});

test("MOT annotation audit reports structural progress without granting review approval", async () => {
  const importer = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMotGroundTruthImportService.js",
  ));
  expect(importer.inspectMotAnnotationProgress(rows(), descriptor())).toMatchObject({
    protocol: "football-science-mot-annotation-audit-v1",
    rowCount: 15,
    trackCount: 3,
    annotatedFrameCount: 5,
    sequenceLengthFrames: 20,
    annotatedFrameRatio: 0.25,
    sceneCoverageRatio: 0.95,
    entityCounts: { player: 1, ball: 1, referee: 1 },
    structurallyReady: true,
    issues: [],
  });
  expect(importer.inspectMotAnnotationProgress("", {
    ...descriptor(),
    trackMap: {},
  })).toMatchObject({
    rowCount: 0,
    structurallyReady: false,
    issues: expect.arrayContaining([
      expect.objectContaining({ code: "annotations-empty" }),
      expect.objectContaining({ code: "player-missing" }),
      expect.objectContaining({ code: "ball-missing" }),
      expect.objectContaining({ code: "referee-missing" }),
    ]),
  });
});

test("MOT import refuses inferred classes, duplicate observations and off-frame boxes", async () => {
  const importer = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMotGroundTruthImportService.js",
  ));
  const missingMetadata = descriptor({ trackMap: { 1: descriptor().trackMap[1], 2: descriptor().trackMap[2] } });
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(rows(), missingMetadata)).toThrow(
    /Missing explicit metadata for MOT track 3/,
  );
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(
    `${rows()}\n1,1,101,101,100,200,1,-1,-1,-1`,
    descriptor(),
  )).toThrow(/duplicate frame 1/);
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(
    rows().replace("1,2,451,201,20,20", "1,2,995,201,20,20"),
    descriptor(),
  )).toThrow(/leaves the video frame/);
});

test("full-scene evidence cannot inflate duration without player visibility", async () => {
  const importer = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMotGroundTruthImportService.js",
  ));
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const suites = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthSuiteService.js",
  ));
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(
    rows({ playerFrames: [1, 2] }),
    descriptor(),
  )).toThrow(/at least 95% of the range/);

  const legacySparse = JSON.parse(JSON.stringify(
    importer.createGroundTruthArtifactFromMotAnnotations(rows(), descriptor()),
  ));
  delete legacySparse.reviewEvidence.sceneCoverageRatio;
  const player = legacySparse.groundTruth.tracks.find((track) => track.entityType === "player");
  player.segments[0].points = player.segments[0].points.slice(0, 2);
  player.segments[0].endMs = player.segments[0].points.at(-1).atMs;
  player.endMs = player.segments[0].endMs;
  expect(groundTruth.validateGroundTruthArtifact(legacySparse)).toBe(legacySparse);
  expect(suites.groundTruthSuiteReadiness({
    id: "legacy-local-suite",
    revision: 1,
    benchmarkType: "multi-object",
    cases: [legacySparse],
  }).issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "invalid-case", message: expect.stringContaining("at least 95%") }),
  ]));
});

test("MOT import requires immutable local-use and dataset-rights evidence", async () => {
  const importer = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMotGroundTruthImportService.js",
  ));
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(rows(), descriptor({
    attested: false,
  }))).toThrow(/explicit frame-by-frame/);
  expect(() => importer.createGroundTruthArtifactFromMotAnnotations(rows(), descriptor({
    referenceEvidence: { ...descriptor().referenceEvidence, annotationUseReviewed: false },
  }))).toThrow(/rights and local-use evidence are incomplete/);

  const artifact = importer.createGroundTruthArtifactFromMotAnnotations(rows(), descriptor());
  const tampered = JSON.parse(JSON.stringify(artifact));
  tampered.sourceEvidence.reference.localBenchmarkOnly = false;
  expect(() => groundTruth.validateGroundTruthArtifact(tampered)).toThrow(/rights and local-use evidence/);
});

test("MOT import command exposes one bounded manifest-to-suite interface", async () => {
  const command = await import(moduleUrl("scripts/fs-player-tracking-mot-import.mjs"));
  expect(command.parseMotImportArguments([
    "--manifest", "import.json", "--output", "suite.json", "--json",
  ])).toEqual({ manifest: "import.json", output: "suite.json", audit: false, json: true, help: false });
  expect(command.parseMotImportArguments([
    "--manifest", "import.json", "--audit", "--json",
  ])).toEqual({ manifest: "import.json", output: "", audit: true, json: true, help: false });
  expect(command.motImportHelp()).toContain("tracking:mot:import");
  expect(() => command.parseMotImportArguments(["--manifest", "import.json"])).toThrow(
    /--output is required unless --audit/,
  );
  expect(() => command.parseMotImportArguments([
    "--manifest", "import.json", "--audit", "--output", "suite.json",
  ])).toThrow(/read-only/);
});

test("MOT import command writes and revalidates a complete ten-minute suite", async () => {
  const command = await import(moduleUrl("scripts/fs-player-tracking-mot-import.mjs"));
  const suites = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthSuiteService.js",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-mot-import-"));
  try {
    const scenarioGroups = [
      ["transition", "camera-motion"],
      ["crowded-box"],
      ["occlusion"],
      ["set-piece"],
      ["compact-unit"],
    ];
    const sequences = [];
    for (let index = 0; index < 5; index += 1) {
      const sourceFile = `source-${index + 1}.mp4`;
      const annotationFile = `gt-${index + 1}.txt`;
      const annotationRows = [];
      for (let frame = 1; frame <= 1200; frame += 5) {
        annotationRows.push(`${frame},1,101,101,100,200,1,-1,-1,-1`);
        annotationRows.push(`${frame},2,451,201,20,20,1,-1,-1,-1`);
        annotationRows.push(`${frame},3,701,101,80,180,1,-1,-1,-1`);
      }
      await fs.writeFile(path.join(directory, sourceFile), `exact-local-source-${index + 1}`);
      await fs.writeFile(path.join(directory, annotationFile), `${annotationRows.join("\n")}\n`);
      sequences.push({
        id: `SNMOT-${String(index + 1).padStart(3, "0")}`,
        sourceFile,
        annotationFile,
        angleId: "main-camera",
        frame: { width: 1000, height: 500 },
        frameRate: 10,
        sequenceLengthFrames: 1200,
        firstFrameNumber: 1,
        sourceStartMs: 0,
        coordinateOrigin: "one-based",
        maximumContinuousGapFrames: 5,
        scenarioTags: scenarioGroups[index],
        benchmarkTargetTrackId: "1",
        trackMap: descriptor().trackMap,
      });
    }
    const manifestPath = path.join(directory, "import.json");
    const outputPath = path.join(directory, "suite.json");
    await fs.writeFile(manifestPath, JSON.stringify({
      version: 1,
      protocol: "football-science-mot-ground-truth-import-manifest-v1",
      suite: { id: "soccernet-proof", revision: 1 },
      dataset: {
        name: "SoccerNet-Tracking",
        version: "2023",
        videoUseReviewed: true,
        annotationUseReviewed: true,
        localBenchmarkOnly: true,
      },
      review: {
        reviewedBy: "analyst-1",
        reviewedAt: "2026-08-31T12:00:00.000Z",
        attested: true,
        exhaustiveSceneAttested: true,
      },
      sequences,
    }));
    let stdout = "";
    let stderr = "";
    expect(await command.runMotGroundTruthImport([
      "--manifest", manifestPath,
      "--audit",
      "--json",
    ], {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    })).toBe(0);
    const audit = JSON.parse(stdout);
    expect(audit).toMatchObject({
      protocol: "football-science-mot-ground-truth-audit-v1",
      rightsReady: true,
      reviewReady: true,
      sequenceCount: 5,
      structurallyReadySequenceCount: 5,
      readyForImport: true,
    });
    expect(audit.annotationRowCount).toBe(3600);
    stdout = "";
    expect(await command.runMotGroundTruthImport([
      "--manifest", manifestPath,
      "--output", outputPath,
    ], {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    })).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("10.0 min");
    const artifact = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(suites.validateGroundTruthSuiteArtifact(artifact)).toBe(artifact);
    expect(artifact.summary).toMatchObject({
      benchmarkType: "multi-object",
      caseCount: 5,
      sourceCount: 5,
      uniqueDurationMs: 600_000,
    });
    expect(JSON.stringify(artifact)).not.toContain(directory);

    const { createTrackingGroundTruthController } = await import(moduleUrl(
      "src/modules/video-analysis/controllers/trackingGroundTruthController.js",
    ));
    const { renderTrackingBenchmarkSuitePanel } = await import(moduleUrl(
      "src/modules/video-analysis/components/TrackingBenchmarkSuitePanel.js",
    ));
    let state = {
      presentation: {
        tracking: {
          groundTruth: {
            byItemId: {},
            suite: {
              id: "real-match-pilot",
              revision: 1,
              status: "draft",
              benchmarkType: "selected-object",
              cases: [],
              downloadedAt: "",
              error: "",
            },
          },
          providerRuns: { byItemId: {}, downloadedAt: "", error: "" },
          benchmarkEvaluation: { status: "passed", report: { passed: true } },
        },
      },
    };
    let evidenceChanges = 0;
    const controller = createTrackingGroundTruthController({
      getState: () => state,
      updateState: (updater) => { state = updater(state); },
      onEvidenceChanged: () => { evidenceChanges += 1; },
    });
    const suiteJson = JSON.stringify(artifact);
    const field = {
      files: [{ size: new TextEncoder().encode(suiteJson).byteLength, text: async () => suiteJson }],
      value: "suite.json",
    };
    expect(controller.handleField("groundTruthSuiteImport", field)).toBe(true);
    await expect.poll(() => state.presentation.tracking.groundTruth.suite.cases.length).toBe(5);
    expect(state.presentation.tracking.groundTruth.suite).toMatchObject({
      id: "soccernet-proof",
      revision: 1,
      benchmarkType: "multi-object",
      error: "",
    });
    expect(state.presentation.tracking.benchmarkEvaluation.status).toBe("idle");
    expect(field.value).toBe("");
    expect(evidenceChanges).toBe(1);
    const panel = renderTrackingBenchmarkSuitePanel(state);
    expect(panel).toContain("Ready for provider benchmark");
    expect(panel).toContain('data-video-analysis-tracking-action="ground-truth-suite-import" disabled');

    expect(await command.runMotGroundTruthImport([
      "--manifest", manifestPath,
      "--output", outputPath,
    ], {
      stdout: { write: () => {} },
      stderr: { write: (value) => { stderr += value; } },
    })).toBe(2);
    expect(stderr).toContain("never overwritten");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("MOT annotation audit reports empty human work without writing or approving evidence", async () => {
  const command = await import(moduleUrl("scripts/fs-player-tracking-mot-import.mjs"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-mot-audit-empty-"));
  try {
    await fs.writeFile(path.join(directory, "source.mp4"), "exact-private-source");
    await fs.writeFile(path.join(directory, "annotations.txt"), "");
    const manifestPath = path.join(directory, "import.json");
    await fs.writeFile(manifestPath, JSON.stringify({
      version: 1,
      protocol: "football-science-mot-ground-truth-import-manifest-v1",
      suite: { id: "human-review-pending", revision: 1 },
      dataset: {
        name: "Local match",
        version: "review-1",
        videoUseReviewed: false,
        annotationUseReviewed: false,
        localBenchmarkOnly: true,
      },
      review: {
        reviewedBy: "",
        reviewedAt: "",
        attested: false,
        exhaustiveSceneAttested: false,
      },
      sequences: [{
        id: "case-1",
        sourceFile: "source.mp4",
        annotationFile: "annotations.txt",
        angleId: "main",
        frame: { width: 1920, height: 1080 },
        frameRate: 30,
        sequenceLengthFrames: 3600,
        firstFrameNumber: 1,
        sourceStartMs: 0,
        coordinateOrigin: "one-based",
        maximumContinuousGapFrames: 15,
        scenarioTags: ["transition"],
        benchmarkTargetTrackId: "",
        trackMap: {},
      }],
    }));
    let stdout = "";
    let stderr = "";
    expect(await command.runMotGroundTruthImport([
      "--manifest", manifestPath,
      "--audit",
      "--json",
    ], {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    })).toBe(3);
    expect(stderr).toBe("");
    const audit = JSON.parse(stdout);
    expect(audit).toMatchObject({
      rightsReady: false,
      reviewReady: false,
      structurallyReadySequenceCount: 0,
      annotationRowCount: 0,
      readyForImport: false,
      sequences: [{
        id: "case-1",
        structurallyReady: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: "annotations-empty" })]),
      }],
    });
    expect(await fs.readdir(directory)).toEqual(expect.not.arrayContaining(["suite.json"]));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
