import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionSecurePossession } from "../src/modules/game-simulator/ball-resolution-secure-possession.mjs";

function createSecurePossession(overrides = {}) {
  const state = overrides.state || {
    time: 12,
    ball: {
      securePossession: null,
      ownerPlayerId: null,
      position: { x: 20, y: 34 },
      target: { x: 20, y: 34 },
      inTransit: true,
      elapsedTravelTime: 0.4,
    },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 18.8, y: 34 }, bodyAngle: Math.PI },
      { id: "A6", team: "away", role: "DM", shortLabel: "A6", position: { x: 22.2, y: 35 }, bodyAngle: Math.PI },
      { id: "A1", team: "away", role: "GK", shortLabel: "A1", position: { x: 3, y: 34 }, bodyAngle: 0 },
    ],
  };
  const pitch = { length: 105, width: 68 };
  const deps = {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getOffensiveRoleKey: () => "connector",
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerDecisionContext: () => ({
      pressure: 0.24,
      profile: {
        composure: 0.8,
        decisionQuality: 0.82,
        pressResistance: 0.78,
        technicalSecurity: 0.84,
      },
    }),
    getPlayerPositionForControlPoint: (_player, point) => point,
    getPlayerPressureLoad: () => 0.26,
    getTeamAttackStyleKey: () => "balanced",
    isGoalkeeper: (player) => player?.role === "GK",
    isTransitionAttackStyle: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalize: (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    },
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };

  return {
    engine: createGameSimulatorBallResolutionSecurePossession(deps),
    state,
  };
}

test("game simulator ball resolution secure possession applies ball-win escape shield", () => {
  const { engine, state } = createSecurePossession();
  const winner = state.players[0];
  const loser = state.players[1];

  engine.setSecurePossessionAfterBallWin(winner, loser, { x: 20, y: 34 }, "tackle");

  expect(state.ball.ownerPlayerId).toBe("H8");
  expect(state.ball.securePossession).toMatchObject({
    ownerPlayerId: "H8",
    opponentPlayerId: "A4",
    reason: "tackle",
    minDistanceToExpire: 7.8,
    minTimeToExpire: 1.85,
  });
  expect(state.ball.securePossession.escapePoint).toEqual(state.ball.position);
  expect(Number.isFinite(winner.bodyAngle)).toBe(true);
});

test("game simulator ball resolution secure possession keeps controlled-touch shield context", () => {
  const { engine, state } = createSecurePossession();
  const owner = state.players[0];
  const challenger = state.players[2];

  engine.setSecurePossessionAfterControlledTouch(owner, owner.position, {
    quality: 0.82,
    reason: "controlled-reception",
  });

  expect(state.ball.securePossession.ownerPlayerId).toBe("H8");
  expect(state.ball.securePossession.opponentPlayerIds).toContain("A6");
  expect(state.ball.securePossession.opponentPlayerIds).not.toContain("A1");
  const context = engine.getSecurePossessionContext(owner, challenger);
  expect(context?.protectionRatio).toBeGreaterThan(0);

  owner.position = { x: 35, y: 34 };
  expect(engine.getSecurePossessionContext(owner, challenger)).toBeNull();
  expect(state.ball.securePossession).toBeNull();
});

test("game simulator ball resolution secure possession preserves stronger ball-win shield", () => {
  const { engine, state } = createSecurePossession();
  const owner = state.players[0];
  state.ball.securePossession = {
    ownerPlayerId: "H8",
    opponentPlayerId: "A4",
    reason: "interception",
  };

  engine.setSecurePossessionAfterControlledTouch(owner, owner.position, {
    quality: 0.92,
    reason: "controlled-reception",
  });

  expect(state.ball.securePossession).toMatchObject({
    ownerPlayerId: "H8",
    opponentPlayerId: "A4",
    reason: "interception",
  });
});
