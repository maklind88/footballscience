import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballSupportTriangleTargets } from "../src/modules/game-simulator/autopilot-offball-support-triangle-targets.mjs";

const pitch = { length: 105, width: 68 };

function createSupportTriangleDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      position: { x: 55, y: 22 },
      receiverPlayerId: "H9",
      startPosition: { x: 45, y: 28 },
    },
    players: [
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 48, y: 9 } },
      { id: "H3", team: "home", roleKey: "wideBack", position: { x: 42, y: 58 } },
      { id: "H6", team: "home", roleKey: "pivot", position: { x: 43, y: 34 } },
      { id: "H7", team: "home", roleKey: "wideForward", position: { x: 58, y: 12 } },
      { id: "H8", team: "home", roleKey: "connector", position: { x: 52, y: 28 } },
      { id: "H9", team: "home", roleKey: "striker", position: { x: 64, y: 34 } },
      { id: "H10", team: "home", roleKey: "connector", position: { x: 54, y: 44 } },
      { id: "A4", team: "away", roleKey: "centreBack", position: { x: 57, y: 23 } },
      { id: "A5", team: "away", roleKey: "centreBack", position: { x: 59, y: 30 } },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
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
    distance,
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
      betweenLines: 0.32,
      centralPocket: 0.3,
      halfSpace: 0.34,
    }),
    getWideSideSign,
    isGoalkeeper: (player) => player.roleKey === "gk",
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
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

const profile = {
  directness: 0.64,
  overlapBias: 0.58,
  phaseKey: "openPlay",
  restBehind: 20,
  shortSupport: 0.62,
  supportCompactness: 0.58,
  switchBias: 0.6,
  width: 60,
  widthDiscipline: 0.68,
};

test("game simulator autopilot offball support triangle targets expose moved contracts", () => {
  const supportTriangle = createGameSimulatorAutopilotOffballSupportTriangleTargets(createSupportTriangleDeps());

  expect(typeof supportTriangle.getBallNearSupportTriangleTarget).toBe("function");
  expect(typeof supportTriangle.applyBallNearSupportTriangleTargets).toBe("function");
  expect(typeof supportTriangle.getTargetLocalSuperiorityProfile).toBe("function");
  expect(typeof supportTriangle.getLocalSuperioritySupportTarget).toBe("function");
  expect(typeof supportTriangle.applyLocalSuperioritySupportTargets).toBe("function");
});

test("game simulator autopilot offball support triangle targets preserve ball-near labels", () => {
  const deps = createSupportTriangleDeps();
  const supportTriangle = createGameSimulatorAutopilotOffballSupportTriangleTargets(deps);
  const targets = createTargets(deps.state?.players ?? []);

  const labels = supportTriangle.applyBallNearSupportTriangleTargets(
    "home",
    targets,
    { x: 58, y: 18 },
    { actionType: "pass", carrierPlayerId: "H8", receiverPlayerId: "H9" },
    profile
  );

  expect(labels).toContain("Ball-near support triangle");
  expect(labels).toContain("Inside support angle");
  expect(labels).toContain("Rest-defence lock");
  expect(labels.length).toBeGreaterThanOrEqual(3);
  expect(targets.get("H6").x).toBeLessThan(58);
});

test("game simulator autopilot offball support triangle targets repair local superiority", () => {
  const deps = createSupportTriangleDeps();
  const supportTriangle = createGameSimulatorAutopilotOffballSupportTriangleTargets(deps);
  const targets = createTargets(deps.state?.players ?? []);

  const result = supportTriangle.applyLocalSuperioritySupportTargets(
    "home",
    targets,
    { x: 58, y: 18 },
    {
      actionType: "pass",
      beforeSnapshot: { ball: { position: { x: 45, y: 28 }, ownerPlayerId: "H8" } },
      carrierPlayerId: "H8",
      receiverPlayerId: "H9",
    },
    profile,
    new Set()
  );

  expect(result.labels).toContain("Local superiority support");
  expect(result.labels).toContain("Local superiority: under support");
  expect(result.protectedIds.size).toBeGreaterThan(0);
});

test("game simulator autopilot offball support triangle targets read live state through dependency boundary", () => {
  const deps = createSupportTriangleDeps();
  const supportTriangle = createGameSimulatorAutopilotOffballSupportTriangleTargets(deps);
  const targets = createTargets(deps.state?.players ?? []);

  expect(supportTriangle.getTargetLocalSuperiorityProfile("home", targets, { x: 55, y: 28 }).supportCount).toBeGreaterThan(1);

  deps.replaceState({
    ball: { ownerPlayerId: "H1", position: { x: 40, y: 40 } },
    players: [
      { id: "H1", team: "home", roleKey: "pivot", position: { x: 41, y: 40 } },
      { id: "A1", team: "away", roleKey: "centreBack", position: { x: 42, y: 40 } },
    ],
  });
  const nextTargets = new Map([["H1", { x: 41, y: 40 }]]);

  expect(supportTriangle.getTargetLocalSuperiorityProfile("home", nextTargets, { x: 41, y: 40 }).supportCount).toBe(1);
});
