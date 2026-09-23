import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function observation(id, entityType, confidence = 0.9) {
  return {
    track: { id, entityType },
    point: { confidence },
  };
}

function match(truth, prediction, iou = 0.9) {
  return { truth, prediction, iou };
}

test("internal frame diagnostics retain bounded per-entity errors and continuity events", async () => {
  const metrics = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectMetrics.js",
  ));
  const truthPlayer = observation("truth-player", "player");
  const truthBall = observation("truth-ball", "ball");
  const predictionPlayerA = observation("prediction-player-a", "player");
  const predictionPlayerB = observation("prediction-player-b", "player");
  const predictionBall = observation("prediction-ball", "ball");
  const frames = [{
    atMs: 0,
    truth: [truthPlayer, truthBall],
    prediction: [predictionPlayerA, predictionBall],
    matches: [
      match(truthPlayer, predictionPlayerA),
      match(truthBall, predictionBall),
    ],
    unmatchedTruth: [],
    unmatchedPrediction: [],
  }, {
    atMs: 500,
    truth: [truthPlayer, truthBall],
    prediction: [predictionPlayerB],
    matches: [match(truthPlayer, predictionPlayerB, 0.7)],
    unmatchedTruth: [truthBall],
    unmatchedPrediction: [],
  }, {
    atMs: 1000,
    truth: [truthPlayer],
    prediction: [],
    matches: [],
    unmatchedTruth: [truthPlayer],
    unmatchedPrediction: [],
  }, {
    atMs: 1500,
    truth: [truthPlayer],
    prediction: [predictionPlayerB],
    matches: [match(truthPlayer, predictionPlayerB, 0.8)],
    unmatchedTruth: [],
    unmatchedPrediction: [],
  }];

  const report = metrics.summarizeMultiObjectFrames(frames, {
    durationMs: 2000,
    maximumIdentitySwitchGapMs: 2500,
  });
  const byTime = Object.fromEntries(report.worstFrames.map((entry) => [entry.atMs, entry]));

  expect(report).toMatchObject({ identitySwitches: 1, fragmentations: 1 });
  expect(report.worstFrames.length).toBeLessThanOrEqual(24);
  expect(byTime[500]).toMatchObject({
    identitySwitches: 1,
    perEntity: {
      player: { identitySwitches: 1, meanIou: 0.7 },
      ball: { falseNegatives: 1, falsePositives: 0 },
    },
  });
  expect(byTime[1500]).toMatchObject({
    fragmentations: 1,
    perEntity: { player: { fragmentations: 1, meanIou: 0.8 } },
  });
  expect(JSON.stringify(report.worstFrames)).not.toMatch(/truth-player|prediction-player|playerId|teamId/i);
});
