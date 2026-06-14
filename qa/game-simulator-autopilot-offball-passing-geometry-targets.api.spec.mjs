import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPassingGeometryTargets } from "../src/modules/game-simulator/autopilot-offball-passing-geometry-targets.mjs";

const pitch = { length: 105, width: 68 };

function createPassingGeometryDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      position: { x: 46, y: 28 },
      receiverPlayerId: "H9",
      startPosition: { x: 44, y: 30 },
    },
    players: [
      { id: "H6", team: "home", roleKey: "pivot", position: { x: 43, y: 34 } },
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 50, y: 9 } },
      { id: "H3", team: "home", roleKey: "wideForward", position: { x: 60, y: 56 } },
      { id: "H4", team: "home", roleKey: "wideBack", position: { x: 48, y: 58 } },
      { id: "H5", team: "home", roleKey: "rest", position: { x: 34, y: 34 } },
      { id: "H7", team: "home", roleKey: "wideForward", position: { x: 58, y: 12 } },
      { id: "H8", team: "home", roleKey: "connector", position: { x: 52, y: 24 } },
      { id: "H9", team: "home", roleKey: "striker", position: { x: 64, y: 34 } },
      { id: "H10", team: "home", roleKey: "connector", position: { x: 54, y: 18 } },
      { id: "A4", team: "away", roleKey: "centreBack", position: { x: 59, y: 22 } },
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
    cloneVector: (point) => ({ ...point }),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      targetThreat: {
        assistZone: 0.34,
        box: 0.18,
        centralPocket: 0.28,
        cutbackZone: 0.24,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2" }),
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds, sideSign),
    getOpponentPressureAtPoint: () => 0.58,
    getPitchThreatProfile: () => ({
      assistZone: 0.34,
      box: 0.18,
      centralPocket: 0.28,
      cutbackZone: 0.24,
    }),
    getWideSideSign,
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 16,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target) {
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
  return new Map(
    players
      .filter((player) => player.team === "home")
      .map((player) => [player.id, { ...player.position }])
  );
}

const profile = {
  lineBreakBias: 0.58,
  overlapBias: 0.58,
  phaseKey: "progression",
  restBehind: 20,
  shortSupport: 0.62,
  switchBias: 0.6,
  tempo: 0.56,
  width: 60,
  widthDiscipline: 0.68,
};

test("game simulator autopilot offball passing geometry targets expose moved contracts", () => {
  const passingGeometry = createGameSimulatorAutopilotOffballPassingGeometryTargets(createPassingGeometryDeps());

  expect(typeof passingGeometry.getOffensivePassingGeometryContext).toBe("function");
  expect(typeof passingGeometry.getOffensivePassingGeometryTarget).toBe("function");
  expect(typeof passingGeometry.applyOffensivePassingGeometryTargets).toBe("function");
});

test("game simulator autopilot offball passing geometry targets build pressure context", () => {
  const passingGeometry = createGameSimulatorAutopilotOffballPassingGeometryTargets(createPassingGeometryDeps());

  const context = passingGeometry.getOffensivePassingGeometryContext(
    "home",
    { x: 58, y: 18 },
    { actionType: "pass", beforeSnapshot: { ball: { position: { x: 45, y: 26 } } } },
    profile
  );

  expect(context.actionType).toBe("pass");
  expect(context.isWide).toBe(true);
  expect(context.isFinalThird).toBe(true);
  expect(context.sideSign).toBe(-1);
  expect(context.startPoint).toEqual({ x: 45, y: 26 });
});

test("game simulator autopilot offball passing geometry targets assign support relations", () => {
  const deps = createPassingGeometryDeps();
  const passingGeometry = createGameSimulatorAutopilotOffballPassingGeometryTargets(deps);
  const targets = createTargets(deps.state.players);

  const result = passingGeometry.applyOffensivePassingGeometryTargets(
    "home",
    targets,
    { x: 58, y: 18 },
    { actionType: "pass", carrierPlayerId: "H8", receiverPlayerId: "H9" },
    profile
  );

  expect(result.labels).toContain("Passing geometry: under angle");
  expect(result.labels).toContain("Passing geometry: inside angle");
  expect(result.labels).toContain("Passing geometry: outside exit");
  expect(result.labels).toContain("Passing geometry: third-man angle");
  expect(result.labels).toContain("Passing geometry: weak-side release");
  expect(result.labels).toContain("Passing geometry: rest balance");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(5);
  expect(targets.get("H6").x).toBeLessThan(58);
  expect(targets.get("H2").y).toBeLessThan(10);
});

test("game simulator autopilot offball passing geometry targets read live state through dependency boundary", () => {
  const deps = createPassingGeometryDeps();
  const passingGeometry = createGameSimulatorAutopilotOffballPassingGeometryTargets(deps);

  expect(
    passingGeometry.getOffensivePassingGeometryContext(
      "home",
      { x: 58, y: 18 },
      { actionType: "pass" },
      profile
    ).startPoint
  ).toEqual({ x: 44, y: 30 });

  deps.replaceState({
    ...deps.state,
    ball: {
      ...deps.state.ball,
      startPosition: null,
      position: { x: 51, y: 40 },
    },
  });

  expect(
    passingGeometry.getOffensivePassingGeometryContext(
      "home",
      { x: 58, y: 18 },
      { actionType: "pass" },
      profile
    ).startPoint
  ).toEqual({ x: 51, y: 40 });
});
