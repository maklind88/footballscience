import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotCandidatePrincipleMetricsDecisions } from "../src/modules/game-simulator/autopilot-candidate-principle-metrics-decisions.mjs";

const laneIndexes = {
  leftWide: 0,
  leftHalf: 1,
  central: 2,
  rightHalf: 3,
  rightWide: 4,
};

function createCandidatePrincipleMetrics(overrides = {}) {
  const players = [
    { id: "H7", roleKey: "wideForward" },
    { id: "H6", roleKey: "connector" },
  ];

  return createGameSimulatorAutopilotCandidatePrincipleMetricsDecisions({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({ value: 0.72, lineBreakCount: 2, openTarget: 0.74 }),
    getActionThreatGain: () => 0.2,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point) => point.x,
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getPitchLaneIndex: (laneOrPoint) => laneIndexes[typeof laneOrPoint === "string" ? laneOrPoint : laneOrPoint.laneKey] ?? 2,
    getPitchLaneKey: (pointOrKey) => (typeof pointOrKey === "string" ? pointOrKey : pointOrKey.laneKey),
    getPitchThreatProfile: (point) => ({
      assistZone: point.x >= 72 ? 0.6 : 0.1,
      betweenLines: 0.45,
      centralPocket: point.laneKey === "central" ? 0.7 : 0.48,
      cutbackZone: point.x >= 72 ? 0.35 : 0.08,
      halfSpace: 0.38,
      value: point.x >= 72 ? 0.7 : 0.48,
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.3,
    getPlayerTendency: () => 0.8,
    pitch: { length: 105, width: 68 },
    teams: { home: { formation: "4-3-3" } },
    ...overrides,
  });
}

const model = {
  ballDepth: 45,
  carrierRoleKey: "wideForward",
  flow: { carrierJustReceived: false, consecutivePasses: 1, pressure: 0.5 },
  forwardFacingSpaceTwo: { active: true },
  progressionWindow: { active: true },
  regain: { active: false },
  rhythm: { sidewaysPasses: 1, steps: 2 },
};

test("game simulator autopilot candidate principle metrics decisions scores line-breaking wide passes", () => {
  const decisions = createCandidatePrincipleMetrics();

  const metrics = decisions.getAutoPilotCandidatePrincipleMetrics(
    {
      actionType: "pass",
      isLineBreak: true,
      isPrinciplePattern: true,
      isSwitch: true,
      laneClarity: 0.8,
      receiverPlayerId: "H7",
      target: { x: 74, y: 58, laneKey: "rightWide" },
    },
    { id: "H8", team: "home" },
    { x: 45, y: 34, laneKey: "central" },
    { directness: 0.75, routeOneBias: 0.2 },
    model
  );

  expect(metrics.breakLine).toBe(1);
  expect(metrics.switchPlay).toBe(1);
  expect(metrics.wideOverload).toBeGreaterThan(0.8);
  expect(metrics.counterAttack).toBeGreaterThan(0.6);
});

test("game simulator autopilot candidate principle metrics decisions scores carries into space", () => {
  const decisions = createCandidatePrincipleMetrics();

  const metrics = decisions.getAutoPilotCandidatePrincipleMetrics(
    {
      actionType: "dribble",
      target: { x: 62, y: 48, laneKey: "rightHalf" },
    },
    { id: "H8", team: "home" },
    { x: 45, y: 34, laneKey: "central" },
    { directness: 0.7, routeOneBias: 0.2 },
    model
  );

  expect(metrics.driveSpace).toBeGreaterThan(0.85);
  expect(metrics.breakLine).toBeGreaterThan(0.8);
  expect(metrics.counterAttack).toBeGreaterThan(0.8);
});

test("game simulator autopilot candidate principle metrics decisions adds regain urgency to shots", () => {
  const decisions = createCandidatePrincipleMetrics();

  const metrics = decisions.getAutoPilotCandidatePrincipleMetrics(
    {
      actionType: "shot",
      insideBox: true,
      laneClarity: 0.72,
      mustShoot: true,
      target: { x: 105, y: 34, laneKey: "central" },
    },
    { id: "H9", team: "home" },
    { x: 86, y: 34, laneKey: "central" },
    { directness: 0.6, routeOneBias: 0.2 },
    {
      ...model,
      regain: { active: true, counterIntent: 0.7, freshness: 0.8 },
      rhythm: { lastStep: { label: "cutback" }, sidewaysPasses: 0, steps: 1 },
    }
  );

  expect(metrics.shoot).toBeGreaterThan(1);
  expect(metrics.goldenZone).toBeGreaterThan(0.5);
  expect(metrics.cutback).toBe(0.42);
});
