import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandSimulationStep } from "../src/modules/game-simulator/command-simulation-step.mjs";

function cloneVector(point) {
  return point ? { ...point } : point;
}

function createSimulationStep(overrides = {}) {
  const events = [];
  const state = overrides.state || {
    time: 0,
    playbackSpeed: 1,
    isRunning: true,
    activeActionTargets: null,
    draftStep: null,
    ball: {
      actionType: "pass",
      carrierPlayerId: null,
      currentSpeed: 10,
      deceleration: 0,
      elapsedTravelTime: 0,
      finalSpeed: 10,
      inTransit: true,
      position: { x: 20, y: 34 },
      receiverPlayerId: "H9",
      spinAngle: 0,
      spinRate: 0,
      startPosition: { x: 20, y: 34 },
      target: { x: 30, y: 34 },
      trackDistanceCovered: 9.95,
      trackDistanceTotal: 10,
      controlRadius: 1.2,
    },
    players: [
      { id: "H8", team: "home", role: "CM", position: { x: 20, y: 34 }, movementProgress: 0 },
      { id: "H9", team: "home", role: "ST", position: { x: 30, y: 34 }, movementProgress: 0 },
    ],
    sequence: { isPlaying: false, phase: null, steps: [], playbackIndex: 0 },
  };

  const step = createGameSimulatorCommandSimulationStep({
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    applyBestReceiveBodyAngle: (...args) => events.push(["receiveBody", ...args.slice(1)]),
    applySnapshot: (snapshot) => events.push(["snapshot", snapshot]),
    ballRadiusMeters: 0.11,
    buildMovementPath: (_player, start, end) => ({
      start: cloneVector(start),
      end: cloneVector(end),
      waypoint: null,
      totalDistance: Math.hypot(end.x - start.x, end.y - start.y),
    }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clearBallAction: () => events.push(["clearBall"]),
    cloneVector,
    completeBallTravelArrival: (payload) => events.push(["arrival", payload]),
    completeDribbleCarry: (player, time) => events.push(["dribbleComplete", player.id, time]),
    completeGoalkeeperSave: (payload, time) => events.push(["save", payload, time]),
    completeLooseBallRecoveryAction: (player) => events.push(["recoveryComplete", player.id]),
    completeShotGoal: (payload, time) => events.push(["goal", payload, time]),
    completeShotOutOfPlay: (payload, time) => events.push(["shotOut", payload, time]),
    completeTouchlineOutOfPlay: (payload, time) => events.push(["touchline", payload, time]),
    completeTransitOutcome: (payload, actionType) => events.push(["transit", payload, actionType]),
    computeReachDistance: (_player, elapsed) => elapsed * 8,
    describeStep: () => ({ title: "Pass" }),
    detectShotGoal: () => null,
    detectShotOutOfPlay: () => null,
    detectTouchlineOutOfPlay: () => null,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    finishSequencePlayback: () => events.push(["finishSequence"]),
    getActionOrigin: (player) => cloneVector(player.position),
    getActionSpeed: () => 10,
    getBallFlightControlFactor: (actionType) => {
      events.push(["flightFactor", actionType]);
      return 1;
    },
    getBallTravelPoint: (progress) => ({
      x: 20 + 10 * progress,
      y: 34,
    }),
    getDefensiveAutoV2Intent: () => null,
    getDefensiveAutopilotFocusPoint: () => ({ x: 25, y: 34 }),
    getDribbleCarryPathPoint: (_path, covered) => ({ x: 20 + covered, y: 34 }),
    getLiveDefensiveDribblePressTarget: (_player, _meta, target) => target,
    getLiveDribbleSpeed: () => 5,
    getMovementPathPoint: (path, progress) => ({
      x: path.start.x + (path.end.x - path.start.x) * (progress / path.totalDistance),
      y: path.start.y + (path.end.y - path.start.y) * (progress / path.totalDistance),
    }),
    getOffensiveAutoV2Intent: () => null,
    getOffensiveAutopilotFocusPoint: () => ({ x: 30, y: 34 }),
    getPlayerBallControlPoint: (player) => cloneVector(player.position),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    isDefensiveAutopilotPlayer: () => false,
    isDefensiveDribblePresser: () => false,
    isOffensiveAutopilotPlayer: () => false,
    logEvent: (message) => events.push(["log", message]),
    moveDefensiveAutoV2Player: () => events.push(["moveDefensive"]),
    moveOffensiveAutoV2Player: () => events.push(["moveOffensive"]),
    moveTowards: (from, to, distance) => ({ x: from.x + Math.sign(to.x - from.x) * distance, y: from.y }),
    resolveDribbleDefensiveChallenge: () => events.push(["dribbleChallenge"]),
    resolveGoalkeeperSave: () => null,
    resolvePassTransitInterception: () => null,
    resolveShotBlockCommitment: () => null,
    rotatePlayerBodyAlongMovement: (...args) => events.push(["bodyAlong", args[0].id]),
    rotatePlayerBodyToward: (...args) => events.push(["bodyToward", args[0].id]),
    rotatePlayerBodyTowardAngle: (...args) => events.push(["bodyAngle", args[0].id]),
    setDribbleCarryPathForBall: () => events.push(["dribblePath"]),
    startRecordedAction: (action) => events.push(["startRecorded", action]),
    state,
    ui: { playPauseButton: { textContent: "" } },
    updateBallFlightHeight: () => events.push(["height"]),
    ...overrides,
  });

  return { events, state, step };
}

test("game simulator command simulation step completes pass arrival through explicit ball control factor", () => {
  const { events, state, step } = createSimulationStep();

  step.updateBall(0.01);

  expect(state.ball.position).toEqual({ x: 30, y: 34 });
  expect(events).toContainEqual(["flightFactor", "pass"]);
  const arrival = events.find((event) => event[0] === "arrival");
  expect(arrival?.[1]).toMatchObject({
    reachedReceiverControlZone: true,
    reachedTravelEnd: true,
  });
});

test("game simulator command simulation step moves action players with explicit reach distance", () => {
  const { state, step } = createSimulationStep();
  const receiver = state.players.find((player) => player.id === "H9");
  receiver.position = { x: 30, y: 34 };
  state.ball.elapsedTravelTime = 0.5;
  const targetMap = new Map([["H9", { x: 34, y: 34 }]]);

  step.updateActionPlayers(targetMap, {
    actionType: "pass",
    receiverPlayerId: "H9",
    beforeSnapshot: { ball: { position: { x: 20, y: 34 } } },
  });

  expect(receiver.movementProgress).toBe(4);
  expect(receiver.position).toEqual({ x: 34, y: 34 });
});
