import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const performanceReadiness = require("../api/_lib/rtp-performance-readiness.js");

function completeScore(overrides = {}) {
  const { components: componentOverrides = {}, ...scoreOverrides } = overrides;
  return performanceReadiness.calculateReadinessScore({
    components: {
      strength: 85,
      running: 85,
      sprint: 85,
      cod: 85,
      jumpLanding: 85,
      positionDemand: 85,
      ...componentOverrides,
    },
    hasSprintExposure: true,
    hasCodExposure: true,
    latestExposureStatus: "completed",
    ...scoreOverrides,
  });
}

test("rtp bottleneck engine prioritizes medical participation ceiling before performance gaps", () => {
  const readinessScore = completeScore({
    components: {
      sprint: 40,
    },
  });

  expect(
    performanceReadiness.resolveBottleneck({
      readinessScore,
      medicalClearanceStatus: "not-cleared",
      hasSprintExposure: false,
    })
  ).toMatchObject({
    key: "medical-participation-ceiling",
    domain: "medical",
    severity: "high",
    priority: 1,
  });
});

test("rtp bottleneck engine identifies sprint exposure gap before COD and strength", () => {
  const readinessScore = completeScore({
    components: {
      strength: 50,
      sprint: 60,
      cod: 55,
    },
  });

  expect(
    performanceReadiness.resolveBottleneck({
      readinessScore,
      medicalClearanceStatus: "match-available",
      hasSprintExposure: false,
      hasCodExposure: false,
    })
  ).toMatchObject({
    key: "sprint-exposure-gap",
    domain: "sprint",
    coachSafeLabel: "Sprint exposure gap",
    priority: 4,
  });
});

test("rtp bottleneck coach filtering hides performance-only reasoning from coaches", () => {
  const bottleneck = performanceReadiness.resolveBottleneck({
    readinessScore: completeScore({
      components: {
        cod: 65,
      },
    }),
    medicalClearanceStatus: "match-available",
    hasSprintExposure: true,
    hasCodExposure: true,
  });

  const coachView = performanceReadiness.filterBottleneckForActor(bottleneck, { role: "coach" });
  const performanceView = performanceReadiness.filterBottleneckForActor(bottleneck, { role: "performance" });

  expect(coachView).toMatchObject({
    key: "cod-braking-gap",
    label: "COD/braking gap",
    summary: "Change-of-direction and braking demand is the main progression limiter.",
  });
  expect(coachView).not.toHaveProperty("performanceOnlyReason");
  expect(coachView).not.toHaveProperty("priority");
  expect(performanceView).toMatchObject({
    performanceOnlyReason: "COD readiness is below threshold.",
    priority: 5,
  });
});
