import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballReceptionCarrySupportTargets } from "../src/modules/game-simulator/autopilot-offball-reception-carry-support-targets.mjs";

function createReceptionCarryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      startPosition: { x: 40, y: 18 },
      position: { x: 45, y: 18 },
      target: { x: 58, y: 18 },
      ownerPlayerId: "H10",
      carrierPlayerId: "H10",
      initiatorPlayerId: "H10",
    },
  };
  const players = overrides.players || [
    { id: "H3", team: "home", roleKey: "wideBack", position: { x: 38, y: 12 } },
    { id: "H4", team: "home", roleKey: "rest", position: { x: 34, y: 35 } },
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 43, y: 31 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 50, y: 22 } },
    { id: "H9", team: "home", roleKey: "striker", position: { x: 67, y: 34 } },
    { id: "H10", team: "home", roleKey: "connector", position: { x: 45, y: 18 } },
    { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 16 } },
    { id: "H7", team: "home", roleKey: "wideForward", position: { x: 60, y: 52 } },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    if (!Number.isFinite(y)) {
      return 0;
    }
    return y < pitch.width / 2 ? -1 : 1;
  };
  const pickByRoles = (teamId, roleKeys, targets, excludedIds = new Set(), sideSign = 0, referencePoint = null) => {
    const roleSet = new Set(roleKeys);
    const desiredSide = sideSign === 0 ? 0 : Math.sign(sideSign);
    return players
      .filter((player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
          return false;
        }
        if (!roleSet.has(player.roleKey)) {
          return false;
        }
        if (desiredSide && getWideSideSign(player) !== desiredSide) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const roleFit = roleKeys.indexOf(a.roleKey) - roleKeys.indexOf(b.roleKey);
        if (roleFit) {
          return roleFit;
        }
        if (referencePoint) {
          return distance(a.position, referencePoint) - distance(b.position, referencePoint);
        }
        return a.id.localeCompare(b.id);
      })[0] ?? null;
  };

  return {
    clamp,
    clampToPitch: (point) => ({
      x: clamp(point.x, 0, pitch.length),
      y: clamp(point.y, 0, pitch.width),
    }),
    distance,
    getActionSpaceValue: () => ({
      openTarget: 0.74,
      targetPressure: 0.28,
      targetThreat: { box: 0.22, behindLine: 0.32 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds, referencePoint) =>
      pickByRoles(teamId, roleKeys, targets, excludedIds, 0, referencePoint),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign, referencePoint) =>
      pickByRoles(teamId, roleKeys, targets, excludedIds, sideSign, referencePoint),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) || null,
    getWideSideSign,
    isWideChannel: (point) => point.y <= 20 || point.y >= 48,
    isWidePrincipleZone: (point) => point.y <= 20 || point.y >= 48,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    players,
    ...overrides,
  };
}

function createTargetMap(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball reception carry support targets expose moved contracts", () => {
  const support = createGameSimulatorAutopilotOffballReceptionCarrySupportTargets(createReceptionCarryDeps());

  expect(typeof support.getReceptionSupportTarget).toBe("function");
  expect(typeof support.applyReceptionSupportPrincipleTargets).toBe("function");
  expect(typeof support.getOpenGrassCarrySupportTarget).toBe("function");
  expect(typeof support.applyOpenGrassCarrySupportTargets).toBe("function");
});

test("game simulator autopilot offball reception carry support targets calculate support slots", () => {
  const deps = createReceptionCarryDeps();
  const support = createGameSimulatorAutopilotOffballReceptionCarrySupportTargets(deps);
  const hubPoint = { x: 58, y: 18 };
  const startPoint = { x: 40, y: 18 };

  const under = support.getReceptionSupportTarget("home", hubPoint, "under", -1, { supportCompactness: 0.72 });
  const stretch = support.getOpenGrassCarrySupportTarget("home", startPoint, hubPoint, "stretchAhead", -1, {
    directness: 0.68,
    shortSupport: 0.58,
    supportCompactness: 0.62,
    widthDiscipline: 0.7,
    width: 60,
  });

  expect(under.x).toBeLessThan(hubPoint.x);
  expect(stretch.x).toBeGreaterThan(hubPoint.x);
});

test("game simulator autopilot offball reception carry support targets assign reception triangle", () => {
  const deps = createReceptionCarryDeps();
  const support = createGameSimulatorAutopilotOffballReceptionCarrySupportTargets(deps);
  const targetMap = createTargetMap(deps.players);
  const excludedIds = new Set(["H10"]);
  const labels = support.applyReceptionSupportPrincipleTargets(
    "home",
    targetMap,
    { x: 58, y: 18 },
    {
      actionType: "pass",
      receiverPlayerId: "H11",
      beforeSnapshot: { ball: { position: { x: 45, y: 18 } } },
    },
    { directness: 0.7, overlapBias: 0.68, restBehind: 22, switchBias: 0.58, supportCompactness: 0.64, widthDiscipline: 0.72 },
    excludedIds
  );

  expect(labels).toContain("Reception triangle");
  expect(labels).toContain("Inside support angle");
  expect(labels).toContain("Outside option");
  expect(labels).toContain("Next depth option");
  expect(excludedIds.has("H6")).toBe(true);
  expect(targetMap.get("H6").x).toBeLessThan(58);
});

test("game simulator autopilot offball reception carry support targets assign open grass carry support", () => {
  const deps = createReceptionCarryDeps();
  const support = createGameSimulatorAutopilotOffballReceptionCarrySupportTargets(deps);
  const targetMap = createTargetMap(deps.players);
  const labels = support.applyOpenGrassCarrySupportTargets(
    "home",
    targetMap,
    { x: 62, y: 16 },
    {
      actionType: "dribble",
      autoPrinciples: ["open-grass carry"],
      beforeSnapshot: { ball: { position: { x: 40, y: 18 } } },
    },
    { directness: 0.7, overlapBias: 0.7, restBehind: 22, shortSupport: 0.6, supportCompactness: 0.62, switchBias: 0.62, width: 60, widthDiscipline: 0.72 },
    new Set(["H10"])
  );

  expect(labels).toContain("Carry support: stretch last line");
  expect(labels).toContain("Carry support: inside lane");
  expect(labels).toContain("Carry support: outside option");
  expect(labels).toContain("Carry support: rest-defence lock");
  expect(targetMap.get("H9").x).toBeGreaterThan(62);
});
