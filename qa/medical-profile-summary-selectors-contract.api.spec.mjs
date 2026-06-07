import { expect, test } from "@playwright/test";
import { createMedicalProfileSummarySelectors } from "../src/modules/medical/index.mjs";

test("Medical profile summary selectors preserve read-only profile summary calculations", () => {
  const player = { id: "p1", name: "Player One" };
  const currentRecord = {
    id: "record-current",
    playerId: "p1",
    date: "2026-06-07",
    participation: 75,
    rtpPhase: "phase-2",
    coachNote: "Limit high-speed exposure",
  };
  const manualRecord = {
    id: "record-manual",
    playerId: "p1",
    date: "2026-06-01",
    participation: 50,
    restricted: true,
    coachNote: "Manual restriction",
  };
  const activePlan = {
    id: "plan-active",
    playerId: "p1",
    startDate: "2026-06-01",
    rtpPhase: "phase-3",
    clearance: { doctor: true, physio: true, coach: false },
    gates: { sprint: "pass", gym: "monitor", contact: "pass" },
    cleared: false,
  };
  const olderPlan = { id: "plan-old", playerId: "p1" };
  const recordsByDate = new Map([
    ["2026-06-07", currentRecord],
    ["2026-06-06", { id: "window-1", participation: 100 }],
    ["2026-06-05", { id: "window-2", participation: 50 }],
  ]);

  const selectors = createMedicalProfileSummarySelectors({
    getActiveMedicalInjuryPlan: (playerId, dateValue) =>
      playerId === "p1" && dateValue === "2026-06-07" ? activePlan : null,
    getLatestMedicalRecord: (playerId, dateValue) => (playerId === "p1" ? recordsByDate.get(dateValue) ?? null : null),
    getMedicalCoachComment: (record) => record?.coachNote ?? "",
    getMedicalDaySpan: () => 7,
    getMedicalPastWindowDates: () => ["2026-06-07", "2026-06-06", "2026-06-05"],
    getMedicalPlayerInjuryPlans: () => [olderPlan],
    getMedicalPlayerRecords: () => [manualRecord, { id: "record-open", restricted: false }],
    getMedicalRecordStatus: (record) => ({ key: "modified", label: `${record.participation}% modified` }),
    getMedicalRtpPhaseOption: (phase) => ({ label: `RTP ${phase}` }),
    isMedicalPlanCleared: (plan) => plan.cleared === true,
    isMedicalRestrictedRecommendationRecord: (record) => record.restricted === true,
    medicalClearanceRoles: [{ key: "doctor" }, { key: "physio" }, { key: "coach" }],
    medicalLoadGateOptions: [{ key: "sprint" }, { key: "gym" }, { key: "contact" }],
    normalizeMedicalClearance: (clearance) => clearance ?? {},
    normalizeMedicalLoadGates: (gates) => gates ?? {},
  });

  const summary = selectors.getMedicalPlayerProfileSummary(player, "2026-06-07");

  expect(summary.currentRecord).toBe(currentRecord);
  expect(summary.status).toEqual({ key: "modified", label: "75% modified" });
  expect(summary.phaseLabel).toBe("RTP phase-2");
  expect(summary.plans).toEqual([olderPlan]);
  expect(summary.activePlan).toBe(activePlan);
  expect(summary.primaryPlan).toBe(activePlan);
  expect(summary.windowAverage).toBe(75);
  expect(summary.windowLoggedCount).toBe(3);
  expect(summary.manualLogCount).toBe(1);
  expect(summary.latestManualRecord).toBe(manualRecord);
  expect(summary.activeDays).toBe(7);
  expect(summary.signOffCount).toBe(2);
  expect(summary.gatePassCount).toBe(2);
  expect(summary.coachNote).toBe("Limit high-speed exposure");
  expect(summary.cleared).toBe(false);
});
