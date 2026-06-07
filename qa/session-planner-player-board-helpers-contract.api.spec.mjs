import { expect, test } from "@playwright/test";
import {
  createSessionPlannerPlayerBoardHelpers,
  sessionPlannerPlayerBoardPositionGroups,
} from "../src/modules/session-planner/index.mjs";

function createHelpers(overrides = {}) {
  const session = {
    blocks: [
      { id: "target", title: "Target", playerBoardColors: { p1: "#0055cc" } },
      { id: "copy", title: "Pressing Game", playerBoardPositions: { p2: { x: 44, y: 52 } } },
      { id: "empty", title: "Empty" },
    ],
  };
  return createSessionPlannerPlayerBoardHelpers({
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    getSelectedSession: () => session,
    normalizeColor: (value = "", fallback = "") => (/^#[0-9a-f]{6}$/i.test(String(value)) ? value : fallback),
    normalizePlayerProfileRole: (value = "") => String(value || "").trim().toUpperCase(),
    ...overrides,
  });
}

test("Session Planner Player Board helpers classify roles, sides, and position groups", () => {
  const helpers = createHelpers();

  expect(sessionPlannerPlayerBoardPositionGroups.map((group) => group.key)).toEqual([
    "goalkeeper",
    "defender",
    "midfielder",
    "forward",
  ]);
  expect(helpers.getRoleGroupForRole("LB")).toBe("defender");
  expect(helpers.getSideForRole("RW")).toBe("right");
  expect(helpers.normalizeRoleGroupKey("målvakt")).toBe("goalkeeper");
  expect(helpers.getPositionGroup({ primaryRole: "LW" })).toMatchObject({ key: "forward" });
  expect(helpers.getPlayerRoleProfile({ primaryRole: "LB" })).toMatchObject({
    roleKey: "defender",
    side: "left",
  });
});

test("Session Planner Player Board helpers rank role fit, squad status, and career phase", () => {
  const helpers = createHelpers();
  const slot = { roleKey: "forward", side: "left" };
  const widePlayer = {
    primaryRole: "LW",
    roleFit: { LW: 91 },
    squadStatus: "important",
    careerPhase: "peak",
    seasonMinutes: 1200,
  };
  const centerBack = {
    primaryRole: "CB",
    squadStatus: "depth",
    careerPhase: "developing",
    seasonMinutes: 120,
  };

  expect(helpers.getDirectRoleFitScore(widePlayer, slot)).toBe(100);
  expect(helpers.getSquadStatusPriority("squad-depth")).toBe(48);
  expect(helpers.getCareerPhasePriority("experienced")).toBe(86);
  expect(helpers.getPriorityScore({ player: widePlayer }, slot)).toBeGreaterThan(
    helpers.getPriorityScore({ player: centerBack }, slot)
  );
});

test("Session Planner Player Board helpers keep labels, colors, and source blocks deterministic", () => {
  const helpers = createHelpers();
  const labels = helpers.getInitialLabelMap([
    { player: { id: "p1", name: "Mak Lind" } },
    { player: { id: "p2", name: "Mia Larsen" } },
  ]);

  expect(labels.get("p1")).toBe("MLI");
  expect(labels.get("p2")).toBe("MLA");
  expect(helpers.getTone(75)).toBe("modified");
  expect(helpers.getTextColor("#ffffff")).toBe("#1d1d1f");
  expect(helpers.getColorStyle("#123456")).toContain("--session-player-board-text: #ffffff");
  expect(helpers.getSourceBlocks({ id: "target" }).map(({ block }) => block.id)).toEqual(["copy"]);
  expect(helpers.getSourceLabel({ title: "Pressing Game" }, 1)).toBe("Block 2: Pressing Game");
});
