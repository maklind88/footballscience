import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveOpenPlayTargets } from "../src/modules/game-simulator/autopilot-defensive-open-play-targets.mjs";

function createOpenPlayDeps(overrides = {}) {
  const state = {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 60, y: 34 },
      target: { x: 72, y: 34 },
      position: { x: 72, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 72, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      beforeSnapshot: {
        ball: {
          position: { x: 60, y: 34 },
          ownerPlayerId: "H8",
        },
      },
    },
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(105, point.x)),
      y: Math.max(0, Math.min(68, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => Math.abs((teamId === "away" ? 105 : 0) - point.x),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? 105 : 0, y: 34 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 70 ? 0.58 : 0.32,
      box: point.x >= 88 ? 0.3 : 0.1,
      centralPocket: point.x >= 70 ? 0.38 : 0.18,
      betweenLines: point.x >= 68 ? 0.5 : 0.22,
      cutbackZone: 0.12,
      assistZone: 0.12,
      primaryLabel: "central pocket",
    }),
    getTeamDefenseStyleKey: () => "high-press",
    getWideSideSign: (point) => (point.y < 30 ? -1 : point.y > 38 ? 1 : 0),
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => {
      for (const lineKey of lineKeys) {
        const player = (groups[lineKey] ?? []).find((candidate) => !excludedIds.has(candidate.id));
        if (player) {
          return player;
        }
      }
      return null;
    },
    pitch: { length: 105, width: 68 },
    state,
    uniquePrincipleLabels: (labels) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups() {
  return {
    gk: [{ id: "A1", team: "away", position: { x: 102, y: 34 }, role: "Goalkeeper" }],
    back: [
      { id: "A4", team: "away", position: { x: 88, y: 29 }, role: "Center Back", shortLabel: "CB" },
      { id: "A5", team: "away", position: { x: 88, y: 39 }, role: "Center Back", shortLabel: "CB" },
    ],
    midfield: [
      { id: "A6", team: "away", position: { x: 78, y: 32 }, role: "Defensive Midfielder", shortLabel: "6" },
      { id: "A8", team: "away", position: { x: 76, y: 38 }, role: "Central Midfielder", shortLabel: "8" },
    ],
    forward: [{ id: "A9", team: "away", position: { x: 70, y: 34 }, role: "Striker", shortLabel: "9" }],
  };
}

test("game simulator autopilot defensive open play targets expose moved open-play contracts", () => {
  const openPlayTargets = createGameSimulatorAutopilotDefensiveOpenPlayTargets(createOpenPlayDeps());

  expect(typeof openPlayTargets.getDefensiveOpenPlayTriggerContext).toBe("function");
  expect(typeof openPlayTargets.getDefensiveOpenPlayTriggerTarget).toBe("function");
  expect(typeof openPlayTargets.applyDefensiveOpenPlayTriggerTargets).toBe("function");
});

test("game simulator autopilot defensive open play targets detect central entry triggers", () => {
  const openPlayTargets = createGameSimulatorAutopilotDefensiveOpenPlayTargets(createOpenPlayDeps());

  const context = openPlayTargets.getDefensiveOpenPlayTriggerContext(
    "away",
    { x: 72, y: 34 },
    { styleKey: "high-press", pressingIntensity: 0.7 }
  );

  expect(context.active).toBe(true);
  expect(context.mode).toBe("centralJump");
  expect(context.forwardGain).toBeGreaterThan(8);
  expect(context.targetThreat.primaryLabel).toBe("central pocket");
});

test("game simulator autopilot defensive open play targets apply central jump coverage", () => {
  const openPlayTargets = createGameSimulatorAutopilotDefensiveOpenPlayTargets(createOpenPlayDeps());
  const targets = new Map();
  const result = openPlayTargets.applyDefensiveOpenPlayTriggerTargets(
    "away",
    targets,
    createGroups(),
    null,
    { x: 72, y: 34 },
    { styleKey: "high-press", pressingIntensity: 0.7 }
  );

  expect(result.active).toBe(true);
  expect(result.labels).toContain("Jump on central entry");
  expect(result.labels).toContain("Close central pocket");
  expect(result.labels).toContain("Cover the line behind");
  expect(targets.size).toBeGreaterThanOrEqual(3);
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(4);
});
