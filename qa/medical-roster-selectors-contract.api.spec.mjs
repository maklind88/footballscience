import { expect, test } from "@playwright/test";
import { createMedicalRosterSelectors, medicalPositionOrder } from "../src/modules/medical/index.mjs";

test("Medical roster selectors preserve position grouping order and per-position stats", () => {
  const players = [
    { id: "p3", name: "Cara", number: "9", position: "Forward" },
    { id: "p1", name: "Alex", number: "1", position: "Goalkeeper" },
    { id: "p2", name: "Bea", number: "5", position: "Defender" },
    { id: "p4", name: "Dana", number: "11", position: "Forward" },
  ];
  const records = new Map([
    ["p1", { participation: 100 }],
    ["p2", { participation: 0 }],
    ["p3", { participation: 75 }],
  ]);

  const selectors = createMedicalRosterSelectors({
    compareMedicalPlayers: (first, second) => Number(first.number) - Number(second.number),
    getLatestMedicalRecord: (playerId, dateValue) => (dateValue === "2026-06-07" ? records.get(playerId) ?? null : null),
    getMedicalPlayerPositionRank: (player) => medicalPositionOrder[player.position] ?? 99,
    getSelectedDate: () => "2026-06-07",
    medicalPositionOrder,
    normalizeMedicalPlayerPosition: (value) => value || "Unassigned",
  });

  const groups = selectors.getMedicalRosterPositionGroups(players);

  expect(groups.map((group) => group.position)).toEqual(["Goalkeeper", "Defender", "Forward"]);
  expect(groups.find((group) => group.position === "Forward").players.map((player) => player.number)).toEqual(["9", "11"]);
  expect(selectors.getMedicalRosterPositionStats(players)).toEqual({
    total: 4,
    logged: 3,
    full: 1,
    modified: 1,
    unavailable: 1,
    missing: 1,
  });
});
