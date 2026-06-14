import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets } from "../src/modules/game-simulator/autopilot-defensive-second-ball-anticipation-targets.mjs";

function createSecondBallDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      startPosition: { x: 62, y: 22 },
      target: { x: 80, y: 22 },
      receiverPlayerId: "H9",
      carrierPlayerId: "H7",
      initiatorPlayerId: "H7",
      ownerPlayerId: "H7",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 80, y: 22 },
      receiverPlayerId: "H9",
      carrierPlayerId: "H7",
      beforeSnapshot: {
        ball: {
          position: { x: 62, y: 22 },
          ownerPlayerId: "H7",
        },
      },
    },
  };
  const defaultContext = {
    targetPoint: { x: 80, y: 22 },
    sideSign: -1,
    finalThirdLanding: true,
    aerial: true,
    lineBreakLanding: true,
  };
  const secondBallContext = Object.prototype.hasOwnProperty.call(overrides, "secondBallContext")
    ? overrides.secondBallContext
    : defaultContext;
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getOffensiveAutopilotProfile: () => ({ phaseKey: "chanceCreation", styleKey: "direct" }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getSecondBallAnticipationContext: () => secondBallContext,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds, _target, preferLabels = []) => {
      const candidates = lineKeys.flatMap((lineKey) => groups[lineKey] || []);
      return candidates.find((player) => !excludedIds.has(player.id) && preferLabels.includes(player.shortLabel))
        || candidates.find((player) => !excludedIds.has(player.id))
        || null;
    },
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups() {
  return {
    gk: [{ id: "A1", lineKey: "gk", shortLabel: "GK", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 26 } },
      { id: "A5", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 34 } },
      { id: "A2", lineKey: "back", shortLabel: "RB", position: { x: 86, y: 45 } },
      { id: "A3", lineKey: "back", shortLabel: "LB", position: { x: 86, y: 18 } },
    ],
    midfield: [
      { id: "A6", lineKey: "midfield", shortLabel: "6", position: { x: 76, y: 34 } },
      { id: "A8", lineKey: "midfield", shortLabel: "8", position: { x: 75, y: 28 } },
      { id: "A10", lineKey: "midfield", shortLabel: "10", position: { x: 72, y: 24 } },
    ],
    forward: [
      { id: "A9", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 30 } },
      { id: "A11", lineKey: "forward", shortLabel: "W", position: { x: 67, y: 14 } },
    ],
  };
}

test("game simulator autopilot defensive second ball anticipation targets expose moved contracts", () => {
  const secondBall = createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets(createSecondBallDeps());

  expect(typeof secondBall.getDefensiveSecondBallAnticipationTarget).toBe("function");
  expect(typeof secondBall.applyDefensiveSecondBallAnticipationTargets).toBe("function");
});

test("game simulator autopilot defensive second ball anticipation targets calculate landing lanes", () => {
  const secondBall = createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets(createSecondBallDeps());
  const context = {
    targetPoint: { x: 80, y: 22 },
    sideSign: -1,
    finalThirdLanding: true,
    aerial: true,
    lineBreakLanding: true,
  };

  expect(secondBall.getDefensiveSecondBallAnticipationTarget("away", context, "firstContact")).toMatchObject({
    x: 81.2,
  });
  expect(secondBall.getDefensiveSecondBallAnticipationTarget("away", context, "dropZoneScreen").y).toBeCloseTo(28.96);
  expect(secondBall.getDefensiveSecondBallAnticipationTarget("away", context, "unknown")).toEqual(
    secondBall.getDefensiveSecondBallAnticipationTarget("away", context, "dropZoneScreen")
  );
});

test("game simulator autopilot defensive second ball anticipation targets apply connected coverage", () => {
  const secondBall = createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets(createSecondBallDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = secondBall.applyDefensiveSecondBallAnticipationTargets(
    "away",
    targets,
    groups,
    groups.forward[0],
    { x: 80, y: 22 },
    { pressingIntensity: 0.62, styleKey: "counter-press" },
    new Set(["A3"])
  );

  expect(result.labels).toContain("Anticipate second ball");
  expect(result.labels).toContain("Second ball: contest first contact");
  expect(result.labels).toContain("Second ball: screen drop zone");
  expect(result.labels).toContain("Second ball: cover depth behind");
  expect(result.labels).toContain("Second ball: block outlet");
  expect(result.focusPoint).toEqual({ x: 80, y: 22 });
  expect(result.protectedIds.has("A1")).toBe(true);
  expect(result.protectedIds.has("A3")).toBe(true);
  expect(result.protectedIds.has("A9")).toBe(true);
  expect(targets.has("A1")).toBe(false);
  expect(targets.has("A3")).toBe(false);
  expect(targets.size).toBeGreaterThanOrEqual(6);
});

test("game simulator autopilot defensive second ball anticipation targets stay neutral without context", () => {
  const secondBall = createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets(
    createSecondBallDeps({ secondBallContext: null })
  );

  const result = secondBall.applyDefensiveSecondBallAnticipationTargets(
    "away",
    new Map(),
    createGroups(),
    null,
    { x: 80, y: 22 },
    { pressingIntensity: 0.4, styleKey: "balanced" },
    new Set(["A3"])
  );

  expect(result).toMatchObject({
    labels: [],
    focusPoint: null,
  });
  expect(result.protectedIds.has("A3")).toBe(true);
});
