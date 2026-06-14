import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotRegainReleaseCandidates } from "../src/modules/game-simulator/autopilot-regain-release-candidates.mjs";

function createRegainReleaseDeps(overrides = {}) {
  const state = overrides.state || {
    players: [
      { id: "H6", team: "home", position: { x: 52, y: 34 }, roleKey: "pivot", shortLabel: "H6" },
      { id: "H8", team: "home", position: { x: 58, y: 39 }, roleKey: "connector", shortLabel: "H8" },
      { id: "H9", team: "home", position: { x: 72, y: 28 }, roleKey: "striker", shortLabel: "H9" },
      { id: "A6", team: "away", position: { x: 54, y: 34 }, roleKey: "pivot", shortLabel: "A6" },
    ],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.86,
    computeTimeToCoverDistance: () => 1.1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotRegainContext: () => ({
      active: true,
      freshness: 0.78,
      pressure: 0.62,
      directStyle: false,
      secureIntent: 0.9,
      counterIntent: 0.34,
      forwardOpenSpace: 0.32,
      localSupport: 2,
    }),
    getAutoPilotRoleStrength: () => 0.72,
    getHighValueAttackTarget: (teamId, startPoint) => ({
      x: startPoint.x + (teamId === "home" ? 24 : -24),
      y: startPoint.y - 5,
    }),
    getOffensiveRoleKey: (player) => player.roleKey,
    getPitchThreatProfile: () => ({ value: 0.62, box: 0.18 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.22,
    getState: () => state,
    getTeamSupportCountAroundPoint: () => 2,
    getWideSideSign: () => 1,
    isGoalkeeper: (player) => player.roleKey === "gk",
    isPassReceiverOffside: () => false,
    resolveBallActionProfile: () => ({ averageSpeed: 16 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot regain release candidates expose moved contract", () => {
  const candidates = createGameSimulatorAutopilotRegainReleaseCandidates(createRegainReleaseDeps());

  expect(typeof candidates.buildAutoPilotRegainReleaseCandidate).toBe("function");
});

test("game simulator autopilot regain release candidates secure the first pass under pressure", () => {
  const candidates = createGameSimulatorAutopilotRegainReleaseCandidates(createRegainReleaseDeps());
  const carrier = { id: "H6", team: "home", position: { x: 52, y: 34 }, roleKey: "pivot", shortLabel: "H6" };

  const candidate = candidates.buildAutoPilotRegainReleaseCandidate(carrier, carrier.position, {
    directness: 0.42,
    shortSupport: 0.76,
    routeOneBias: 0.12,
    firstTouchForwardBias: 0.54,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H8",
    label: "secure regain",
    principleKey: "secure-regain",
  });
  expect(candidate.score).toBeGreaterThan(2);
});
