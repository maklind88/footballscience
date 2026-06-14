import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandLooseBallRecovery } from "../src/modules/game-simulator/command-loose-ball-recovery.mjs";

function cloneVector(point) {
  return point ? { ...point } : point;
}

function createLooseBallRecovery(overrides = {}) {
  const events = [];
  const state = overrides.state || {
    ball: {
      claimRadius: 1,
      position: { x: 22, y: 34 },
      securePossession: { ownerPlayerId: "H8" },
      secondBallContext: {
        attackingTeamId: "home",
        defendingTeamId: "away",
        originPoint: { x: 18, y: 34 },
        preferredPlayerId: "H6",
        preferredTeamId: "home",
        source: "cross-spill",
        spillPoint: { x: 22, y: 34 },
        urgency: 0.85,
      },
    },
    draftStep: null,
    players: [
      { id: "H6", team: "home", role: "CM", roleKey: "pivot", shortLabel: "H6", position: { x: 20, y: 34 } },
      { id: "H9", team: "home", role: "ST", roleKey: "striker", shortLabel: "H9", position: { x: 42, y: 35 } },
      { id: "A5", team: "away", role: "CB", roleKey: "rest", shortLabel: "A5", position: { x: 24, y: 34 } },
    ],
  };

  const recovery = createGameSimulatorCommandLooseBallRecovery({
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    applyAutopilotsForCurrentAction: () => events.push(["autopilots"]),
    captureSnapshot: () => ({ ball: {}, players: state.players.map((player) => ({ id: player.id })) }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => cloneVector(point),
    clearAutoPilotReceiveMomentum: (playerId) => events.push(["clearMomentum", playerId]),
    clearSecurePossession: () => {
      state.ball.securePossession = null;
      events.push(["clearSecure"]);
    },
    cloneVector,
    computeTimeToCoverDistance: (_player, runDistance) => runDistance / 6,
    connectBallToPlayerForNextAction: (player, point) => {
      state.ball.ownerPlayerId = player.id;
      state.ball.position = cloneVector(point);
      return true;
    },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    formatTime: (value) => `${value.toFixed(2)}s`,
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: (point) => point.x,
    getOffensiveAutopilotProfile: () => ({ counterPress: 0.62 }),
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getOpponentPressureAtPoint: () => 0.32,
    getPitchThreatProfile: (point) => ({
      assistZone: point.x > 68 ? 0.24 : 0.12,
      box: point.x > 68 ? 0.22 : 0.08,
      depth: point.x,
      goldenZone: 0.08,
      value: 0.42,
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerDecisionContext: () => ({
      profile: {
        composure: 0.74,
        decisionQuality: 0.72,
        decisionSpeed: 0.78,
        perception: 0.82,
        pressResistance: 0.7,
        tacticalDiscipline: 0.76,
        technicalSecurity: 0.74,
      },
    }),
    getPlayerMagnetLabel: (player) => player.role === "ST" ? "9" : player.role === "CB" ? "CB" : "6",
    getPlayerPositionForControlPoint: (_player, point) => cloneVector(point),
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getTeamSupportCountAroundPoint: () => 1,
    isGoalkeeper: (player) => player.role === "GK",
    isInsideOpponentBox: (point, teamId) => teamId === "home" ? point.x >= 88 : point.x <= 17,
    isInsideOwnBox: (point, teamId) => teamId === "home" ? point.x <= 17 : point.x >= 88,
    isWideChannel: (point) => point.y <= 16 || point.y >= 52,
    keepSecurePossessionOnlyForOwner: (playerId) => events.push(["keepSecure", playerId]),
    lerp: (start, end, weight) => start + (end - start) * weight,
    logEvent: (message) => events.push(["log", message]),
    normalize: (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    },
    pitch: { length: 105, width: 68 },
    setSecurePossessionAfterControlledTouch: (player, point, config) => {
      state.ball.securePossession = { ownerPlayerId: player.id, point: cloneVector(point), config };
    },
    setSelectedPlayers: (playerIds, activePlayerId) => events.push(["selected", playerIds, activePlayerId]),
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  });

  return { events, recovery, state };
}

test("game simulator command loose ball recovery chooses the strongest second-ball runner", () => {
  const { recovery, state } = createLooseBallRecovery();

  const chosen = recovery.chooseAutoPilotLooseBallRecovery(state.ball.position);

  expect(chosen.player.id).toBe("H6");
  expect(chosen.secondBallLabel).toBe("second-ball team reaction");
  expect(chosen.duration).toBeGreaterThan(0.35);
});

test("game simulator command loose ball recovery issues recovery command and control touch", () => {
  const { events, recovery, state } = createLooseBallRecovery();
  const chosen = recovery.chooseAutoPilotLooseBallRecovery(state.ball.position);

  expect(recovery.issueLooseBallRecoveryCommand(chosen)).toBe(true);

  expect(state.draftStep).toMatchObject({
    actionType: "recovery",
    autoGenerated: true,
    carrierPlayerId: "H6",
    profileKey: "loose-ball-recovery",
    secondBallContext: { preferredPlayerId: "H6" },
  });
  expect(state.ball.actionType).toBe("recovery");
  expect(state.ball.carrierPlayerId).toBe("H6");
  expect(events).toContainEqual(["autopilots"]);

  const player = state.players.find((entry) => entry.id === "H6");
  state.ball.secondBallContext = { attackingTeamId: "home", defendingTeamId: "away" };
  expect(recovery.applyLooseBallCollectControlTouch(player, { x: 23, y: 54 })).toBe(true);
  expect(state.ball.ownerPlayerId).toBe("H6");
  expect(state.ball.secondBallContext).toBeNull();
  expect(state.ball.securePossession.ownerPlayerId).toBe("H6");
});
