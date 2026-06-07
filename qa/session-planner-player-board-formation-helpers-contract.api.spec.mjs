import { expect, test } from "@playwright/test";
import { createSessionPlannerPlayerBoardFormationHelpers } from "../src/modules/session-planner/index.mjs";

const roleOrder = { goalkeeper: 0, defender: 1, midfielder: 2, forward: 3 };
const roleGroups = {
  GK: { roleKey: "goalkeeper", side: "center", x: 12 },
  CB: { roleKey: "defender", side: "center", x: 35 },
  LB: { roleKey: "defender", side: "left", x: 35 },
  CM: { roleKey: "midfielder", side: "center", x: 58 },
  LW: { roleKey: "forward", side: "left", x: 82 },
  ST: { roleKey: "forward", side: "center", x: 82 },
};

function createHelpers() {
  return createSessionPlannerPlayerBoardFormationHelpers({
    autoModeOptions: [{ key: "balanced" }, { key: "best-xi" }, { key: "relations" }, { key: "rotation" }],
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    getCareerScore: (player = {}) => player.career ?? 60,
    getDirectRoleFitScore: (player = {}, slot = {}) => (getRole(player).roleKey === slot.roleKey ? 90 : 35),
    getImportanceScore: (player = {}) => player.importance ?? 50,
    getItemPriorityScore: (item = {}) => item.player?.priority ?? 0,
    getMinutesScore: (player = {}) => player.minutes ?? 0,
    getPlayerInitials: (player = {}) => String(player.name || "P").split(/\s+/).map((word) => word[0]).join("").toUpperCase(),
    getPlayerRoleProfile: getRole,
    getPositionGroup: (player = {}) => {
      const role = getRole(player);
      return { key: role.roleKey, x: role.x };
    },
    getPriorityScore: (item = {}) => item.player?.priority ?? 0,
    getRoleOrder: (roleKey) => roleOrder[roleKey] ?? 2,
    getRolePriorityValue: (player = {}, slot = {}) => (getRole(player).roleKey === slot.roleKey ? 85 : 0),
    maxTeamCount: 4,
  });
}

function getRole(player = {}) {
  const key = String(player.primaryRole || player.role || "CM").toUpperCase();
  const role = roleGroups[key] ?? roleGroups.CM;
  return { ...role, roleOrder: roleOrder[role.roleKey] ?? 2 };
}

function item(id, primaryRole, priority, extra = {}) {
  return {
    player: {
      id,
      name: id.toUpperCase(),
      primaryRole,
      priority,
      ...extra,
    },
  };
}

test("Session Planner Player Board formation helpers parse formations and create stable slots", () => {
  const helpers = createHelpers();

  expect(helpers.cleanFormationInput(" 3 x 3 -- 1! ")).toBe("3-3-1");
  expect(helpers.normalizeFormationValue("4×2–3")).toBe("4-2-3");
  expect(helpers.parseFormation("3-3-1")).toEqual([3, 3, 1]);
  expect(helpers.normalizeTeamCount(99)).toBe(4);
  expect(helpers.normalizeAutoMode("unknown")).toBe("balanced");

  const slots = helpers.createFormationSlots([3, 3, 1], true);
  expect(slots).toHaveLength(8);
  expect(slots[0]).toMatchObject({ roleKey: "goalkeeper", side: "center", x: 50, y: 80 });
  expect(slots.some((slot) => slot.roleKey === "forward" && slot.side === "center")).toBe(true);
});

test("Session Planner Player Board formation helpers keep default positions and relations deterministic", () => {
  const helpers = createHelpers();
  const players = [item("gk", "GK", 95), item("cb", "CB", 70), item("lw", "LW", 88)];

  expect(helpers.getDefaultPosition(players[0], 0, players)).toMatchObject({ x: 12 });
  expect(helpers.getDefaultPosition(players[2], 2, players)).toMatchObject({ x: 82 });
  expect(helpers.getRelationLookupValue({ LW: 12, lw: 18 }, { id: "lw", name: "LW" })).toBe(18);
  expect(
    helpers.getRelationLookupValue([{ playerId: "cb", sharedMinutes: 45 }], { id: "cb", name: "CB" })
  ).toBe(45);
});

test("Session Planner Player Board formation helpers assign balanced teams and formation positions", () => {
  const helpers = createHelpers();
  const players = [
    item("gk1", "GK", 100),
    item("gk2", "GK", 98),
    item("cb1", "CB", 90),
    item("cb2", "CB", 84),
    item("cm1", "CM", 82),
    item("cm2", "CM", 80),
    item("lw1", "LW", 78),
    item("st1", "ST", 72),
  ];
  const formation = [2, 1];

  const teamAssignments = helpers.assignAutoTeams(players, 2, "balanced", {});
  expect(new Set(teamAssignments.map((assignment) => assignment.teamIndex))).toEqual(new Set([0, 1]));

  const positionedAssignments = helpers.assignAutoFormationTeams(players, 2, "best-xi", {}, formation);
  expect(positionedAssignments).toHaveLength(players.length);
  expect(positionedAssignments.every((assignment) => Number.isFinite(assignment.position.x))).toBe(true);
  expect(positionedAssignments.some((assignment) => assignment.playerId === "gk1" && assignment.position.y >= 70)).toBe(true);
});
