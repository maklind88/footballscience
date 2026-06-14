import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionAerialContest } from "../src/modules/game-simulator/ball-resolution-aerial-contest.mjs";

function createAerialContestDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state =
    overrides.state ??
    {
      ball: {
        actionType: "pass",
        flightStyle: "lofted",
        initiatorPlayerId: "H8",
        profileKey: "cross",
        profileLabel: "lofted box delivery",
        targetKind: "into-space",
      },
      draftStep: {
        autoPrinciples: ["cross delivery"],
        beforeSnapshot: { ball: { ownerPlayerId: "H8" } },
      },
      players: [
        { id: "H8", team: "home", label: "8", roleKey: "connector", position: { x: 74, y: 20 }, bodyAngle: 0 },
        { id: "H9", team: "home", label: "9", roleKey: "striker", position: { x: 88, y: 32 }, bodyAngle: 0 },
        { id: "A1", team: "away", label: "GK", roleKey: "gk", position: { x: 94, y: 34 }, bodyAngle: Math.PI },
        { id: "A4", team: "away", label: "CB", roleKey: "rest", position: { x: 91, y: 33 }, bodyAngle: Math.PI },
      ],
    };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const angleBetween = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    angleBetween,
    angleDifference: (first, second) => Math.abs(first - second),
    blendAngles: (first, second, firstWeight = 0.5, secondWeight = 0.5) =>
      (first * firstWeight + second * secondWeight) / (firstWeight + secondWeight),
    clamp,
    computeTimeToCoverDistance: (_player, gap) => gap / 6,
    distance,
    getActionInitiator: () => state.players.find((player) => player.id === "H8") ?? null,
    getOffensiveRoleKey: (player) => player?.roleKey ?? null,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getOrientationMovementProfile: () => ({ coverModifier: 0.86, receiveModifier: 0.82 }),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPitchThreatProfile: () => ({ assistZone: 0.32, behindLine: 0.24, box: 0.34, value: 0.58 }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerDecisionContext: () => ({
      pressure: 0.18,
      profile: {
        composure: 0.82,
        decisionQuality: 0.8,
        decisionSpeed: 0.78,
        perception: 0.8,
        pressResistance: 0.76,
        technicalSecurity: 0.79,
      },
    }),
    getPlayerFacingAngle: (player) => player.bodyAngle ?? 0,
    getPlayerMagnetLabel: (player) => player?.label ?? "",
    getReceiveFootUsageScore: () => 0.8,
    getReceiveOrientationScore: () => 0.82,
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    isGoalkeeper: (player) => player?.roleKey === "gk",
    isInsideOpponentBox: (_point, teamId) => teamId === "home",
    isInsideOwnBox: (_point, teamId) => teamId === "away",
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalizeAngle: (angle) => angle,
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator ball resolution aerial contest exposes moved contracts", () => {
  const aerial = createGameSimulatorBallResolutionAerialContest(createAerialContestDeps());

  expect(typeof aerial.getAerialPresence).toBe("function");
  expect(typeof aerial.getAerialContestScore).toBe("function");
  expect(typeof aerial.getAerialFirstContactContext).toBe("function");
  expect(typeof aerial.getAerialFirstContactScore).toBe("function");
  expect(typeof aerial.getAerialDefensiveClearanceAngle).toBe("function");
  expect(typeof aerial.getAerialAttackingKnockdownAngle).toBe("function");
  expect(typeof aerial.getAerialControlScore).toBe("function");
});

test("game simulator ball resolution aerial contest scores aerial presence and preferred first contact", () => {
  const deps = createAerialContestDeps();
  const aerial = createGameSimulatorBallResolutionAerialContest(deps);
  const striker = deps.state.players.find((player) => player.id === "H9");
  const centreBack = deps.state.players.find((player) => player.id === "A4");
  const contestPoint = { x: 91, y: 33 };
  const incomingPoint = { x: 74, y: 20 };

  expect(aerial.getAerialPresence(centreBack)).toBeGreaterThan(aerial.getAerialPresence(striker));

  const normalScore = aerial.getAerialContestScore(striker, contestPoint, incomingPoint);
  const preferredScore = aerial.getAerialContestScore(striker, contestPoint, incomingPoint, "H9", 0.2);
  expect(preferredScore).toBeGreaterThan(normalScore);
});

test("game simulator ball resolution aerial contest builds box-cross context and contact outcomes", () => {
  const deps = createAerialContestDeps();
  const aerial = createGameSimulatorBallResolutionAerialContest(deps);
  const striker = deps.state.players.find((player) => player.id === "H9");
  const goalkeeper = deps.state.players.find((player) => player.id === "A1");
  const contestPoint = { x: 91, y: 33 };
  const incomingPoint = { x: 74, y: 20 };

  const context = aerial.getAerialFirstContactContext("pass", contestPoint, incomingPoint, striker);
  expect(context.attackingTeamId).toBe("home");
  expect(context.defendingTeamId).toBe("away");
  expect(context.crossLike).toBe(true);
  expect(context.secondBallZone).toBe(true);

  const strikerScore = aerial.getAerialFirstContactScore(striker, contestPoint, incomingPoint, context);
  const goalkeeperScore = aerial.getAerialFirstContactScore(goalkeeper, contestPoint, incomingPoint, context);
  expect(goalkeeperScore).toBeGreaterThan(strikerScore);
  expect(Number.isFinite(aerial.getAerialDefensiveClearanceAngle(goalkeeper, contestPoint, 0))).toBe(true);
  expect(Number.isFinite(aerial.getAerialAttackingKnockdownAngle(striker, contestPoint, context))).toBe(true);
  expect(aerial.getAerialControlScore(striker, incomingPoint)).toBeGreaterThan(0.18);
});
