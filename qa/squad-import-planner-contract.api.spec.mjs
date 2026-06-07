import { expect, test } from "@playwright/test";
import { createSquadImportPlanner, getImportedSquadPlayersFromPayload } from "../src/modules/squad/index.mjs";

const existingPlayers = [
  {
    id: "p1",
    name: "Existing Player",
    number: "8",
    primaryRole: "8",
    secondaryRoles: [],
    preferredSide: "right",
    roleGroup: "midfield",
    rosterType: "squad",
    countsInSquad: true,
  },
];

function createPlanner() {
  return createSquadImportPlanner({
    ensureState: () => {},
    getPlayers: () => existingPlayers,
    normalizeProfile: (source) => ({
      secondaryRoles: [],
      rosterType: "squad",
      countsInSquad: true,
      ...source,
      name: String(source.name || "").trim(),
    }),
    normalizeName: (value) => String(value || "").trim().toLowerCase(),
    validateProfile: (player) => {
      if (!player.name) {
        return { ok: false, errors: ["Name is required."], warnings: [] };
      }
      return {
        ok: true,
        player,
        errors: [],
        warnings: player.primaryRole ? [] : ["Primary role missing."],
      };
    },
    createId: () => "player-profile-created",
    getNow: () => "2026-06-07T12:00:00.000Z",
  });
}

test("Squad import planner reads supported payload shapes", () => {
  expect(getImportedSquadPlayersFromPayload({ players: [{ id: "direct" }] })).toEqual([{ id: "direct" }]);
  expect(getImportedSquadPlayersFromPayload({ sessionPlanner: { players: [{ id: "contract" }] } })).toEqual([
    { id: "contract" },
  ]);
  expect(getImportedSquadPlayersFromPayload({ state: { players: [{ id: "state" }] } })).toEqual([{ id: "state" }]);
  expect(getImportedSquadPlayersFromPayload({ bad: true })).toEqual([]);
});

test("Squad import planner builds create, update, duplicate, and error rows without applying writes", () => {
  const planner = createPlanner();
  const plan = planner.buildPlayerProfileImportPlan({
    players: [
      { id: "p1", name: "Existing Player", number: "8", roles: { primaryRole: "6" } },
      { name: "New Player", number: "10", primaryRole: "10" },
      { name: "New Player", number: "10", primaryRole: "10" },
      { number: "99" },
    ],
  });

  expect(plan).toMatchObject({
    ok: true,
    status: "warning",
    sourceRows: 4,
    importedCount: 2,
    createdCount: 1,
    updatedCount: 1,
    skippedCount: 2,
    duplicateRowsCount: 1,
    canApply: true,
  });
  expect(plan.rows.map((row) => row.action)).toEqual(["update", "create", "skip", "skip"]);
  expect(plan.nextPlayers).toHaveLength(2);
  expect(plan.nextPlayers[0]).toMatchObject({ id: "p1", primaryRole: "6" });
  expect(plan.nextPlayers[1]).toMatchObject({ id: "player-profile-created", name: "New Player" });
  expect(plan.profilesForMedicalSync.map((player) => player.id)).toEqual(["p1", "player-profile-created"]);
});

test("Squad import planner returns a non-applicable plan for empty imports", () => {
  const planner = createPlanner();
  const plan = planner.buildPlayerProfileImportPlan({});

  expect(plan).toMatchObject({
    ok: false,
    status: "error",
    importedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    canApply: false,
  });
  expect(plan.errors[0].message).toBe("No players found in import file.");
  expect(plan.nextPlayers).toEqual(existingPlayers);
});
