import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveOffensiveSupport } from "../src/modules/game-simulator/autopilot-live-offensive-support.mjs";

function createOffensiveSupportDeps(overrides = {}) {
  let state =
    overrides.state ??
    {
      players: [
        { id: "H7", team: "home", role: "LW", position: { x: 54, y: 44 } },
        { id: "H8", team: "home", role: "CM", position: { x: 45, y: 34 } },
        { id: "H9", team: "home", role: "ST", position: { x: 60, y: 34 } },
        { id: "A6", team: "away", role: "DM", position: { x: 58, y: 34 } },
      ],
      sequence: {
        steps: [
          {
            actionType: "pass",
            receiverPlayerId: "H7",
            beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 42, y: 34 } } },
            afterSnapshot: { ball: { ownerPlayerId: "H7" } },
            target: { x: 51, y: 36 },
            duration: 0.8,
          },
          {
            actionType: "pass",
            receiverPlayerId: "H8",
            beforeSnapshot: { ball: { ownerPlayerId: "H7", position: { x: 51, y: 36 } } },
            afterSnapshot: { ball: { ownerPlayerId: "H8" } },
            target: { x: 45, y: 32 },
            duration: 0.9,
          },
          {
            actionType: "pass",
            receiverPlayerId: "H9",
            beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 53, y: 34 } } },
            afterSnapshot: { ball: { ownerPlayerId: "H9" } },
            target: { x: 54, y: 44 },
            duration: 1.2,
          },
        ],
      },
    };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    clamp,
    clampToPitch: (point, padding = 0) => ({
      x: clamp(point.x, padding, pitch.length - padding),
      y: clamp(point.y, padding, pitch.width - padding),
    }),
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionOrigin: (player) => player.actionOrigin ?? player.position,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefensiveAutoV2FrameDt: () => 0.25,
    getDepthX: (teamId, depth) => (teamId === "home" ? depth : pitch.length - depth),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerDecisionContext: () => ({
      acceleration: 3.6,
      maxSpeed: 7.2,
      reactionTime: 0.24,
      profile: {
        decisionSpeed: 0.82,
        perception: 0.8,
      },
    }),
    getPlayerFacingAngle: () => 0,
    getRecordedStepDuration: (step) => step.duration ?? 1,
    normalizeAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
    pitch,
    rotatePlayerBodyAlongMovement: (player, from, to, weight) => {
      player.bodyMovementCalls = [...(player.bodyMovementCalls ?? []), { from, to, weight }];
    },
    rotatePlayerBodyToward: (player, point, weight) => {
      player.bodyTowardCalls = [...(player.bodyTowardCalls ?? []), { point, weight }];
    },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live offensive support exposes possession, lane, overlap, and movement contracts", () => {
  const support = createGameSimulatorAutopilotLiveOffensiveSupport(createOffensiveSupportDeps());

  expect(typeof support.getRecentPossessionSteps).toBe("function");
  expect(typeof support.getRecordedStepPossessionTeamId).toBe("function");
  expect(typeof support.getPossessionRhythmContext).toBe("function");
  expect(typeof support.getLaneForSideSign).toBe("function");
  expect(typeof support.getWideOverlapPrincipleFit).toBe("function");
  expect(typeof support.getWideOverlapRunTarget).toBe("function");
  expect(typeof support.moveOffensiveAutoV2Player).toBe("function");
});

test("game simulator autopilot live offensive support reads possession rhythm from current sequence state", () => {
  const deps = createOffensiveSupportDeps();
  const support = createGameSimulatorAutopilotLiveOffensiveSupport(deps);

  const recent = support.getRecentPossessionSteps("home", 2);
  expect(recent).toHaveLength(2);
  expect(recent[0].receiverPlayerId).toBe("H9");
  expect(support.getRecordedStepPossessionTeamId(recent[0])).toBe("home");

  const rhythm = support.getPossessionRhythmContext("home", 3);
  expect(rhythm.steps).toBe(3);
  expect(rhythm.duration).toBeCloseTo(2.9, 3);
  expect(rhythm.sidewaysPasses).toBe(1);
  expect(rhythm.backPasses).toBe(1);
  expect(rhythm.forwardPasses).toBe(1);
  expect(rhythm.lineBreaks).toBe(1);
  expect(rhythm.lastActionType).toBe("pass");

  deps.replaceState({ ...deps.getState(), sequence: { steps: [] } });
  expect(support.getRecentPossessionSteps("home", 2)).toEqual([]);
  expect(support.getPossessionRhythmContext("home", 3).steps).toBe(0);
});

test("game simulator autopilot live offensive support maps wide overlap lanes and run target", () => {
  const support = createGameSimulatorAutopilotLiveOffensiveSupport(createOffensiveSupportDeps());
  const profile = {
    crossBias: 0.8,
    formation: "4-3-3",
    overlapBias: 0.95,
    phaseKey: "finalThird",
    switchBias: 0.6,
    widthDiscipline: 0.9,
  };

  expect(support.getLaneForSideSign(-1)).toBe("leftHalf");
  expect(support.getLaneForSideSign(1, "wide")).toBe("rightWide");
  expect(support.getWideOverlapPrincipleFit(profile)).toBeGreaterThan(1.1);

  const target = support.getWideOverlapRunTarget("home", { x: 65, y: 20 }, -1, profile);
  expect(target.x).toBeGreaterThan(65);
  expect(target.y).toBeLessThan(20);
  expect(target.y).toBeGreaterThanOrEqual(2);
});

test("game simulator autopilot live offensive support moves with reaction delay and controlled acceleration", () => {
  const support = createGameSimulatorAutopilotLiveOffensiveSupport(createOffensiveSupportDeps());
  const focusPoint = { x: 55, y: 34 };
  const player = {
    id: "H7",
    team: "home",
    actionOrigin: { x: 30, y: 34 },
    position: { x: 30, y: 34 },
  };
  const intent = { startDelay: 0.5, type: "run-behind", urgency: 1 };

  support.moveOffensiveAutoV2Player(player, { x: 40, y: 34 }, {}, intent, 0.4, focusPoint);
  expect(player.position).toEqual({ x: 30, y: 34 });
  expect(player.bodyTowardCalls).toHaveLength(1);

  support.moveOffensiveAutoV2Player(player, { x: 40, y: 34 }, {}, intent, 1.0, focusPoint);
  expect(player.position.x).toBeGreaterThan(30);
  expect(player.autoV2Velocity.x).toBeGreaterThan(0);
  expect(player.movementProgress).toBeGreaterThan(0);
  expect(player.bodyMovementCalls).toHaveLength(1);

  const arrived = {
    id: "H8",
    actionOrigin: { x: 39.99, y: 34 },
    position: { x: 39.99, y: 34 },
  };
  support.moveOffensiveAutoV2Player(arrived, { x: 40, y: 34 }, {}, { type: "offer-angle" }, 1.0, focusPoint);
  expect(arrived.position).toEqual({ x: 40, y: 34 });
  expect(arrived.autoV2Velocity).toEqual({ x: 0, y: 0 });
  expect(arrived.bodyTowardCalls).toHaveLength(1);
});
