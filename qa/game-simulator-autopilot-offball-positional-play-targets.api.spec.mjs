import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPositionalPlayTargets } from "../src/modules/game-simulator/autopilot-offball-positional-play-targets.mjs";

const pitch = { length: 105, width: 68 };

function createPositionalPlayDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      actionType: "pass",
      position: { x: 72, y: 58 },
    },
    players: [
      { id: "H1", team: "home", roleKey: "connector", position: { x: 63, y: 55 } },
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 58, y: 60 } },
      { id: "H11", team: "home", roleKey: "wideForward", position: { x: 68, y: 10 } },
      { id: "H3", team: "home", roleKey: "wideBack", position: { x: 52, y: 12 } },
      { id: "H4", team: "home", roleKey: "rest", position: { x: 49, y: 35 } },
      { id: "H6", team: "home", roleKey: "pivot", position: { x: 56, y: 32 } },
      { id: "H5", team: "home", roleKey: "connector", position: { x: 55, y: 15 } },
      { id: "H8", team: "home", roleKey: "connector", position: { x: 64, y: 50 } },
      { id: "H7", team: "home", roleKey: "wideForward", position: { x: 70, y: 58 } },
      { id: "H9", team: "home", roleKey: "striker", position: { x: 76, y: 34 } },
      { id: "A4", team: "away", roleKey: "centreBack", position: { x: 78, y: 34 } },
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
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds, sideSign),
    getPitchSpaceProfile: () => ({
      assistZone: 0.36,
      box: 0.28,
      cutbackZone: 0.2,
      wideCorridor: 0.5,
    }),
    getWideSideSign,
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
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
  directness: 0.62,
  phaseKey: "openPlay",
  restBehind: 22,
  runnerBoost: 7,
  shortSupport: 0.58,
  switchBias: 0.68,
  width: 60,
};

test("game simulator autopilot offball positional play targets expose moved contracts", () => {
  const positionalPlay = createGameSimulatorAutopilotOffballPositionalPlayTargets(createPositionalPlayDeps());

  expect(typeof positionalPlay.getPositionalPlayOccupationTarget).toBe("function");
  expect(typeof positionalPlay.applyPositionalPlayOccupationTargets).toBe("function");
});

test("game simulator autopilot offball positional play targets preserve final third occupation", () => {
  const deps = createPositionalPlayDeps();
  const positionalPlay = createGameSimulatorAutopilotOffballPositionalPlayTargets(deps);
  const targets = createTargets(deps.state.players);
  const excludedIds = new Set(["H1"]);

  const labels = positionalPlay.applyPositionalPlayOccupationTargets(
    "home",
    targets,
    { x: 72, y: 58 },
    { actionType: "pass" },
    profile,
    excludedIds
  );

  expect(labels).toContain("Under-ball support");
  expect(labels).toContain("Weak-side width");
  expect(labels).toContain("Half-space support");
  expect(labels).toContain("Diagonal box threat");
  expect(labels).toContain("Far-half connection");
  expect(labels).toContain("Rest-defence lock");
  expect(labels).toContain("Far rest cover");
  expect(excludedIds.has("H6")).toBe(true);
  expect(targets.get("H11").y).toBeLessThan(12);
  expect(targets.get("H7").x).toBeGreaterThan(84);
  expect(targets.get("H4").x).toBeLessThan(55);
});

test("game simulator autopilot offball positional play targets skip set pieces", () => {
  const deps = createPositionalPlayDeps();
  const positionalPlay = createGameSimulatorAutopilotOffballPositionalPlayTargets(deps);
  const targets = createTargets(deps.state.players);

  expect(positionalPlay.applyPositionalPlayOccupationTargets(
    "home",
    targets,
    { x: 72, y: 58 },
    { actionType: "pass" },
    { ...profile, phaseKey: "setPiece" },
    new Set()
  )).toEqual([]);
});
