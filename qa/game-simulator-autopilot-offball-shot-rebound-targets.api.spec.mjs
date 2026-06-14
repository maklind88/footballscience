import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballShotReboundTargets } from "../src/modules/game-simulator/autopilot-offball-shot-rebound-targets.mjs";

const pitch = { length: 105, width: 68 };

function createShotReboundDeps(overrides = {}) {
  const state = overrides.state ?? {
    players: [
      { id: "H9", team: "home", position: { x: 76, y: 34 }, roleKey: "striker" },
      { id: "H7", team: "home", position: { x: 72, y: 22 }, roleKey: "wideForward" },
      { id: "H10", team: "home", position: { x: 70, y: 43 }, roleKey: "secondStriker" },
      { id: "H8", team: "home", position: { x: 66, y: 36 }, roleKey: "connector" },
      { id: "H6", team: "home", position: { x: 61, y: 31 }, roleKey: "pivot" },
      { id: "H4", team: "home", position: { x: 55, y: 33 }, roleKey: "rest" },
      { id: "A5", team: "away", position: { x: 84, y: 35 }, roleKey: "back" },
    ],
    ball: {
      actionType: "shot",
      initiatorPlayerId: "H9",
      startPosition: { x: 76, y: 34 },
      position: { x: 76, y: 34 },
      target: { x: 105, y: 38 },
      currentSpeed: 23,
    },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clampToPitch = (point, margin = 0) => ({
    x: clamp(point.x, margin, pitch.length - margin),
    y: clamp(point.y, margin, pitch.width - margin),
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getPlayerById = (playerId) => state.players.find((player) => player.id === playerId) ?? null;
  const getMovableAutopilotPlayerByRoles = (teamId, roleKeys, targets, excludedIds, referencePoint) => state.players
    .filter((player) => player.team === teamId && targets.has(player.id) && !excludedIds.has(player.id))
    .filter((player) => roleKeys.includes(player.roleKey))
    .sort((first, second) => {
      const roleDiff = roleKeys.indexOf(first.roleKey) - roleKeys.indexOf(second.roleKey);
      if (roleDiff) {
        return roleDiff;
      }
      return distance(first.position, referencePoint) - distance(second.position, referencePoint);
    })[0] ?? null;

  return {
    clamp,
    clampToPitch,
    cloneVector: (point) => ({ ...point }),
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getMovableAutopilotPlayerByRoles,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById,
    getShotWindowProfile: () => ({
      blockRisk: 0.72,
      goalkeeperOpenness: 0.45,
      laneClarity: 0.38,
      quality: 0.48,
    }),
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 22 }),
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, clampToPitch(target, 3));
      return true;
    },
    state,
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball shot rebound targets expose moved contracts", () => {
  const shotRebounds = createGameSimulatorAutopilotOffballShotReboundTargets(createShotReboundDeps());

  expect(typeof shotRebounds.getShotReboundGeometryContext).toBe("function");
  expect(typeof shotRebounds.getShotReboundTarget).toBe("function");
  expect(typeof shotRebounds.applyShotReboundPrincipleTargets).toBe("function");
});

test("game simulator autopilot offball shot rebound targets preserve blocked-shot rebound logic", () => {
  const deps = createShotReboundDeps();
  const shotRebounds = createGameSimulatorAutopilotOffballShotReboundTargets(deps);
  const actionMeta = {
    actionType: "shot",
    carrierPlayerId: "H9",
    beforeSnapshot: {
      ball: {
        ownerPlayerId: "H9",
        position: { x: 76, y: 34 },
      },
    },
    target: { x: 105, y: 38 },
  };

  const geometry = shotRebounds.getShotReboundGeometryContext("home", actionMeta.target, actionMeta, { directness: 0.72 });

  expect(geometry.likelyBlock).toBe(true);
  expect(geometry.highReboundChance).toBe(true);
  expect(geometry.reboundProbability).toBeGreaterThan(0.44);

  const targets = createTargets(deps.state.players);
  const labels = shotRebounds.applyShotReboundPrincipleTargets(
    "home",
    targets,
    actionMeta.target,
    actionMeta,
    { directness: 0.72 },
    new Set(["H9"])
  );

  expect(labels).toContain("Shot rebound geometry");
  expect(labels).toContain("Attack blocked-shot rebound");
  expect(labels).toContain("Far-post rebound");
  expect(labels).toContain("Second-ball finish");
  expect(labels).toContain("Rest-defence after shot");
  expect(targets.get("H7")).not.toEqual({ x: 72, y: 22 });
  expect(targets.get("H8")).not.toEqual({ x: 66, y: 36 });
});
