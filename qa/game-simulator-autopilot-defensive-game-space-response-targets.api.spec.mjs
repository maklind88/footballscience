import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveGameSpaceResponseTargets } from "../src/modules/game-simulator/autopilot-defensive-game-space-response-targets.mjs";

function createGameSpaceResponseDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 58, y: 34 }, shortLabel: "8" },
    { id: "H10", team: "home", lineKey: "midfield", position: { x: 72, y: 34 }, shortLabel: "10" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 30 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 40 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 78, y: 32 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 76, y: 38 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      startPosition: { x: 58, y: 34 },
      position: { x: 72, y: 34 },
      target: { x: 72, y: 34 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      target: { x: 72, y: 34 },
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
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingGameSpaceProfile: (point) => (
      point.x >= 68
        ? { key: "space2", index: 2, label: "space 2" }
        : { key: "space1", index: 1, label: "space 1" }
    ),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      value: 0.48,
      box: 0.08,
      behindLine: 0.16,
      betweenLines: 0.5,
      centralPocket: 0.34,
      cutbackZone: 0.12,
    }),
    getPlayerMagnetLabel: (player) => player?.shortLabel || player?.label || "",
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0),
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
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

function createGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive game space response targets expose moved space contracts", () => {
  const gameSpaceTargets = createGameSimulatorAutopilotDefensiveGameSpaceResponseTargets(createGameSpaceResponseDeps());

  expect(typeof gameSpaceTargets.getDefensiveGameSpaceResponseContext).toBe("function");
  expect(typeof gameSpaceTargets.getDefensiveGameSpaceResponseTarget).toBe("function");
  expect(typeof gameSpaceTargets.applyDefensiveGameSpaceResponseTargets).toBe("function");
});

test("game simulator autopilot defensive game space response targets detect space 2 entry", () => {
  const gameSpaceTargets = createGameSimulatorAutopilotDefensiveGameSpaceResponseTargets(createGameSpaceResponseDeps());

  const context = gameSpaceTargets.getDefensiveGameSpaceResponseContext("away", { x: 72, y: 34 }, {});

  expect(context?.mode).toBe("spaceTwoJump");
  expect(context?.targetSpace.label).toBe("space 2");
  expect(context?.lineEntry).toBe(true);
});

test("game simulator autopilot defensive game space response targets apply space 2 response", () => {
  const deps = createGameSpaceResponseDeps();
  const gameSpaceTargets = createGameSimulatorAutopilotDefensiveGameSpaceResponseTargets(deps);
  const targets = new Map();

  const result = gameSpaceTargets.applyDefensiveGameSpaceResponseTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 72, y: 34 },
    {}
  );

  expect(result.labels).toContain("Respond to space 2");
  expect(result.labels).toContain("Press first touch in space 2");
  expect(result.labels).toContain("Block bounce pass");
  expect(result.labels).toContain("Deny turn inside");
  expect(result.focusPoint).toEqual({ x: 72, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
