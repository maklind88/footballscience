import { expect, test } from "@playwright/test";
import { createMedicalOperationsSelectors } from "../src/modules/medical/index.mjs";

test("Medical operations selectors build read-only operations summaries without owning writes", () => {
  const state = {
    players: [
      { id: "p1", name: "Mak Player", position: "CM" },
      { id: "p2", name: "Ava Defender", position: "CB" },
      { id: "p-guest", name: "Guest Risk", position: "FW", rosterType: "guest", countsInSquad: false },
      { id: "p3", name: "Archived Player", position: "ST", archivedAt: "2026-05-01T08:00:00.000Z" },
      { id: "p4", name: "Duplicate History", position: "FW" },
    ],
    records: [
      {
        id: "r1",
        playerId: "p1",
        date: "2026-05-31",
        participation: 75,
        actualParticipation: 100,
        status: "modified",
        rtpPhase: "phase-2",
        shareWithCoach: true,
        updatedAt: "2026-05-31T12:00:00.000Z",
      },
      {
        id: "r2",
        playerId: "p2",
        date: "2026-05-31",
        participation: 100,
        actualParticipation: "not-logged",
        status: "full",
        rtpPhase: "full",
        shareWithCoach: false,
        updatedAt: "2026-05-31T11:00:00.000Z",
      },
      {
        id: "r-guest",
        playerId: "p-guest",
        date: "2026-05-31",
        participation: 0,
        actualParticipation: "not-logged",
        status: "unavailable",
        rtpPhase: "medical-restriction",
        shareWithCoach: false,
        updatedAt: "2026-05-31T10:00:00.000Z",
      },
      {
        id: "r-duplicate-old",
        playerId: "p4",
        date: "2026-05-30",
        participation: 0,
        actualParticipation: "not-logged",
        status: "unavailable",
        rtpPhase: "medical-restriction",
        shareWithCoach: false,
        updatedAt: "2026-05-30T08:00:00.000Z",
      },
      {
        id: "r-duplicate-latest",
        playerId: "p4",
        date: "2026-05-30",
        participation: 25,
        actualParticipation: "not-logged",
        status: "modified",
        rtpPhase: "rehab",
        shareWithCoach: true,
        updatedAt: "2026-05-30T11:00:00.000Z",
      },
      {
        id: "r-duplicate-mid",
        playerId: "p4",
        date: "2026-05-30",
        participation: 10,
        actualParticipation: "not-logged",
        status: "modified",
        rtpPhase: "rehab",
        shareWithCoach: false,
        updatedAt: "2026-05-30T09:00:00.000Z",
      },
    ],
    injuryPlans: [
      {
        id: "plan-1",
        playerId: "p1",
        startDate: "2026-05-20",
        endDate: "2026-06-10",
        participation: 100,
        injuryType: "Hamstring",
        rtpPhase: "phase-2",
        shareWithCoach: true,
        updatedAt: "2026-05-30T08:00:00.000Z",
      },
      {
        id: "plan-archived",
        playerId: "p3",
        startDate: "2026-05-10",
        endDate: "2026-05-12",
        participation: 0,
        injuryType: "Old case",
        rtpPhase: "phase-1",
        archivedAt: "2026-05-13T08:00:00.000Z",
      },
    ],
  };
  let ensureCount = 0;
  const selectors = createMedicalOperationsSelectors({
    compareMedicalPlayers: (first, second) => first.name.localeCompare(second.name),
    ensureMedicalState: () => {
      ensureCount += 1;
    },
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getActiveMedicalInjuryPlan: (playerId, dateValue) =>
      state.injuryPlans.find((plan) => plan.playerId === playerId && plan.startDate <= dateValue && plan.endDate >= dateValue && !plan.archivedAt) ?? null,
    getLatestMedicalRecord: (playerId, dateValue) => state.records.find((record) => record.playerId === playerId && record.date === dateValue) ?? null,
    getMedicalAvailabilityItems: (dateValue) =>
      state.players
        .filter((player) => !player.archivedAt)
        .map((player) => {
          const record = state.records.find((candidate) => candidate.playerId === player.id && candidate.date === dateValue) ?? null;
          return {
            player,
            record,
            participation: record?.participation ?? 100,
          };
        }),
    getMedicalPlanClearanceSummary: () => ({ isCleared: false, signOffCount: 0, gatePassCount: 0, gateFailCount: 1, gateMonitorCount: 0 }),
    getMedicalPlanDaysRemaining: () => 10,
    getMedicalPlanElapsedDays: () => 5,
    getMedicalPlanReviewState: () => ({ key: "due", label: "Review due", severity: 2 }),
    getMedicalPlanSeverity: () => ({ key: "minor", label: "Minor", tone: "low", weight: 2 }),
    getMedicalPlanTotalDays: () => 22,
    getMedicalPlayerInjuryPlans: (playerId) => state.injuryPlans.filter((plan) => plan.playerId === playerId && !plan.archivedAt),
    getMedicalRecordStatus: (record) => ({ key: record?.status || "not-set", label: record?.status === "full" ? "Full" : "Modified" }),
    getMedicalRtpPhaseOption: () => ({ label: "Return to train" }),
    getMedicalState: () => state,
    getMedicalTodayValue: () => "2026-05-31",
    getMedicalTrailingRecommendationSummary: (playerId) =>
      playerId === "p1"
        ? { records: [1, 2, 3], modifiedDays: 3, unavailableDays: 0, exceededCount: 1, average: 80 }
        : { records: [], modifiedDays: 0, unavailableDays: 0, exceededCount: 0, average: null },
    getSelectedDate: () => "2026-05-31",
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    isMedicalInjuryPlanActive: (plan, dateValue) => plan.startDate <= dateValue && plan.endDate >= dateValue && !plan.archivedAt,
    isMedicalItemArchived: (item) => Boolean(item?.archivedAt),
    medicalActualParticipationFallback: "not-logged",
    parseDateValue: (value) => new Date(value),
  });

  const activeCases = selectors.getMedicalActiveCaseItems("2026-05-31");
  expect(activeCases).toHaveLength(1);
  expect(activeCases[0].player.name).toBe("Mak Player");

  const history = selectors.getMedicalHistoryEvents();
  expect(history.map((event) => event.type)).toContain("Recommendation");
  expect(history.find((event) => event.id === "r1")?.title).toContain("75%");
  expect(history.find((event) => event.id === "r2")).toBeUndefined();
  expect(history.find((event) => event.id === "plan-1")).toBeUndefined();
  expect(history.find((event) => event.id === "r-duplicate-old")).toBeUndefined();
  expect(history.find((event) => event.id === "r-duplicate-mid")).toBeUndefined();
  expect(history.find((event) => event.id === "r-duplicate-latest")?.title).toContain("25%");

  const season = selectors.getMedicalSeasonSummary("2026-05-31");
  expect(season.plans).toHaveLength(1);
  expect(season.minor).toBe(1);
  expect(season.topPlayerDays[0].player.name).toBe("Mak Player");

  const signal = selectors.getMedicalPlayerRiskSignal(state.players[0], "2026-05-31");
  expect(signal.actionLabel).toBe("Action required");
  expect(signal.primaryActionDriver).toBe("Actual exceeded recommendation");

  const summary = selectors.getMedicalOperationsSummary("2026-05-31");
  expect(summary.actionRequired).toBe(1);
  expect(summary.signals.map((item) => item.player.name)).not.toContain("Guest Risk");
  expect(summary.clearanceBlockers).toHaveLength(1);
  expect(summary.actualMissing).toBe(1);
  expect(ensureCount).toBeGreaterThan(0);
});

test("Medical operations keep clinical case calculations anchored to today while availability can view another date", () => {
  const state = {
    players: [{ id: "p1", name: "Current Injury", position: "DF" }],
    records: [],
    injuryPlans: [
      {
        id: "plan-current",
        playerId: "p1",
        startDate: "2026-06-05",
        endDate: "2026-06-20",
        reviewDate: "2026-06-12",
        participation: 0,
        injuryType: "ACL injury",
        rtpPhase: "medical-restriction",
        updatedAt: "2026-06-05T10:00:00.000Z",
        createdAt: "2026-06-05T10:00:00.000Z",
      },
    ],
  };
  const isDateValue = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const daySpan = (startDate, endDate) => {
    if (!isDateValue(startDate) || !isDateValue(endDate)) {
      return null;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((new Date(`${endDate}T00:00:00.000Z`) - new Date(`${startDate}T00:00:00.000Z`)) / dayMs) + 1);
  };
  const selectors = createMedicalOperationsSelectors({
    compareMedicalPlayers: (first, second) => first.name.localeCompare(second.name),
    ensureMedicalState: () => {},
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getActiveMedicalInjuryPlan: (playerId, dateValue) =>
      state.injuryPlans.find((plan) => plan.playerId === playerId && plan.startDate <= dateValue && plan.endDate >= dateValue) ?? null,
    getLatestMedicalRecord: () => null,
    getMedicalAvailabilityItems: () => [],
    getMedicalPlanClearanceSummary: () => ({ isCleared: false, signOffCount: 0, gatePassCount: 0, gateFailCount: 0, gateMonitorCount: 0 }),
    getMedicalPlanDaysRemaining: (plan, dateValue) => daySpan(dateValue, plan.endDate),
    getMedicalPlanElapsedDays: (plan, dateValue) => daySpan(plan.startDate, dateValue),
    getMedicalPlanReviewState: (plan, dateValue) =>
      plan.reviewDate <= dateValue ? { key: "due", label: "Review due", severity: 2 } : { key: "scheduled", label: "Review scheduled", severity: 0 },
    getMedicalPlanSeverity: () => ({ key: "major", label: "Major", tone: "high", weight: 4 }),
    getMedicalPlanTotalDays: (plan) => daySpan(plan.startDate, plan.endDate),
    getMedicalPlayerInjuryPlans: (playerId) => state.injuryPlans.filter((plan) => plan.playerId === playerId),
    getMedicalRecordStatus: () => ({ key: "not-set", label: "Not set" }),
    getMedicalRtpPhaseOption: () => ({ label: "Medical restriction" }),
    getMedicalState: () => state,
    getMedicalTodayValue: () => "2026-06-10",
    getMedicalTrailingRecommendationSummary: () => ({ records: [], modifiedDays: 0, unavailableDays: 0, exceededCount: 0, average: null }),
    getSelectedDate: () => "2026-06-01",
    isMedicalDateValue: isDateValue,
    isMedicalInjuryPlanActive: (plan, dateValue) => plan.startDate <= dateValue && plan.endDate >= dateValue,
    isMedicalItemArchived: () => false,
    medicalActualParticipationFallback: "not-logged",
    parseDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
  });

  expect(selectors.getMedicalActiveCaseItems()).toHaveLength(1);
  expect(selectors.getMedicalActiveCaseItems("2026-06-01")).toHaveLength(0);

  const summary = selectors.getMedicalOperationsSummary("2026-06-01");
  expect(summary.selectedDate).toBe("2026-06-01");
  expect(summary.clinicalDate).toBe("2026-06-10");
  expect(summary.activeCases).toHaveLength(1);
  expect(summary.activeCases[0].elapsedDays).toBe(6);
  expect(summary.activeCases[0].daysRemaining).toBe(11);
  expect(summary.signals[0].activePlan.id).toBe("plan-current");
  expect(summary.season.activeCount).toBe(1);
});
