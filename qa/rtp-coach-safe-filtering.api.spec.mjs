import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const coachRead = require("../api/_lib/rtp-coach-read-model.js");
const rtp = require("../api/_lib/rtp-database.js");

test("rtp coach-safe filtering removes medical private and performance exact fields", () => {
  const filtered = coachRead.filterCoachSafeRtpSummary(
    {
      contractVersion: "footballscience-rtp-coach-read-v1",
      scope: "coach-safe",
      readiness: {
        label: "Progression score – not clearance",
        band: "training-demand-build",
        exactPercentage: 82,
        components: {
          sprint: {
            score: 78,
            weight: 25,
          },
        },
      },
      statusCard: {
        canTrainToday: "yes",
        canPlayNextMatch: "limited",
        riskLevel: "moderate",
      },
      medicalConfidenceLevel: "low",
      privateMedicalNotes: "MRI detail",
      imaging: "protected",
      bottleneck: {
        label: "Sprint exposure gap",
        performanceOnlyReason: "Raw sprint exposure is below target.",
        priority: 4,
      },
    },
    { role: "coach" }
  );

  expect(filtered).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    readiness: {
      label: "Progression score – not clearance",
      band: "training-demand-build",
    },
    statusCard: {
      canTrainToday: "yes",
      canPlayNextMatch: "limited",
      riskLevel: "moderate",
    },
    bottleneck: {
      label: "Sprint exposure gap",
    },
  });
  expect(filtered.readiness).not.toHaveProperty("exactPercentage");
  expect(filtered.readiness).not.toHaveProperty("components");
  expect(filtered).not.toHaveProperty("medicalConfidenceLevel");
  expect(filtered).not.toHaveProperty("privateMedicalNotes");
  expect(filtered).not.toHaveProperty("imaging");
  expect(filtered.bottleneck).not.toHaveProperty("performanceOnlyReason");
  expect(filtered.bottleneck).not.toHaveProperty("priority");
});

test("rtp coach-safe default GET includes derived read model without exposing private data", async () => {
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
    { method: "GET", url: "/api/rtp?playerId=player-1" },
    res,
    { id: "coach-1", role: "coach", organizationId: "org-1", teamId: "team-1" }
  );

  const payload = JSON.parse(res.body);
  expect(payload.coachReadModel).toMatchObject({
    contractVersion: "footballscience-rtp-coach-read-v1",
    scope: "coach-safe",
    playerId: "player-1",
    readiness: {
      label: "Progression score – not clearance",
      band: "insufficient-data",
    },
  });
  expect(payload.coachReadModel.readiness).not.toHaveProperty("exactPercentage");
  expect(payload.coachReadModel.readiness).not.toHaveProperty("components");
  expect(payload.coachReadModel).not.toHaveProperty("medicalConfidenceLevel");
});
