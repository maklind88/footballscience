import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function reviewEffort(overrides = {}) {
  return {
    coverage: "complete",
    openedCount: 1,
    acceptActionCount: 2,
    rejectActionCount: 2,
    undoActionCount: 1,
    deferActionCount: 1,
    correctionHandoffCount: 1,
    batchSaveActionCount: 1,
    savedTrackActionCount: 2,
    firstOpenedAt: "2026-08-31T12:00:00.000Z",
    lastActionAt: "2026-08-31T12:10:00.000Z",
    ...overrides,
  };
}

function workloadInput(overrides = {}) {
  return {
    sourceFingerprint: "a".repeat(64),
    workspaceSha256: "b".repeat(64),
    packId: "real-match-pack",
    caseId: "transition-1",
    angleId: "tactical-main",
    range: { startMs: 1_000, endMs: 31_000 },
    totalSuggestionCount: 4,
    rejectedCount: 2,
    savedCount: 2,
    reviewEffort: reviewEffort(),
    ...overrides,
  };
}

test("review workload evidence is exact, reproducible, and carries no approval claim", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewWorkloadEvidenceService.js",
  ));
  const evidence = service.createTrackingReviewWorkloadEvidence(workloadInput(), {
    expectedSavedTrackCount: 2,
  });

  expect(evidence).toMatchObject({
    version: 1,
    protocol: "football-science-tracking-review-workload-evidence-v1",
    kind: "preannotation-review-workload",
    sourceFingerprint: "a".repeat(64),
    workspaceSha256: "b".repeat(64),
    packId: "real-match-pack",
    caseId: "transition-1",
    range: { startMs: 1_000, endMs: 31_000 },
    outcome: { totalSuggestionCount: 4, rejectedCount: 2, savedCount: 2 },
    effort: { coverage: "complete", savedTrackActionCount: 2 },
    metrics: {
      decisionActionCount: 4,
      reviewActionCount: 8,
      reworkActionCount: 2,
      reviewActionsPer100Suggestions: 200,
      undoPer100Decisions: 25,
      correctionHandoffsPer100SavedTracks: 50,
    },
  });
  expect(Object.isFrozen(evidence)).toBe(true);
  expect(service.validateTrackingReviewWorkloadEvidence(structuredClone(evidence), {
    sourceFingerprint: "a".repeat(64),
    angleId: "tactical-main",
    range: { startMs: 1_000, endMs: 31_000 },
    expectedSavedTrackCount: 2,
  })).toEqual(evidence);
  expect(JSON.stringify(evidence)).not.toMatch(/attest|approv|provider|analyst|tenant|clip|item|path|url/i);
});

test("review workload evidence rejects partial, hidden, drifted, and cross-case claims", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewWorkloadEvidenceService.js",
  ));
  const evidence = service.createTrackingReviewWorkloadEvidence(workloadInput());

  expect(() => service.createTrackingReviewWorkloadEvidence(workloadInput({
    reviewEffort: reviewEffort({ coverage: "partial" }),
  }))).toThrow(/coverage must be complete/i);
  expect(() => service.createTrackingReviewWorkloadEvidence(workloadInput({ savedCount: 1 })))
    .toThrow(/does not reconcile/i);
  expect(() => service.createTrackingReviewWorkloadEvidence(workloadInput(), {
    expectedSavedTrackCount: 3,
  })).toThrow(/track selection/i);

  const hidden = structuredClone(evidence);
  hidden.analystId = "private-user";
  expect(() => service.validateTrackingReviewWorkloadEvidence(hidden)).toThrow(/unsupported field analystId/i);
  const changedMetrics = structuredClone(evidence);
  changedMetrics.metrics.reviewActionCount += 1;
  expect(() => service.validateTrackingReviewWorkloadEvidence(changedMetrics)).toThrow(/metrics do not match/i);
  expect(() => service.validateTrackingReviewWorkloadEvidence(evidence, {
    sourceFingerprint: "c".repeat(64),
  })).toThrow(/another source/i);
  expect(() => service.validateTrackingReviewWorkloadEvidence(evidence, {
    range: { startMs: 1_001, endMs: 31_000 },
  })).toThrow(/another benchmark range/i);
});

test("campaign presentation keeps only the raw effort fields needed for exact evidence", async () => {
  const helpers = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewControllerHelpers.js",
  ));
  const effort = reviewEffort();
  const state = helpers.normalizeTrackingPreannotationReviewState({
    campaign: {
      status: "ready",
      workspaceSha256: "b".repeat(64),
      packId: "real-match-pack",
      caseCount: 1,
      cases: [{
        caseId: "transition-1",
        reviewEffort: {
          ...effort,
          decisionActionCount: 4,
          reviewActionCount: 8,
          sourcePath: "/must-not-survive",
        },
      }],
    },
  });

  expect(state.campaign.cases[0].reviewEffort).toEqual(effort);
  expect(state.campaign.cases[0].reviewEffort).not.toHaveProperty("decisionActionCount");
  expect(state.campaign.cases[0].reviewEffort).not.toHaveProperty("sourcePath");
});
