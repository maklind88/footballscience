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

test("rtp coach matchday readiness contract returns empty selection groups", async () => {
  const res = createJsonResponse();
  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp?view=coach-matchday-readiness&matchId=match-1" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    matchday: {
      matchId: "match-1",
      generatedAt: null,
    },
    selectionGroups: {
      available: [],
      limitedMinutes: [],
      trainingOnly: [],
      unavailable: [],
      unknown: [],
    },
    emptyState: {
      code: "rtp-coach-matchday-empty",
    },
  });
});

test("rtp coach matchday readiness groups players but does not select them", () => {
  const payload = coachRead.buildCoachMatchdayReadinessReadModel(
    {
      matchId: "match-1",
      players: [
        {
          playerId: "available-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "performance-restored",
            medicalClearanceStatus: "match-available",
          },
          readinessScore: readinessScore(95),
        },
        {
          playerId: "limited-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "match-available",
            medicalClearanceStatus: "match-available",
          },
          readinessScore: readinessScore(80),
        },
        {
          playerId: "training-player",
          hasActiveRtpCase: true,
          mostRestrictiveStatus: {
            status: "training-available",
            medicalClearanceStatus: "full-training",
          },
          readinessScore: readinessScore(72),
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

  expect(payload.selectionGroups.available.map((player) => player.playerId)).toEqual(["available-player"]);
  expect(payload.selectionGroups.limitedMinutes.map((player) => player.playerId)).toEqual(["limited-player"]);
  expect(payload.selectionGroups.trainingOnly.map((player) => player.playerId)).toEqual(["training-player"]);
  expect(payload.selectionGroups.unavailable.map((player) => player.playerId)).toEqual(["unavailable-player"]);
  expect(JSON.stringify(payload).toLowerCase()).not.toContain("recommended starter");
  expect(JSON.stringify(payload).toLowerCase()).not.toContain("must play");
});
