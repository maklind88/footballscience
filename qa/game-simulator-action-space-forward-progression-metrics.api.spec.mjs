import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceForwardProgressionMetrics } from "../src/modules/game-simulator/action-space-forward-progression-metrics.mjs";

function createForwardProgressionDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    angleDifference: (first, second) => Math.abs(first - second),
    clamp,
    clampToPitch: (point, padding = 0) => ({
      x: clamp(point.x, padding, pitch.length - padding),
      y: clamp(point.y, padding, pitch.width - padding),
    }),
    distance,
    getActionSpaceValue: () => ({
      value: 0.46,
      lineBreakCount: 1,
      openTarget: 0.72,
    }),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: (point, teamId) => teamId === "home" ? point.x : pitch.length - point.x,
    getAttackingGameSpaceProfile: (point) => point.x >= 68
      ? { key: "space2", index: 2 }
      : { key: "space1", index: 1 },
    getCarryLaneOpenSpaceScore: () => 0.78,
    getGoldenZoneScore: () => 0.68,
    getNearestOpponentGapInCarryLane: () => 8,
    getOffensiveRoleKey: () => "striker",
    getOpponentGoalCenter: () => ({ x: pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 76 ? 0.55 : 0.28,
      betweenLines: point.x >= 68 ? 0.34 : 0.18,
      centralPocket: point.x >= 76 ? 0.28 : 0.12,
      centrality: 0.9,
    }),
    getPlayerById: () => ({ id: "H9", team: "home", role: "ST", position: { x: 77, y: 34 } }),
    getPlayerFacingAngle: () => 0,
    getPlayerPressureLoad: () => 0.28,
    getPlayerTendency: () => 0.62,
    getTeamAttackAngle: () => 0,
    isFrontLineRole: (roleKey) => roleKey === "striker",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    teams: { home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator action space forward progression metrics expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpaceForwardProgressionMetrics(createForwardProgressionDeps());

  expect(typeof metrics.getActionThreatGain).toBe("function");
  expect(typeof metrics.isPlayerFacingForward).toBe("function");
  expect(typeof metrics.getForwardFacingSpaceTwoContext).toBe("function");
  expect(typeof metrics.getAutoPilotSpaceTwoAdvantageAdjustment).toBe("function");
  expect(typeof metrics.getForwardProgressionWindow).toBe("function");
});

test("game simulator action space forward progression metrics preserve forward-facing context", () => {
  const metrics = createGameSimulatorActionSpaceForwardProgressionMetrics(createForwardProgressionDeps());
  const carrier = { id: "H8", team: "home", position: { x: 58, y: 34 } };

  expect(metrics.isPlayerFacingForward(carrier)).toBe(true);
  expect(metrics.getActionThreatGain({ x: 58, y: 34 }, { x: 78, y: 34 }, "home")).toBeGreaterThan(0);
  expect(metrics.getForwardFacingSpaceTwoContext(carrier)).toMatchObject({
    active: true,
    facingForward: true,
  });
  expect(metrics.getForwardProgressionWindow(carrier, carrier.position, {
    firstTouchForwardBias: 0.74,
    directness: 0.66,
    progressionUrgency: 0.7,
  }).active).toBe(true);
});

test("game simulator action space forward progression metrics preserve space two adjustment", () => {
  const metrics = createGameSimulatorActionSpaceForwardProgressionMetrics(createForwardProgressionDeps());
  const carrier = { id: "H8", team: "home", position: { x: 70, y: 34 } };
  const candidate = {
    actionType: "pass",
    target: { x: 86, y: 34 },
    receiverPlayerId: "H9",
    forwardGain: 16,
    passDistance: 16,
  };
  const adjustment = metrics.getAutoPilotSpaceTwoAdvantageAdjustment(candidate, carrier, carrier.position, {
    progressionUrgency: 0.72,
  });

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Use space 2 advantage");
  expect(adjustment.context.isProgressivePass).toBe(true);
});
