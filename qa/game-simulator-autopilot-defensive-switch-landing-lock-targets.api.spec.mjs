import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveSwitchLandingLockTargets } from "../src/modules/game-simulator/autopilot-defensive-switch-landing-lock-targets.mjs";

function createSwitchLandingLockDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H7", team: "home", lineKey: "forward", position: { x: 70, y: 56 }, shortLabel: "W" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 84, y: 50 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 30 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 40 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 77, y: 35 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 74, y: 47 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } },
  ];
  const lastStep = {
    actionType: "pass",
    receiverPlayerId: "H7",
    profileLabel: "switch",
    target: { x: 70, y: 56 },
    beforeSnapshot: {
      ball: {
        position: { x: 48, y: 12 },
      },
    },
    afterSnapshot: {
      ball: {
        ownerPlayerId: "H7",
      },
    },
  };
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "dribble",
      carrierPlayerId: "H7",
      ownerPlayerId: "H7",
      startPosition: { x: 70, y: 56 },
      position: { x: 70, y: 56 },
      target: { x: 75, y: 54 },
    },
    draftStep: {
      actionType: "dribble",
      carrierPlayerId: "H7",
      target: { x: 75, y: 54 },
      beforeSnapshot: {
        ball: {
          position: { x: 70, y: 56 },
          ownerPlayerId: "H7",
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
    getActionSpaceValue: () => ({ lineBreakCount: 1 }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchLaneIndex: (point) => (point.y < 18 ? 0 : point.y > 50 ? 4 : 2),
    getPitchThreatProfile: () => ({
      value: 0.58,
      assistZone: 0.36,
      box: 0.16,
      cutbackZone: 0.28,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getRecentPossessionSteps: () => [lastStep],
    getRecordedStepDuration: () => 2.1,
    getWideSideSign: (point) => {
      const y = point?.position?.y ?? point?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => !!point && Math.abs(point.y - pitch.width / 2) >= 15,
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

test("game simulator autopilot defensive switch landing lock targets expose moved landing contracts", () => {
  const landingTargets = createGameSimulatorAutopilotDefensiveSwitchLandingLockTargets(createSwitchLandingLockDeps());

  expect(typeof landingTargets.getDefensiveSwitchLandingLockContext).toBe("function");
  expect(typeof landingTargets.getDefensiveSwitchLandingLockTarget).toBe("function");
  expect(typeof landingTargets.applyDefensiveSwitchLandingLockTargets).toBe("function");
});

test("game simulator autopilot defensive switch landing lock targets detect far-side landing", () => {
  const landingTargets = createGameSimulatorAutopilotDefensiveSwitchLandingLockTargets(createSwitchLandingLockDeps());

  const context = landingTargets.getDefensiveSwitchLandingLockContext("away", { x: 75, y: 54 }, {});

  expect(context?.targetIsWide).toBe(true);
  expect(context?.finalThirdCue).toBe(true);
  expect(context?.lockNeed).toBeGreaterThan(0.5);
});

test("game simulator autopilot defensive switch landing lock targets apply landing lock coverage", () => {
  const deps = createSwitchLandingLockDeps();
  const landingTargets = createGameSimulatorAutopilotDefensiveSwitchLandingLockTargets(deps);
  const targets = new Map();

  const result = landingTargets.applyDefensiveSwitchLandingLockTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 75, y: 54 },
    {}
  );

  expect(result.labels).toContain("Lock far-side attack after switch");
  expect(result.labels).toContain("Switch landing lock: pressure first touch");
  expect(result.labels).toContain("Switch landing lock: close inside gate");
  expect(result.labels).toContain("Switch landing lock: back line slides");
  expect(result.focusPoint).toEqual({ x: 70, y: 56 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
