import { expect, test } from "@playwright/test";
import { createSessionPlannerMedicalAvailabilitySelectors } from "../src/modules/session-planner/index.mjs";

test("Session Planner medical availability selectors preserve medical, temporary, and summary semantics", () => {
  const profiles = [
    { id: "tmp-1", name: "Temporary Active", temporary: true, active: true },
    { id: "tmp-2", name: "Existing Temporary", temporary: true, active: true },
    { id: "tmp-3", name: "Inactive Temporary", temporary: true, active: false },
    { id: "p4", name: "Permanent", temporary: false, active: true },
  ];
  const medicalItems = [
    { player: { id: "p1", name: "Full" }, record: { participation: 100 }, participation: 100 },
    { player: { id: "p2", name: "Limited" }, record: { participation: 50 }, participation: 50 },
    { player: { id: "p3", name: "Unconfirmed" }, record: null, participation: null },
    { player: { id: "tmp-2", name: "Existing Temporary", temporary: true }, record: null, participation: null },
    { player: { id: "blocked", name: "Blocked" }, record: { participation: 100 }, participation: 100 },
  ];

  const selectors = createSessionPlannerMedicalAvailabilitySelectors({
    buildMedicalPlayerFromPlayerProfile: (profile) => ({ ...profile, medicalPlayerId: profile.id }),
    createMedicalRecordFromSquadAvailabilityBlock: (player) =>
      player.id === "tmp-1" ? { participation: 100, status: "full" } : null,
    getMedicalAvailabilityItems: () => medicalItems,
    getMedicalRecordStatus: (record) => ({ key: record.status, label: record.status }),
    getSessionPlannerPlayerBoardProfileState: () => ({ players: profiles }),
    getSessionPlannerPlayerBoardSyncedPlayer: (player) => player,
    isMedicalPlayerBlockedBySquadAvailability: (player) => ["blocked", "tmp-3"].includes(player.id),
    isTemporaryPlayerProfile: (player) => player.temporary === true,
  });

  const availability = selectors.getMedicalAvailability("2026-06-07");

  expect(availability.all.map((item) => item.player.id)).toEqual(["p1", "p2", "p3", "tmp-2", "tmp-1"]);
  expect(availability.all.find((item) => item.player.id === "tmp-2")).toMatchObject({
    participation: 100,
    planningOnly: true,
    status: { key: "planning-guest" },
  });
  expect(availability.limited.map((item) => item.player.id)).toEqual(["p2"]);
  expect(availability.available.map((item) => item.player.id)).toEqual(["p1", "tmp-2", "tmp-1"]);
  expect(availability.unconfirmed.map((item) => item.player.id)).toEqual(["p3"]);
});
