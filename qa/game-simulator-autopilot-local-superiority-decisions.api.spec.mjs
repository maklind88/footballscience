import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLocalSuperiorityDecisions } from "../src/modules/game-simulator/autopilot-local-superiority-decisions.mjs";

function createLocalSuperiorityDeps(overrides = {}) {
  const state = overrides.state ?? {
    players: [
      { id: "H1", team: "home", position: { x: 52, y: 34 }, role: "Central Midfielder" },
      { id: "H2", team: "home", position: { x: 43, y: 32 }, role: "Defensive Midfielder" },
      { id: "H3", team: "home", position: { x: 54, y: 43 }, role: "Wide Forward" },
      { id: "H4", team: "home", position: { x: 61, y: 34 }, role: "Striker" },
      { id: "A1", team: "away", position: { x: 58, y: 34 }, role: "Defender" },
      { id: "A2", team: "away", position: { x: 66, y: 38 }, role: "Defender" },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    distance,
    getActionSpaceValue: (_startPoint, target) => ({
      lineBreakCount: target.x >= 60 ? 1 : 0,
      openTarget: target.y >= 42 ? 0.68 : 0.32,
      targetPressure: target.y >= 42 ? 0.34 : 0.72,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAutoPilotCandidateReceiver: (candidate) =>
      state.players.find((player) => player.id === candidate.receiverPlayerId) ?? null,
    getNearestOpponentGapToPoint: () => 8,
    getOpponentPressureAtPoint: () => 0.42,
    getPitchThreatProfile: (point) => ({
      behindLine: point.x >= 62 ? 0.34 : 0.12,
      box: point.x >= 82 ? 0.3 : 0.08,
      centralPocket: point.x >= 58 ? 0.36 : 0.12,
      cutbackZone: point.x >= 84 ? 0.28 : 0.04,
      value: point.x >= 58 ? 0.62 : 0.36,
    }),
    getPlayerPressureLoad: () => 0.38,
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot local superiority decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotLocalSuperiorityDecisions(createLocalSuperiorityDeps());

  expect(typeof decisions.getAutoPilotLocalSuperiorityProfile).toBe("function");
  expect(typeof decisions.getAutoPilotLocalSuperiorityAdjustment).toBe("function");
});

test("game simulator autopilot local superiority decisions score nearby support geometry", () => {
  const decisions = createGameSimulatorAutopilotLocalSuperiorityDecisions(createLocalSuperiorityDeps());

  const profile = decisions.getAutoPilotLocalSuperiorityProfile(
    "home",
    { x: 55, y: 34 },
    new Set(["H1"]),
    15
  );

  expect(profile.supportCount).toBeGreaterThanOrEqual(2);
  expect(profile.opponentCount).toBeGreaterThanOrEqual(1);
  expect(profile.underSupport).toBe(true);
  expect(profile.lateralSupport).toBe(true);
  expect(profile.geometryScore).toBeGreaterThan(0.4);
});

test("game simulator autopilot local superiority decisions reward triangle access and punish isolation", () => {
  const decisions = createGameSimulatorAutopilotLocalSuperiorityDecisions(createLocalSuperiorityDeps());
  const carrier = { id: "H1", team: "home", position: { x: 52, y: 34 } };

  const supported = decisions.getAutoPilotLocalSuperiorityAdjustment(
    {
      actionType: "pass",
      forwardGain: 4,
      receiverPlayerId: "H4",
      target: { x: 60, y: 34 },
    },
    carrier,
    carrier.position,
    { shortSupport: 0.72, tempo: 0.66 }
  );
  const isolated = decisions.getAutoPilotLocalSuperiorityAdjustment(
    {
      actionType: "pass",
      forwardGain: 0,
      receiverPlayerId: "H4",
      target: { x: 66, y: 34 },
    },
    carrier,
    carrier.position,
    { progressionUrgency: 0.62 }
  );

  expect(supported.score).toBeGreaterThan(0);
  expect(supported.labels).toContain("Local superiority: playable triangle");
  expect(isolated.score).toBeLessThanOrEqual(supported.score);
});
