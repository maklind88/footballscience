import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionDribbleChallenges } from "../src/modules/game-simulator/ball-resolution-dribble-challenges.mjs";

function createDribbleChallenges(overrides = {}) {
  const events = [];
  const state = overrides.state || {
    ball: {
      actionType: "dribble",
      carrierPlayerId: "H8",
      receiverPlayerId: null,
      initiatorPlayerId: "H8",
      startPosition: { x: 20, y: 34 },
      position: { x: 22, y: 34 },
      target: { x: 32, y: 34 },
      elapsedTravelTime: 0.58,
      currentSpeed: 5,
      controlRadius: 1.4,
      inTransit: true,
    },
    defensiveAggressionPreset: "balanced",
    draftStep: {
      target: null,
      nextRestartPhase: null,
    },
    isRunning: true,
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 22, y: 34 } },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 22.4, y: 34 } },
      { id: "A1", team: "away", role: "GK", shortLabel: "A1", position: { x: 4, y: 34 } },
    ],
    sequence: {
      isPlaying: false,
      steps: [],
      playbackIndex: 0,
      currentFrameIndex: 0,
    },
  };
  const deps = {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    applyCommittedSnapshot: (snapshot) => events.push(["applySnapshot", snapshot]),
    captureSnapshot: () => ({ captured: true }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    cloneSnapshot: (snapshot) => ({ ...snapshot }),
    cloneVector: (point) => ({ ...point }),
    completeLiveActionPlayersBeforeCommit: (point) => events.push(["completeLive", point]),
    computeTimeToCoverDistance: () => 0.2,
    connectBallToPlayerForNextAction: (player, point, blend) => events.push(["connect", player.id, point, blend]),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    finalizeCurrentActionStep: () => events.push(["finalize"]),
    formatTime: (time) => `${time.toFixed(2)}s`,
    getBallDuelScore: (player) => player.team === "away" ? 1.2 : 0.2,
    getBallTravelProgress: () => 0.4,
    getDefensiveAggressionPreset: () => ({
      contactWindow: 1,
      contestedMargin: 0.05,
      etaTolerance: 0.75,
      laneAheadWindow: 0.3,
      laneBehindWindow: 0.3,
      laneScoreThreshold: 0.55,
      marginThreshold: 0.12,
      reachMultiplier: 1,
      scoreBonus: 0.14,
    }),
    getLiveDribbleSpeed: () => 5,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerDecisionContext: (player) => ({
      pressure: player.team === "home" ? 0.2 : 0.1,
      profile: {
        composure: player.team === "home" ? 0.48 : 0.86,
        decisionQuality: player.team === "home" ? 0.45 : 0.9,
        decisionSpeed: player.team === "home" ? 0.45 : 0.9,
        perception: player.team === "home" ? 0.45 : 0.9,
        pressResistance: player.team === "home" ? 0.45 : 0.9,
        tacticalDiscipline: player.team === "home" ? 0.45 : 0.9,
        technicalSecurity: player.team === "home" ? 0.45 : 0.9,
      },
    }),
    getSecurePossessionContext: () => null,
    isGoalkeeper: (player) => player?.role === "GK",
    isInsideOpponentBox: () => false,
    logEvent: (message) => events.push(["log", message]),
    normalizeAngle: (angle) => angle,
    playerRadiusMeters: 0.6,
    projectPointOnSegmentWithRatio: () => ({ point: { x: 22.4, y: 34 }, ratio: 0.4 }),
    queueNextSequenceStep: () => events.push(["queue"]),
    scheduleAutoPilotContinuation: (...args) => events.push(["schedule", ...args]),
    setPiecePhaseProfiles: {
      freeKick: { label: "Free-kick" },
      penalty: { label: "Penalty" },
    },
    clearSecurePossession: () => events.push(["clearSecure"]),
    setSecurePossessionAfterBallWin: (winner, loser, point, reason) => {
      events.push(["secureWin", winner.id, loser.id, point, reason]);
    },
    state,
    teams: { home: { name: "Home" }, away: { name: "Away" } },
    ui: { playPauseButton: { textContent: "Start" } },
    ...overrides,
  };

  return {
    engine: createGameSimulatorBallResolutionDribbleChallenges(deps),
    events,
    state,
  };
}

test("game simulator ball resolution dribble challenges resolves defensive tackle turnover", () => {
  const { engine, events, state } = createDribbleChallenges();

  const candidate = engine.getDribbleTackleCandidate(state.players[0]);
  expect(candidate?.player.id).toBe("A4");

  expect(engine.resolveDribbleDefensiveChallenge()).toBe(true);
  expect(events).toContainEqual(["connect", "A4", { x: 22, y: 34 }, 0.7]);
  expect(events).toContainEqual(["secureWin", "A4", "H8", { x: 22, y: 34 }, "tackle"]);
  expect(events).toContainEqual(["completeLive", { x: 22, y: 34 }]);
  expect(events).toContainEqual(["finalize"]);
  expect(state.ball.actionType).toBeNull();
  expect(state.isRunning).toBe(false);
});

test("game simulator ball resolution dribble challenges creates foul restart", () => {
  const { engine, events, state } = createDribbleChallenges({
    state: {
      ...createDribbleChallenges().state,
      ball: {
        ...createDribbleChallenges().state.ball,
        position: { x: 24.2, y: 34 },
        target: { x: 32, y: 34 },
      },
      defensiveAggressionPreset: "aggressive",
      players: [
        { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 22, y: 34 } },
        { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 22.4, y: 34 } },
      ],
    },
    projectPointOnSegmentWithRatio: () => ({ point: { x: 24, y: 34 }, ratio: 0.42 }),
  });

  const foul = engine.getDribbleFoulCandidate(state.players[0]);
  expect(foul?.player.id).toBe("A4");

  engine.completeDribbleFoulRestart(foul, 0.58);

  expect(events).toContainEqual(["clearSecure"]);
  expect(events).toContainEqual(["completeLive", { x: 24.2, y: 34 }]);
  expect(events).toContainEqual(["schedule", null, "dribble"]);
  expect(state.draftStep.nextRestartPhase).toMatchObject({
    type: "freeKick",
    teamId: "home",
    label: "Free-kick",
  });
  expect(state.ball.actionType).toBeNull();
});
