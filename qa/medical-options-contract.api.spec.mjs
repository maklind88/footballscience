import { expect, test } from "@playwright/test";
import {
  medicalActualParticipationFallback,
  medicalClearanceRoles,
  medicalDataSafetySyncStatusOptions,
  medicalDefaultRosterVersion,
  medicalGateOptions,
  medicalInjuryDurationPresets,
  medicalLoadGateOptions,
  medicalOperationsTabOptions,
  medicalParticipationOptions,
  medicalPlayerModalTabOptions,
  medicalPositionAliases,
  medicalPositionOrder,
  medicalRtpPhaseOptions,
  medicalStatusActivityLabels,
  medicalStatusActivityTones,
  medicalStatusOptions,
  medicalWindowLength,
} from "../src/modules/medical/index.mjs";

test("Medical options expose stable availability, RTP, and roster constants", () => {
  expect(medicalParticipationOptions).toEqual([0, 10, 25, 50, 75, 100]);
  expect(medicalStatusOptions.find((option) => option.key === "full")?.defaultParticipation).toBe(100);
  expect(medicalStatusActivityLabels.match.full).toBe("Match Available");
  expect(medicalStatusActivityTones.match.monitor).toBe("full");
  expect(medicalRtpPhaseOptions.map((option) => option.key)).toContain("match-available");
  expect(medicalClearanceRoles.map((role) => role.key)).toEqual(["doctor", "physio", "performance"]);
  expect(medicalGateOptions.map((option) => option.key)).toContain("fail");
  expect(medicalLoadGateOptions.map((gate) => gate.key)).toContain("psychologicalReadiness");
  expect(medicalInjuryDurationPresets.map((preset) => preset.label)).toContain("6m");
  expect(medicalActualParticipationFallback).toBe("not-logged");
  expect(medicalWindowLength).toBe(7);
  expect(medicalDefaultRosterVersion).toBe("ncc-2026-roster-v1");
  expect(medicalOperationsTabOptions.map((tab) => tab.key)).toContain("season");
  expect(medicalPlayerModalTabOptions.map((tab) => tab.key)).toContain("plan");
  expect(medicalDataSafetySyncStatusOptions.has("failed")).toBe(true);
  expect(medicalPositionOrder.Goalkeeper).toBeLessThan(medicalPositionOrder.Forward);
  expect(medicalPositionAliases.Midfielder).toContain("cm");
});
