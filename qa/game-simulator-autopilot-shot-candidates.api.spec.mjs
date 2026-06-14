import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotShotCandidates } from "../src/modules/game-simulator/autopilot-shot-candidates.mjs";

function createShotCandidateDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    sequence: { steps: [] },
    players: [],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotCarryEndProductContext: () => ({ active: false }),
    getAutoPilotRoleStrength: (_player, strength) => (strength === "finisher" ? 0.86 : 0.65),
    getAutoPilotShotTarget: (teamId, carrier) => ({ x: teamId === "home" ? pitch.length : 0, y: carrier.position.y }),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerPressureLoad: () => 0.22,
    getRecentPossessionSteps: () => [],
    getShotWindowProfile: () => ({
      laneClarity: 0.76,
      goalkeeperOpenness: 0.68,
      angleQuality: 0.54,
      blockRisk: 0.18,
      quality: 0.58,
    }),
    getState: () => state,
    isInsideOpponentBox: (point, teamId) => (teamId === "home" ? point.x >= 84 : point.x <= 21),
    pitch,
    ...overrides,
  };
}

test("game simulator autopilot shot candidates expose moved shot contract", () => {
  const candidates = createGameSimulatorAutopilotShotCandidates(createShotCandidateDeps());

  expect(typeof candidates.buildAutoPilotShotCandidate).toBe("function");
});

test("game simulator autopilot shot candidates build a credible box shot", () => {
  const candidates = createGameSimulatorAutopilotShotCandidates(createShotCandidateDeps());
  const carrier = { id: "H9", team: "home", position: { x: 88, y: 34 }, roleKey: "striker" };

  const candidate = candidates.buildAutoPilotShotCandidate(carrier, carrier.position, {
    shootBias: 0.72,
  });

  expect(candidate).toMatchObject({
    actionType: "shot",
    label: "shot",
    reason: "box chance",
    insideBox: true,
    mustShoot: true,
  });
  expect(candidate.score).toBeGreaterThan(2);
});

test("game simulator autopilot shot candidates avoid repeating outside shots", () => {
  const candidates = createGameSimulatorAutopilotShotCandidates(createShotCandidateDeps({
    getRecentPossessionSteps: () => [{ actionType: "shot" }],
  }));
  const carrier = { id: "H10", team: "home", position: { x: 74, y: 34 }, roleKey: "connector" };

  const candidate = candidates.buildAutoPilotShotCandidate(carrier, carrier.position, {
    shootBias: 0.82,
  });

  expect(candidate).toBeNull();
});

test("game simulator autopilot shot candidates carry runway context into shot reason", () => {
  const candidates = createGameSimulatorAutopilotShotCandidates(createShotCandidateDeps({
    getAutoPilotCarryEndProductContext: () => ({
      active: true,
      finishWindow: false,
      wasRunwayCarry: true,
      endProductUrgency: 0.72,
    }),
  }));
  const carrier = { id: "H11", team: "home", position: { x: 72, y: 28 }, roleKey: "wideForward" };

  const candidate = candidates.buildAutoPilotShotCandidate(carrier, carrier.position, {
    shootBias: 0.64,
  });

  expect(candidate).toMatchObject({
    actionType: "shot",
    reason: "runway carry has created a shooting window",
  });
});
