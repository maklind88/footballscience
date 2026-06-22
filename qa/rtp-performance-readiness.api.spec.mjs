import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rtp = require("../api/_lib/rtp-database.js");
const performanceReadiness = require("../api/_lib/rtp-performance-readiness.js");

test("rtp readiness score is always labelled as progression score, not clearance", () => {
  const score = performanceReadiness.calculateReadinessScore({
    components: {
      strength: 92,
      running: 91,
      sprint: 90,
      cod: 88,
      jumpLanding: 94,
      positionDemand: 90,
    },
    hasSprintExposure: true,
    hasCodExposure: true,
    latestExposureStatus: "completed",
  });

  expect(score).toMatchObject({
    label: "Progression score – not clearance",
    exactPercentage: 91,
    band: "match-demand-candidate",
    dataCompleteness: "complete",
  });
});

test("rtp readiness score caps progression when sprint exposure is missing", () => {
  const score = performanceReadiness.calculateReadinessScore({
    components: {
      strength: 95,
      running: 95,
      sprint: 95,
      cod: 95,
      jumpLanding: 95,
      positionDemand: 95,
    },
    hasSprintExposure: false,
    hasCodExposure: true,
    latestExposureStatus: "completed",
  });

  expect(score.exactPercentage).toBe(69);
  expect(score.band).toBe("field-build");
  expect(score.capsApplied).toContainEqual({
    cap: 69,
    reason: "Sprint exposure gap caps progression.",
  });
});

test("rtp coach-safe readiness output prefers bands over exact percentages", () => {
  const score = performanceReadiness.calculateReadinessScore({
    components: {
      strength: 80,
      running: 82,
      sprint: 78,
      cod: 81,
      jumpLanding: 84,
      positionDemand: 79,
    },
    hasSprintExposure: true,
    hasCodExposure: true,
    latestExposureStatus: "completed",
  });

  const coachView = performanceReadiness.filterReadinessForActor(score, { role: "coach" });
  const performanceView = performanceReadiness.filterReadinessForActor(score, { role: "performance" });

  expect(coachView).toMatchObject({
    label: "Progression score – not clearance",
    band: "training-demand-build",
  });
  expect(coachView).not.toHaveProperty("exactPercentage");
  expect(coachView.components.sprint).not.toHaveProperty("score");
  expect(performanceView).toMatchObject({
    exactPercentage: 80,
    components: {
      sprint: {
        score: 78,
        weight: 25,
      },
    },
  });
});

test("rtp empty state exposes Performance contract while writes remain disabled", async () => {
  const res = {
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

  await rtp.handleRtpRequest(
    { method: "GET", url: "/api/rtp" },
    res,
    { id: "performance-1", role: "performance", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(payload.performanceReadiness).toMatchObject({
    contractVersion: "footballscience-rtp-performance-readiness-v1",
    writesEnabled: false,
    scoreLabel: "Progression score – not clearance",
    exposureTracking: {
      events: [],
      lastCompletedExposure: null,
    },
  });
  expect(payload.performanceReadiness.exposureTracking.supportedExposureTypes).toContain("sprint");
  expect(payload.performanceReadiness.exposureTracking.supportedExposureStatuses).toContain("completed");
});
