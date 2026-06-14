import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePassLaneDenialTargets } from "../src/modules/game-simulator/autopilot-defensive-pass-lane-denial-targets.mjs";

function createPassLaneDenialDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 48, y: 18 },
      position: { x: 48, y: 18 },
      target: { x: 74, y: 20 },
      receiverPlayerId: "H11",
      carrierPlayerId: "H8",
      ownerPlayerId: "H8",
    },
    players: [
      { id: "H8", team: "home", position: { x: 48, y: 18 }, roleKey: "connector" },
      { id: "H11", team: "home", position: { x: 74, y: 20 }, roleKey: "wideForward" },
    ],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      targetThreat: {
        value: 0.62,
        betweenLines: 0.34,
        centralPocket: 0.24,
        box: 0.18,
        assistZone: 0.36,
        behindLine: 0.26,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 12,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, assignedIds) => {
      for (const lineKey of lineKeys) {
        const player = groups[lineKey]?.find((candidate) => !assignedIds.has(candidate.id));
        if (player) {
          return player;
        }
      }
      return null;
    },
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createDefensiveGroups() {
  return {
    gk: [{ id: "A1", team: "away", position: { x: 102, y: 34 } }],
    forward: [{ id: "A9", team: "away", position: { x: 58, y: 24 } }],
    midfield: [
      { id: "A6", team: "away", position: { x: 63, y: 30 } },
      { id: "A8", team: "away", position: { x: 66, y: 38 } },
    ],
    back: [
      { id: "A4", team: "away", position: { x: 78, y: 31 } },
      { id: "A3", team: "away", position: { x: 80, y: 22 } },
      { id: "A5", team: "away", position: { x: 84, y: 38 } },
    ],
  };
}

test("game simulator autopilot defensive pass lane denial targets expose moved contracts", () => {
  const targets = createGameSimulatorAutopilotDefensivePassLaneDenialTargets(createPassLaneDenialDeps());

  expect(typeof targets.getDefensivePassLaneDenialContext).toBe("function");
  expect(typeof targets.getDefensivePassLaneDenialTarget).toBe("function");
  expect(typeof targets.applyDefensivePassLaneDenialTargets).toBe("function");
});

test("game simulator autopilot defensive pass lane denial targets read pass context", () => {
  const targets = createGameSimulatorAutopilotDefensivePassLaneDenialTargets(createPassLaneDenialDeps());

  const context = targets.getDefensivePassLaneDenialContext("away", { x: 74, y: 20 }, { phaseKey: "highPress" });

  expect(context.attackingTeamId).toBe("home");
  expect(context.receiver.id).toBe("H11");
  expect(context.passDistance).toBeGreaterThan(20);
  expect(context.forwardGain).toBeGreaterThan(20);
  expect(context.laneDanger).toBe(true);
  expect(context.isWidePass).toBe(true);
});

test("game simulator autopilot defensive pass lane denial targets place lane screens goal-side", () => {
  const targets = createGameSimulatorAutopilotDefensivePassLaneDenialTargets(createPassLaneDenialDeps());
  const context = targets.getDefensivePassLaneDenialContext("away", { x: 74, y: 20 }, { phaseKey: "highPress" });

  const screen = targets.getDefensivePassLaneDenialTarget("away", context, "centralLaneScreen");
  const outsideTrap = targets.getDefensivePassLaneDenialTarget("away", context, "outsideTrap");

  expect(screen.x).toBeGreaterThan(55);
  expect(screen.y).toBeGreaterThan(20);
  expect(outsideTrap.y).toBeLessThan(20);
});

test("game simulator autopilot defensive pass lane denial targets assign cover roles", () => {
  const targetMap = new Map();
  const targets = createGameSimulatorAutopilotDefensivePassLaneDenialTargets(createPassLaneDenialDeps());

  const result = targets.applyDefensivePassLaneDenialTargets(
    "away",
    targetMap,
    createDefensiveGroups(),
    { id: "A9", team: "away" },
    { x: 74, y: 20 },
    { phaseKey: "highPress" },
    new Set(["A10"])
  );

  expect(result.labels).toContain("Deny pass lane");
  expect(result.labels).toContain("Deny central pass lane");
  expect(result.labels).toContain("Trap outside receiving lane");
  expect(result.labels).toContain("Cover behind pass lane");
  expect(result.focusPoint).toMatchObject({ x: 74, y: 20 });
  expect(result.protectedIds.has("A9")).toBe(true);
  expect(targetMap.size).toBeGreaterThanOrEqual(4);
});
