import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const coachRead = require("../api/_lib/rtp-coach-read-model.js");
const rtp = require("../api/_lib/rtp-database.js");
const performanceReadiness = require("../api/_lib/rtp-performance-readiness.js");

function createJsonResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(value) {
      this.body += value || "";
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
  };
}

function completeReadinessScore() {
  return performanceReadiness.calculateReadinessScore({
    components: {
      strength: 92,
      running: 91,
      sprint: 90,
      cod: 90,
      jumpLanding: 88,
      positionDemand: 91,
    },
    hasSprintExposure: true,
    hasCodExposure: true,
    latestExposureStatus: "completed",
  });
}

test("rtp coach player status contract returns a coach-safe empty state", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp?view=coach-player-status&playerId=player-1" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    playerId: "player-1",
    statusCard: {
      canTrainToday: "unknown",
      canPlayNextMatch: "unknown",
      riskLevel: "high",
      minutesGuidanceBand: "unknown",
      positionReadinessBand: "unknown",
    },
    readiness: {
      label: "Progression score – not clearance",
      band: "insufficient-data",
    },
    emptyState: {
      code: "rtp-coach-player-empty",
    },
  });
  expect(payload.readiness).not.toHaveProperty("exactPercentage");
  expect(payload.readiness).not.toHaveProperty("components");
  expect(payload).not.toHaveProperty("medicalConfidenceLevel");
});

test("rtp coach player status derives match availability from medical and performance state", () => {
  const readinessScore = completeReadinessScore();
  const statusCard = coachRead.buildCoachPlayerStatusCard(
    {
      playerId: "player-ready",
      hasActiveRtpCase: true,
      mostRestrictiveStatus: {
        status: "match-available",
        medicalClearanceStatus: "match-available",
      },
      readinessScore,
      bottleneck: performanceReadiness.resolveBottleneck({
        readinessScore,
        medicalClearanceStatus: "match-available",
        hasSprintExposure: true,
        hasCodExposure: true,
      }),
      restrictions: ["normal team training"],
    },
    { role: "coach" }
  );

  expect(statusCard).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    playerId: "player-ready",
    statusCard: {
      canTrainToday: "yes",
      canPlayNextMatch: "yes",
      riskLevel: "low",
      minutesGuidanceBand: "normal",
      positionReadinessBand: "ready",
      restrictions: ["normal team training"],
    },
    readiness: {
      label: "Progression score – not clearance",
      band: "match-demand-candidate",
    },
    case: {
      hasActiveRtpCase: true,
      mostRestrictiveStatus: "match-available",
    },
  });
  expect(statusCard.readiness).not.toHaveProperty("exactPercentage");
});

test("rtp coach player status respects medical participation ceiling", () => {
  const statusCard = coachRead.buildCoachPlayerStatusCard(
    {
      playerId: "player-medical-ceiling",
      hasActiveRtpCase: true,
      mostRestrictiveStatus: {
        status: "medical-review",
        medicalClearanceStatus: "not-cleared",
      },
      readinessScore: completeReadinessScore(),
      medicalClearanceStatus: "not-cleared",
    },
    { role: "coach" }
  );

  expect(statusCard.statusCard).toMatchObject({
    canTrainToday: "no",
    canPlayNextMatch: "no",
    riskLevel: "high",
    minutesGuidanceBand: "none",
  });
  expect(statusCard.statusCard.nextDecisionPoint).toBe("Medical review required before demand progression.");
});
