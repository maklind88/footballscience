import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveMovementPlanning } from "../src/modules/game-simulator/autopilot-live-movement-planning.mjs";

const pitch = { length: 105, width: 68 };

function createMovementPlanningDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      position: { x: 50, y: 34 },
      target: { x: 62, y: 30 },
      speed: 14,
      elapsedTravelTime: 0,
    },
    players: [
      { id: "H7", team: "home", role: "W", position: { x: 42, y: 16 } },
      { id: "H8", team: "home", role: "8", position: { x: 48, y: 35 } },
      { id: "A5", team: "away", role: "CB", position: { x: 65, y: 30 } },
    ],
    physicalProfile: "pro",
    projectedDuration: 1.4,
    currentDuration: 1.1,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionOrigin: (player) => player.actionOrigin ?? player.position,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2" }),
    getCurrentActionDuration: () => state.currentDuration,
    getOrientationMovementProfile: () => ({ accelerationMultiplier: 1, speedMultiplier: 1 }),
    getOrientationTurnDelay: () => 0,
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      assistZone: 0.34,
      behindLine: 0.32,
      box: 0.22,
      cutbackZone: 0.12,
    }),
    getPlayerDecisionContext: () => ({
      acceleration: 3.2,
      maxSpeed: 7.2,
      reactionTime: 0.18,
      sprintProfile: {
        burstDistance: 9,
        shortBurstBoost: 0.18,
      },
    }),
    getPlayerMagnetLabel: (player) => player.role,
    getProjectedActionDuration: () => state.projectedDuration,
    getOffensiveRoleKey: (player) => (player.role === "W" ? "wideForward" : "connector"),
    hasBallAction: () => true,
    isGoalkeeper: (player) => player?.role === "GK",
    isOffensiveAutopilotPlayer: (player, actionMeta) => player?.team === actionMeta?.offensiveAutopilot?.teamId,
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from, to, maxDistance) => {
      const gap = Math.hypot(to.x - from.x, to.y - from.y);
      if (!gap || gap <= maxDistance) {
        return { ...to };
      }
      return {
        x: from.x + ((to.x - from.x) / gap) * maxDistance,
        y: from.y + ((to.y - from.y) / gap) * maxDistance,
      };
    },
    normalize: (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    },
    pitch,
    teams: {
      home: { formation: "4-3-3", identity: { attackStyle: "balanced", defenseStyle: "balanced" } },
      away: { formation: "4-3-3", identity: { attackStyle: "balanced", defenseStyle: "balanced" } },
    },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live movement planning exposes moved contracts", () => {
  const planning = createGameSimulatorAutopilotLiveMovementPlanning(createMovementPlanningDeps());

  expect(typeof planning.computeReachDistance).toBe("function");
  expect(typeof planning.computeTimeToCoverDistance).toBe("function");
  expect(typeof planning.buildMovementPath).toBe("function");
  expect(typeof planning.getMovementPathPoint).toBe("function");
  expect(typeof planning.createTransitionPlan).toBe("function");
  expect(typeof planning.getEditableRadius).toBe("function");
});

test("game simulator autopilot live movement planning reads current state through dependency boundary", () => {
  const deps = createMovementPlanningDeps();
  const planning = createGameSimulatorAutopilotLiveMovementPlanning(deps);
  const player = deps.getState().players[0];

  const projectedRadius = planning.getEditableRadius(player);

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, elapsedTravelTime: 0.4 },
    currentDuration: 2.1,
  });

  expect(planning.getEditableRadius(player)).toBeGreaterThan(projectedRadius);
});

test("game simulator autopilot live movement planning builds counter movement paths", () => {
  const planning = createGameSimulatorAutopilotLiveMovementPlanning(createMovementPlanningDeps());
  const player = { id: "H7", team: "home", role: "W", position: { x: 42, y: 16 } };
  const startPoint = { x: 42, y: 16 };
  const endPoint = { x: 72, y: 29 };
  const actionMeta = {
    actionType: "pass",
    carrierPlayerId: "H8",
    receiverPlayerId: "H9",
    beforeSnapshot: { ball: { ownerPlayerId: "H8" } },
    offensiveAutopilot: {
      teamId: "home",
      principleLabel: "third-man run",
    },
    autoPrinciples: ["blindside run"],
  };

  const path = planning.buildMovementPath(player, startPoint, endPoint, actionMeta);

  expect(path.waypoint).toBeTruthy();
  expect(path.totalDistance).toBeGreaterThan(
    Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
  );
  expect(planning.getMovementPathPoint(path, path.segmentOneDistance / 2)).not.toEqual(startPoint);
});

test("game simulator autopilot live movement planning creates transition plans from snapshots", () => {
  const deps = createMovementPlanningDeps();
  const planning = createGameSimulatorAutopilotLiveMovementPlanning(deps);
  const startSnapshot = {
    ball: { position: { x: 40, y: 30 }, ownerPlayerId: "H8" },
    players: [
      { id: "H7", position: { x: 42, y: 16 } },
      { id: "H8", position: { x: 48, y: 35 } },
      { id: "A5", position: { x: 65, y: 30 } },
    ],
  };
  const targetSnapshot = {
    ball: { position: { x: 62, y: 34 }, ownerPlayerId: null },
    players: [
      { id: "H7", position: { x: 55, y: 20 } },
      { id: "H8", position: { x: 50, y: 35 } },
      { id: "A5", position: { x: 60, y: 31 } },
    ],
  };

  const plan = planning.createTransitionPlan(startSnapshot, targetSnapshot);

  expect(plan.duration).toBeGreaterThan(0);
  expect(plan.ballOwnerPlayerId).toBeNull();
  expect(plan.playerTargets.get("H7")).toEqual({
    start: { x: 42, y: 16 },
    end: { x: 55, y: 20 },
  });
});

test("game simulator autopilot live movement planning compares snapshots", () => {
  const deps = createMovementPlanningDeps();
  const planning = createGameSimulatorAutopilotLiveMovementPlanning(deps);
  const snapshot = {
    formations: { home: "4-3-3", away: "4-3-3" },
    teamIdentities: {
      home: { attackStyle: "balanced", defenseStyle: "balanced" },
      away: { attackStyle: "balanced", defenseStyle: "balanced" },
    },
    physicalProfile: "pro",
    ball: { position: { x: 50, y: 34 }, ownerPlayerId: "H8" },
    players: [
      { id: "H7", position: { x: 42, y: 16 } },
      { id: "H8", position: { x: 48, y: 35 } },
    ],
  };

  expect(planning.snapshotsMatch(snapshot, {
    ...snapshot,
    players: snapshot.players.map((player) => ({ ...player, position: { ...player.position } })),
  })).toBe(true);
});
