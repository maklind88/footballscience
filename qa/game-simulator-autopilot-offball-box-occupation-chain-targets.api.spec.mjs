import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballBoxOccupationChainTargets } from "../src/modules/game-simulator/autopilot-offball-box-occupation-chain-targets.mjs";

const pitch = { length: 105, width: 68 };

function createBoxOccupationChainDeps(overrides = {}) {
  const state = overrides.state ?? {
    players: [
      { id: "H2", team: "home", position: { x: 72, y: 10 }, roleKey: "wideBack" },
      { id: "H9", team: "home", position: { x: 82, y: 34 }, roleKey: "striker" },
      { id: "H10", team: "home", position: { x: 76, y: 30 }, roleKey: "secondStriker" },
      { id: "H11", team: "home", position: { x: 72, y: 52 }, roleKey: "wideForward" },
      { id: "H7", team: "home", position: { x: 70, y: 23 }, roleKey: "wideForward" },
      { id: "H8", team: "home", position: { x: 68, y: 37 }, roleKey: "connector" },
      { id: "H6", team: "home", position: { x: 61, y: 33 }, roleKey: "pivot" },
      { id: "H4", team: "home", position: { x: 55, y: 34 }, roleKey: "rest" },
      { id: "A5", team: "away", position: { x: 86, y: 35 }, roleKey: "back" },
    ],
    ball: {
      actionType: "pass",
      carrierPlayerId: "H2",
      initiatorPlayerId: "H2",
      ownerPlayerId: "H2",
      position: { x: 72, y: 10 },
      receiverPlayerId: "H9",
      startPosition: { x: 72, y: 10 },
      target: { x: 88, y: 31 },
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clampToPitch = (point, margin = 0) => ({
    x: clamp(point.x, margin, pitch.length - margin),
    y: clamp(point.y, margin, pitch.width - margin),
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const getMovable = (teamId, roleKeys, targets, excludedIds, referencePoint, preferredSide = 0) => state.players
    .filter((player) => player.team === teamId && targets.has(player.id) && !excludedIds.has(player.id))
    .filter((player) => roleKeys.includes(player.roleKey))
    .filter((player) => !preferredSide || getWideSideSign(player) === preferredSide || Math.abs(player.position.y - pitch.width / 2) < 3)
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
    getActionSpaceValue: () => ({
      targetThreat: {
        behindLine: 0.26,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, overrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds, referencePoint) =>
      getMovable(teamId, roleKeys, targets, excludedIds, referencePoint),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, preferredSide, referencePoint) =>
      getMovable(teamId, roleKeys, targets, excludedIds, referencePoint, preferredSide),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      assistZone: Math.abs(point.y - pitch.width / 2) >= 16 ? 0.34 : 0.18,
      behindLine: point.x >= 84 ? 0.28 : 0.16,
      box: point.x >= 84 ? 0.22 : 0.1,
      cutbackZone: point.y <= 18 ? 0.12 : 0.18,
    }),
    getWideSideSign,
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, clampToPitch(target, 3));
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball box occupation chain targets expose moved contracts", () => {
  const boxChain = createGameSimulatorAutopilotOffballBoxOccupationChainTargets(createBoxOccupationChainDeps());

  expect(typeof boxChain.getAttackingBoxOccupationChainContext).toBe("function");
  expect(typeof boxChain.getAttackingBoxOccupationChainTarget).toBe("function");
  expect(typeof boxChain.applyAttackingBoxOccupationChainTargets).toBe("function");
});

test("game simulator autopilot offball box occupation chain targets preserve cross occupation", () => {
  const deps = createBoxOccupationChainDeps();
  const boxChain = createGameSimulatorAutopilotOffballBoxOccupationChainTargets(deps);
  const actionMeta = {
    actionType: "pass",
    carrierPlayerId: "H2",
    receiverPlayerId: "H9",
    beforeSnapshot: { ball: { ownerPlayerId: "H2", position: { x: 72, y: 10 } } },
    target: { x: 88, y: 31 },
    autoPrinciples: ["cross delivery final-third"],
  };

  const context = boxChain.getAttackingBoxOccupationChainContext("home", actionMeta.target, actionMeta, {
    crossBias: 0.7,
    phaseKey: "openPlay",
    switchBias: 0.62,
  });

  expect(context.sourceIsWide).toBe(true);
  expect(context.deliveryKind).toBe("cross");

  const targets = createTargets(deps.state.players);
  const result = boxChain.applyAttackingBoxOccupationChainTargets(
    "home",
    targets,
    actionMeta.target,
    actionMeta,
    { crossBias: 0.7, phaseKey: "openPlay", switchBias: 0.62 }
  );

  expect(result.labels).toContain("Prepare box occupation");
  expect(result.labels).toContain("Box chain: near-post pin");
  expect(result.labels).toContain("Box chain: penalty-spot arrival");
  expect(result.labels).toContain("Box chain: rest-defence lock");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(5);
});
