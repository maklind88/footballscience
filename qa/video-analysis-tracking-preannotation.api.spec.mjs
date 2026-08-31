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

function observation(id, frameIndex, entityType, left) {
  return {
    id,
    atMs: frameIndex * (1000 / 30),
    frameIndex,
    entityType,
    box: { left, top: 0.2, width: entityType === "ball" ? 0.02 : 0.1, height: entityType === "ball" ? 0.04 : 0.3 },
    confidence: entityType === "referee" ? 0.45 : 0.9,
  };
}

function fixtures() {
  const observations = [
    observation("player-1", 0, "player", 0.1),
    observation("ball-1", 30, "ball", 0.5),
    observation("referee-1", 59, "referee", 0.7),
  ];
  const sourceSha256 = "a".repeat(64);
  const evidence = (stage, payload) => ({
    protocol: "football-science-tracking-candidate-stage-run-v1",
    benchmarkOnly: true,
    provider: { stage },
    source: { fingerprintSha256: sourceSha256 },
    range: { startMs: 0, endMs: 2000 },
    request: { payload: stage === "association" ? { observations } : {} },
    result: {
      artifactSha256: stage === "detection" ? "d".repeat(64) : "e".repeat(64),
      payload: { stage, payload },
    },
  });
  const packCase = {
    id: "transition",
    durationMs: 2000,
    expectedFrames: 60,
    clip: { sha256: sourceSha256 },
  };
  const pack = {
    id: "real-match-pack",
    source: { sha256: "f".repeat(64) },
    extraction: { width: 100, height: 50 },
    summary: { caseCount: 1, uniqueDurationMs: 2000, reviewStatus: "not-reviewed" },
    cases: [packCase],
  };
  const associationManifest = {
    input: { screeningSha256: "b".repeat(64) },
    screeningSha256: "c".repeat(64),
  };
  const loaded = {
    pack,
    detectionManifest: { screeningSha256: "b".repeat(64) },
    associationManifest,
    cases: [{
      packCase,
      detectionEvidence: evidence("detection", { observations }),
      associationEvidence: evidence("association", { trajectories: [
        { id: "player-track", entityType: "player", observationIds: ["player-1"] },
        { id: "ball-track", entityType: "ball", observationIds: ["ball-1"] },
      ] }),
    }],
  };
  return loaded;
}

function descriptor(file, bytes) {
  return {
    file,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

test("preannotation preserves associated and unassociated suggestions without claiming ground truth", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace.mjs",
  ));
  const loaded = fixtures();
  const prepared = service.createTrackingCandidatePreannotationCase({
    ...loaded.cases[0],
    extraction: loaded.pack.extraction,
  });

  expect(prepared.summary).toMatchObject({
    observationCount: 3,
    trackCount: 3,
    associatedTrackCount: 2,
    unassociatedObservationCount: 1,
    sampledFrames: 3,
    entityObservationCounts: { player: 1, ball: 1, referee: 1 },
  });
  expect(prepared.trackMap).toMatchObject({
    benchmarkOnly: true,
    suggestionOnly: true,
    approvalReady: false,
  });
  expect(prepared.trackMap.tracks[2]).toMatchObject({
    entityType: "referee",
    associationStatus: "unassociated",
    reviewState: "unreviewed",
  });
  expect(prepared.motText.trim().split("\n")).toEqual([
    "1,1,10,10,10,15,0.9,-1,-1,-1",
    "31,2,50,10,2,2,0.9,-1,-1,-1",
    "60,3,70,10,10,15,0.45,-1,-1,-1",
  ]);

  const suggestionBytes = Buffer.from(prepared.motText);
  const trackMapBytes = Buffer.from(`${JSON.stringify(prepared.trackMap, null, 2)}\n`);
  const workspace = service.createTrackingCandidatePreannotationWorkspace(
    loaded.pack,
    loaded.associationManifest,
    [{
      id: prepared.id,
      suggestion: descriptor("cases/transition.suggestions.mot.txt", suggestionBytes),
      trackMap: descriptor("cases/transition.track-map.json", trackMapBytes),
      summary: prepared.summary,
    }],
    { now: () => "2026-08-31T12:00:00.000Z" },
  );
  expect(workspace).toMatchObject({
    suggestionOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    reviewGate: {
      originalAnnotationMutationAllowed: false,
      suggestionPromotionAllowed: false,
      exhaustiveHumanReviewRequired: true,
    },
  });
  expect(workspace.workspaceSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("preannotation refuses partial candidate ranges before generating suggestions", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace.mjs",
  ));
  const loaded = fixtures();
  loaded.cases[0].detectionEvidence.range.endMs = 1000;
  expect(() => service.createTrackingCandidatePreannotationCase({
    ...loaded.cases[0],
    extraction: loaded.pack.extraction,
  })).toThrow(/complete full-range/i);
  try {
    service.createTrackingCandidatePreannotationCase({
      ...loaded.cases[0],
      extraction: loaded.pack.extraction,
    });
  } catch (error) {
    expect(error.code).toBe("TRACKING_CANDIDATE_PREANNOTATION_PARTIAL");
  }
});

test("preannotation CLI writes a separate immutable workspace and verifier reproduces every byte", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-preannotation-workspace.mjs"));
  const verifier = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace-verifier.mjs",
  ));
  const fixture = fixtures();
  const loaded = {
    pack: fixture.pack,
    detectionManifest: fixture.detectionManifest,
    cases: fixture.cases.map(({ associationEvidence, ...entry }) => entry),
  };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-preannotation-"));
  const outputDir = path.join(await fs.realpath(tempDir), "workspace");
  try {
    const result = await cli.runTrackingCandidatePreannotation({
      packPath: "/private/pack.json",
      detectionScreeningDir: "/private/detection",
      outputDir,
    }, {
      loadBundle: async () => loaded,
      now: () => "2026-08-31T12:00:00.000Z",
    });
    expect(result.workspace).toMatchObject({
      suggestionOnly: true,
      approvalReady: false,
      input: { associationScreeningSha256: "", associationEvaluated: false },
      reviewGate: { associationReviewRequired: true },
      summary: { associationEvaluated: false, unassociatedObservationCount: 3 },
    });
    expect(await fs.stat(path.join(outputDir, "workspace.json"))).toMatchObject({ mode: expect.any(Number) });

    const verified = await verifier.verifyTrackingCandidatePreannotationWorkspace({
      packPath: "/private/pack.json",
      detectionScreeningDir: "/private/detection",
      workspaceDir: outputDir,
    }, { loadBundle: async () => loaded });
    expect(verified).toMatchObject({ ok: true, caseCount: 1, observationCount: 3 });

    const suggestionPath = path.join(outputDir, "cases/transition.suggestions.mot.txt");
    await fs.chmod(suggestionPath, 0o600);
    await fs.appendFile(suggestionPath, "1,99,0,0,1,1,1,-1,-1,-1\n");
    await expect(verifier.verifyTrackingCandidatePreannotationWorkspace({
      packPath: "/private/pack.json",
      detectionScreeningDir: "/private/detection",
      workspaceDir: outputDir,
    }, { loadBundle: async () => loaded })).rejects.toThrow(/not sealed read-only/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("preannotation CLIs require explicit complete input paths", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-preannotation-workspace.mjs"));
  const verifyCli = await import(moduleUrl("scripts/fs-player-tracking-preannotation-workspace-verify.mjs"));
  expect(() => cli.parseTrackingCandidatePreannotationArguments([
    "--pack", "/pack.json",
  ])).toThrow(/required/i);
  expect(() => verifyCli.parseTrackingCandidatePreannotationVerificationArguments([
    "--workspace", "/workspace",
  ])).toThrow(/required/i);
});
