import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotPressureEscapeCandidates } from "../src/modules/game-simulator/autopilot-pressure-escape-candidates.mjs";

function getLaneKey(point) {
  if (point.y < 14) return "leftWide";
  if (point.y < 27) return "leftHalf";
  if (point.y < 41) return "central";
  if (point.y < 54) return "rightHalf";
  return "rightWide";
}

function createPressureCandidateDeps(overrides = {}) {
  const state = {
    restartPhase: null,
    players: [
      { id: "H6", team: "home", position: { x: 50, y: 8 }, role: "Pivot", shortLabel: "6" },
      { id: "H11", team: "home", position: { x: 58, y: 48 }, role: "Wide Forward", shortLabel: "LW" },
      { id: "H8", team: "home", position: { x: 55, y: 25 }, role: "Central Midfielder", shortLabel: "8" },
      { id: "A7", team: "away", position: { x: 49, y: 10 }, role: "Wide Forward", shortLabel: "RW" },
    ],
  };
  const laneIndexes = { leftWide: 0, leftHalf: 1, central: 2, rightHalf: 3, rightWide: 4 };

  return {
    chooseScoredCandidateWithVariation: (options) => [...options].sort((a, b) => b.score - a.score)[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(105, point.x)),
      y: Math.max(0, Math.min(68, point.y)),
    }),
    computePassLaneClarity: (_carrier, target) => (target.y > 42 ? 0.84 : 0.68),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_start, target) => ({
      value: target.x >= 55 ? 0.62 : 0.32,
      lineBreakCount: target.x >= 56 ? 1 : 0,
      openTarget: 0.72,
      targetThreat: {
        value: target.x >= 56 ? 0.6 : 0.34,
        box: 0.08,
        cutbackZone: target.y > 42 ? 0.28 : 0.04,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotPressureEscapeContext: () => ({
      active: true,
      pressure: 0.72,
      opponentDensity: 3,
      sideSign: -1,
      isWideTrap: true,
      trapLoad: 0.84,
    }),
    getAutoPilotRoleStrength: () => 0.68,
    getCarryLaneOpenSpaceScore: () => 0.7,
    getNearestOpponentGapInCarryLane: () => 8,
    getOffensiveRoleKey: (player) => (player.id === "H11" ? "wideForward" : player.id === "H8" ? "connector" : "pivot"),
    getOpponentBlockReadProfile: () => ({ ballSideCompression: 0.68 }),
    getOpponentDensityAtPoint: (_teamId, point) => (point.y < 14 ? 3 : point.y > 42 ? 1 : 2),
    getOpponentPressureAtPoint: (_teamId, point) => (point.y < 14 ? 0.72 : point.y > 42 ? 0.22 : 0.46),
    getPitchLaneIndex: (laneOrPoint) => laneIndexes[typeof laneOrPoint === "string" ? laneOrPoint : getLaneKey(laneOrPoint)] ?? 2,
    getPitchLaneKey: getLaneKey,
    getPitchThreatProfile: (point) => ({
      value: point.x >= 56 ? 0.6 : 0.36,
      box: 0.08,
      cutbackZone: point.y > 42 ? 0.28 : 0.04,
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel ?? player.id,
    getPlayerPressureLoad: (player) => (player.id === "H6" ? 0.72 : 0.24),
    getTeamDensityAtPoint: (_teamId, point) => (point.y < 14 ? 0 : point.y > 42 ? 2 : 1),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < 30 ? -1 : y > 38 ? 1 : 0;
    },
    isFrontLineRole: (roleKey) => ["wideForward", "striker"].includes(roleKey),
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    isPassReceiverOffside: () => false,
    isWidePrincipleZone: (point) => Math.abs(point.y - 34) >= 12,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot pressure escape candidates expose moved candidate builder", () => {
  const pressureCandidates = createGameSimulatorAutopilotPressureEscapeCandidates(createPressureCandidateDeps());

  expect(typeof pressureCandidates.buildAutoPilotPressureTrapEscapeCandidate).toBe("function");
});

test("game simulator autopilot pressure escape candidates choose an escape option", () => {
  const pressureCandidates = createGameSimulatorAutopilotPressureEscapeCandidates(createPressureCandidateDeps());
  const carrier = { id: "H6", team: "home", position: { x: 50, y: 8 } };

  const candidate = pressureCandidates.buildAutoPilotPressureTrapEscapeCandidate(
    carrier,
    carrier.position,
    { switchBias: 0.74, shortSupport: 0.5, tempo: 0.65, directness: 0.48, lineBreakBias: 0.48, carryBias: 0.5 }
  );

  expect(candidate).toBeTruthy();
  expect(candidate.actionType).toBe("pass");
  expect(candidate.principleKey).toContain("pressure-trap-");
  expect(candidate.principleLabels).toContain("Press escape");
});
