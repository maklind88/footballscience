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
      current: { id: "suggestion-1", entityType: "ball", atMs: 1250, durationMs: 900 },
      campaign: {
        caseCount: 5,
        completeCaseCount: 1,
        cases: [{ caseId: "fast-transition", complete: false }],
      },
    },
  }), { id: "item-1", objectTracks: [] });

  expect(html).toContain("Resolve current suggestion");
  expect(html).toContain("ball at 1.25s | 900ms");
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-preview-context"');
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-accept"');
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-save-current"');
  expect(html).toContain('data-video-analysis-tracking-action="preannotation-reject"');
  expect(html.indexOf("preannotation-preview-context")).toBeLessThan(html.indexOf("preannotation-accept"));
  expect(html).toContain("0/5 refs");
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

test("review studio separates decision completion from locked Match 11 references", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js",
  ));
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: {
        benchmarkType: "multi-object",
        cases: [{
          id: "locked-attacking-third",
          workloadEvidence: {
            workspaceSha256: "b".repeat(64),
            caseId: "attacking-third",
          },
        }],
      },
      byItemId: {
        "item-1": truth({ status: "locked", lockedArtifact: { id: "locked-attacking-third" } }),
      },
    },
    preannotationReview: {
      status: "complete",
      workspaceSha256: "b".repeat(64),
      caseId: "attacking-third",
      campaign: {
        caseCount: 2,
        completeCaseCount: 1,
        cases: [{
          caseId: "attacking-third",
          sourceSha256: "a".repeat(64),
          complete: true,
          reviewEffortCoverage: "complete",
          savedCount: 10,
          decisionCount: 10,
          totalSuggestionCount: 10,
          pendingCount: 0,
        }, {
          caseId: "fast-transition",
          sourceSha256: "c".repeat(64),
          complete: false,
          reviewEffortCoverage: "complete",
          savedCount: 2,
          decisionCount: 3,
          totalSuggestionCount: 10,
          pendingCount: 7,
        }],
      },
    },
  }), { id: "item-1", objectTracks: [] });

  expect(html).toContain("Match 11 campaign");
  expect(html).toContain("1/2 references");
  expect(html).toContain("Reference locked");
  expect(html).toContain("Verified by locked reference");
  expect(html).toContain("4/5 stages");
  expect(html).toContain("3/10 decisions");
  expect(html).toContain("Reconnect fast-transition (cccccc...cccc) and resolve 7 remaining suggestions.");
  expect(html).not.toContain("2/2 references");
});

test("review studio accepts the real normalized campaign coverage contract", async () => {
  const [component, campaignService] = await Promise.all([
    import(moduleUrl("src/modules/video-analysis/components/TrackingGroundTruthReviewStudio.js")),
    import(moduleUrl("src/modules/video-analysis/services/trackingPreannotationCampaignService.js")),
  ]);
  const campaign = campaignService.trackingPreannotationCampaignProgress({
    workspaceSha256: "b".repeat(64),
    packId: "match-11",
    caseCount: 1,
    totalSuggestionCount: 2,
    cases: [{
      caseId: "attacking-third",
      sourceSha256: "a".repeat(64),
      totalSuggestionCount: 2,
      associatedTrackCount: 2,
      unassociatedObservationCount: 0,
      missingSuggestedEntityTypes: [],
    }],
  }, [], {
    activeCaseId: "attacking-third",
    current: {
      caseId: "attacking-third",
      totalSuggestionCount: 2,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      savedCount: 2,
      reviewEffort: {
        coverage: "complete",
        openedCount: 1,
        acceptActionCount: 2,
        savedTrackActionCount: 2,
        firstOpenedAt: "2026-08-31T10:00:00.000Z",
        lastActionAt: "2026-08-31T10:05:00.000Z",
      },
      updatedAt: "2026-08-31T10:05:00.000Z",
    },
  });
  const html = component.renderTrackingGroundTruthReviewStudio(state({
    groundTruth: {
      suite: { benchmarkType: "multi-object", cases: [] },
      byItemId: { "item-1": truth() },
    },
    preannotationReview: {
      status: "complete",
      workspaceSha256: "b".repeat(64),
      caseId: "attacking-third",
      campaign,
    },
  }), { id: "item-1", objectTracks: [] });

  expect(campaign.cases[0].reviewEffortCoverage).toBe("complete");
  expect(html).toContain("Ready for reference");
  expect(html).toContain("Prepare independent reference");
  expect(html).toContain('data-video-analysis-tracking-action="ground-truth-use-preannotation-case"');
});
