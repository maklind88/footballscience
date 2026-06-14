import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionShotRebounds } from "../src/modules/game-simulator/ball-resolution-shot-rebounds.mjs";

function createShotReboundDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state =
    overrides.state ??
    {
      ball: {
        actionType: "shot",
        initiatorPlayerId: "H8",
        profileKey: "shot parry",
        secondBallContext: {
          attackingTeamId: "home",
          defendingTeamId: "away",
          source: "save parry",
          urgency: 0.88,
        },
      },
      draftStep: {
        beforeSnapshot: { ball: { ownerPlayerId: "H8" } },
      },
      players: [
        { id: "H8", team: "home", label: "8", position: { x: 82, y: 28 } },
        { id: "H9", team: "home", label: "9", position: { x: 94, y: 33 } },
        { id: "A1", team: "away", label: "GK", position: { x: 99, y: 34 } },
        { id: "A4", team: "away", label: "CB", position: { x: 91, y: 34 } },
      ],
    };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    distance,
    getActionInitiator: () => state.players.find((player) => player.id === "H8") ?? null,
    getOrientationMovementProfile: () => ({ receiveModifier: 0.84 }),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPitchThreatProfile: () => ({
      box: 0.42,
      centrality: 0.8,
      cutbackZone: 0.18,
      depth: 86,
      value: 0.66,
    }),
    getPlannedPossessionTeamId: () => "home",
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerDecisionContext: () => ({
      profile: {
        composure: 0.78,
        decisionSpeed: 0.82,
        perception: 0.8,
        tacticalDiscipline: 0.78,
      },
    }),
    getPlayerMagnetLabel: (player) => player?.label ?? "",
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    isGoalkeeper: (player) => player?.label === "GK",
    isInsideOpponentBox: (_point, teamId) => teamId === "home",
    isInsideOwnBox: (_point, teamId) => teamId === "away",
    pitch,
    state,
    ...overrides,
  };
}

test("game simulator ball resolution shot rebounds expose moved contracts", () => {
  const shotRebounds = createGameSimulatorBallResolutionShotRebounds(createShotReboundDeps());

  expect(typeof shotRebounds.getShotReboundClaimContext).toBe("function");
  expect(typeof shotRebounds.getShotReboundClaimAdjustment).toBe("function");
});

test("game simulator ball resolution shot rebounds activate only for shot rebound sources", () => {
  const inactiveDeps = createShotReboundDeps({
    state: {
      ball: {
        actionType: "pass",
        initiatorPlayerId: "H8",
        profileKey: "ground pass",
        secondBallContext: null,
      },
      draftStep: {
        beforeSnapshot: { ball: { ownerPlayerId: "H8" } },
      },
      players: [
        { id: "H8", team: "home", label: "8", position: { x: 82, y: 28 } },
      ],
    },
  });
  const inactiveShotRebounds = createGameSimulatorBallResolutionShotRebounds(inactiveDeps);
  const deps = createShotReboundDeps();
  const shotRebounds = createGameSimulatorBallResolutionShotRebounds(deps);
  const point = { x: 92, y: 34 };

  expect(inactiveShotRebounds.getShotReboundClaimContext(point, { source: "simple pass" }).active).toBe(false);

  const context = shotRebounds.getShotReboundClaimContext(point, { source: "blocked shot", urgency: 1.4 });
  expect(context.active).toBe(true);
  expect(context.attackingTeamId).toBe("home");
  expect(context.defendingTeamId).toBe("away");
  expect(context.isBlockedShot).toBe(true);
  expect(context.urgency).toBe(0.96);
  expect(context.penaltySpot).toEqual({ x: 94, y: 34 });
});

test("game simulator ball resolution shot rebounds weight poachers and box defenders", () => {
  const deps = createShotReboundDeps();
  const shotRebounds = createGameSimulatorBallResolutionShotRebounds(deps);
  const point = { x: 92, y: 34 };
  const context = shotRebounds.getShotReboundClaimContext(point, { source: "shot save parry" });
  const striker = deps.state.players.find((player) => player.id === "H9");
  const goalkeeper = deps.state.players.find((player) => player.id === "A1");
  const centreBack = deps.state.players.find((player) => player.id === "A4");

  expect(shotRebounds.getShotReboundClaimAdjustment(null, point, context)).toBe(0);
  expect(shotRebounds.getShotReboundClaimAdjustment(striker, point, context)).toBeGreaterThan(0.2);
  expect(shotRebounds.getShotReboundClaimAdjustment(centreBack, point, context)).toBeGreaterThan(0.2);
  expect(shotRebounds.getShotReboundClaimAdjustment(goalkeeper, point, context)).toBeGreaterThan(0.1);
});
