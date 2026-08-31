import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function track(id, entityType, options = {}) {
  const points = options.points || [0, 500, 1000].map((atMs) => ({
    atMs,
    x: 0.4,
    y: 0.5,
    width: 0.08,
    height: 0.16,
    groundX: 0.4,
    groundY: 0.58,
    confidence: 0.9,
    identityConfidence: 0.9,
  }));
  return {
    id,
    entityType,
    playerId: entityType === "player" ? options.playerId ?? `player-${id}` : "",
    playerLabel: entityType === "player" ? options.playerLabel ?? `Player ${id}` : entityType,
    teamSide: entityType === "player" ? options.teamSide ?? "home" : "",
    status: options.status || "verified",
    startMs: 0,
    endMs: 1000,
    confidence: 0.9,
    identityConfidence: 0.9,
    engine: "checkpoint-test",
    segments: [{ id: `${id}-segment`, startMs: 0, endMs: 1000, confidence: 0.9, points }],
    corrections: [],
    metadata: {},
  };
}

test("checkpoint diagnostics expose visible entities, gaps, identity work and excluded tracks", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthCheckpointService.js",
  ));
  const player = track("player", "player", {
    playerId: "",
    playerLabel: "",
    teamSide: "",
    status: "review",
  });
  const ball = track("ball", "ball");
  ball.segments[0].points[1].occluded = true;
  const refereeGap = track("referee", "referee", {
    points: [0, 1000].map((atMs) => ({
      atMs,
      x: 0.5,
      y: 0.5,
      width: 0.08,
      height: 0.16,
      groundX: 0.5,
      groundY: 0.58,
      confidence: 0.9,
      identityConfidence: 0.9,
    })),
  });
  const outside = track("outside", "player");
  const preview = track("preview", "player");
  preview.metadata.preannotationReviewPreview = true;

  expect(service.trackingGroundTruthCheckpointDiagnostics({
    tracks: [player, ball, refereeGap, outside, preview],
    selectedTrackIds: [player.id, ball.id, refereeGap.id],
    benchmarkType: "multi-object",
    atMs: 500,
  })).toEqual({
    atMs: 500,
    selectedDeclaredCount: 3,
    selectedVisibleCount: 1,
    occludedCount: 1,
    samplingGapCount: 1,
    unselectedVisibleCount: 1,
    unverifiedCount: 1,
    identityIssueCount: 1,
    issues: [
      { code: "sample-gap", trackId: "referee", entityType: "referee", label: "Referee: sample gap" },
      { code: "unverified", trackId: "player", entityType: "player", label: "Player: unverified" },
      { code: "identity", trackId: "player", entityType: "player", label: "Player: needs identity or team" },
      { code: "outside-reference", trackId: "outside", entityType: "player", label: "Player outside: outside reference" },
    ],
    entityCounts: { player: 1, ball: 0, referee: 0 },
  });
  expect(service.trackingGroundTruthCheckpointDiagnostics({
    tracks: [player, outside],
    selectedTrackIds: [player.id],
    benchmarkType: "selected-object",
    atMs: 500,
  }).unselectedVisibleCount).toBe(0);
});
