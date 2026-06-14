import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveRunnerTrackingTargets } from "../src/modules/game-simulator/autopilot-defensive-runner-tracking-targets.mjs";

function createRunnerTrackingDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 60, y: 34 }, shortLabel: "8" },
    { id: "H9", team: "home", lineKey: "forward", position: { x: 80, y: 46 }, shortLabel: "9" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 82, y: 36 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 45 } },
    { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 80, y: 52 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 74, y: 35 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 72, y: 42 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H9",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      target: { x: 82, y: 46 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H9",
      principleRunnerPlayerId: "H9",
      target: { x: 82, y: 46 },
      autoPrinciples: ["blindside channel run behind"],
      beforeSnapshot: {
        ball: {
          ownerPlayerId: "H8",
        },
        players: {
          H9: { position: { x: 62, y: 34 } },
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
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getOffensiveRoleKey: (player) => (player?.shortLabel === "9" ? "striker" : "connector"),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 78 ? 0.72 : 0.38,
      box: point.x >= 78 ? 0.26 : 0.1,
      behindLine: point.x >= 76 ? 0.36 : 0.12,
      cutbackZone: 0.16,
      betweenLines: 0.28,
      centralPocket: 0.18,
      assistZone: point.y > 42 ? 0.28 : 0.12,
    }),
    getSnapshotPlayerMap: (snapshot) => new Map(
      Object.entries(snapshot?.players || {}).map(([id, player]) => [id, player.position])
    ),
    getWideSideSign: (pointOrPlayer) => {
      const y = pointOrPlayer?.position?.y ?? pointOrPlayer?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
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

test("game simulator autopilot defensive runner tracking targets expose moved runner contracts", () => {
  const runnerTargets = createGameSimulatorAutopilotDefensiveRunnerTrackingTargets(createRunnerTrackingDeps());

  expect(typeof runnerTargets.getDefensiveRunnerThreats).toBe("function");
  expect(typeof runnerTargets.getDefensiveRunnerTrackingTarget).toBe("function");
  expect(typeof runnerTargets.applyDefensiveRunnerTrackingTargets).toBe("function");
});

test("game simulator autopilot defensive runner tracking targets detect blindside channel runs", () => {
  const runnerTargets = createGameSimulatorAutopilotDefensiveRunnerTrackingTargets(createRunnerTrackingDeps());

  const threats = runnerTargets.getDefensiveRunnerThreats("away", { x: 82, y: 46 }, { phaseKey: "midBlock" });

  expect(threats[0]?.player.id).toBe("H9");
  expect(threats[0]?.isBlindsideRun).toBe(true);
  expect(threats[0]?.isChannelRun).toBe(true);
});

test("game simulator autopilot defensive runner tracking targets apply channel coverage", () => {
  const deps = createRunnerTrackingDeps();
  const runnerTargets = createGameSimulatorAutopilotDefensiveRunnerTrackingTargets(deps);
  const targets = new Map();

  const result = runnerTargets.applyDefensiveRunnerTrackingTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    { x: 82, y: 46 },
    { phaseKey: "midBlock" }
  );

  expect(result.labels).toContain("Track blindside channel run");
  expect(result.labels).toContain("Cover depth behind channel run");
  expect(result.labels).toContain("Weak side tucks against runner");
  expect(result.focusPoint).toEqual({ x: 80, y: 46 });
  expect(targets.size).toBeGreaterThanOrEqual(3);
});
