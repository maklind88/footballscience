import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveLineBreakAdvantageTargets } from "../src/modules/game-simulator/autopilot-defensive-line-break-advantage-targets.mjs";

function createLineBreakDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 60, y: 34 },
      position: { x: 60, y: 34 },
      target: { x: 78, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      profileKey: "line-break",
      profileLabel: "Line-break advantage",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 78, y: 34 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      profileKey: "line-break",
      profileLabel: "Line-break advantage",
      autoPrinciples: ["Do not reset line-break"],
      beforeSnapshot: {
        ball: {
          position: { x: 60, y: 34 },
          ownerPlayerId: "H8",
        },
      },
    },
    players: [
      { id: "H8", team: "home", shortLabel: "8", position: { x: 60, y: 34 } },
      { id: "H10", team: "home", shortLabel: "10", position: { x: 78, y: 34 } },
    ],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.72,
      lineBreakCount: 1,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDepthX: (teamId, depth) => (teamId === "away" ? pitch.length - depth : depth),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getDribblePressureReference: () => ({
      startPoint: { x: 60, y: 34 },
      targetPoint: { x: 78, y: 34 },
    }),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getOpponentPressureAtPoint: () => 0.18,
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      value: 0.7,
      box: 0.18,
      centralPocket: 0.36,
      behindLine: 0.24,
      betweenLines: 0.36,
      cutbackZone: 0.08,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.16,
    getRecentPossessionSteps: () => [],
    getWideSideSign: (pointOrPlayer) => {
      const y = pointOrPlayer?.position?.y ?? pointOrPlayer?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 32 } },
      { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 38 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 86, y: 48 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 75, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 77, y: 40 } },
      { id: "A10", team: "away", lineKey: "midfield", shortLabel: "10", position: { x: 73, y: 31 } },
    ],
    forward: [{ id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } }],
  };
}

test("game simulator autopilot defensive line break advantage targets expose moved contracts", () => {
  const lineBreak = createGameSimulatorAutopilotDefensiveLineBreakAdvantageTargets(createLineBreakDeps());

  expect(typeof lineBreak.getDefensiveLineBreakAdvantageContext).toBe("function");
  expect(typeof lineBreak.getDefensiveLineBreakAdvantageTarget).toBe("function");
  expect(typeof lineBreak.applyDefensiveLineBreakAdvantageCollapseTargets).toBe("function");
});

test("game simulator autopilot defensive line break advantage targets detect central collapse", () => {
  const lineBreak = createGameSimulatorAutopilotDefensiveLineBreakAdvantageTargets(createLineBreakDeps());

  const context = lineBreak.getDefensiveLineBreakAdvantageContext(
    "away",
    { x: 78, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(context).toMatchObject({
    actionType: "pass",
    attackingTeamId: "home",
    advantageCue: true,
    mode: "centralCollapse",
  });
  expect(context.dangerScore).toBeGreaterThan(0.7);
});

test("game simulator autopilot defensive line break advantage targets apply collapse cover", () => {
  const lineBreak = createGameSimulatorAutopilotDefensiveLineBreakAdvantageTargets(createLineBreakDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = lineBreak.applyDefensiveLineBreakAdvantageCollapseTargets(
    "away",
    targets,
    groups,
    groups.midfield[0],
    { x: 78, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(result.labels).toContain("Collapse after line break");
  expect(result.labels).toContain("Line-break collapse: delay first finish");
  expect(result.labels).toContain("Line-break collapse: seal last line");
  expect(result.labels).toContain("Line-break collapse: close central gate");
  expect(result.focusPoint).toEqual({ x: 78, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
