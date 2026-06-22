import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rtp = require("../api/_lib/rtp-database.js");

test("rtp resolver keeps medical clearance more restrictive than lifecycle status", () => {
  expect(
    rtp.resolveMostRestrictiveStatus({
      lifecycleStatus: "match-available",
      medicalClearanceStatus: "not-cleared",
    })
  ).toMatchObject({
    status: "medical-review",
    source: "medical-clearance",
  });

  expect(
    rtp.resolveMostRestrictiveStatus({
      lifecycleStatus: "match-available",
      medicalClearanceStatus: "modified-training",
    })
  ).toMatchObject({
    status: "training-available",
    source: "medical-clearance",
  });
});

test("rtp resolver treats closed cases as terminal", () => {
  expect(
    rtp.resolveMostRestrictiveStatus({
      lifecycleStatus: "closed",
      medicalClearanceStatus: "not-cleared",
    })
  ).toMatchObject({
    status: "closed",
    source: "lifecycle",
  });
});

test("rtp medical confidence is medical-private in API helpers", () => {
  const clearance = {
    clearance_status: "match-available",
    medical_confidence_level: "moderate",
    participation_ceiling: "match-available",
    medical_restrictions: { sprint: "full" },
    reviewed_at: "2026-06-22T00:00:00.000Z",
  };

  expect(rtp.filterMedicalClearanceForActor(clearance, { role: "coach" })).not.toHaveProperty("medicalConfidenceLevel");
  expect(rtp.filterMedicalClearanceForActor(clearance, { role: "performance" })).not.toHaveProperty("medicalConfidenceLevel");
  expect(rtp.filterMedicalClearanceForActor(clearance, { role: "medical" })).toHaveProperty("medicalConfidenceLevel", "moderate");
});
