import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandBoundaryOutcomes } from "../src/modules/game-simulator/command-boundary-outcomes.mjs";

function createBoundaryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    time: 42,
    ball: {
      actionType: "shot",
      initiatorPlayerId: "H9",
      target: { x: 106, y: 34 },
    },
    draftStep: null,
    players: [
      { id: "H9", team: "home", role: "ST", position: { x: 103, y: 34 } },
      { id: "A1", team: "away", role: "GK", position: { x: 102, y: 34 } },
    ],
  };
  return {
    ballRadiusMeters: 0.11,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getActionInitiator: () => state.players[0] ?? null,
    getGoalDirectionSign: (side) => (side === "left" ? -1 : 1),
    getGoalLineX: (side) => (side === "left" ? 0 : pitch.length),
    getGoalNetDisplayPoint: (side, y) => ({
      x: side === "left" ? -2.6 : pitch.length + 2.6,
      y,
    }),
    getOpponentGoalSide: (teamId) => (teamId === "home" ? "right" : "left"),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPlannedPossessionTeamId: () => "home",
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    isBetweenGoalPosts: (y, margin = 0) => Math.abs(y - pitch.width / 2) <= 7.32 / 2 + margin,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    ...overrides,
  };
}

test("game simulator command boundary outcomes expose moved contracts", () => {
  const outcomes = createGameSimulatorCommandBoundaryOutcomes(createBoundaryDeps());

  expect(typeof outcomes.detectShotGoal).toBe("function");
  expect(typeof outcomes.detectShotOutOfPlay).toBe("function");
  expect(typeof outcomes.detectTouchlineOutOfPlay).toBe("function");
});

test("game simulator command boundary outcomes detect a goal crossing", () => {
  const outcomes = createGameSimulatorCommandBoundaryOutcomes(createBoundaryDeps());

  const goal = outcomes.detectShotGoal({ x: 104, y: 34 }, { x: 105.6, y: 34 });

  expect(goal).toMatchObject({
    scoringTeamId: "home",
    concedingTeamId: "away",
    side: "right",
    scoredAt: 42,
    point: { x: 105, y: 34 },
    displayPoint: { x: 107.6, y: 34 },
  });
});

test("game simulator command boundary outcomes detect a goal kick after missed shot", () => {
  const outcomes = createGameSimulatorCommandBoundaryOutcomes(createBoundaryDeps({
    state: {
      time: 44,
      ball: {
        actionType: "shot",
        initiatorPlayerId: "H9",
        target: { x: 106, y: 45 },
      },
      draftStep: null,
      players: [{ id: "H9", team: "home", role: "ST", position: { x: 103, y: 45 } }],
    },
  }));

  const out = outcomes.detectShotOutOfPlay({ x: 104, y: 45 }, { x: 105.6, y: 45 });

  expect(out).toMatchObject({
    type: "goalKick",
    shootingTeamId: "home",
    restartTeamId: "away",
    side: "right",
    occurredAt: 44,
    point: { x: 105, y: 45 },
    displayPoint: { x: 104.55, y: 45 },
  });
});

test("game simulator command boundary outcomes detect touchline restart", () => {
  const outcomes = createGameSimulatorCommandBoundaryOutcomes(createBoundaryDeps({
    state: {
      time: 46,
      ball: {
        actionType: "pass",
        initiatorPlayerId: "H8",
        target: { x: 44, y: 70 },
      },
      draftStep: null,
      players: [{ id: "H8", team: "home", role: "CM", position: { x: 40, y: 66 } }],
    },
  }));

  const out = outcomes.detectTouchlineOutOfPlay({ x: 40, y: 67 }, { x: 42, y: 69 });

  expect(out).toMatchObject({
    type: "throwIn",
    lastTouchTeamId: "home",
    restartTeamId: "away",
    sideY: 68,
    occurredAt: 46,
    point: { x: 41, y: 68 },
    displayPoint: { x: 41, y: 68.45 },
  });
});
