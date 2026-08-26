import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFingerprint = "a".repeat(64);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function objectTrack(id, entityType, options = {}) {
  const x = Number(options.x) || 0.2;
  const player = entityType === "player";
  return {
    id,
    entityType,
    playerId: player ? options.playerId || `player-${id}` : "",
    playerLabel: player ? options.playerLabel || `Player ${id}` : entityType === "ball" ? "Ball" : "Referee",
    teamSide: player ? options.teamSide || "home" : "",
    status: "verified",
    startMs: 0,
    endMs: 1000,
    confidence: 0.98,
    identityConfidence: 0.98,
    engine: "test-provider",
    segments: [{
      id: `${id}-segment`,
      startMs: 0,
      endMs: 1000,
      confidence: 0.98,
      points: [
        { atMs: 0, x, y: 0.5, width: 0.08, height: 0.16, groundX: x, groundY: 0.58, confidence: 0.98, identityConfidence: 0.98 },
        { atMs: 500, x: x + 0.025, y: 0.5, width: 0.08, height: 0.16, groundX: x + 0.025, groundY: 0.58, confidence: 0.98, identityConfidence: 0.98 },
        { atMs: 1000, x: x + 0.05, y: 0.5, width: 0.08, height: 0.16, groundX: x + 0.05, groundY: 0.58, confidence: 0.98, identityConfidence: 0.98 },
      ],
    }],
    corrections: [{ startMs: 500, endMs: 500, correctionType: "position", correctedBy: "private-user" }],
    metadata: { localPath: "/private/match.mp4", model: "private-model" },
  };
}

function reviewedInput(overrides = {}) {
  const tracks = overrides.tracks || [
    objectTrack("p1", "player", { x: 0.1 }),
    objectTrack("ball", "ball", { x: 0.45 }),
    objectTrack("ref", "referee", { x: 0.75 }),
  ];
  return {
    sourceFingerprint,
    angleId: "angle-1",
    frame: { width: 1920, height: 1080 },
    range: { startMs: 0, endMs: 1000 },
    tracks,
    selectedTrackIds: tracks.map((track) => track.id),
    reviewedBy: "analyst-1",
    attested: true,
    ...overrides,
  };
}

test("ball and referee prompts remain first-class objects without false player identity gates", async () => {
  const review = await import(moduleUrl("src/modules/video-analysis/services/trackingReviewService.js"));
  const ball = review.createManualPromptTrack({
    id: "ball-track",
    entityType: "ball",
    playerId: "must-be-cleared",
    startMs: 0,
    endMs: 1000,
    box: { left: 0.3, top: 0.4, width: 0.04, height: 0.04 },
  });
  expect(ball).toMatchObject({ entityType: "ball", playerId: "", playerLabel: "Ball", identityConfidence: 1 });
  expect(review.trackingReviewSummary(ball).issues).toEqual(["Add at least two tracking points"]);
  const corrected = review.applyManualTrackingCorrection(ball, {
    atMs: 1000,
    box: { left: 0.4, top: 0.42, width: 0.04, height: 0.04 },
  });
  expect(review.verifyObjectTrack(corrected)).toMatchObject({ entityType: "ball", status: "verified" });

  const refereePrompt = review.trackingPrompt({ entityType: "referee", playerId: "player-9" });
  expect(refereePrompt).toMatchObject({ entityType: "referee", playerId: "", playerLabel: "Referee" });
  expect(review.trackingMetadataPayload({
    ...corrected,
    metadata: { localSourceSha256: sourceFingerprint, model: "approved-local" },
  })).toMatchObject({ metadata: { model: "approved-local", pointsStoredLocally: true } });
  expect(review.trackingMetadataPayload({
    ...corrected,
    metadata: { localSourceSha256: sourceFingerprint },
  }).metadata).not.toHaveProperty("localSourceSha256");
});

test("unlisted opponent identity and shirt number survive manual review", async () => {
  const review = await import(moduleUrl("src/modules/video-analysis/services/trackingReviewService.js"));
  const first = review.createManualPromptTrack({
    id: "opponent-9",
    entityType: "player",
    playerLabel: "Opponent 9",
    teamSide: "away",
    shirtNumber: "9",
    startMs: 0,
    endMs: 1000,
    box: { left: 0.3, top: 0.4, width: 0.08, height: 0.18 },
  });
  expect(first).toMatchObject({
    entityType: "player",
    playerId: "",
    playerLabel: "Opponent 9",
    teamSide: "away",
    shirtNumber: "9",
    identityConfidence: 1,
  });
  const corrected = review.applyManualTrackingCorrection(first, {
    atMs: 1000,
    box: { left: 0.4, top: 0.42, width: 0.08, height: 0.18 },
  });
  const verified = review.verifyObjectTrack(corrected);
  expect(review.trackingMetadataPayload(verified)).toMatchObject({
    playerId: "",
    playerLabel: "Opponent 9",
    teamSide: "away",
    shirtNumber: "9",
    status: "verified",
  });
});

test("tracking controls create the selected object class end to end", async () => {
  const { createTrackingController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingController.js",
  ));
  const { renderTrackingSidebar } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingTelestration.js",
  ));
  const item = {
    id: "item-1",
    clipId: "clip-1",
    startMs: 0,
    endMs: 1000,
    objectTracks: [],
    dynamicGraphics: [],
  };
  let state = {
    players: [{ id: "p1", name: "Player One" }],
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        selectedTrackIds: [],
        prompt: {
          entityType: "player",
          playerId: "p1",
          playerLabel: "Player One",
          startMs: 0,
          endMs: 1000,
          promptAtMs: 0,
          box: { left: 0.3, top: 0.4, width: 0.04, height: 0.04 },
        },
      },
    },
  };
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
  });
  const field = {
    nodeType: 1,
    value: "ball",
    dataset: { videoAnalysisTrackingField: "entityType" },
    closest(selector) { return selector === "[data-video-analysis-tracking-field]" ? this : null; },
  };
  expect(controller.handleChange({ target: field })).toBe(true);
  expect(state.presentation.tracking.prompt).toMatchObject({
    entityType: "ball",
    playerId: "",
    playerLabel: "Ball",
  });
  expect(renderTrackingSidebar(state, item)).not.toContain('data-video-analysis-tracking-field="playerId"');

  const action = {
    nodeType: 1,
    dataset: { videoAnalysisTrackingAction: "manual" },
    closest(selector) { return selector === "[data-video-analysis-tracking-action]" ? this : null; },
  };
  expect(controller.handleClick({ target: action })).toBe(true);
  await expect.poll(() => (
    state.presentation.current.sections[0].items[0].objectTracks[0]?.entityType
  )).toBe("ball");
});

test("tracking provider output honors the requested object class", async () => {
  const { validateTrackingArtifact } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-artifact-validator.mjs",
  ));
  const result = validateTrackingArtifact({
    entityType: "player",
    segments: [{ points: [
      { atMs: 0, x: 0.5, y: 0.5, width: 0.04, height: 0.04, confidence: 0.9 },
      { atMs: 1000, x: 0.55, y: 0.5, width: 0.04, height: 0.04, confidence: 0.9 },
    ] }],
  }, {
    entityType: "ball",
    startMs: 0,
    endMs: 1000,
    playerId: "must-not-survive",
  });
  expect(result.artifact).toMatchObject({ entityType: "ball", status: "review" });
});

test("ground-truth readiness fails closed until exact source, entities, verification and attestation exist", async () => {
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const incomplete = groundTruth.groundTruthReadiness({
    ...reviewedInput({ sourceFingerprint: "", attested: false }),
    tracks: [objectTrack("p1", "player")],
    selectedTrackIds: ["p1"],
  });
  expect(incomplete.ready).toBe(false);
  expect(incomplete.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
    "source-fingerprint-missing",
    "ball-missing",
    "referee-missing",
    "attestation-missing",
  ]));

  const unverified = reviewedInput();
  unverified.tracks[0].status = "review";
  expect(groundTruth.groundTruthReadiness(unverified).issues.map((entry) => entry.code)).toContain("track-unverified");
  const wrongRange = reviewedInput({ range: { startMs: 2000, endMs: 3000 } });
  expect(groundTruth.groundTruthReadiness(wrongRange).issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
    "track-sparse",
    "track-coverage",
  ]));
  const duplicateIds = reviewedInput();
  duplicateIds.tracks[1].id = duplicateIds.tracks[0].id;
  expect(groundTruth.groundTruthReadiness(duplicateIds).issues.map((entry) => entry.code)).toContain("track-id-invalid");
  const sparseSampling = reviewedInput();
  sparseSampling.tracks[0].segments[0].points.splice(1, 1);
  expect(groundTruth.groundTruthReadiness(sparseSampling).issues.map((entry) => entry.code)).toContain("track-sampling");
  const mixedSource = reviewedInput();
  mixedSource.tracks[0].metadata = { localSourceSha256: "b".repeat(64), angleId: "angle-2" };
  expect(groundTruth.groundTruthReadiness(mixedSource).issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
    "track-source-mismatch",
    "track-angle-mismatch",
  ]));
  expect(groundTruth.groundTruthReadiness(reviewedInput({
    range: { startMs: 0, endMs: 120_001 },
  })).issues.map((entry) => entry.code)).toContain("range-invalid");
  expect(groundTruth.groundTruthReadiness(reviewedInput())).toMatchObject({
    ready: true,
    selectedTrackCount: 3,
    verifiedTrackCount: 3,
    entityCounts: { player: 1, ball: 1, referee: 1 },
  });
});

test("locked real-match references are immutable, media-free and benchmark-ready", async () => {
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const input = reviewedInput();
  input.tracks[0].segments[0].points = Array.from({ length: 11 }, (_, index) => ({
    atMs: index * 100,
    x: 0.1 + (index * 0.005),
    y: 0.5,
    width: 0.08,
    height: 0.16,
    groundX: 0.1 + (index * 0.005),
    groundY: 0.58,
    confidence: 0.98,
    identityConfidence: 0.98,
    ...(index === 3 ? { source: "manual" } : {}),
  }));
  const artifact = groundTruth.createGroundTruthArtifact(input, { now: () => 1_800_000_000_000 });
  expect(Object.isFrozen(artifact)).toBe(true);
  expect(artifact).toMatchObject({
    protocol: "football-science-ground-truth-v1",
    profileId: "football-scene-pilot-v1",
    sourceFingerprint,
    reviewEvidence: {
      kind: "real-match",
      protocol: "football-ground-truth-review-v1",
      reviewedBy: "analyst-1",
      attested: true,
    },
  });
  expect(artifact.groundTruth.tracks[0]).not.toHaveProperty("metadata");
  expect(artifact.groundTruth.tracks[0]).not.toHaveProperty("confidence");
  expect(artifact.groundTruth.tracks[0]).not.toHaveProperty("corrections");
  const sampledTimes = artifact.groundTruth.tracks[0].segments[0].points.map((point) => point.atMs);
  expect(sampledTimes).toContain(300);
  expect(sampledTimes.length).toBeLessThan(11);
  expect(Math.max(...sampledTimes.slice(1).map((atMs, index) => atMs - sampledTimes[index]))).toBeLessThanOrEqual(500);
  for (const track of artifact.groundTruth.tracks) {
    expect(track.segments.flatMap((segment) => segment.points.map((point) => point.atMs))).toContain(300);
  }
  expect(groundTruth.groundTruthArtifactJson(artifact)).not.toMatch(/private\/match|private-model|correctedBy|https?:|blob:/);

  input.tracks[0].segments[0].points[0].x = 0.99;
  expect(artifact.groundTruth.tracks[0].segments[0].points[0].x).toBe(0.1);

  const benchmarkCase = groundTruth.buildMultiObjectCaseFromGroundTruth(artifact, {
    id: "real-match-case-1",
    predictionTracks: reviewedInput().tracks.map((track) => ({ ...track, corrections: [] })),
    performance: { processingMs: 500 },
  });
  expect(benchmark.evaluateMultiObjectTrackingBenchmarkCase(benchmarkCase)).toMatchObject({
    benchmarkId: "real-match-case-1",
    evidence: {
      kind: "real-match",
      reviewProtocol: "football-ground-truth-review-v1",
      attested: true,
    },
    verdict: { passed: true, providerApprovalReady: false },
    metrics: {
      detectionPrecision: 1,
      detectionRecall: 1,
      entityTypeAccuracy: 1,
      teamAccuracy: 1,
      playerIdentityAccuracy: 1,
    },
  });
  const missingPerformance = groundTruth.buildMultiObjectCaseFromGroundTruth(artifact, {
    id: "missing-performance",
    predictionTracks: reviewedInput().tracks.map((track) => ({ ...track, corrections: [] })),
  });
  expect(benchmark.evaluateMultiObjectTrackingBenchmarkCase(missingPerformance)).toMatchObject({
    verdict: {
      passed: false,
      failures: expect.arrayContaining([expect.objectContaining({ metric: "realtimeFactor", reason: "missing-metric" })]),
    },
  });
});

test("ground-truth controller locks and downloads only the reviewed snapshot", async () => {
  const { createTrackingGroundTruthController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingGroundTruthController.js",
  ));
  const { renderTrackingGroundTruthPanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthPanel.js",
  ));
  const tracks = reviewedInput().tracks;
  tracks[0].metadata.localSourceSha256 = sourceFingerprint;
  tracks[0].metadata.angleId = "angle-1";
  const item = {
    id: "item-1",
    clipId: "clip-1",
    startMs: 0,
    endMs: 1000,
    objectTracks: tracks,
  };
  let state = {
    video: { id: "video-1" },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        selectedTrackIds: [tracks[0].id],
        groundTruth: { status: "draft", revision: 1, selectedTrackIds: [], attested: false },
      },
    },
    mediaProduction: {
      activeAngleId: "angle-1",
      angles: [{ id: "angle-1", primary: true, videoId: "video-1" }],
      proxy: { byAngleId: {} },
    },
  };
  const downloads = [];
  const win = {
    Blob,
    URL: {
      createObjectURL: () => "blob:ground-truth",
      revokeObjectURL: (url) => downloads.push({ revoked: url }),
    },
    document: {
      body: { appendChild: () => {} },
      createElement: () => ({
        click() { downloads.push({ href: this.href, download: this.download }); },
        remove() {},
      }),
    },
    setTimeout: (callback) => callback(),
  };
  const controller = createTrackingGroundTruthController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getVideoElement: () => ({ videoWidth: 1920, videoHeight: 1080 }),
    getWindow: () => win,
    getReviewer: () => "analyst-1",
    now: () => 1_800_000_000_000,
  });

  for (const track of tracks) {
    state.presentation.tracking.selectedTrackIds = [track.id];
    expect(controller.handleAction("ground-truth-toggle")).toBe(true);
  }
  expect(controller.handleField("groundTruthAttested", { checked: true })).toBe(true);
  tracks[0].metadata.angleId = "angle-2";
  const mismatchedPanel = renderTrackingGroundTruthPanel(state, item);
  expect(mismatchedPanel).toContain("Reference tracks must use the active camera angle.");
  expect(mismatchedPanel).toMatch(/data-video-analysis-tracking-action="ground-truth-lock" disabled/);
  tracks[0].metadata.angleId = "angle-1";
  expect(controller.handleAction("ground-truth-lock")).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id]).toMatchObject({
    status: "locked",
    selectedTrackIds: tracks.map((track) => track.id),
    lockedArtifact: { sourceFingerprint },
  });
  expect(renderTrackingGroundTruthPanel(state, item)).toContain("Locked reference");
  expect(renderTrackingGroundTruthPanel(state, { ...item, id: "item-2" })).toContain("Review draft");
  expect(controller.handleAction("ground-truth-download")).toBe(true);
  expect(downloads).toEqual(expect.arrayContaining([
    expect.objectContaining({ href: "blob:ground-truth", download: expect.stringMatching(/^fs-player-gt-.*\.json$/) }),
    { revoked: "blob:ground-truth" },
  ]));
  expect(controller.handleAction("ground-truth-new")).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id]).toMatchObject({
    status: "draft",
    revision: 2,
    selectedTrackIds: [],
    lockedArtifact: null,
  });
});
