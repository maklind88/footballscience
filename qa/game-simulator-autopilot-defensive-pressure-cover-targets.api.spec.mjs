import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePressureCoverTargets } from "../src/modules/game-simulator/autopilot-defensive-pressure-cover-targets.mjs";

function createPressureCoverDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 58, y: 35 },
      position: { x: 70, y: 54 },
      target: { x: 70, y: 54 },
    },
    draftStep: {
      actionType: "pass",
      target: { x: 70, y: 54 },
      beforeSnapshot: {
        ball: {
          position: { x: 58, y: 35 },
          ownerPlayerId: "H8",
        },
      },
    },
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    getActionSpaceValue: () => ({ lineBreakCount: 1 }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDefensivePressTarget: () => ({ x: 68, y: 50 }),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      value: 0.48,
      box: 0.12,
      behindLine: 0.28,
      betweenLines: 0.34,
      centralPocket: 0.24,
    }),
    getWideSideSign: (pointOrPlayer) => {
      const y = pointOrPlayer?.position?.y ?? pointOrPlayer?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 36 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 82, y: 50 } },
      { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 43 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 75, y: 36 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 72, y: 44 } },
    ],
    forward: [{ id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 48 } }],
  };
}

test("game simulator autopilot defensive pressure cover targets expose moved cover contracts", () => {
  const pressureCoverTargets = createGameSimulatorAutopilotDefensivePressureCoverTargets(createPressureCoverDeps());

  expect(typeof pressureCoverTargets.getDefensivePressureCoverContext).toBe("function");
  expect(typeof pressureCoverTargets.getDefensivePressureCoverTarget).toBe("function");
  expect(typeof pressureCoverTargets.applyDefensivePressureCoverBalanceTargets).toBe("function");
});

test("game simulator autopilot defensive pressure cover targets detect wide pressure cover", () => {
  const pressureCoverTargets = createGameSimulatorAutopilotDefensivePressureCoverTargets(createPressureCoverDeps());
  const presser = createGroups().forward[0];

  const context = pressureCoverTargets.getDefensivePressureCoverContext(
    "away",
    { x: 70, y: 54 },
    presser,
    { phaseKey: "midBlock" }
  );

  expect(context?.isWidePressure).toBe(true);
  expect(context?.depthDanger).toBe(true);
  expect(context?.presser.id).toBe("A9");
});

test("game simulator autopilot defensive pressure cover targets apply second and third defender support", () => {
  const pressureCoverTargets = createGameSimulatorAutopilotDefensivePressureCoverTargets(createPressureCoverDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = pressureCoverTargets.applyDefensivePressureCoverBalanceTargets(
    "away",
    targets,
    groups,
    groups.forward[0],
    { x: 70, y: 54 },
    { phaseKey: "midBlock" }
  );

  expect(result.labels).toContain("Second defender covers inside");
  expect(result.labels).toContain("Third defender covers behind press");
  expect(result.labels).toContain("Lock outside of press");
  expect(result.labels).toContain("Balance far side");
  expect(result.focusPoint).toEqual({ x: 70, y: 54 });
  expect(targets.size).toBeGreaterThanOrEqual(4);
});
