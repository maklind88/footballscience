import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveRouteAnticipationTargets } from "../src/modules/game-simulator/autopilot-defensive-route-anticipation-targets.mjs";

function createRouteAnticipationDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    autoPilotPlay: {
      possessionPlan: {
        teamId: "home",
        routeKey: "patient-switch",
        routeLanes: ["rightWide", "central"],
        routeIntents: ["switch", "finish"],
      },
    },
  };
  const laneIndexes = {
    leftWide: 0,
    leftHalf: 1,
    central: 2,
    rightHalf: 3,
    rightWide: 4,
  };
  const laneY = {
    leftWide: 8,
    leftHalf: 22,
    central: 34,
    rightHalf: 46,
    rightWide: 60,
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotPossessionRouteStage: () => 0,
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getLaneCenterY: (laneKey) => laneY[laneKey] ?? pitch.width / 2,
    getOffensiveAutopilotProfile: () => ({ widthDiscipline: 0.72 }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchLaneIndex: (laneOrPoint) => {
      if (typeof laneOrPoint === "string") {
        return laneIndexes[laneOrPoint] ?? 2;
      }
      return laneOrPoint.y < 14 ? 0 : laneOrPoint.y > 54 ? 4 : 2;
    },
    getPitchLaneKey: (point) => (point.y < 14 ? "leftWide" : point.y > 54 ? "rightWide" : "central"),
    getPitchThreatProfile: () => ({ value: 0.34, betweenLines: 0.22 }),
    getPossessionRhythmContext: () => ({ steps: 2 }),
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0),
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
    gk: [{ id: "A1", team: "away", lineKey: "gk", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 30 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 82, y: 52 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 72, y: 35 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 70, y: 46 } },
    ],
    forward: [{ id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 60, y: 34 } }],
  };
}

test("game simulator autopilot defensive route anticipation targets expose moved route contracts", () => {
  const routeTargets = createGameSimulatorAutopilotDefensiveRouteAnticipationTargets(createRouteAnticipationDeps());

  expect(typeof routeTargets.getDefensiveRouteAnticipationContext).toBe("function");
  expect(typeof routeTargets.getDefensiveRouteAnticipationTarget).toBe("function");
  expect(typeof routeTargets.applyDefensiveRouteAnticipationTargets).toBe("function");
});

test("game simulator autopilot defensive route anticipation targets detect switch route", () => {
  const routeTargets = createGameSimulatorAutopilotDefensiveRouteAnticipationTargets(createRouteAnticipationDeps());

  const context = routeTargets.getDefensiveRouteAnticipationContext("away", { x: 52, y: 34 }, {});

  expect(context?.routeIntent).toBe("switch");
  expect(context?.targetIsWide).toBe(true);
  expect(context?.routeShiftFromBall).toBeGreaterThanOrEqual(2);
});

test("game simulator autopilot defensive route anticipation targets apply route coverage", () => {
  const routeTargets = createGameSimulatorAutopilotDefensiveRouteAnticipationTargets(createRouteAnticipationDeps());
  const targets = new Map();

  const result = routeTargets.applyDefensiveRouteAnticipationTargets(
    "away",
    targets,
    createGroups(),
    null,
    { x: 52, y: 34 },
    {}
  );

  expect(result.labels).toContain("Anticipate attacking route");
  expect(result.labels).toContain("Protect route lane");
  expect(result.labels).toContain("Deny outside route");
  expect(result.labels).toContain("Cover weak-side switch");
  expect(result.focusPoint).toEqual({ x: 52, y: 60 });
  expect(targets.size).toBeGreaterThanOrEqual(4);
});
