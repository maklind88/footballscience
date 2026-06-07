import { expect, test } from "@playwright/test";
import {
  createMedicalOptionSelectors,
  medicalActualParticipationFallback,
  medicalGateOptions,
  medicalParticipationOptions,
  medicalRtpPhaseOptions,
  medicalStatusActivityLabels,
  medicalStatusActivityTones,
  medicalStatusOptions,
} from "../src/modules/medical/index.mjs";

const selectors = createMedicalOptionSelectors({
  getMedicalRecommendationActivityContext: (dateValue) => ({ type: dateValue === "match-day" ? "match" : "training" }),
  medicalActualParticipationFallback,
  medicalGateOptions,
  medicalParticipationOptions,
  medicalRtpPhaseOptions,
  medicalStatusActivityLabels,
  medicalStatusActivityTones,
  medicalStatusOptions,
});

test("Medical option selectors preserve status, activity, RTP, and gate lookups", () => {
  expect(selectors.getMedicalStatusOption("modified").label).toBe("Modified Training");
  expect(selectors.getMedicalStatusOption("bad-value").key).toBe("full");
  expect(selectors.getMedicalStatusActivityType("match-day")).toBe("match");
  expect(selectors.getMedicalStatusActivityType("rest-day", "match-available")).toBe("training");
  expect(
    createMedicalOptionSelectors({
      getMedicalRecommendationActivityContext: () => ({}),
      medicalRtpPhaseOptions,
      medicalStatusOptions,
    }).getMedicalStatusActivityType("rest-day", "match-available")
  ).toBe("match");
  expect(selectors.getMedicalStatusOptionForDate("full", "match-day")).toMatchObject({
    label: "Match Available",
    tone: "full",
    activityType: "match",
  });
  expect(selectors.getMedicalRtpPhaseOption("modified-team").label).toBe("Modified team");
  expect(selectors.getMedicalRtpPhaseOption("bad-value").key).toBe("medical-restriction");
  expect(selectors.getMedicalGateOption("pass").label).toBe("Pass");
  expect(selectors.getMedicalGateOption("bad-value").key).toBe("pending");
});

test("Medical option selectors preserve participation normalization and recommendation phases", () => {
  expect(selectors.getMedicalStatusForParticipation(0)).toBe("unavailable");
  expect(selectors.getMedicalStatusForParticipation(25)).toBe("rehab");
  expect(selectors.getMedicalStatusForParticipation(50)).toBe("controlled");
  expect(selectors.getMedicalStatusForParticipation(75)).toBe("modified");
  expect(selectors.getMedicalStatusForParticipation(100)).toBe("full");
  expect(selectors.getMedicalRtpPhaseForRecommendation("full", 100, "match")).toBe("match-available");
  expect(selectors.getMedicalRtpPhaseForRecommendation("modified", 75, "training")).toBe("modified-team");
  expect(selectors.normalizeMedicalParticipation("75")).toBe(75);
  expect(selectors.normalizeMedicalParticipation("bad", 50)).toBe(50);
  expect(selectors.normalizeMedicalActualParticipation("")).toBe(medicalActualParticipationFallback);
  expect(selectors.normalizeMedicalActualParticipation("100")).toBe(100);
  expect(selectors.normalizeMedicalActualParticipation("bad")).toBe(medicalActualParticipationFallback);
});
