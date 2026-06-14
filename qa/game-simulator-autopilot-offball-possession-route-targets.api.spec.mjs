import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPossessionRouteTargets } from "../src/modules/game-simulator/autopilot-offball-possession-route-targets.mjs";

const pitch = { length: 105, width: 68 };
const laneCenters = {
  leftWide: 5,
  leftHalf: 20,
  central: 34,
  rightHalf: 48,
  rightWide: 63,
};

function createPossessionRouteDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      position: { x: 38, y: 14 },
      startPosition: { x: 38, y: 14 },
    },
    players: [
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 48, y: 11 } },
      { id: "H8", team: "home", roleKey: "connector", position: { x: 51, y: 18 } },
      { id: "H7", team: "home", roleKey: "wideForward", position: { x: 58, y: 10 } },
      { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 58 } },
      { id: "H6", team: "home", roleKey: "pivot", position: { x: 43, y: 31 } },
      { id: "H4", team: "home", roleKey: "rest", position: { x: 35, y: 38 } },
      { id: "A4", team: "away", roleKey: "centreBack", position: { x: 72, y: 34 } },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const pickPlayer = (teamId, roleKeys, targets, excludedIds = new Set(), sideSign = 0) => {
    const desiredSide = Math.sign(sideSign);
    return state.players.find((player) => {
      if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
        return false;
      }
      if (!roleKeys.includes(player.roleKey)) {
        return false;
      }
      return !desiredSide || getWideSideSign(player) === desiredSide;
    }) ?? null;
  };

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotPossessionPlan: () => ({
      routeIntents: ["progress", "switch", "finish"],
      routeKey: "wide-overload-switch",
      routeLabel: "Wide overload route",
      routeLanes: ["leftWide", "central", "rightWide"],
    }),
    getAutoPilotPossessionRouteStage: () => 0,
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getLaneCenterY: (laneKey) => laneCenters[laneKey] ?? pitch.width / 2,
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds, sideSign),
    getPitchLaneIndex: (laneOrPoint) => {
      if (typeof laneOrPoint === "string") {
        return ["leftWide", "leftHalf", "central", "rightHalf", "rightWide"].indexOf(laneOrPoint);
      }
      const y = laneOrPoint?.y ?? pitch.width / 2;
      if (y < 13) return 0;
      if (y < 27) return 1;
      if (y < 41) return 2;
      if (y < 55) return 3;
      return 4;
    },
    getPitchLaneKey: () => "leftWide",
    getPossessionRhythmContext: () => ({ duration: 2, steps: 3 }),
    getWideSideSign,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state: stateProxy,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

const profile = {
  directness: 0.58,
  overlapBias: 0.64,
  phaseKey: "openPlay",
  progressionUrgency: 0.62,
  restBehind: 22,
  shortSupport: 0.58,
  supportCompactness: 0.56,
  switchBias: 0.7,
  widthDiscipline: 0.68,
};

test("game simulator autopilot offball possession route targets expose moved contracts", () => {
  const possessionRoute = createGameSimulatorAutopilotOffballPossessionRouteTargets(createPossessionRouteDeps());

  expect(typeof possessionRoute.getPossessionRouteOccupationTarget).toBe("function");
  expect(typeof possessionRoute.applyPossessionRoutePrincipleTargets).toBe("function");
});

test("game simulator autopilot offball possession route targets preserve wide route occupation", () => {
  const deps = createPossessionRouteDeps();
  const possessionRoute = createGameSimulatorAutopilotOffballPossessionRouteTargets(deps);
  const targets = createTargets(deps.state.players);
  const excludedIds = new Set();

  const labels = possessionRoute.applyPossessionRoutePrincipleTargets(
    "home",
    targets,
    { x: 54, y: 10 },
    { beforeSnapshot: { ball: { position: { x: 38, y: 14 } } } },
    profile,
    excludedIds
  );

  expect(labels).toContain("Wide overload route");
  expect(labels).toContain("Route width");
  expect(labels).toContain("Half-space link");
  expect(labels).toContain("Route overlap");
  expect(labels).toContain("Route switch release");
  expect(labels).toContain("Route support under");
  expect(labels).toContain("Route rest-defence");
  expect(targets.get("H2").y).toBeLessThan(7);
  expect(targets.get("H11").y).toBeGreaterThan(30);
  expect(targets.get("H4").x).toBeLessThan(36);
  expect(excludedIds.has("H2")).toBe(true);
  expect(excludedIds.has("H4")).toBe(true);
});

test("game simulator autopilot offball possession route targets skip set pieces", () => {
  const deps = createPossessionRouteDeps();
  const possessionRoute = createGameSimulatorAutopilotOffballPossessionRouteTargets(deps);
  const targets = createTargets(deps.state.players);

  expect(possessionRoute.applyPossessionRoutePrincipleTargets(
    "home",
    targets,
    { x: 54, y: 10 },
    { beforeSnapshot: { ball: { position: { x: 38, y: 14 } } } },
    { ...profile, phaseKey: "setPiece" },
    new Set()
  )).toEqual([]);
});
