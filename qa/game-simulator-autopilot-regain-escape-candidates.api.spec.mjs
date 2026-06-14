import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotRegainEscapeCandidates } from "../src/modules/game-simulator/autopilot-regain-escape-candidates.mjs";

function createRegainEscapeDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    players: [
      { id: "H6", team: "home", position: { x: 50, y: 34 }, roleKey: "pivot", shortLabel: "H6" },
      { id: "H8", team: "home", position: { x: 56, y: 42 }, roleKey: "connector", shortLabel: "H8" },
      { id: "A6", team: "away", position: { x: 48, y: 35 }, roleKey: "pivot", shortLabel: "A6" },
      { id: "A9", team: "away", position: { x: 52, y: 31 }, roleKey: "striker", shortLabel: "A9" },
    ],
  };
  return {
    chooseScoredCandidateWithVariation: (candidates, _profile, options = {}) => (
      options.preferredCandidate || candidates.filter(Boolean).sort((a, b) => b.score - a.score)[0] || null
    ),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    computePassLaneClarity: () => 0.84,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotRegainContext: () => ({
      active: true,
      freshness: 0.82,
      pressure: 0.72,
      secureIntent: 0.88,
    }),
    getAutoPilotRoleStrength: () => 0.74,
    getCarryLaneOpenSpaceScore: () => 0.66,
    getDistanceFromOwnGoal: () => 18,
    getNearestOpponentGapInCarryLane: () => 12,
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentPressureAtPoint: () => 0.26,
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.68,
    getState: () => state,
    getTeamSupportCountAroundPoint: () => 1,
    getWideSideSign: () => 1,
    isGoalkeeper: (player) => player.roleKey === "gk",
    isInsideOwnBox: () => false,
    isTransitionAttackStyle: () => false,
    normalize: (from, to) => {
      const x = to.x - from.x;
      const y = to.y - from.y;
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length };
    },
    pitch,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot regain escape candidates expose moved contract", () => {
  const candidates = createGameSimulatorAutopilotRegainEscapeCandidates(createRegainEscapeDeps());

  expect(typeof candidates.getPressedRegainExitVector).toBe("function");
  expect(typeof candidates.buildAutoPilotPressedRegainExitCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotDangerZoneEscapeCandidate).toBe("function");
});

test("game simulator autopilot regain escape candidates find first pass out of counter-press", () => {
  const candidates = createGameSimulatorAutopilotRegainEscapeCandidates(createRegainEscapeDeps());
  const carrier = { id: "H6", team: "home", position: { x: 50, y: 34 }, roleKey: "pivot", shortLabel: "H6" };

  const candidate = candidates.buildAutoPilotPressedRegainExitCandidate(carrier, carrier.position, {
    styleKey: "balanced",
    directness: 0.44,
    carryBias: 0.42,
    firstTouchForwardBias: 0.64,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H8",
    label: "pressed regain exit",
    principleKey: "pressed-regain-exit-pass",
  });
});

test("game simulator autopilot regain escape candidates clear from own-box danger", () => {
  const candidates = createGameSimulatorAutopilotRegainEscapeCandidates(createRegainEscapeDeps({
    isInsideOwnBox: () => true,
  }));
  const carrier = { id: "H5", team: "home", position: { x: 9, y: 34 }, roleKey: "centerBack", shortLabel: "H5" };

  const candidate = candidates.buildAutoPilotDangerZoneEscapeCandidate(carrier, carrier.position, {
    directness: 0.62,
    shortSupport: 0.32,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    label: "danger clearance",
    principleKey: "danger-zone-clearance",
    firstTouchMode: "forward",
  });
});
