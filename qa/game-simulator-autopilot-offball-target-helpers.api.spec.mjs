import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballTargetHelpers } from "../src/modules/game-simulator/autopilot-offball-target-helpers.mjs";

function createTargetHelperDeps(overrides = {}) {
  const state = {
    players: [
      { id: "H1", team: "home", role: "Pivot", position: { x: 36, y: 32 } },
      { id: "H2", team: "home", role: "Left Winger", position: { x: 45, y: 14 } },
      { id: "H3", team: "home", role: "Right Winger", position: { x: 48, y: 54 } },
      { id: "A1", team: "away", role: "Centre Back", position: { x: 64, y: 34 } },
    ],
  };
  const pitch = { length: 105, width: 68 };
  return {
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAutoPilotRoleStrength: (player) => (player.id === "H3" ? 0.9 : 0.4),
    getDepthX: (teamId, depth) => (teamId === "home" ? depth : pitch.length - depth),
    getOffensiveRoleKey: (player) => {
      if (player.role.includes("Winger")) {
        return "wideForward";
      }
      if (player.role.includes("Pivot")) {
        return "pivot";
      }
      return "connector";
    },
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot offball target helpers expose shared contracts", () => {
  const helpers = createGameSimulatorAutopilotOffballTargetHelpers(createTargetHelperDeps());

  expect(typeof helpers.getMovableAutopilotPlayerByRoles).toBe("function");
  expect(typeof helpers.getMovableAutopilotPlayerByRolesOnSide).toBe("function");
  expect(typeof helpers.setAutopilotPrincipleTarget).toBe("function");
  expect(typeof helpers.getDepthPoint).toBe("function");
});

test("game simulator autopilot offball target helpers preserve role and side selection", () => {
  const helpers = createGameSimulatorAutopilotOffballTargetHelpers(createTargetHelperDeps());
  const targets = new Map([
    ["H1", { x: 36, y: 32 }],
    ["H2", { x: 45, y: 14 }],
    ["H3", { x: 48, y: 54 }],
  ]);

  expect(helpers.getMovableAutopilotPlayerByRoles("home", ["wideForward"], targets).id).toBe("H3");
  expect(helpers.getMovableAutopilotPlayerByRolesOnSide("home", ["wideForward"], targets, new Set(), -1).id).toBe("H2");
});

test("game simulator autopilot offball target helpers clamp assigned targets and depth points", () => {
  const helpers = createGameSimulatorAutopilotOffballTargetHelpers(createTargetHelperDeps());
  const targets = new Map([["H1", { x: 36, y: 32 }]]);
  const player = { id: "H1", team: "home" };

  expect(helpers.setAutopilotPrincipleTarget(targets, player, { x: 120, y: -4 })).toBe(true);
  expect(targets.get("H1")).toEqual({ x: 105, y: 0 });
  expect(helpers.getDepthPoint("away", 22, { y: 72 })).toEqual({ x: 83, y: 68 });
});
