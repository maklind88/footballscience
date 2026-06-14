import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotRiskEscapeDecisions } from "../src/modules/game-simulator/autopilot-risk-escape-decisions.mjs";

function createRiskEscapeDeps(overrides = {}) {
  let risk = overrides.risk || {
    clarity: 0.78,
    timingRisk: 0.24,
    coverShadow: 0.4,
    interceptors: 0,
  };
  let regain = overrides.regain || {
    active: false,
    freshness: 0,
    pressure: 0,
    counterIntent: 0,
    secureIntent: 0,
    reason: "none",
    origin: null,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    computePassLaneClarity: () => 0.72,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotRegainContext: () => regain,
    getCarryLaneOpenSpaceScore: () => 0.68,
    getNearestOpponentGapInCarryLane: () => 8,
    getOpponentDensityAtPoint: (_teamId, point) => (point.x >= 52 ? 1 : 3),
    getOpponentPressureAtPoint: (_teamId, point) => (point.x >= 52 ? 0.42 : 0.68),
    getPassLaneRiskProfile: () => risk,
    getPitchThreatProfile: (point) => ({ value: point.x >= 60 ? 0.58 : 0.28 }),
    getTeamDensityAtPoint: () => 2,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    setRisk(nextRisk) {
      risk = nextRisk;
    },
    setRegain(nextRegain) {
      regain = nextRegain;
    },
    ...overrides,
  };
  return deps;
}

function createProfile(overrides = {}) {
  return {
    risk: 0.42,
    directness: 0.62,
    ...overrides,
  };
}

test("game simulator autopilot risk escape decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotRiskEscapeDecisions(createRiskEscapeDeps());

  expect(typeof decisions.getAutoPilotPassLaneDenialAdjustment).toBe("function");
  expect(typeof decisions.getAutoPilotCounterPressEscapeAdjustment).toBe("function");
});

test("game simulator autopilot risk escape decisions punish covered pass lanes", () => {
  const decisions = createGameSimulatorAutopilotRiskEscapeDecisions(createRiskEscapeDeps({
    risk: {
      clarity: 0.3,
      timingRisk: 0.68,
      coverShadow: 1.12,
      interceptors: 2,
    },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotPassLaneDenialAdjustment(
    {
      actionType: "pass",
      target: { x: 48, y: 34 },
      receiverPlayerId: "H2",
      forwardGain: 6,
    },
    carrier,
    carrier.position,
    createProfile({ risk: 0.28 })
  );

  expect(result.score).toBeLessThan(-0.12);
  expect(result.labels).toContain("Respect cover shadow");
  expect(result.labels).toContain("Avoid covered lane");
  expect(result.context.laneDanger).toBeGreaterThan(result.context.valueTolerance);
});

test("game simulator autopilot risk escape decisions stay neutral without fresh regain", () => {
  const decisions = createGameSimulatorAutopilotRiskEscapeDecisions(createRiskEscapeDeps());
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotCounterPressEscapeAdjustment(
    { actionType: "pass", target: { x: 55, y: 34 }, receiverPlayerId: "H2" },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result.score).toBe(0);
  expect(result.labels).toEqual([]);
  expect(result.context).toBeNull();
});

test("game simulator autopilot risk escape decisions reward secure transition outlets", () => {
  const decisions = createGameSimulatorAutopilotRiskEscapeDecisions(createRiskEscapeDeps({
    regain: {
      active: true,
      freshness: 0.78,
      pressure: 0.68,
      counterIntent: 0.74,
      secureIntent: 0.62,
      reason: "interception",
      origin: { x: 40, y: 34 },
    },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 43, y: 34 } };

  const result = decisions.getAutoPilotCounterPressEscapeAdjustment(
    {
      actionType: "pass",
      target: { x: 56, y: 34 },
      receiverPlayerId: "H7",
      forwardGain: 13,
      passDistance: 13,
      laneClarity: 0.72,
      receiverPressure: 0.42,
    },
    carrier,
    carrier.position,
    createProfile({ directness: 0.68 })
  );

  expect(result.score).toBeGreaterThan(0.35);
  expect(result.labels).toContain("Secure away from regain crowd");
  expect(result.labels).toContain("Attack transition space");
  expect(result.context.safeOutlet).toBe(true);
  expect(result.context.transitionRelease).toBe(true);
});

test("game simulator autopilot risk escape decisions punish crowded returns into regain", () => {
  const decisions = createGameSimulatorAutopilotRiskEscapeDecisions(createRiskEscapeDeps({
    regain: {
      active: true,
      freshness: 0.72,
      pressure: 0.66,
      counterIntent: 0.38,
      secureIntent: 0.42,
      reason: "loose-ball",
      origin: { x: 42, y: 34 },
    },
    getOpponentDensityAtPoint: (_teamId, point) => (point.x <= 46 ? 4 : 2),
    getTeamDensityAtPoint: () => 0,
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotCounterPressEscapeAdjustment(
    {
      actionType: "pass",
      target: { x: 42.6, y: 34.2 },
      receiverPlayerId: "H2",
      forwardGain: 0.6,
      passDistance: 1,
      laneClarity: 0.52,
      receiverPressure: 0.62,
    },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result.score).toBeLessThan(0);
  expect(result.labels).toContain("Avoid regain crowd");
  expect(result.context.crowdedReturn).toBe(true);
});
