import { expect, test } from "@playwright/test";
import { createMedicalPlanSelectors } from "../src/modules/medical/index.mjs";

const daySpan = (startValue, endValue) => {
  if (!startValue || !endValue) {
    return null;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((new Date(endValue) - new Date(startValue)) / dayMs) + 1);
};

test("Medical plan selectors preserve plan timing, severity, clearance, review, and trailing summaries", () => {
  const records = [
    { playerId: "p1", date: "2026-05-29", participation: 100, actualParticipation: "not-logged" },
    { playerId: "p1", date: "2026-05-30", participation: 75, actualParticipation: 100 },
    { playerId: "p1", date: "2026-05-31", participation: 0, actualParticipation: 0 },
  ];
  const selectors = createMedicalPlanSelectors({
    formatMedicalDateLabel: (value) => `Label ${value}`,
    getLatestMedicalRecord: (playerId, dateValue) =>
      records.find((record) => record.playerId === playerId && record.date === dateValue) ?? null,
    getMedicalDaySpan: daySpan,
    getMedicalPastWindowDates: () => ["2026-05-29", "2026-05-30", "2026-05-31"],
    getSelectedDate: () => "2026-05-31",
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")),
    isMedicalPlanCleared: (plan) => plan?.cleared === true,
    medicalActualParticipationFallback: "not-logged",
    medicalClearanceRoles: [{ key: "doctor" }, { key: "physio" }, { key: "coach" }],
    medicalLoadGateOptions: [{ key: "pain" }, { key: "strength" }, { key: "running" }],
    normalizeMedicalClearance: (clearance = {}) => ({
      doctor: Boolean(clearance.doctor),
      physio: Boolean(clearance.physio),
      coach: Boolean(clearance.coach),
    }),
    normalizeMedicalLoadGates: (gates = {}) => ({
      pain: gates.pain || "monitor",
      strength: gates.strength || "monitor",
      running: gates.running || "monitor",
    }),
    parseDateValue: (value) => new Date(value),
  });

  const plan = {
    startDate: "2026-05-20",
    endDate: "2026-06-10",
    participation: 75,
    reviewDate: "2026-06-03",
    clearance: { doctor: true, physio: true },
    gates: { pain: "pass", strength: "fail", running: "monitor" },
    cleared: false,
  };

  expect(selectors.getMedicalPlanTotalDays(plan)).toBe(22);
  expect(selectors.getMedicalPlanElapsedDays(plan, "2026-05-31")).toBe(12);
  expect(selectors.getMedicalPlanDaysRemaining(plan, "2026-05-31")).toBe(11);
  expect(selectors.getMedicalPlanSeverity(plan)).toMatchObject({ key: "moderate", weight: 3 });
  expect(selectors.getMedicalPlanClearanceSummary(plan)).toEqual({
    signOffCount: 2,
    gatePassCount: 1,
    gateFailCount: 1,
    gateMonitorCount: 1,
    isCleared: false,
  });
  expect(selectors.getMedicalPlanReviewState(plan, "2026-05-31")).toEqual({
    key: "due",
    label: "Review Label 2026-06-03",
    severity: 2,
    daysUntil: 3,
  });

  const trailing = selectors.getMedicalTrailingRecommendationSummary("p1", "2026-05-31");
  expect(trailing.modifiedDays).toBe(1);
  expect(trailing.unavailableDays).toBe(1);
  expect(trailing.exceededCount).toBe(1);
  expect(trailing.average).toBe(58);
});
