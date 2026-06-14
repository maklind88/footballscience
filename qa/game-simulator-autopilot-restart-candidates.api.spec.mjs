import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotRestartCandidates } from "../src/modules/game-simulator/autopilot-restart-candidates.mjs";

function createRestartDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    sequence: { steps: [] },
    players: [
      { id: "H2", team: "home", position: { x: 22, y: 16 }, roleKey: "wideBack", shortLabel: "LB" },
      { id: "H7", team: "home", position: { x: 63, y: 10 }, roleKey: "wideForward", shortLabel: "RW" },
      { id: "H8", team: "home", position: { x: 47, y: 34 }, roleKey: "connector", shortLabel: "CM" },
      { id: "H9", team: "home", position: { x: 52, y: 34 }, roleKey: "striker", shortLabel: "ST" },
      { id: "A1", team: "away", position: { x: 94, y: 34 }, roleKey: "gk", shortLabel: "GK" },
    ],
  };
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  return {
    chooseCornerDeliveryRunner: (teamId, target) => {
      const runner = state.players.find((player) => player.team === teamId && player.roleKey === "striker");
      return runner ? { player: runner, timeToTarget: 1.6, score: 0.8, target } : null;
    },
    chooseFreeKickShortReceiver: () => null,
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    computePassLaneClarity: () => 0.82,
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: (player, strength) => {
      if (strength === "finisher" && player.roleKey === "striker") {
        return 0.86;
      }
      if (strength === "creator") {
        return 0.72;
      }
      if (strength === "receiver") {
        return 0.76;
      }
      return 0.64;
    },
    getAutoPilotShotTarget: (teamId, carrier) => ({ x: teamId === "home" ? pitch.length : 0, y: carrier.position.y }),
    getCornerDeliveryTarget: (teamId, sideY, slot) => ({
      x: teamId === "home" ? 94 : 11,
      y: slot === "nearPost" ? sideY + 4 : slot === "farPost" ? pitch.width - sideY : pitch.width / 2,
    }),
    getFreeKickDeliveryTarget: (teamId, point, slot) => ({
      x: teamId === "home" ? 91 : 14,
      y: slot === "edge" ? pitch.width / 2 - 10 : pitch.width / 2,
    }),
    getGoalkeeperTargetOpenness: () => 0.72,
    getKickoffSupportId: () => "H8",
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchLaneIndex: (lane) => (lane === "leftWide" ? 0 : lane === "central" ? 2 : 4),
    getPitchLaneKey: (point) => (point.y < 20 ? "leftWide" : point.y > 48 ? "rightWide" : "central"),
    getPitchThreatProfile: () => ({ value: 0.62, box: 0.52 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.18,
    getShotAngleQuality: () => 0.52,
    getShotWindowProfile: () => ({
      laneClarity: 0.82,
      goalkeeperOpenness: 0.7,
      angleQuality: 0.56,
      blockRisk: 0.16,
      quality: 0.62,
    }),
    getState: () => state,
    getTeamSupportCountAroundPoint: (teamId, point, excludedIds = new Set(), radius = 12) => (
      state.players.reduce((count, player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || player.roleKey === "gk") {
          return count;
        }
        return count + (distance(player.position, point) <= radius ? 1 : 0);
      }, 0)
    ),
    getWideSideSign: (point) => {
      const position = point?.position || point;
      return position?.y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player.roleKey === "gk",
    isLastStepKickoffResetForTeam: () => false,
    kickoffOpeningProfiles: {
      "secure-backline": {
        key: "secure-backline",
        label: "Secure backline",
        receiverRoles: ["rest", "gk", "wideBack"],
        firstTouchMode: "inside",
      },
    },
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 18 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

function createProfile(overrides = {}) {
  return {
    crossBias: 0.5,
    deliveryBias: 0.5,
    directness: 0.5,
    firstTouchForwardBias: 0.48,
    lineBreakBias: 0.5,
    recycleWindow: 0.5,
    risk: 0.42,
    shootBias: 0.62,
    shortSupport: 0.7,
    styleLabel: "Balanced",
    switchBias: 0.46,
    ...overrides,
  };
}

test("game simulator autopilot restart candidates expose moved restart contracts", () => {
  const candidates = createGameSimulatorAutopilotRestartCandidates(createRestartDeps());

  expect(typeof candidates.buildAutoPilotKickoffCandidate).toBe("function");
  expect(typeof candidates.getLastKickoffOpeningProfile).toBe("function");
  expect(typeof candidates.getKickoffOpeningCandidateFit).toBe("function");
  expect(typeof candidates.buildAutoPilotPostKickoffResetCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotCornerCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotThrowInCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotPenaltyCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotFreeKickCandidate).toBe("function");
});

test("game simulator autopilot restart candidates build kickoff reset", () => {
  const deps = createRestartDeps({
    state: {
      restartPhase: { type: "kickoff", teamId: "home", supportPlayerId: "H8" },
      sequence: { steps: [] },
      players: [
        { id: "H8", team: "home", position: { x: 47, y: 34 }, roleKey: "connector", shortLabel: "CM" },
        { id: "H9", team: "home", position: { x: 52, y: 34 }, roleKey: "striker", shortLabel: "ST" },
      ],
    },
  });
  const candidates = createGameSimulatorAutopilotRestartCandidates(deps);
  const carrier = deps.getPlayerById("H9");

  const candidate = candidates.buildAutoPilotKickoffCandidate(carrier, carrier.position, createProfile());

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H8",
    label: "kick-off reset",
  });
});

test("game simulator autopilot restart candidates build throw-in support", () => {
  const deps = createRestartDeps({
    state: {
      restartPhase: { type: "throwIn", teamId: "home", point: { x: 60, y: 2 } },
      sequence: { steps: [] },
      players: [
        { id: "H2", team: "home", position: { x: 60, y: 2 }, roleKey: "wideBack", shortLabel: "LB" },
        { id: "H7", team: "home", position: { x: 63, y: 10 }, roleKey: "wideForward", shortLabel: "RW" },
      ],
    },
  });
  const candidates = createGameSimulatorAutopilotRestartCandidates(deps);
  const carrier = deps.getPlayerById("H2");

  const candidate = candidates.buildAutoPilotThrowInCandidate(carrier, carrier.position, createProfile({
    shortSupport: 0.82,
  }));

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H7",
    principleKey: "throw-in-support",
  });
});

test("game simulator autopilot restart candidates build penalty shot", () => {
  const deps = createRestartDeps({
    state: {
      restartPhase: { type: "penalty", teamId: "home" },
      sequence: { steps: [] },
      players: [
        { id: "H9", team: "home", position: { x: 88, y: 34 }, roleKey: "striker", shortLabel: "ST" },
      ],
    },
  });
  const candidates = createGameSimulatorAutopilotRestartCandidates(deps);
  const carrier = deps.getPlayerById("H9");

  const candidate = candidates.buildAutoPilotPenaltyCandidate(carrier, carrier.position, createProfile({
    shootBias: 0.78,
  }));

  expect(candidate).toMatchObject({
    actionType: "shot",
    label: "penalty",
    mustShoot: true,
    principleKey: "penalty-execution",
  });
});

test("game simulator autopilot restart candidates build direct free kick", () => {
  const deps = createRestartDeps({
    state: {
      restartPhase: { type: "freeKick", teamId: "home", point: { x: 78, y: 34 } },
      sequence: { steps: [] },
      players: [
        { id: "H10", team: "home", position: { x: 78, y: 34 }, roleKey: "connector", shortLabel: "AM" },
      ],
    },
  });
  const candidates = createGameSimulatorAutopilotRestartCandidates(deps);
  const carrier = deps.getPlayerById("H10");

  const candidate = candidates.buildAutoPilotFreeKickCandidate(carrier, carrier.position, createProfile({
    shootBias: 0.82,
  }));

  expect(candidate).toMatchObject({
    actionType: "shot",
    label: "direct free-kick",
    principleKey: "direct-free-kick",
  });
});
