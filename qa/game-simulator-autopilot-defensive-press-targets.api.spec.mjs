import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePressTargets } from "../src/modules/game-simulator/autopilot-defensive-press-targets.mjs";

function createPressDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      ownerPlayerId: "HGK",
      position: { x: 18, y: 24 },
      startPosition: { x: 6, y: 34 },
      target: { x: 18, y: 24 },
    },
    draftStep: null,
    players: [],
    restartPhase: null,
  };
  const teams = overrides.teams || {
    home: { formation: "4-3-3" },
    away: { formation: "4-3-3" },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveAutopilotLineKey: (player) => player.lineKey || "midfield",
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOffensiveRoleKey: (player) => player?.roleKey || "midfielder",
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPitchThreatProfile: () => ({ value: 0.48 }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({
      profile: {
        decisionSpeed: 0.6,
        tacticalDiscipline: 0.7,
      },
    }),
    getPlayerMagnetLabel: (player) => player.label || "",
    getWideSideSign: (point) => {
      if (!point || !Number.isFinite(point.y)) {
        return 0;
      }
      return point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    teams,
    ...overrides,
  };
}

test("game simulator autopilot defensive press targets expose moved press contracts", () => {
  const defensivePressTargets = createGameSimulatorAutopilotDefensivePressTargets(createPressDeps());

  expect(typeof defensivePressTargets.chooseDefensiveAutopilotPresser).toBe("function");
  expect(typeof defensivePressTargets.getDefensivePressTarget).toBe("function");
  expect(typeof defensivePressTargets.applyDefensivePresserAngleTarget).toBe("function");
  expect(typeof defensivePressTargets.pickDefensiveAutopilotPlayer).toBe("function");
  expect(typeof defensivePressTargets.applyGoalkeeperBuildOutPressTargets).toBe("function");
});

test("game simulator autopilot defensive press targets choose an outfield presser for high press", () => {
  const state = {
    ball: { position: { x: 70, y: 21 }, target: { x: 70, y: 21 } },
    draftStep: null,
    players: [
      { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 100, y: 34 } },
      { id: "A9", team: "away", lineKey: "forward", position: { x: 67, y: 22 } },
      { id: "A6", team: "away", lineKey: "midfield", position: { x: 62, y: 35 } },
      { id: "A4", team: "away", lineKey: "back", position: { x: 82, y: 33 } },
    ],
    restartPhase: null,
  };
  const defensivePressTargets = createGameSimulatorAutopilotDefensivePressTargets(createPressDeps({ state }));
  const presser = defensivePressTargets.chooseDefensiveAutopilotPresser(
    "away",
    state.ball.target,
    new Map(),
    { phaseKey: "highPress", pressingIntensity: 0.8, threatResponse: { protectCenter: 0.2 } }
  );

  expect(presser?.id).toBe("A9");
});

test("game simulator autopilot defensive press targets apply goalkeeper build-out pressure", () => {
  const state = {
    ball: {
      actionType: "pass",
      ownerPlayerId: "HGK",
      position: { x: 6, y: 34 },
      startPosition: { x: 6, y: 34 },
      target: { x: 24, y: 21 },
    },
    draftStep: {
      actionType: "pass",
      receiverPlayerId: "H2",
      target: { x: 24, y: 21 },
      beforeSnapshot: {
        ball: {
          ownerPlayerId: "HGK",
          position: { x: 6, y: 34 },
        },
      },
      offensiveAutopilot: { principleLabel: "GK build first pass" },
      autoPrinciples: [],
    },
    players: [
      { id: "HGK", team: "home", lineKey: "gk", role: "Goalkeeper", position: { x: 6, y: 34 } },
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 24, y: 21 } },
      { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 42, y: 27 } },
      { id: "A10", team: "away", lineKey: "forward", label: "10", position: { x: 46, y: 36 } },
      { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 58, y: 32 } },
      { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 58, y: 43 } },
      { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 78, y: 34 } },
    ],
    restartPhase: null,
  };
  const defensivePressTargets = createGameSimulatorAutopilotDefensivePressTargets(createPressDeps({ state }));
  const targets = new Map();

  const result = defensivePressTargets.applyGoalkeeperBuildOutPressTargets(
    "away",
    targets,
    {
      forward: state.players.filter((player) => player.team === "away" && player.lineKey === "forward"),
      midfield: state.players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
      back: state.players.filter((player) => player.team === "away" && player.lineKey === "back"),
    },
    null,
    state.ball.target,
    { phaseKey: "highPress" }
  );

  expect(result.labels).toContain("Press GK first pass");
  expect(result.presser?.team).toBe("away");
  expect(targets.size).toBeGreaterThanOrEqual(3);
});
