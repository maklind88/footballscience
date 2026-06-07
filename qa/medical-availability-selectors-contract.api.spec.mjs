import { expect, test } from "@playwright/test";
import { createMedicalAvailabilitySelectors } from "../src/modules/medical/index.mjs";

test("Medical availability selectors preserve sorted availability item semantics", () => {
  let ensured = 0;
  const players = [
    { id: "p3", name: "Charlie" },
    { id: "p1", name: "Alex" },
    { id: "p2", name: "Bea" },
    { id: "p4", name: "Dana" },
  ];
  const records = new Map([
    ["p1", { participation: 100, status: "full" }],
    ["p2", { participation: 50, status: "controlled" }],
    ["p3", { participation: 0, status: "unavailable" }],
  ]);

  const selectors = createMedicalAvailabilitySelectors({
    compareMedicalPlayers: (first, second) => first.name.localeCompare(second.name),
    ensureMedicalState: () => {
      ensured += 1;
    },
    getActiveMedicalPlayersForDate: (dateValue) => (dateValue === "2026-06-07" ? players.slice() : []),
    getLatestMedicalRecord: (playerId) => records.get(playerId) ?? null,
    getMedicalRecordStatus: (record) => (record ? { key: record.status, label: record.status } : { key: "missing", label: "Not set" }),
  });

  const items = selectors.getMedicalAvailabilityItems("2026-06-07");

  expect(ensured).toBe(1);
  expect(items.map((item) => [item.player.name, item.participation, item.status.key])).toEqual([
    ["Charlie", 0, "unavailable"],
    ["Bea", 50, "controlled"],
    ["Alex", 100, "full"],
    ["Dana", null, "missing"],
  ]);
});
