import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotVisionScanDecisions } from "../src/modules/game-simulator/autopilot-vision-scan-decisions.mjs";

function createVisionScanDeps(overrides = {}) {
  const state = overrides.state || {
    players: [
      { id: "H1", team: "home", position: { x: 40, y: 34 }, role: "Central Midfielder" },
      { id: "H2", team: "home", position: { x: 54, y: 34 }, role: "Central Midfielder" },
    ],
  };
  const profile = overrides.profile || {
    perception: 0.82,
    decisionQuality: 0.78,
    decisionSpeed: 0.76,
    tacticalDiscipline: 0.72,
    composure: 0.74,
    pressResistance: 0.7,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (first, second) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second))),
    buildPlayerIntelligenceProfile: () => profile,
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotCandidatePattern: (candidate) => ({ family: candidate.patternFamily || "direct" }),
    getOffensiveRoleKey: (player) => (player.id === "H2" ? "connector" : "striker"),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getPitchLaneIndex: (point) => {
      if (point.y < 18) {
        return 0;
      }
      if (point.y < 30) {
        return 1;
      }
      if (point.y <= 38) {
        return 2;
      }
      if (point.y <= 50) {
        return 3;
      }
      return 4;
    },
    getPitchThreatProfile: (point) => ({
      value: point.x >= 55 ? 0.58 : 0.3,
      betweenLines: point.x >= 52 ? 0.38 : 0.12,
      centralPocket: point.y >= 24 && point.y <= 44 ? 0.34 : 0.12,
      behindLine: point.x >= 62 ? 0.32 : 0.08,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ profile }),
    getPlayerFacingAngle: () => overrides.bodyAngle ?? 0,
    getPlayerPressureLoad: () => overrides.pressure ?? 0.24,
    isSupportRole: (roleKey) => ["connector", "pivot", "wideBack"].includes(roleKey),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels) => [...new Set(labels.filter(Boolean))].slice(0, 3),
    ...overrides,
  };
}

test("game simulator autopilot vision scan decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotVisionScanDecisions(createVisionScanDeps());

  expect(typeof decisions.getAutoPilotVisionScanAdjustment).toBe("function");
});

test("game simulator autopilot vision scan decisions reward visible forward action", () => {
  const decisions = createGameSimulatorAutopilotVisionScanDecisions(createVisionScanDeps());

  const result = decisions.getAutoPilotVisionScanAdjustment(
    {
      actionType: "pass",
      target: { x: 58, y: 34 },
      receiverPlayerId: "H2",
      forwardGain: 18,
      passDistance: 18,
      isLineBreak: true,
    },
    { id: "H1", team: "home", position: { x: 40, y: 34 } },
    { x: 40, y: 34 },
    { tempo: 0.64 }
  );

  expect(result.score).toBeGreaterThan(0.22);
  expect(result.labels).toContain("Vision: sees forward option");
  expect(result.context.visibleCone).toBeGreaterThan(0.95);
  expect(result.context.highValueForward).toBe(true);
});

test("game simulator autopilot vision scan decisions reward scanned weak side", () => {
  const decisions = createGameSimulatorAutopilotVisionScanDecisions(createVisionScanDeps());

  const result = decisions.getAutoPilotVisionScanAdjustment(
    {
      actionType: "pass",
      target: { x: 54, y: 56 },
      receiverPlayerId: "H2",
      forwardGain: 14,
      passDistance: 28,
      isSwitch: true,
    },
    { id: "H1", team: "home", position: { x: 40, y: 34 } },
    { x: 40, y: 34 },
    { tempo: 0.58 }
  );

  expect(result.score).toBeGreaterThan(0.12);
  expect(result.labels).toContain("Vision: scanned weak side");
  expect(result.context.actionComplexity).toBeGreaterThan(0.35);
});

test("game simulator autopilot vision scan decisions penalize blind complex options", () => {
  const decisions = createGameSimulatorAutopilotVisionScanDecisions(createVisionScanDeps({
    bodyAngle: Math.PI,
    pressure: 0.52,
    profile: {
      perception: 0.34,
      decisionQuality: 0.32,
      decisionSpeed: 0.3,
      tacticalDiscipline: 0.34,
      composure: 0.28,
      pressResistance: 0.22,
    },
  }));

  const result = decisions.getAutoPilotVisionScanAdjustment(
    {
      actionType: "pass",
      target: { x: 58, y: 10 },
      receiverPlayerId: "H2",
      forwardGain: 18,
      passDistance: 30,
      isSwitch: true,
      patternFamily: "third-player",
    },
    { id: "H1", team: "home", position: { x: 40, y: 34 } },
    { x: 40, y: 34 },
    { progressionUrgency: 0.72 }
  );

  expect(result.score).toBeLessThan(-0.28);
  expect(result.labels).toContain("Vision: blind-side option");
  expect(result.context.blindRisk).toBeGreaterThan(0.25);
  expect(result.context.visibleCone).toBeLessThan(0.1);
});
