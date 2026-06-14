import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDecisionContextHelpers } from "../src/modules/game-simulator/autopilot-decision-context-helpers.mjs";

function createDecisionContextDeps(overrides = {}) {
  const state = overrides.state || {
    time: 12,
    ball: {
      securePossession: {
        ownerPlayerId: "H9",
        point: { x: 74, y: 32 },
        createdAt: 11,
        minDistanceToExpire: 8,
        minTimeToExpire: 2,
        reason: "interception",
      },
    },
    players: [
      { id: "H8", team: "home", position: { x: 66, y: 34 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 78, y: 32 }, roleKey: "striker" },
      { id: "H6", team: "home", position: { x: 60, y: 37 }, roleKey: "pivot" },
      { id: "A4", team: "away", position: { x: 80, y: 33 }, roleKey: "centerBack" },
    ],
    sequence: {
      steps: [
        {
          actionType: "pass",
          possessionTeamId: "home",
          receiverPlayerId: "H9",
          duration: 2.4,
          target: { x: 78, y: 32 },
          beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 66, y: 34 } } },
          offensiveAutopilot: { principleLabel: "Line break" },
          autoPrinciples: ["Find the Third"],
        },
        {
          actionType: "pass",
          possessionTeamId: "home",
          receiverPlayerId: "H8",
          duration: 2.8,
          target: { x: 66, y: 34 },
          beforeSnapshot: { ball: { ownerPlayerId: "H6", position: { x: 58, y: 38 } } },
          offensiveAutopilot: { principleKey: "support-link" },
        },
        {
          actionType: "dribble",
          possessionTeamId: "home",
          carrierPlayerId: "H9",
          target: { x: 84, y: 31 },
          beforeSnapshot: { ball: { ownerPlayerId: "H9", position: { x: 78, y: 32 } } },
        },
      ],
    },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(105 - margin, point.x)),
      y: Math.max(margin, Math.min(68 - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingThirdKey: (point, teamId) => {
      const depth = teamId === "home" ? point.x : 105 - point.x;
      return depth >= 70 ? "final" : depth >= 35 ? "middle" : "build";
    },
    getCarryLaneOpenSpaceScore: (gap) => Math.max(0, Math.min(1, gap / 20)),
    getNearestOpponentGapInCarryLane: () => 14,
    getOffensiveRoleKey: (player) => player.roleKey,
    getPitchLaneKey: (point) => (point.y <= 22 ? "leftWide" : point.y >= 46 ? "rightWide" : "central"),
    getPitchThreatProfile: (point) => ({
      primaryLabel: point.x >= 82 ? "box lane" : point.x >= 70 ? "final-third space" : "central space",
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.32,
    getRecentPossessionSteps: (teamId, limit = 6) => state.sequence.steps
      .filter((step) => step.possessionTeamId === teamId)
      .slice(0, limit),
    getRecordedStepDuration: (step) => step.duration ?? 0,
    getRecordedStepPossessionTeamId: (step) => step.possessionTeamId,
    getTeamSupportCountAroundPoint: () => 2,
    isWideChannel: (point) => point.y <= 20 || point.y >= 48,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot decision context helpers expose moved flow contracts", () => {
  const helpers = createGameSimulatorAutopilotDecisionContextHelpers(createDecisionContextDeps());

  expect(typeof helpers.isLastStepKickoffResetForTeam).toBe("function");
  expect(typeof helpers.getRecentLaneRepeatCount).toBe("function");
  expect(typeof helpers.getAutoPilotFlowContext).toBe("function");
  expect(typeof helpers.getAutoPilotRegainContext).toBe("function");
  expect(typeof helpers.getAutoPilotCandidatePattern).toBe("function");
  expect(typeof helpers.getRecordedStepPattern).toBe("function");
  expect(typeof helpers.getRecordedStepActorIds).toBe("function");
});

test("game simulator autopilot decision context helpers read possession flow and principles", () => {
  const helpers = createGameSimulatorAutopilotDecisionContextHelpers(createDecisionContextDeps());
  const carrier = { id: "H9", team: "home", position: { x: 78, y: 32 }, roleKey: "striker" };

  const flow = helpers.getAutoPilotFlowContext(carrier, carrier.position);
  const principles = helpers.getLastAutoPrincipleSet("home");

  expect(flow.carrierJustReceived).toBe(true);
  expect(flow.consecutivePasses).toBe(2);
  expect(flow.recentFrontLineTargets).toBe(1);
  expect(flow.receiverRoleCounts.get("striker")).toBe(1);
  expect(helpers.getStepReceiverRoleKey(flow.lastStep, "home")).toBe("striker");
  expect(helpers.principleSetIncludes(principles, "line")).toBe(true);
});

test("game simulator autopilot decision context helpers calculate regain context", () => {
  const helpers = createGameSimulatorAutopilotDecisionContextHelpers(createDecisionContextDeps());
  const carrier = { id: "H9", team: "home", position: { x: 78, y: 32 }, roleKey: "striker" };

  const secure = helpers.getSecurePossessionSnapshotForTeam("home");
  const regain = helpers.getAutoPilotRegainContext(carrier, carrier.position, {
    directness: 0.8,
    progressionUrgency: 0.8,
    tempo: 0.7,
    shortSupport: 0.35,
    recycleWindow: 0.25,
    styleKey: "counter-attack",
  });

  expect(secure.ownerPlayerId).toBe("H9");
  expect(helpers.isTransitionAttackStyle("counter-attack")).toBe(true);
  expect(regain.active).toBe(true);
  expect(regain.directStyle).toBe(true);
  expect(regain.forwardOpenSpace).toBeGreaterThan(0);
});

test("game simulator autopilot decision context helpers classify candidate and recorded patterns", () => {
  const helpers = createGameSimulatorAutopilotDecisionContextHelpers(createDecisionContextDeps());
  const carrier = { id: "H8", team: "home", position: { x: 66, y: 34 }, roleKey: "connector" };

  const candidatePattern = helpers.getAutoPilotCandidatePattern(
    {
      actionType: "pass",
      target: { x: 88, y: 31 },
      receiverPlayerId: "H9",
      isLineBreak: true,
    },
    carrier,
    carrier.position,
  );
  const recordedPattern = helpers.getRecordedStepPattern({
    actionType: "pass",
    possessionTeamId: "home",
    receiverPlayerId: "H8",
    profileLabel: "Change corridor",
    target: { x: 72, y: 55 },
    beforeSnapshot: { ball: { ownerPlayerId: "H6", position: { x: 58, y: 30 } } },
  }, "home");
  const actors = helpers.getRecordedStepActorIds({
    carrierPlayerId: "H6",
    receiverPlayerId: "H8",
  });

  expect(candidatePattern.family).toBe("line-break");
  expect(candidatePattern.receiverRoleKey).toBe("striker");
  expect(recordedPattern.family).toBe("switch");
  expect(actors).toEqual({ carrierId: "H6", receiverId: "H8" });
});
