import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceHash = "a".repeat(64);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function provider(stage) {
  return {
    id: stage === "detection" ? "detector" : "bytetrack",
    version: "1.0.0",
    protocol: "football-science-tracking-stage-v1",
    stage,
    capabilities: stage === "detection" ? ["detect:ball", "detect:player"] : ["associate:multi-object"],
    manifestFingerprintSha256: (stage === "detection" ? "b" : "c").repeat(64),
    executionFingerprintSha256: (stage === "detection" ? "d" : "e").repeat(64),
  };
}

function pack() {
  return {
    version: 1,
    protocol: "football-science-tracking-annotation-pack-v1",
    id: "real-match-screening",
    createdAt: "2026-08-31T12:00:00.000Z",
    source: { bytes: 1000, sha256: "f".repeat(64) },
    extraction: { ffmpegSha256: "1".repeat(64), width: 1920, height: 1080, frameRate: 30, crf: 18 },
    summary: { caseCount: 1, uniqueDurationMs: 120_000, scenarioIds: ["transition"], reviewStatus: "not-reviewed" },
    cases: [{
      id: "transition",
      startMs: 0,
      endMs: 120_000,
      durationMs: 120_000,
      scenarioTags: ["transition"],
      expectedFrames: 3600,
      clipFile: "clips/transition.mp4",
      annotationFile: "annotations/transition.txt",
      clip: { bytes: 900, sha256: sourceHash },
    }],
  };
}

function observations() {
  return [
    { id: "p-1", entityType: "player" },
    { id: "p-2", entityType: "player" },
    { id: "b-1", entityType: "ball" },
  ];
}

function evidence() {
  const detected = observations();
  const common = {
    schemaVersion: 1,
    protocol: "football-science-tracking-candidate-stage-run-v1",
    benchmarkOnly: true,
    source: { fingerprintSha256: sourceHash },
    range: { startMs: 0, endMs: 5000 },
  };
  return {
    detection: {
      ...common,
      provider: provider("detection"),
      result: { artifactSha256: "2".repeat(64), payload: { payload: { observations: detected } } },
    },
    association: {
      ...common,
      provider: provider("association"),
      request: { payload: { observations: detected } },
      result: {
        artifactSha256: "3".repeat(64),
        payload: { payload: { trajectories: [
          {
            id: "player-1",
            entityType: "player",
            observationIds: ["p-1", "p-2"],
            confidence: 0.8,
            discontinuitiesMs: [],
          },
          {
            id: "ball-1",
            entityType: "ball",
            observationIds: ["b-1"],
            confidence: 0.7,
            discontinuitiesMs: [3000],
          },
        ] } },
      },
      execution: {
        realTimeFactor: 0.02,
        wallTimeMs: 100,
        isolation: "darwin-sandbox-exec-network-denied-v1",
        runtimeMode: "native-bytetrack-cpp-eigen-3.4.0-arm64-v1",
      },
    },
  };
}

function detectionManifest(descriptor) {
  return {
    protocol: "football-science-tracking-candidate-screening-v1",
    id: "real-match-screening-detector-1.0.0",
    benchmarkOnly: true,
    screeningSha256: "4".repeat(64),
    pack: { id: "real-match-screening" },
    provider: provider("detection"),
    cases: [{ id: "transition", evidence: descriptor }],
  };
}

function descriptor(bytes, artifactSha256) {
  return {
    file: "cases/transition.candidate-stage.json",
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    artifactSha256,
  };
}

test("association screening proves complete lineage but never claims identity approval", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-association-screening.mjs",
  ));
  const sample = evidence();
  const detectionDescriptor = {
    file: "cases/transition.candidate-stage.json",
    bytes: 100,
    sha256: "5".repeat(64),
    artifactSha256: sample.detection.result.artifactSha256,
  };
  const summary = service.summarizeTrackingCandidateAssociationCase({
    packCase: pack().cases[0],
    detectionEvidence: sample.detection,
    detectionDescriptor,
    associationEvidence: sample.association,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 120,
    evidenceSha256: "6".repeat(64),
  });
  const manifest = service.createTrackingCandidateAssociationManifest(
    pack(),
    detectionManifest(detectionDescriptor),
    [{ provider: sample.association.provider, summary }],
    { now: () => "2026-08-31T12:30:00.000Z" },
  );
  expect(manifest).toMatchObject({
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: "screening-pass-awaiting-ground-truth",
    policy: { realTimePassed: true, completeLineagePassed: true },
    summary: {
      inputObservationCount: 3,
      assignedObservationCount: 3,
      assignmentCoverage: 1,
      trajectoryCount: 2,
      singletonTrajectoryCount: 1,
      discontinuityCount: 1,
    },
    reviewGate: {
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      nextStep: "independent-identity-ground-truth-review",
    },
  });
  expect(manifest.screeningSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("association screening rejects drift and cross-entity lineage", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-association-screening.mjs",
  ));
  const changed = evidence();
  changed.association.request.payload.observations = [{ id: "other", entityType: "player" }];
  expect(() => service.summarizeTrackingCandidateAssociationCase({
    packCase: pack().cases[0],
    detectionEvidence: changed.detection,
    detectionDescriptor: { file: "cases/transition.candidate-stage.json", bytes: 1, sha256: "7".repeat(64), artifactSha256: "8".repeat(64) },
    associationEvidence: changed.association,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 1,
    evidenceSha256: "9".repeat(64),
  })).toThrow(/does not reproduce/);
});

test("association screening CLI requires an explicit verified detection input", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-association-candidate-screening.mjs"));
  expect(cli.parseTrackingAssociationScreeningArguments([
    "--pack", "/tmp/annotation-pack.json",
    "--detection-screening", "/tmp/detection",
    "--provider", "bytetrack@1.0.0",
    "--output", "/tmp/association",
    "--json",
  ])).toEqual({
    json: true,
    outputDir: "/tmp/association",
    packPath: "/tmp/annotation-pack.json",
    detectionScreeningDir: "/tmp/detection",
    providerId: "bytetrack",
    providerVersion: "1.0.0",
  });
  expect(() => cli.parseTrackingAssociationScreeningArguments(["--provider", "bytetrack@1.0.0"]))
    .toThrow(/required/);
});

test("association verifier reproduces the manifest and rejects evidence drift", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-association-screening.mjs",
  ));
  const verifier = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-association-screening-verifier.mjs",
  ));
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "fs-association-verify-")));
  try {
    const detectionDir = path.join(tempDir, "detection");
    const associationDir = path.join(tempDir, "association");
    await fs.mkdir(path.join(detectionDir, "cases"), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(associationDir, "cases"), { recursive: true, mode: 0o700 });
    const sample = evidence();
    const detectionBytes = Buffer.from(`${JSON.stringify(sample.detection)}\n`);
    const associationBytes = Buffer.from(`${JSON.stringify(sample.association)}\n`);
    const detectionDescriptor = descriptor(detectionBytes, sample.detection.result.artifactSha256);
    const associationDescriptor = descriptor(associationBytes, sample.association.result.artifactSha256);
    const inputManifest = detectionManifest(detectionDescriptor);
    const summary = service.summarizeTrackingCandidateAssociationCase({
      packCase: pack().cases[0],
      detectionEvidence: sample.detection,
      detectionDescriptor,
      associationEvidence: sample.association,
      evidenceFile: associationDescriptor.file,
      evidenceBytes: associationDescriptor.bytes,
      evidenceSha256: associationDescriptor.sha256,
    });
    const manifest = service.createTrackingCandidateAssociationManifest(
      pack(),
      inputManifest,
      [{ provider: sample.association.provider, summary }],
      { now: () => "2026-08-31T12:30:00.000Z" },
    );
    const packPath = path.join(tempDir, "annotation-pack.json");
    const detectionEvidencePath = path.join(detectionDir, detectionDescriptor.file);
    const associationEvidencePath = path.join(associationDir, associationDescriptor.file);
    await fs.writeFile(packPath, `${JSON.stringify(pack())}\n`, { mode: 0o600 });
    await fs.writeFile(detectionEvidencePath, detectionBytes, { mode: 0o400 });
    await fs.writeFile(associationEvidencePath, associationBytes, { mode: 0o400 });
    await fs.writeFile(path.join(detectionDir, "screening.json"), `${JSON.stringify(inputManifest)}\n`, { mode: 0o400 });
    await fs.writeFile(path.join(associationDir, "screening.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o400 });
    const dependencies = {
      verifyDetection: async () => ({ ok: true }),
      registry: {
        resolve: async (id, version) => ({ provider: { providerId: id, providerVersion: version } }),
      },
      validateDetectionEvidence: (value) => value,
      validateAssociationEvidence: (value) => value,
    };
    await expect(verifier.verifyTrackingCandidateAssociationBundle({
      packPath,
      detectionScreeningDir: detectionDir,
      screeningDir: associationDir,
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      status: "screening-pass-awaiting-ground-truth",
      caseCount: 1,
      screeningSha256: manifest.screeningSha256,
    });
    await fs.chmod(associationEvidencePath, 0o600);
    await fs.appendFile(associationEvidencePath, " ");
    await expect(verifier.verifyTrackingCandidateAssociationBundle({
      packPath,
      detectionScreeningDir: detectionDir,
      screeningDir: associationDir,
    }, dependencies)).rejects.toThrow(/not sealed read-only/);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
