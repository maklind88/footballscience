import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function track(id, status = "verified") {
  const points = [0, 500, 1000].map((atMs) => ({
    atMs,
    frameIndex: atMs / 500,
    x: 0.4,
    y: 0.5,
    width: 0.08,
    height: 0.16,
    groundX: 0.4,
    groundY: 0.58,
    confidence: 0.9,
    identityConfidence: 0.9,
    occluded: false,
    source: "manual",
  }));
  return {
    id,
    entityType: "player",
    playerId: `player-${id}`,
    playerLabel: `Player ${id}`,
    teamSide: "home",
    status,
    startMs: 0,
    endMs: 1000,
    confidence: 0.9,
    identityConfidence: 0.9,
    engine: "review-studio-test",
    segments: [{ id: `${id}-segment`, startMs: 0, endMs: 1000, confidence: 0.9, points }],
    corrections: [],
    metadata: {},
  };
}

function truth(overrides = {}) {
  return {
    itemId: "item-1",
    status: "draft",
    revision: 1,
    sourceFingerprint: "a".repeat(64),
    angleId: "primary",
    frame: { width: 1920, height: 1080 },
    range: { startMs: 0, endMs: 1000 },
    selectedTrackIds: [],
    benchmarkTargetTrackId: "",
    scenarioTags: [],
    attested: false,
    exhaustiveSceneAttested: false,
    error: "",
    ...overrides,
  };
}

function state(tracking = {}) {
  return { presentation: { tracking } };
}

test("review studio starts with one hash-matched workspace action", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js",
  ));
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: { benchmarkType: "multi-object", cases: [] },
      byItemId: { "item-1": truth() },
    },
  }), { id: "item-1", objectTracks: [] });

  expect(html).toContain("Review Studio");
  expect(html).toContain("Open review workspace");
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-open"');
  expect(html).toContain('class="is-active" aria-current="step"');
  expect(html).toContain("0/5 stages");
});

test("review studio keeps accept and reject decisions explicit", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js",
  ));
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: { benchmarkType: "multi-object", cases: [] },
      byItemId: { "item-1": truth() },
    },
    preannotationReview: {
      status: "review",
      workspaceSha256: "b".repeat(64),
      caseId: "fast-transition",
      pendingCount: 8,
      current: { id: "suggestion-1", entityType: "ball", atMs: 1250 },
      campaign: {
        caseCount: 5,
        completeCaseCount: 1,
        cases: [{ caseId: "fast-transition", complete: false }],
      },
    },
  }), { id: "item-1", objectTracks: [] });

  expect(html).toContain("Resolve current suggestion");
  expect(html).toContain("ball at 1.25s");
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-accept"');
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-reject"');
  expect(html).toContain("1/5 cases");
});

test("review studio routes the analyst to the first known checkpoint issue", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js",
  ));
  const player = track("p1", "review");
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: { benchmarkType: "multi-object", cases: [] },
      byItemId: {
        "item-1": truth({
          selectedTrackIds: [player.id],
          benchmarkTargetTrackId: player.id,
          workloadEvidence: { protocol: "test" },
        }),
      },
    },
    preannotationReview: {
      status: "complete",
      workspaceSha256: "b".repeat(64),
      caseId: "attacking-third",
      campaign: {
        caseCount: 5,
        completeCaseCount: 1,
        cases: [{
          caseId: "attacking-third",
          complete: true,
          reviewEffortCoverage: "complete",
          savedCount: 1,
        }],
      },
    },
  }), { id: "item-1", objectTracks: [player] });

  expect(html).toContain("Resolve first checkpoint issue");
  expect(html).toContain("Player p1: unverified at 0.0s");
  expect(html).toContain('data-video-analysis-tracking-action="ground-truth-checkpoint-select"');
  expect(html).toContain('data-video-analysis-ground-truth-track-id="p1"');
  expect(html).toContain('data-video-analysis-ground-truth-at-ms="0"');
});

test("review studio routes unresolved person roles back to explicit classification", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js",
  ));
  const person = {
    ...track("person-1"),
    entityType: "person",
    metadata: {
      preannotationReviewState: "saved-review",
      preannotationWorkspaceSha256: "b".repeat(64),
      preannotationCaseId: "attacking-third",
    },
  };
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: { benchmarkType: "multi-object", cases: [] },
      byItemId: { "item-1": truth() },
    },
    preannotationReview: {
      status: "complete",
      workspaceSha256: "b".repeat(64),
      caseId: "attacking-third",
      campaign: {
        caseCount: 5,
        completeCaseCount: 1,
        cases: [{
          caseId: "attacking-third",
          complete: true,
          reviewEffortCoverage: "complete",
          savedCount: 1,
        }],
      },
    },
  }), { id: "item-1", objectTracks: [person] });

  expect(html).toContain("Classify saved person roles");
  expect(html).toContain("1 saved track must become player or referee");
  expect(html).toContain('data-video-analysis-track-select="person-1"');
  expect(html).not.toContain('data-video-analysis-tracking-action="ground-truth-use-preannotation-case"');
});
