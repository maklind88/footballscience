import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function descriptor(file, value) {
  return {
    file,
    bytes: value.byteLength,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

async function fixture() {
  const generator = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace.mjs",
  ));
  const sourceSha256 = "a".repeat(64);
  const observations = [
    {
      id: "player-1-a", atMs: 0, frameIndex: 0, entityType: "player",
      box: { left: 0.1, top: 0.2, width: 0.1, height: 0.3 }, confidence: 0.9,
    },
    {
      id: "player-1-b", atMs: 1000, frameIndex: 30, entityType: "player",
      box: { left: 0.2, top: 0.2, width: 0.1, height: 0.3 }, confidence: 0.8,
    },
    {
      id: "ball-1", atMs: 1000, frameIndex: 30, entityType: "ball",
      box: { left: 0.5, top: 0.4, width: 0.02, height: 0.04 }, confidence: 0.4,
    },
  ];
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
    startMs: 10000,
    endMs: 12000,
    durationMs: 2000,
    expectedFrames: 60,
    clipFile: "clips/transition.mp4",
    annotationFile: "annotations/transition.txt",
    clip: { bytes: 1000, sha256: sourceSha256 },
  };
  const pack = {
    version: 1,
    protocol: "football-science-tracking-annotation-pack-v1",
    id: "real-match-pack",
    createdAt: "2026-08-31T12:00:00.000Z",
    source: { bytes: 10000, sha256: "f".repeat(64) },
    extraction: { ffmpegSha256: "b".repeat(64), width: 100, height: 50, frameRate: 30, crf: 18 },
    summary: {
      caseCount: 1,
      uniqueDurationMs: 2000,
      scenarioIds: ["transition"],
      reviewStatus: "not-reviewed",
    },
    cases: [packCase],
  };
  const prepared = generator.createTrackingCandidatePreannotationCase({
    packCase,
    extraction: pack.extraction,
    detectionEvidence: evidence("detection", { observations }),
    associationEvidence: evidence("association", { trajectories: [{
      id: "player-track",
      entityType: "player",
      observationIds: ["player-1-a", "player-1-b"],
      confidence: 0.85,
      discontinuitiesMs: [],
    }] }),
  });
  const suggestionBytes = Buffer.from(prepared.motText);
  const trackMapBytes = Buffer.from(`${JSON.stringify(prepared.trackMap, null, 2)}\n`);
  const workspace = generator.createTrackingCandidatePreannotationWorkspace(
    pack,
    {
      benchmarkOnly: true,
      approvalReady: false,
      groundTruthEvaluated: false,
      input: { screeningSha256: "1".repeat(64) },
      screeningSha256: "2".repeat(64),
      reviewGate: { suggestionLayerAllowed: true },
    },
    [{
      id: packCase.id,
      suggestion: descriptor("cases/transition.suggestions.mot.txt", suggestionBytes),
      trackMap: descriptor("cases/transition.track-map.json", trackMapBytes),
      summary: prepared.summary,
    }],
    { now: () => "2026-08-31T12:00:00.000Z" },
  );
  return {
    pack,
    workspace,
    packBytes: Buffer.from(`${JSON.stringify(pack, null, 2)}\n`),
    workspaceBytes: Buffer.from(`${JSON.stringify(workspace, null, 2)}\n`),
    trackMapBytes,
    suggestionBytes,
    sourceSha256,
  };
}

async function resealTrackMap(value, mutate) {
  const generator = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace.mjs",
  ));
  const trackMap = JSON.parse(value.trackMapBytes.toString("utf8"));
  mutate(trackMap);
  const trackMapBytes = Buffer.from(`${JSON.stringify(trackMap, null, 2)}\n`);
  const payload = {
    ...value.workspace,
    cases: value.workspace.cases.map((entry) => entry.id === "transition" ? {
      ...entry,
      trackMap: descriptor("cases/transition.track-map.json", trackMapBytes),
    } : entry),
  };
  delete payload.workspaceSha256;
  const workspace = {
    ...payload,
    workspaceSha256: generator._private.hashValue(payload),
  };
  return {
    ...value,
    trackMapBytes,
    workspace,
    workspaceBytes: Buffer.from(`${JSON.stringify(workspace, null, 2)}\n`),
  };
}

test("preannotation review import materializes associated tracks and keeps raw detections queued", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationReviewService.js",
  ));
  const value = await fixture();
  const result = await service.importTrackingPreannotationReviewCase({
    ...value,
    caseId: "transition",
    itemId: "presentation-item-1",
    clipId: "clip-1",
    angleId: "primary",
  });

  expect(result).toMatchObject({
    suggestionOnly: true,
    approvalReady: false,
    sourceSha256: value.sourceSha256,
    caseId: "transition",
    campaign: {
      workspaceSha256: value.workspace.workspaceSha256,
      packId: "real-match-pack",
      caseCount: 1,
      totalSuggestionCount: 2,
      cases: [{
        caseId: "transition",
        totalSuggestionCount: 2,
        associatedTrackCount: 1,
        unassociatedObservationCount: 1,
      }],
    },
    summary: {
      associatedTrackCount: 1,
      unassociatedObservationCount: 1,
      observationCount: 3,
    },
  });
  expect(result.tracks).toHaveLength(1);
  expect(result.tracks[0]).toMatchObject({
    clipId: "clip-1",
    entityType: "player",
    status: "review",
    identityConfidence: 0,
    metadata: {
      clientGeneratedTrackId: true,
      preannotationAssociationStatus: "associated",
      preannotationPresentationItemId: "presentation-item-1",
      localSourceSha256: value.sourceSha256,
      angleId: "primary",
    },
  });
  expect(result.tracks[0].segments[0].points).toHaveLength(2);
  expect(result.queue).toHaveLength(1);
  expect(result.queue[0]).toMatchObject({ entityType: "ball", atMs: 1000, confidence: 0.4 });
  expect(service.materializeTrackingPreannotationQueueEntry(result.queue[0])).toMatchObject({
    entityType: "ball",
    status: "review",
  });
});

test("preannotation review import rejects source mismatch and changed suggestion bytes", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationReviewService.js",
  ));
  const value = await fixture();
  const request = {
    ...value,
    caseId: "transition",
    itemId: "presentation-item-1",
    clipId: "clip-1",
    angleId: "primary",
  };
  await expect(service.importTrackingPreannotationReviewCase({
    ...request,
    sourceSha256: "9".repeat(64),
  })).rejects.toMatchObject({ code: "TRACKING_PREANNOTATION_REVIEW_SOURCE_MISMATCH" });
  await expect(service.importTrackingPreannotationReviewCase({
    ...request,
    suggestionBytes: Buffer.concat([value.suggestionBytes, Buffer.from("1,99,0,0,1,1,1,-1,-1,-1\n")]),
  })).rejects.toMatchObject({ code: "TRACKING_PREANNOTATION_REVIEW_TAMPERED" });
});

test("preannotation review import rejects false association state and ambiguous lineage", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationReviewService.js",
  ));
  const value = await fixture();
  const request = {
    caseId: "transition",
    itemId: "presentation-item-1",
    clipId: "clip-1",
    angleId: "primary",
  };
  const falseAssociation = await resealTrackMap(value, (trackMap) => {
    trackMap.associationEvaluated = false;
  });
  await expect(service.importTrackingPreannotationReviewCase({
    ...falseAssociation,
    ...request,
  })).rejects.toThrow("Invalid preannotation track map");

  const duplicateSuggestion = await resealTrackMap(value, (trackMap) => {
    trackMap.tracks[1].suggestionId = trackMap.tracks[0].suggestionId;
  });
  await expect(service.importTrackingPreannotationReviewCase({
    ...duplicateSuggestion,
    ...request,
  })).rejects.toThrow("track-map ids are invalid");

  const missingLineage = await resealTrackMap(value, (trackMap) => {
    trackMap.tracks[0].sourceTrajectoryId = "";
  });
  await expect(service.importTrackingPreannotationReviewCase({
    ...missingLineage,
    ...request,
  })).rejects.toThrow("Invalid preannotation source trajectory id");
});
