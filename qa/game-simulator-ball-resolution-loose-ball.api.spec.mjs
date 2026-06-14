import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorBallResolutionLooseBall } from "../src/modules/game-simulator/ball-resolution-loose-ball.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createDecisionProfile(overrides = {}) {
  return {
    composure: 0.8,
    decisionQuality: 0.8,
    decisionSpeed: 0.8,
    executionUnderPressure: 0.8,
    perception: 0.8,
    pressResistance: 0.8,
    tacticalDiscipline: 0.8,
    technicalSecurity: 0.8,
    ...overrides,
  };
}

function createLooseBallDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      claimRadius: 1.2,
      controlRadius: 1.4,
      ownerPlayerId: null,
      position: { x: 20, y: 34 },
      profileKey: "firm-feet",
      securePossession: null,
      secondBallContext: null,
      target: { x: 20, y: 34 },
    },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 32, y: 34 }, bodyAngle: Math.PI },
    ],
  };
  const clearedMomentum = [];

  const deps = {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    blendAngles: (a, b, weightA = 0.5, weightB = 0.5) => ((a * weightA) + (b * weightB)) / (weightA + weightB),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    clearAutoPilotReceiveMomentum: (playerId = null) => clearedMomentum.push(playerId),
    clearSecurePossession: () => {
      state.ball.securePossession = null;
    },
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: (_player, gap) => gap * 0.2,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionInitiator: () => state.players[0] ?? null,
    getAutoPilotRoleStrength: () => 0.7,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getOffensiveRoleKey: () => "connector",
    getOrientationMovementProfile: () => ({ coverModifier: 1, receiveModifier: 1 }),
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ pressure: 0.15, profile: createDecisionProfile() }),
    getPlayerMagnetLabel: (player) => player.role,
    getPlayerPressureLoad: () => 0.15,
    getShotReboundClaimAdjustment: () => 0,
    getShotReboundClaimContext: () => ({ active: false, urgency: 0, insideAttackingBox: false, insideDefendingBox: false }),
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    isGoalkeeper: (player) => player?.role === "GK",
    isInsideOpponentBox: () => false,
    keepSecurePossessionOnlyForOwner: (playerId) => {
      if (state.ball.securePossession?.ownerPlayerId !== playerId) {
        state.ball.securePossession = null;
      }
    },
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalizeAngle: (angle) => angle,
    pitch,
    placePlayerWithControlPoint: (player, point, facingAngle) => {
      player.position = point;
      player.bodyAngle = facingAngle;
    },
    rotatePlayerBodyToward: (player, point, blend = 1) => {
      player.bodyAngle = Math.atan2(point.y - player.position.y, point.x - player.position.x) * blend;
    },
    setSecurePossessionAfterControlledTouch: (player, point, context) => {
      state.ball.securePossession = {
        ownerPlayerId: player.id,
        point,
        reason: context.reason,
      };
    },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };

  return {
    engine: createGameSimulatorBallResolutionLooseBall(deps),
    state,
    clearedMomentum,
  };
}

test("game simulator ball resolution loose ball exposes claim and spill helpers", () => {
  const { engine } = createLooseBallDeps();

  expect(typeof engine.getLooseBallClaimScore).toBe("function");
  expect(typeof engine.getBallContestControlScore).toBe("function");
  expect(typeof engine.getBallDuelScore).toBe("function");
  expect(typeof engine.resolveLooseBallClaim).toBe("function");
  expect(typeof engine.connectBallToPlayerForNextAction).toBe("function");
  expect(typeof engine.applyShotReboundControlTouch).toBe("function");
  expect(typeof engine.keepBallPlayableForNextAction).toBe("function");
  expect(typeof engine.createLooseBallSpill).toBe("function");
});

test("game simulator ball resolution loose ball resolves a nearby preferred claim", () => {
  const { engine, state, clearedMomentum } = createLooseBallDeps();

  const claim = engine.resolveLooseBallClaim({ x: 20.2, y: 34 }, 1.5, "H8", 0.08);

  expect(claim.player.id).toBe("H8");
  expect(claim.claimType).toBe("immediate");
  expect(engine.connectBallToPlayerForNextAction(claim.player, { x: 20.2, y: 34 }, 0.5)).toBe(true);
  expect(state.ball.ownerPlayerId).toBe("H8");
  expect(state.ball.position).toEqual({ x: 20, y: 34 });
  expect(clearedMomentum).toContain("H8");
});

test("game simulator ball resolution loose ball creates second-ball context for unclaimed spills", () => {
  const { engine, state } = createLooseBallDeps({
    state: {
      ball: {
        actionType: "shot",
        claimRadius: 0.2,
        controlRadius: 1,
        ownerPlayerId: null,
        position: { x: 50, y: 34 },
        profileKey: "shot",
        securePossession: { ownerPlayerId: "H8" },
        secondBallContext: null,
        target: { x: 50, y: 34 },
      },
      players: [
        { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, bodyAngle: 0 },
        { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 82, y: 34 }, bodyAngle: Math.PI },
      ],
    },
  });

  const spill = engine.createLooseBallSpill(
    { x: 50, y: 34 },
    0,
    2,
    null,
    0,
    { source: "test-spill", attackingTeamId: "home", defendingTeamId: "away", urgency: 0.6 }
  );

  expect(spill.winner).toBeNull();
  expect(state.ball.ownerPlayerId).toBeNull();
  expect(state.ball.securePossession).toBeNull();
  expect(state.ball.secondBallContext).toMatchObject({
    source: "test-spill",
    preferredTeamId: "home",
    attackingTeamId: "home",
    defendingTeamId: "away",
  });
  expect(state.ball.secondBallContext.spillPoint).toEqual({ x: 52, y: 34 });
});

test("game simulator ball resolution loose ball is split out of the engine", () => {
  const engineSource = readProjectFile("src/modules/game-simulator/ball-resolution-engine.mjs");
  const looseBallSource = readProjectFile("src/modules/game-simulator/ball-resolution-loose-ball.mjs");

  expect(engineSource).toContain('from "./ball-resolution-loose-ball.mjs"');
  expect(engineSource).toContain("createGameSimulatorBallResolutionLooseBall({");
  expect(engineSource).not.toContain("function resolveLooseBallClaim(");
  expect(engineSource).not.toContain("function createLooseBallSpill(");
  expect(looseBallSource).toContain("createGameSimulatorBallResolutionLooseBall");
  expect(looseBallSource).toContain("function resolveLooseBallClaim(");
  expect(looseBallSource).toContain("function createLooseBallSpill(");
});
