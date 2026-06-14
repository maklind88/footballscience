import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveEmergencyCoverTargets } from "../src/modules/game-simulator/autopilot-defensive-emergency-cover-targets.mjs";

function createEmergencyCoverDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 60, y: 34 },
      position: { x: 60, y: 34 },
      target: { x: 78, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 78, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      autoPrinciples: ["line break"],
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
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.74,
      openTarget: 0.62,
      lineBreakCount: 1,
      targetPressure: 0.12,
      targetThreat: {
        value: 0.76,
        box: 0.2,
        behindLine: 0.3,
        centralPocket: 0.36,
        cutbackZone: 0.12,
        betweenLines: 0.38,
        assistZone: 0.18,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDefensiveRunnerThreats: () => [],
    getDefensiveRunnerTrackingTarget: () => ({ x: 80, y: 34 }),
    getDepthX: (teamId, depth) => (teamId === "away" ? pitch.length - depth : depth),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getDribblePressureReference: () => ({
      startPoint: { x: 60, y: 34 },
      targetPoint: { x: 78, y: 34 },
    }),
    getOffensiveAutopilotProfile: () => ({ phaseKey: "chanceCreation" }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0),
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: () => false,
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
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 32 } },
      { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 38 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 86, y: 48 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 75, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 77, y: 40 } },
      { id: "A10", team: "away", lineKey: "midfield", shortLabel: "10", position: { x: 73, y: 31 } },
    ],
    forward: [{ id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } }],
  };
}

test("game simulator autopilot defensive emergency cover targets expose moved contracts", () => {
  const emergencyCover = createGameSimulatorAutopilotDefensiveEmergencyCoverTargets(createEmergencyCoverDeps());

  expect(typeof emergencyCover.getDefensiveEmergencyCoverContext).toBe("function");
  expect(typeof emergencyCover.getDefensiveEmergencyCoverTarget).toBe("function");
  expect(typeof emergencyCover.applyDefensiveEmergencyCoverTargets).toBe("function");
});

test("game simulator autopilot defensive emergency cover targets detect line break emergency", () => {
  const emergencyCover = createGameSimulatorAutopilotDefensiveEmergencyCoverTargets(createEmergencyCoverDeps());

  const context = emergencyCover.getDefensiveEmergencyCoverContext(
    "away",
    { x: 78, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(context).toMatchObject({
    actionType: "pass",
    attackingTeamId: "home",
    isLineBreak: true,
    mode: "lineBreakEmergency",
  });
  expect(context.dangerScore).toBeGreaterThan(0.8);
});

test("game simulator autopilot defensive emergency cover targets apply emergency cover", () => {
  const emergencyCover = createGameSimulatorAutopilotDefensiveEmergencyCoverTargets(createEmergencyCoverDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = emergencyCover.applyDefensiveEmergencyCoverTargets(
    "away",
    targets,
    groups,
    groups.midfield[0],
    { x: 78, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(result.labels).toContain("Emergency cover against line break");
  expect(result.labels).toContain("Emergency: delay the line break");
  expect(result.labels).toContain("Emergency: protect last line");
  expect(result.labels).toContain("Emergency: screen central finish");
  expect(result.focusPoint).toEqual({ x: 78, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
