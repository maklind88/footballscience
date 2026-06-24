import { expect, test } from "@playwright/test";
import { createMedicalOperationsSelectors } from "../src/modules/medical/index.mjs";

test("Medical operations selectors build read-only operations summaries without owning writes", () => {
  const state = {
    players: [
      { id: "p1", name: "Mak Player", position: "CM" },
      { id: "p2", name: "Ava Defender", position: "CB" },
      { id: "p3", name: "Archived Player", position: "ST", archivedAt: "2026-05-01T08:00:00.000Z" },
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

  const season = selectors.getMedicalSeasonSummary("2026-05-31");
  expect(season.plans).toHaveLength(1);
  expect(season.minor).toBe(1);
  expect(season.topPlayerDays[0].player.name).toBe("Mak Player");

  const signal = selectors.getMedicalPlayerRiskSignal(state.players[0], "2026-05-31");
  expect(signal.actionLabel).toBe("Action required");
  expect(signal.primaryActionDriver).toBe("Actual exceeded recommendation");

  const summary = selectors.getMedicalOperationsSummary("2026-05-31");
  expect(summary.actionRequired).toBe(1);
  expect(summary.clearanceBlockers).toHaveLength(1);
  expect(summary.actualMissing).toBe(1);
  expect(ensureCount).toBeGreaterThan(0);
});
