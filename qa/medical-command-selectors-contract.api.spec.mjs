import { expect, test } from "@playwright/test";
import { createMedicalCommandSelectors } from "../src/modules/medical/index.mjs";

test("Medical command selectors build huddle, attention, position, and handover summaries without writes", () => {
  const players = [
    { id: "p1", name: "Mak Midfielder", position: "CM" },
    { id: "p2", name: "Ava Defender", position: "CB" },
    { id: "p3", name: "Zed Winger", position: "RW" },
  ];
  const records = [
    { playerId: "p1", date: "2026-05-30", status: "full", participation: 100, rtpPhase: "full" },
    { playerId: "p1", date: "2026-05-31", status: "modified", participation: 75, rtpPhase: "phase-2", coachNote: "Limit sprinting" },
    { playerId: "p2", date: "2026-05-30", status: "unavailable", participation: 0, rtpPhase: "medical" },
    { playerId: "p2", date: "2026-05-31", status: "unavailable", participation: 0, rtpPhase: "medical" },
  ];
  let ensureCount = 0;
  const getLatestMedicalRecord = (playerId, dateValue) =>
    records.find((record) => record.playerId === playerId && record.date === dateValue) ?? null;
  const getMedicalRecordStatus = (record) => ({
    key: record?.status || "not-set",
    label: record?.status === "full" ? "Full" : record?.status === "unavailable" ? "Unavailable" : record?.status === "modified" ? "Modified" : "Not set",
  });
  const selectors = createMedicalCommandSelectors({
    compareMedicalPlayers: (first, second) => first.name.localeCompare(second.name),
    ensureMedicalState: () => {
      ensureCount += 1;
    },
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    formatMedicalDateLabel: (value) => `Label ${value}`,
    getActiveMedicalPlayers: () => players,
    getLatestMedicalRecord,
    getMedicalAvailabilityItems: (dateValue) =>
      players.map((player) => {
        const record = getLatestMedicalRecord(player.id, dateValue);
        return {
          player,
          record,
          status: getMedicalRecordStatus(record),
          participation: record?.participation ?? 100,
        };
      }),
    getMedicalCoachComment: (record) => record?.coachNote || "",
    getMedicalMonthToDateDates: () => ["2026-05-30", "2026-05-31"],
    getMedicalPastWindowDates: () => ["2026-05-30", "2026-05-31"],
    getMedicalRecordStatus,
    getMedicalReviewAlerts: () => [{ id: "review-1" }],
    getNow: () => new Date("2026-05-31T12:00:00.000Z"),
    getSelectedDate: () => "2026-05-31",
    medicalPositionOrder: { CB: 2, CM: 3, RW: 7 },
    normalizeMedicalPlayerPosition: (position) => position,
    parseDateValue: (value) => new Date(value),
  });

  expect(selectors.getMedicalDailyStats("2026-05-31")).toMatchObject({
    fullCount: 0,
    modifiedCount: 1,
    unavailableCount: 1,
    unloggedCount: 1,
    averageParticipation: 38,
    loggedCount: 2,
  });
  expect(selectors.getMedicalWindowAverage()).toBe(44);
  expect(selectors.getMedicalMonthAverageStats()).toMatchObject({ averageParticipation: 44, loggedCount: 4, slotCount: 6 });

  const attentionPlayers = selectors.getMedicalAttentionPlayers("2026-05-31");
  expect(attentionPlayers.map((item) => item.player.id)).toEqual(["p3", "p2", "p1"]);

  const positions = selectors.getMedicalPositionSummaries("2026-05-31");
  expect(positions.map((summary) => summary.position)).toEqual(["CB", "CM", "RW"]);
  expect(positions.find((summary) => summary.position === "CM")).toMatchObject({ modified: 1, average: 75 });

  const huddle = selectors.getMedicalDailyHuddle("2026-05-31");
  expect(huddle.changes.map((item) => item.player.id)).toEqual(["p1"]);
  expect(huddle.restricted.map((item) => item.player.id)).toEqual(["p2", "p1"]);
  expect(huddle.needsRecommendation.map((item) => item.player.id)).toEqual(["p3"]);
  expect(huddle.coachHandover.map((item) => item.player.id)).toEqual(["p1"]);
  expect(huddle.reviewAlerts).toHaveLength(1);

  const handover = selectors.buildMedicalCoachHandoverText("2026-05-31");
  expect(handover).toContain("Medical coach-safe handover - Label 2026-05-31");
  expect(handover).toContain("Mak Midfielder: 75% / Modified - Limit sprinting");
  expect(ensureCount).toBeGreaterThan(0);
});

test("Medical command selectors use actual participation for historical averages", () => {
  const players = [
    { id: "p1", name: "Actual Player", position: "CM" },
    { id: "p2", name: "Unlogged Player", position: "CB" },
    { id: "p3", name: "Legacy Player", position: "RW" },
  ];
  const records = [
    { playerId: "p1", date: "2026-05-30", status: "full", participation: 100, actualParticipation: 50 },
    { playerId: "p2", date: "2026-05-30", status: "modified", participation: 75, actualParticipation: "not-logged" },
    { playerId: "p3", date: "2026-05-30", status: "modified", participation: 25 },
  ];
  const selectors = createMedicalCommandSelectors({
    ensureMedicalState: () => {},
    getActiveMedicalPlayers: () => players,
    getLatestMedicalRecord: (playerId, dateValue) =>
      records.find((record) => record.playerId === playerId && record.date === dateValue) ?? null,
    getMedicalMonthToDateDates: () => ["2026-05-30"],
    getMedicalPastWindowDates: () => ["2026-05-30"],
    medicalActualParticipationFallback: "not-logged",
  });

  expect(selectors.getMedicalParticipationAverageForDates(["2026-05-30"])).toMatchObject({
    averageParticipation: 38,
    loggedCount: 2,
    slotCount: 3,
  });
  expect(selectors.getMedicalWindowAverage()).toBe(38);
  expect(selectors.getMedicalMonthAverageStats()).toMatchObject({ averageParticipation: 38, loggedCount: 2 });
});
