import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveReceiveContinuationTargets } from "../src/modules/game-simulator/autopilot-defensive-receive-continuation-targets.mjs";

function createReceiveContinuationDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 58, y: 34 }, shortLabel: "8" },
    { id: "H10", team: "home", lineKey: "midfield", position: { x: 70, y: 34 }, shortLabel: "10" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 29 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 39 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 76, y: 32 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 74, y: 38 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 65, y: 34 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      firstTouchMode: "forward",
      startPosition: { x: 58, y: 34 },
      position: { x: 70, y: 34 },
      target: { x: 70, y: 34 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      firstTouchMode: "forward",
      autoPrinciples: ["space 2 receive"],
      offensiveAutopilot: {
        principleKey: "offer-angle",
        principleLabel: "Receive between lines",
      },
      target: { x: 70, y: 34 },
      beforeSnapshot: {
        ball: {
          position: { x: 58, y: 34 },
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
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 0,
      targetThreat: {
        box: 0.08,
        behindLine: 0.14,
        betweenLines: 0.52,
        centralPocket: 0.42,
        halfSpace: 0.2,
        centrality: 0.86,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2", index: 2 }),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getOffensiveAutopilotProfile: () => ({ styleKey: "positional", directness: 0.48 }),
    getOffensiveRoleKey: (player) => (player?.shortLabel === "10" ? "connector" : "centralMidfielder"),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      value: 0.46,
      box: 0.08,
      behindLine: 0.14,
      betweenLines: 0.52,
      centralPocket: 0.42,
      halfSpace: 0.2,
      centrality: 0.86,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getWideSideSign: (point) => {
      const y = point?.position?.y ?? point?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWideChannel: (point) => !!point && Math.abs(point.y - pitch.width / 2) >= 18,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
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

test("game simulator autopilot defensive receive continuation targets expose moved receive contracts", () => {
  const receiveContinuationTargets = createGameSimulatorAutopilotDefensiveReceiveContinuationTargets(
    createReceiveContinuationDeps()
  );

  expect(typeof receiveContinuationTargets.getDefensiveReceiveContinuationNextPoint).toBe("function");
  expect(typeof receiveContinuationTargets.getDefensiveReceiveContinuationContext).toBe("function");
  expect(typeof receiveContinuationTargets.getDefensiveReceiveContinuationTarget).toBe("function");
  expect(typeof receiveContinuationTargets.applyDefensiveReceiveContinuationTargets).toBe("function");
});

test("game simulator autopilot defensive receive continuation targets detect space 2 receive", () => {
  const receiveContinuationTargets = createGameSimulatorAutopilotDefensiveReceiveContinuationTargets(
    createReceiveContinuationDeps()
  );

  const context = receiveContinuationTargets.getDefensiveReceiveContinuationContext(
    "away",
    { x: 70, y: 34 },
    { styleKey: "mid-block", pressingIntensity: 0.62 }
  );

  expect(context?.spaceTwoReceive).toBe(true);
  expect(context?.intent).toBe("turn");
  expect(context?.receiver?.id).toBe("H10");
});

test("game simulator autopilot defensive receive continuation targets apply space 2 coverage", () => {
  const deps = createReceiveContinuationDeps();
  const receiveContinuationTargets = createGameSimulatorAutopilotDefensiveReceiveContinuationTargets(deps);
  const targets = new Map();

  const result = receiveContinuationTargets.applyDefensiveReceiveContinuationTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 70, y: 34 },
    { styleKey: "mid-block", pressingIntensity: 0.62 }
  );

  expect(result.labels).toContain("Defend space 2 receive");
  expect(result.labels).toContain("Press space-2 receiver");
  expect(result.labels).toContain("Space 2: lock the turn");
  expect(result.labels).toContain("Space 2: screen third-player lane");
  expect(result.focusPoint.x).toBeGreaterThan(70);
  expect(targets.size).toBeGreaterThanOrEqual(4);
});
