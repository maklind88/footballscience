import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveCarryContainmentTargets } from "../src/modules/game-simulator/autopilot-defensive-carry-containment-targets.mjs";

function projectPointOnSegmentWithRatio(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return {
    point: {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
    },
    ratio,
  };
}

function createCarryContainmentDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 55, y: 34 }, shortLabel: "8" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 80, y: 32 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 40 } },
    { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 82, y: 48 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 67, y: 35 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 70, y: 40 } },
    { id: "A10", team: "away", lineKey: "midfield", shortLabel: "10", position: { x: 66, y: 28 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 60, y: 34 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "dribble",
      carrierPlayerId: "H8",
      startPosition: { x: 55, y: 34 },
      position: { x: 55, y: 34 },
      target: { x: 72, y: 34 },
      inTransit: false,
    },
    draftStep: {
      actionType: "dribble",
      carrierPlayerId: "H8",
      target: { x: 72, y: 34 },
      autoPrinciples: ["open-grass carry"],
      beforeSnapshot: {
        ball: {
          position: { x: 55, y: 34 },
          ownerPlayerId: "H8",
        },
      },
    },
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: (_player, distanceToCover) => distanceToCover / 6,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.72,
      targetPressure: 0.18,
      targetThreat: {
        value: 0.56,
        box: 0.2,
        behindLine: 0.26,
        centralPocket: 0.34,
        cutbackZone: 0.26,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getBallTravelProgress: () => 0,
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDefensiveAutopilotLineKey: (player) => player.lineKey,
    getOffensiveAutopilotProfile: () => ({ styleKey: "vertical", directness: 0.7 }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getWideSideSign: (point) => {
      const y = point?.position?.y ?? point?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => !!point && Math.abs(point.y - pitch.width / 2) >= 15,
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (_from, to) => ({ ...to }),
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    playerRadiusMeters: 0.6,
    projectPointOnSegmentWithRatio,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive carry containment targets expose moved carry contracts", () => {
  const carryTargets = createGameSimulatorAutopilotDefensiveCarryContainmentTargets(createCarryContainmentDeps());

  expect(typeof carryTargets.getDribblePressureReference).toBe("function");
  expect(typeof carryTargets.chooseDefensiveDribblePresser).toBe("function");
  expect(typeof carryTargets.getDefensiveDribblePressTarget).toBe("function");
  expect(typeof carryTargets.getDefensiveCarryContainmentContext).toBe("function");
  expect(typeof carryTargets.getDefensiveCarryContainmentTarget).toBe("function");
  expect(typeof carryTargets.applyDefensiveCarryContainmentTargets).toBe("function");
});

test("game simulator autopilot defensive carry containment targets detect open-grass carry", () => {
  const carryTargets = createGameSimulatorAutopilotDefensiveCarryContainmentTargets(createCarryContainmentDeps());

  const reference = carryTargets.getDribblePressureReference();
  const context = carryTargets.getDefensiveCarryContainmentContext(
    "away",
    { x: 72, y: 34 },
    { phaseKey: "midBlock", threatResponse: { protectCenter: 0.4 } },
    reference
  );

  expect(reference?.carrier.id).toBe("H8");
  expect(context?.mode).toBe("emergencyDelay");
  expect(context?.openGrassCarry).toBe(true);
  expect(context?.finalThirdCarry).toBe(true);
});

test("game simulator autopilot defensive carry containment targets apply central carry coverage", () => {
  const deps = createCarryContainmentDeps();
  const carryTargets = createGameSimulatorAutopilotDefensiveCarryContainmentTargets(deps);
  const targets = new Map();

  const result = carryTargets.applyDefensiveCarryContainmentTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 72, y: 34 },
    { phaseKey: "midBlock", threatResponse: { protectCenter: 0.4 } }
  );

  expect(result.labels).toContain("Delay open-grass carry");
  expect(result.labels).toContain("Block inside carry lane");
  expect(result.labels).toContain("Screen next touch");
  expect(result.labels).toContain("Protect cutback on carry");
  expect(result.focusPoint).toEqual({ x: 72, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
