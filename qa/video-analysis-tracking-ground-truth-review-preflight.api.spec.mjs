import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

const caseIds = [
  "attacking-third",
  "set-piece-box",
  "compact-midfield",
  "fast-transition",
  "late-open-play",
];

function pack() {
  return {
    version: 1,
    protocol: "football-science-tracking-annotation-pack-v1",
    id: "match-11-real-match-pilot-r1",
    extraction: { width: 1920, height: 1080, frameRate: 30 },
    summary: { caseCount: 5, uniqueDurationMs: 600000, reviewStatus: "not-reviewed" },
    cases: caseIds.map((id, index) => ({
      id,
      startMs: index * 120000,
      endMs: (index + 1) * 120000,
      expectedFrames: 3600,
      scenarioTags: index ? ["camera-motion"] : ["camera-motion", "occlusion"],
      clipFile: `clips/${id}.mp4`,
      annotationFile: `annotations/${id}.txt`,
      clip: { sha256: String(index + 1).repeat(64) },
    })),
  };
}

function reviewManifest(source = pack()) {
  return {
    version: 1,
    protocol: "football-science-mot-ground-truth-import-manifest-v1",
    suite: { id: "match-11-real-match-pilot", revision: 1 },
    dataset: {
      name: "Football Science local match",
      version: "match-11-review-1",
      videoUseReviewed: true,
      annotationUseReviewed: true,
      localBenchmarkOnly: true,
    },
    review: {
      reviewedBy: "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
      reviewedAt: "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
      attested: false,
      exhaustiveSceneAttested: false,
    },
    sequences: source.cases.map((entry) => ({
      id: entry.id,
      sourceFile: entry.clipFile,
      annotationFile: entry.annotationFile,
      sourceStartMs: entry.startMs,
      sequenceLengthFrames: entry.expectedFrames,
      frame: { width: 1920, height: 1080 },
      frameRate: 30,
      scenarioTags: entry.scenarioTags,
    })),
  };
}

function audit(source = pack(), ready = false) {
  return {
    sequenceCount: 5,
    rightsReady: true,
    reviewReady: ready,
    readyForImport: ready,
    issues: ready ? [] : [{
      code: "human-review-incomplete",
      message: "A named human reviewer and exhaustive review attestation are required.",
    }],
    sequences: source.cases.map((entry) => ({
      id: entry.id,
      sourceFingerprint: entry.clip.sha256,
      rowCount: ready ? 72000 : 0,
      trackCount: ready ? 24 : 0,
      annotatedFrameRatio: ready ? 1 : 0,
      sceneCoverageRatio: ready ? 1 : 0,
      entityCounts: ready
        ? { player: 20, ball: 1, referee: 3 }
        : { player: 0, ball: 0, referee: 0 },
      structurallyReady: ready,
      issues: ready ? [] : [{ code: "annotations-empty", message: "No reviewed MOT observations exist." }],
    })),
  };
}

function evaluator(ready = true) {
  return ready ? {
    ok: true,
    status: "ready",
    evaluator: "TrackEval",
    commit: "12c8791b303e0a0b50f753af204249e622d0281a",
    sourceSha256: "4".repeat(64),
    python: "3.12.13",
  } : {
    ok: false,
    status: "not-installed",
    evaluator: "TrackEval",
    python: "3.12 required",
  };
}

function dependencies(options = {}) {
  const packDocument = options.packDocument || pack();
  const reviewDocument = options.reviewDocument || reviewManifest(packDocument);
  return {
    verifyWorkspace: async () => ({
      ok: true,
      caseCount: 5,
      observationCount: 44333,
      workspaceSha256: "8".repeat(64),
    }),
    readJson: async (_file, label) => label.includes("annotation pack") ? packDocument : reviewDocument,
    auditManifest: async () => options.auditResult || audit(packDocument, false),
    preflightEvaluator: async () => options.evaluatorResult || evaluator(true),
  };
}

const request = {
  packPath: "/private/campaign/annotation-pack.json",
  detectionScreeningDir: "/private/campaign/detection",
  associationScreeningDir: "/private/campaign/association",
  workspaceDir: "/private/campaign/workspace",
  reviewManifestPath: "/private/campaign/mot-import.review.json",
};

test("campaign preflight distinguishes technical readiness from unfinished human ground truth", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-ground-truth-review-preflight.mjs",
  ));
  const report = await service.preflightTrackingGroundTruthReviewCampaign(request, dependencies());

  expect(report).toMatchObject({
    protocol: "football-science-ground-truth-review-preflight-v1",
    ok: true,
    status: "ready-for-human-review",
    campaign: {
      id: "match-11-real-match-pilot-r1",
      caseCount: 5,
      uniqueDurationMs: 600000,
      observationCount: 44333,
      workspaceSha256: "8".repeat(64),
    },
    review: {
      humanReviewReady: false,
      structurallyReadyCaseCount: 0,
      annotationRowCount: 0,
      readyForImport: false,
    },
    evaluator: { ready: true, status: "ready" },
  });
  expect(report.blockers.some((entry) => entry.code === "human-review-incomplete")).toBe(true);
  expect(report.review.cases.every((entry) => entry.status === "pending-human-review")).toBe(true);
  expect(JSON.stringify(report)).not.toContain("/private/campaign");
});

test("campaign preflight reaches measurement only after all five references pass audit", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-ground-truth-review-preflight.mjs",
  ));
  const source = pack();
  const report = await service.preflightTrackingGroundTruthReviewCampaign(request, dependencies({
    packDocument: source,
    auditResult: audit(source, true),
  }));

  expect(report).toMatchObject({
    ok: true,
    status: "ready-for-measurement",
    review: {
      humanReviewReady: true,
      structurallyReadyCaseCount: 5,
      annotationRowCount: 360000,
      readyForImport: true,
    },
  });
  expect(report.blockers).toEqual([]);
  expect(report.nextAction).toMatch(/run the independent benchmark/i);
});

test("campaign preflight fails closed on crossed source evidence and unavailable TrackEval", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-ground-truth-review-preflight.mjs",
  ));
  const source = pack();
  const crossed = audit(source, false);
  crossed.sequences[2].sourceFingerprint = "f".repeat(64);
  await expect(service.preflightTrackingGroundTruthReviewCampaign(request, dependencies({
    packDocument: source,
    auditResult: crossed,
  }))).rejects.toThrow(/crossed its sealed annotation-pack evidence/i);

  const blocked = await service.preflightTrackingGroundTruthReviewCampaign(request, dependencies({
    packDocument: source,
    evaluatorResult: evaluator(false),
  }));
  expect(blocked).toMatchObject({ ok: false, status: "blocked", evaluator: { ready: false } });
  expect(blocked.blockers[0]).toMatchObject({ code: "trackeval-unavailable" });

  const rightsAudit = audit(source, false);
  rightsAudit.rightsReady = false;
  rightsAudit.issues.unshift({
    code: "rights-attestation-incomplete",
    message: "Video, annotation and local-use rights are not fully attested.",
  });
  const rightsBlocked = await service.preflightTrackingGroundTruthReviewCampaign(request, dependencies({
    packDocument: source,
    auditResult: rightsAudit,
  }));
  expect(rightsBlocked).toMatchObject({ ok: false, status: "blocked", review: { rightsReady: false } });
});

test("campaign preflight CLI requires one explicit review campaign", async () => {
  const cli = await import(moduleUrl(
    "scripts/fs-player-tracking-ground-truth-review-preflight.mjs",
  ));
  expect(cli.parseTrackingGroundTruthReviewPreflightArguments([
    "--pack", "pack.json",
    "--detection-screening", "detection",
    "--association-screening", "association",
    "--workspace", "workspace",
    "--review-manifest", "review.json",
    "--json",
  ])).toEqual({
    json: true,
    packPath: "pack.json",
    detectionScreeningDir: "detection",
    associationScreeningDir: "association",
    workspaceDir: "workspace",
    reviewManifestPath: "review.json",
  });
  expect(() => cli.parseTrackingGroundTruthReviewPreflightArguments([
    "--pack", "pack.json",
  ])).toThrow(/required/i);
  expect(() => cli.parseTrackingGroundTruthReviewPreflightArguments([
    "--unknown",
  ])).toThrow(/unknown/i);
});
