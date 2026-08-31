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
    id: stage === "association" ? "bytetrack" : "osnet",
    version: "1.0.0",
    protocol: "football-science-tracking-stage-v1",
    stage,
    capabilities: stage === "association" ? ["associate:multi-object"] : ["reidentify:player"],
    manifestFingerprintSha256: (stage === "association" ? "b" : "c").repeat(64),
    executionFingerprintSha256: (stage === "association" ? "d" : "e").repeat(64),
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
    summary: { caseCount: 1, uniqueDurationMs: 120_000, scenarioIds: ["occlusion", "transition"], reviewStatus: "not-reviewed" },
    cases: [{
      id: "transition",
      startMs: 0,
      endMs: 120_000,
      durationMs: 120_000,
      scenarioTags: ["transition", "occlusion"],
      expectedFrames: 3600,
      clipFile: "clips/transition.mp4",
      annotationFile: "annotations/transition.txt",
      clip: { bytes: 900, sha256: sourceHash },
    }],
  };
}

function observation(id, atMs, frameIndex) {
  return {
    id,
    atMs,
    frameIndex,
    entityType: "player",
    box: { left: 0.1, top: 0.1, width: 0.1, height: 0.2 },
    confidence: 0.8,
  };
}

function sampleEvidence(overlap = false) {
  const observations = [
    observation("p-1", 0, 0),
    observation("p-2", 1000, 30),
    observation("p-3", overlap ? 500 : 2000, overlap ? 15 : 60),
    observation("p-4", 3000, 90),
  ];
  const associationTrajectories = [
    { id: "player-1", entityType: "player", observationIds: ["p-1", "p-2"], confidence: 0.8, discontinuitiesMs: [] },
    { id: "player-2", entityType: "player", observationIds: ["p-3", "p-4"], confidence: 0.75, discontinuitiesMs: [] },
  ];
  const trajectories = associationTrajectories.map((trajectory) => ({
    id: trajectory.id,
    entityType: trajectory.entityType,
    observations: trajectory.observationIds.map((id) => observations.find((entry) => entry.id === id)),
    confidence: trajectory.confidence,
    discontinuitiesMs: trajectory.discontinuitiesMs,
  }));
  const common = {
    schemaVersion: 1,
    protocol: "football-science-tracking-candidate-stage-run-v1",
    benchmarkOnly: true,
    source: { fingerprintSha256: sourceHash },
    range: { startMs: 0, endMs: 5000 },
  };
  return {
    association: {
      ...common,
      provider: provider("association"),
      request: { payload: { observations } },
      result: { artifactSha256: "2".repeat(64), payload: { payload: { trajectories: associationTrajectories } } },
    },
    reidentification: {
      ...common,
      provider: provider("reidentification"),
      request: { payload: { trajectories } },
      result: { artifactSha256: "3".repeat(64), payload: { payload: { identities: [
        { trajectoryId: "player-1", identityKey: "local-7", confidence: 0.9 },
        { trajectoryId: "player-2", identityKey: "local-7", confidence: 0.8 },
      ] } } },
      execution: {
        realTimeFactor: 0.15,
        wallTimeMs: 750,
        isolation: "darwin-sandbox-exec-network-denied-v1",
        runtimeMode: "native-osnet-coreml-arm64-v1",
      },
    },
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

function associationManifest(evidenceDescriptor) {
  return {
    protocol: "football-science-tracking-association-candidate-screening-v1",
    id: "real-match-screening-bytetrack-1.0.0",
    benchmarkOnly: true,
    screeningSha256: "4".repeat(64),
    pack: { id: "real-match-screening" },
    provider: provider("association"),
    cases: [{ id: "transition", evidence: evidenceDescriptor }],
  };
}

test("re-identification screening measures identity coverage without claiming approval", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening.mjs",
  ));
  const sample = sampleEvidence();
  const associationDescriptor = {
    file: "cases/transition.candidate-stage.json",
    bytes: 100,
    sha256: "5".repeat(64),
    artifactSha256: sample.association.result.artifactSha256,
  };
  const summary = service.summarizeTrackingCandidateReidentificationCase({
    packCase: pack().cases[0],
    associationEvidence: sample.association,
    associationDescriptor,
    reidentificationEvidence: sample.reidentification,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 120,
    evidenceSha256: "6".repeat(64),
  });
  const manifest = service.createTrackingCandidateReidentificationManifest(
    pack(),
    associationManifest(associationDescriptor),
    [{ provider: sample.reidentification.provider, summary }],
    { now: () => "2026-08-31T12:30:00.000Z" },
  );
  expect(manifest).toMatchObject({
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: "screening-pass-awaiting-ground-truth",
    policy: { realTimePassed: true, collisionFreePassed: true, outputProducedPassed: true },
    summary: {
      playerTrajectoryCount: 2,
      assignedPlayerTrajectoryCount: 2,
      assignmentCoverage: 1,
      identityClusterCount: 1,
      singletonIdentityClusterCount: 0,
      mergedTrajectoryCount: 1,
      overlapCollisionCount: 0,
    },
    reviewGate: {
      providerApprovalBlocked: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      nextStep: "reviewed-identity-ground-truth-and-trackeval",
    },
  });
  expect(manifest.screeningSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("re-identification screening fails simultaneous identity collisions", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening.mjs",
  ));
  const sample = sampleEvidence(true);
  const associationDescriptor = {
    file: "cases/transition.candidate-stage.json",
    bytes: 100,
    sha256: "7".repeat(64),
    artifactSha256: sample.association.result.artifactSha256,
  };
  const summary = service.summarizeTrackingCandidateReidentificationCase({
    packCase: pack().cases[0],
    associationEvidence: sample.association,
    associationDescriptor,
    reidentificationEvidence: sample.reidentification,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 120,
    evidenceSha256: "8".repeat(64),
  });
  const manifest = service.createTrackingCandidateReidentificationManifest(
    pack(),
    associationManifest(associationDescriptor),
    [{ provider: sample.reidentification.provider, summary }],
    { now: () => "2026-08-31T12:30:00.000Z" },
  );
  expect(manifest.status).toBe("failed-screening");
  expect(manifest.policy.collisionFreePassed).toBe(false);
  expect(manifest.summary.overlapCollisionCount).toBe(1);
});

test("re-identification screening rejects trajectory drift and requires the full upstream chain", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening.mjs",
  ));
  const sample = sampleEvidence();
  sample.reidentification.request.payload.trajectories[0].confidence = 0.1;
  expect(() => service.summarizeTrackingCandidateReidentificationCase({
    packCase: pack().cases[0],
    associationEvidence: sample.association,
    associationDescriptor: { file: "cases/transition.candidate-stage.json", bytes: 1, sha256: "9".repeat(64), artifactSha256: "a".repeat(64) },
    reidentificationEvidence: sample.reidentification,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 1,
    evidenceSha256: "b".repeat(64),
  })).toThrow(/does not reproduce/);
  const cli = await import(moduleUrl("scripts/fs-player-tracking-reidentification-candidate-screening.mjs"));
  expect(cli.parseTrackingReidentificationScreeningArguments([
    "--pack", "/tmp/pack.json",
    "--detection-screening", "/tmp/detection",
    "--association-screening", "/tmp/association",
    "--provider", "osnet@1.0.0",
    "--output", "/tmp/reidentification",
    "--json",
  ])).toMatchObject({
    json: true,
    providerId: "osnet",
    providerVersion: "1.0.0",
    associationScreeningDir: "/tmp/association",
  });
  expect(() => cli.parseTrackingReidentificationScreeningArguments(["--provider", "osnet@1.0.0"]))
    .toThrow(/required/);
});

test("re-identification verifier reproduces sealed evidence and rejects drift", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening.mjs",
  ));
  const verifier = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening-verifier.mjs",
  ));
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "fs-reidentification-verify-")));
  try {
    const detectionDir = path.join(tempDir, "detection");
    const associationDir = path.join(tempDir, "association");
    const reidentificationDir = path.join(tempDir, "reidentification");
    await fs.mkdir(detectionDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(associationDir, "cases"), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(reidentificationDir, "cases"), { recursive: true, mode: 0o700 });
    const sample = sampleEvidence();
    const associationBytes = Buffer.from(`${JSON.stringify(sample.association)}\n`);
    const reidentificationBytes = Buffer.from(`${JSON.stringify(sample.reidentification)}\n`);
    const associationDescriptor = descriptor(associationBytes, sample.association.result.artifactSha256);
    const reidentificationDescriptor = descriptor(reidentificationBytes, sample.reidentification.result.artifactSha256);
    const inputManifest = associationManifest(associationDescriptor);
    const summary = service.summarizeTrackingCandidateReidentificationCase({
      packCase: pack().cases[0],
      associationEvidence: sample.association,
      associationDescriptor,
      reidentificationEvidence: sample.reidentification,
      evidenceFile: reidentificationDescriptor.file,
      evidenceBytes: reidentificationDescriptor.bytes,
      evidenceSha256: reidentificationDescriptor.sha256,
    });
    const manifest = service.createTrackingCandidateReidentificationManifest(
      pack(),
      inputManifest,
      [{ provider: sample.reidentification.provider, summary }],
      { now: () => "2026-08-31T12:30:00.000Z" },
    );
    const packPath = path.join(tempDir, "pack.json");
    const associationPath = path.join(associationDir, associationDescriptor.file);
    const reidentificationPath = path.join(reidentificationDir, reidentificationDescriptor.file);
    await fs.writeFile(packPath, `${JSON.stringify(pack())}\n`, { mode: 0o600 });
    await fs.writeFile(associationPath, associationBytes, { mode: 0o400 });
    await fs.writeFile(reidentificationPath, reidentificationBytes, { mode: 0o400 });
    await fs.writeFile(path.join(associationDir, "screening.json"), `${JSON.stringify(inputManifest)}\n`, { mode: 0o400 });
    await fs.writeFile(path.join(reidentificationDir, "screening.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o400 });
    const dependencies = {
      verifyAssociation: async () => ({ ok: true }),
      registry: { resolve: async (id, version) => ({ provider: { providerId: id, providerVersion: version } }) },
      validateAssociationEvidence: (value) => value,
      validateReidentificationEvidence: (value) => value,
    };
    await expect(verifier.verifyTrackingCandidateReidentificationBundle({
      packPath,
      detectionScreeningDir: detectionDir,
      associationScreeningDir: associationDir,
      screeningDir: reidentificationDir,
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      status: "screening-pass-awaiting-ground-truth",
      caseCount: 1,
      screeningSha256: manifest.screeningSha256,
    });
    await fs.chmod(reidentificationPath, 0o600);
    await fs.appendFile(reidentificationPath, " ");
    await expect(verifier.verifyTrackingCandidateReidentificationBundle({
      packPath,
      detectionScreeningDir: detectionDir,
      associationScreeningDir: associationDir,
      screeningDir: reidentificationDir,
    }, dependencies)).rejects.toThrow(/not sealed read-only/);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
