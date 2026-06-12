import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveFreeKickTargets } from "../src/modules/game-simulator/autopilot-defensive-free-kick-targets.mjs";

function createFreeKickDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "shot",
      position: { x: 82, y: 34 },
      target: { x: 105, y: 34 },
    },
    draftStep: null,
    restartPhase: { type: "freeKick", teamId: "home", point: { x: 82, y: 34 } },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getRestartActionMeta: () => ({
      actionType: state.ball.actionType,
      target: state.ball.target,
      beforeSnapshot: {
        restartPhase: state.restartPhase,
        ball: { position: state.ball.position },
      },
    }),
    getShotAngleQuality: () => 0.5,
    getWideSideSign: (point) => {
      if (!point || !Number.isFinite(point.y)) {
        return 0;
      }
      return point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0;
    },
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from, to, amount) => {
      const total = Math.hypot(to.x - from.x, to.y - from.y);
      if (!total) {
        return { ...from };
      }
      const ratio = Math.min(1, amount / total);
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    },
    normalize: (from, to) => {
      const total = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: (to.x - from.x) / total, y: (to.y - from.y) / total };
    },
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createFreeKickGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 96, y: 32 } },
      { id: "A5", team: "away", lineKey: "back", label: "CB", position: { x: 95, y: 38 } },
      { id: "A2", team: "away", lineKey: "back", label: "RB", position: { x: 94, y: 25 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 88, y: 33 } },
      { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 87, y: 38 } },
      { id: "A10", team: "away", lineKey: "midfield", label: "10", position: { x: 86, y: 29 } },
      { id: "A7", team: "away", lineKey: "midfield", label: "W", position: { x: 85, y: 24 } },
      { id: "A3", team: "away", lineKey: "midfield", label: "8", position: { x: 84, y: 45 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 77, y: 34 } },
      { id: "A11", team: "away", lineKey: "forward", label: "W", position: { x: 77, y: 19 } },
    ],
  };
}

test("game simulator autopilot defensive free kick targets expose moved free kick contracts", () => {
  const freeKickTargets = createGameSimulatorAutopilotDefensiveFreeKickTargets(createFreeKickDeps());

  expect(typeof freeKickTargets.getDefensiveFreeKickContext).toBe("function");
  expect(typeof freeKickTargets.getFreeKickWallTarget).toBe("function");
  expect(typeof freeKickTargets.getDefensiveFreeKickTarget).toBe("function");
  expect(typeof freeKickTargets.applyDefensiveFreeKickSetPieceTargets).toBe("function");
});

test("game simulator autopilot defensive free kick targets detect direct shot threat", () => {
  const freeKickTargets = createGameSimulatorAutopilotDefensiveFreeKickTargets(createFreeKickDeps());
  const context = freeKickTargets.getDefensiveFreeKickContext("away", { x: 105, y: 34 });

  expect(context?.attackingTeamId).toBe("home");
  expect(context?.directShotThreat).toBe(true);
  expect(context?.wideDeliveryThreat).toBe(false);
  expect(freeKickTargets.getDefensiveFreeKickContext("home", { x: 105, y: 34 })).toBeNull();
});

test("game simulator autopilot defensive free kick targets assign wall and rebound line", () => {
  const freeKickTargets = createGameSimulatorAutopilotDefensiveFreeKickTargets(createFreeKickDeps());
  const targets = new Map();

  const result = freeKickTargets.applyDefensiveFreeKickSetPieceTargets(
    "away",
    targets,
    createFreeKickGroups(),
    { x: 105, y: 34 },
    { phaseKey: "boxDefending" }
  );

  expect(result.active).toBe(true);
  expect(result.labels).toContain("GK sets the wall");
  expect(result.labels).toContain("Free-kick wall");
  expect(result.labels).toContain("Rebound and block line");
  expect(targets.has("A1")).toBe(true);
  expect(targets.size).toBeGreaterThanOrEqual(7);
});
