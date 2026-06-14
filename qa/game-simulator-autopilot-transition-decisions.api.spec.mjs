import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotTransitionDecisions } from "../src/modules/game-simulator/autopilot-transition-decisions.mjs";

const pitch = { length: 105, width: 68 };

function createTransitionDecisionDeps(overrides = {}) {
  const recoveryStep = {
    actionType: "recovery",
    afterSnapshot: {
      ball: {
        ownerPlayerId: "H6",
        position: { x: 46, y: 31 },
      },
    },
    carrierPlayerId: "H6",
    profileKey: "loose-ball-recovery",
    receiverPlayerId: "H6",
    target: { x: 46, y: 31 },
  };
  const state = overrides.state ?? {
    players: [
      { id: "H6", team: "home", position: { x: 50, y: 31 }, roleKey: "pivot" },
      { id: "H8", team: "home", position: { x: 57, y: 34 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 69, y: 32 }, roleKey: "striker" },
      { id: "H11", team: "home", position: { x: 63, y: 43 }, roleKey: "wideForward" },
      { id: "A4", team: "away", position: { x: 58, y: 33 }, roleKey: "back" },
      { id: "A5", team: "away", position: { x: 70, y: 38 }, roleKey: "back" },
    ],
    sequence: {
      steps: [recoveryStep],
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    clampToPitch: (point) => ({
      x: clamp(point.x, 0, pitch.length),
      y: clamp(point.y, 0, pitch.width),
    }),
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: (_carrier, target) => (target.x >= 60 ? 0.78 : 0.6),
    distance,
    getActionSpaceValue: (_start, target) => ({
      lineBreakCount: target.x >= 62 ? 1 : 0,
      openTarget: target.x >= 58 ? 0.72 : 0.34,
      targetThreat: {
        behindLine: target.x >= 66 ? 0.26 : 0.12,
        box: 0.08,
        centralPocket: target.x >= 58 ? 0.3 : 0.1,
        value: target.x >= 60 ? 0.58 : 0.34,
      },
      value: target.x >= 60 ? 0.62 : 0.34,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRegainContext: () => ({
      active: true,
      counterIntent: 0.86,
      forwardOpenSpace: 0.78,
      freshness: 0.86,
      pressure: 0.24,
      secureIntent: 0.24,
    }),
    getAutoPilotRoleStrength: (player, role) => (role === "runner" && player.roleKey === "striker" ? 0.85 : 0.62),
    getCarryLaneOpenSpaceScore: () => 0.74,
    getNearestOpponentGapInCarryLane: () => 12,
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentDensityAtPoint: (_teamId, point, radius) => (point.x <= 51 && radius <= 6 ? 2.4 : point.x <= 51 ? 2.8 : 1),
    getOpponentPressureAtPoint: (_teamId, point) => (point.x <= 51 ? 0.56 : 0.32),
    getPitchLaneIndex: (point) => (point.y < 24 ? 1 : point.y > 44 ? 3 : 2),
    getPitchThreatProfile: (point) => ({
      behindLine: point.x >= 66 ? 0.24 : 0.08,
      box: point.x >= 80 ? 0.2 : 0.08,
      centralPocket: point.x >= 58 ? 0.34 : 0.12,
      primaryLabel: "central space",
      value: point.x >= 60 ? 0.58 : 0.32,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: (player) => (player.id === "H6" ? 0.56 : 0.24),
    getRecentPossessionSteps: () => [recoveryStep],
    getRecordedStepActorIds: () => ({ carrierId: "H6", receiverId: "H6" }),
    getRecordedStepDuration: () => 0.8,
    getRecordedStepPattern: () => ({ family: "line-break", forwardGain: 9, laneKey: "central" }),
    getRecordedStepPossessionTeamId: () => "home",
    getTeamSupportCountAroundPoint: (_teamId, point) => (point.x >= 60 ? 1 : 2),
    isFrontLineRole: (roleKey) => ["striker", "wideForward", "secondStriker"].includes(roleKey),
    isGoalkeeper: (player) => player.roleKey === "goalkeeper",
    isSupportRole: (roleKey) => ["pivot", "connector", "wideBack"].includes(roleKey),
    isTransitionAttackStyle: (styleKey) => styleKey === "direct-transition",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot transition decisions expose moved recovery contracts", () => {
  const transitionDecisions = createGameSimulatorAutopilotTransitionDecisions(createTransitionDecisionDeps());

  expect(typeof transitionDecisions.getAutoPilotRecoveryFirstActionContext).toBe("function");
  expect(typeof transitionDecisions.getAutoPilotRecoveryFirstActionAdjustment).toBe("function");
  expect(typeof transitionDecisions.getAutoPilotPostRecoveryPhaseContext).toBe("function");
  expect(typeof transitionDecisions.getAutoPilotPostRecoveryPhaseAdjustment).toBe("function");
  expect(typeof transitionDecisions.getAutoPilotTransitionNumbersContext).toBe("function");
  expect(typeof transitionDecisions.getAutoPilotTransitionNumbersAdjustment).toBe("function");
});

test("game simulator autopilot transition decisions preserve recovery first action scoring", () => {
  const transitionDecisions = createGameSimulatorAutopilotTransitionDecisions(createTransitionDecisionDeps());
  const carrier = { id: "H6", team: "home", position: { x: 50, y: 31 }, roleKey: "pivot" };

  const result = transitionDecisions.getAutoPilotRecoveryFirstActionAdjustment(
    {
      actionType: "pass",
      laneClarity: 0.78,
      passDistance: 13,
      receiverPlayerId: "H8",
      receiverPressure: 0.32,
      target: { x: 60, y: 37 },
    },
    carrier,
    carrier.position,
    { shortSupport: 0.7, styleKey: "direct-transition" }
  );

  expect(result.score).toBeGreaterThan(0);
  expect(result.labels).toContain("Recovery first action: secure first pass");
  expect(result.context.safeFirstPass).toBe(true);
});

test("game simulator autopilot transition decisions preserve transition numbers scoring", () => {
  const transitionDecisions = createGameSimulatorAutopilotTransitionDecisions(createTransitionDecisionDeps());
  const carrier = { id: "H6", team: "home", position: { x: 50, y: 31 }, roleKey: "pivot" };

  const result = transitionDecisions.getAutoPilotTransitionNumbersAdjustment(
    {
      actionType: "pass",
      forwardGain: 19,
      isLineBreak: true,
      laneClarity: 0.82,
      passDistance: 21,
      receiverPlayerId: "H9",
      receiverPressure: 0.28,
      supportNearTarget: 1,
      target: { x: 69, y: 32 },
    },
    carrier,
    carrier.position,
    { directness: 0.78, styleKey: "direct-transition" }
  );

  expect(result.score).toBeGreaterThan(0);
  expect(result.labels).toContain("Transition numbers: exploit advantage");
  expect(result.context.directAction).toBe(true);
});
