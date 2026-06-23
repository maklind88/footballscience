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

function readinessScore(score) {
  return performanceReadiness.calculateReadinessScore({
    components: {
      strength: score,
      running: score,
      sprint: score,
      cod: score,
      jumpLanding: score,
      positionDemand: score,
    },
    hasSprintExposure: true,
    hasCodExposure: true,
    latestExposureStatus: "completed",
  });
}

test("rtp coach squad availability contract returns coach-safe empty summary", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp?view=coach-squad-availability" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    summary: {
      available: 0,
      limited: 0,
      modifiedTraining: 0,
      unavailable: 0,
      unknown: 0,
    },
    players: [],
    emptyState: {
      code: "rtp-coach-squad-empty",
    },
  });
});

test("rtp coach squad availability groups derived player cards without private readiness data", () => {
  const payload = coachRead.buildCoachSquadAvailabilityReadModel(
    {
      players: [
        {
          playerId: "available-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "match-available",
            medicalClearanceStatus: "match-available",
          },
          readinessScore: readinessScore(94),
        },
        {
          playerId: "limited-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "match-available",
            medicalClearanceStatus: "match-available",
          },
          readinessScore: readinessScore(78),
        },
        {
          playerId: "modified-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "active-rtp",
            medicalClearanceStatus: "running-only",
          },
          readinessScore: readinessScore(62),
        },
        {
          playerId: "unavailable-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "medical-review",
            medicalClearanceStatus: "not-cleared",
          },
          readinessScore: readinessScore(92),
        },
      ],
    },
    { role: "coach" }
  );

  expect(payload.summary).toEqual({
    available: 1,
    limited: 1,
    modifiedTraining: 1,
    unavailable: 1,
    unknown: 0,
  });
  expect(payload.players).toHaveLength(4);
  expect(payload.players[0].readiness).not.toHaveProperty("exactPercentage");
  expect(payload.players[0].readiness).not.toHaveProperty("components");
});
