import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballSwitchLandingAttackTargets } from "../src/modules/game-simulator/autopilot-offball-switch-landing-attack-targets.mjs";

const pitch = { length: 105, width: 68 };

function createSwitchLandingDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      actionType: "pass",
      initiatorPlayerId: "H1",
      ownerPlayerId: "H1",
      position: { x: 44, y: 10 },
      receiverPlayerId: "H7",
      startPosition: { x: 44, y: 10 },
    },
    players: [
      { id: "H1", team: "home", roleKey: "connector", position: { x: 44, y: 10 } },
      { id: "H2", team: "home", roleKey: "wideBack", position: { x: 53, y: 60 } },
      { id: "H4", team: "home", roleKey: "rest", position: { x: 43, y: 32 } },
      { id: "H5", team: "home", roleKey: "rest", position: { x: 40, y: 20 } },
      { id: "H6", team: "home", roleKey: "pivot", position: { x: 50, y: 34 } },
      { id: "H7", team: "home", roleKey: "wideForward", position: { x: 70, y: 58 } },
      { id: "H8", team: "home", roleKey: "connector", position: { x: 60, y: 48 } },
      { id: "H9", team: "home", roleKey: "striker", position: { x: 72, y: 35 } },
      { id: "H10", team: "home", roleKey: "connector", position: { x: 62, y: 52 } },
      { id: "H11", team: "home", roleKey: "wideForward", position: { x: 68, y: 11 } },
      { id: "A4", team: "away", roleKey: "centreBack", position: { x: 76, y: 34 } },
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
    cloneVector: (point) => ({ ...point }),
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds, sideSign) =>
      pickPlayer(teamId, roleKeys, targets, excludedIds, sideSign),
    getOpponentPressureAtPoint: () => 0.34,
    getPitchLaneIndex: (point) => {
      if (point.y < 13) return 0;
      if (point.y < 27) return 1;
      if (point.y < 41) return 2;
      if (point.y < 55) return 3;
      return 4;
    },
    getPitchThreatProfile: () => ({
      assistZone: 0.24,
      box: 0.18,
      cutbackZone: 0.2,
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
  dribbleBias: 0.5,
  lineBreakBias: 0.62,
  overlapBias: 0.64,
  phaseKey: "openPlay",
  restBehind: 22,
  runnerBoost: 7,
  shortSupport: 0.58,
  supportCompactness: 0.56,
  switchBias: 0.68,
  width: 60,
  widthDiscipline: 0.68,
};

test("game simulator autopilot offball switch landing attack targets expose moved contracts", () => {
  const switchLanding = createGameSimulatorAutopilotOffballSwitchLandingAttackTargets(createSwitchLandingDeps());

  expect(typeof switchLanding.getSwitchLandingAttackContext).toBe("function");
  expect(typeof switchLanding.getSwitchLandingAttackTarget).toBe("function");
  expect(typeof switchLanding.applySwitchLandingAttackTargets).toBe("function");
});

test("game simulator autopilot offball switch landing attack targets preserve final-third switch support", () => {
  const deps = createSwitchLandingDeps();
  const switchLanding = createGameSimulatorAutopilotOffballSwitchLandingAttackTargets(deps);
  const targets = createTargets(deps.state.players);

  const result = switchLanding.applySwitchLandingAttackTargets(
    "home",
    targets,
    { x: 76, y: 59 },
    {
      actionType: "pass",
      autoPrinciples: ["weak-side switch"],
      beforeSnapshot: { ball: { ownerPlayerId: "H1", position: { x: 44, y: 10 } } },
      carrierPlayerId: "H1",
      receiverPlayerId: "H7",
      target: { x: 76, y: 59 },
    },
    profile
  );

  expect(result.labels).toContain("Switch landing attack: attack the far side");
  expect(result.labels).toContain("Switch landing: outside overlap");
  expect(result.labels).toContain("Switch landing: near-box run");
  expect(result.labels).toContain("Switch landing: rest balance");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(6);
  expect(targets.get("H2").y).toBeGreaterThan(55);
  expect(targets.get("H9").x).toBeGreaterThan(80);
});

test("game simulator autopilot offball switch landing attack targets read live state through dependency boundary", () => {
  const deps = createSwitchLandingDeps();
  const switchLanding = createGameSimulatorAutopilotOffballSwitchLandingAttackTargets(deps);

  expect(switchLanding.getSwitchLandingAttackContext(
    "home",
    { x: 70, y: 58 },
    { target: { x: 70, y: 58 } },
    profile
  )?.mode).toBe("finalThird");

  deps.replaceState({
    ball: {
      actionType: "pass",
      initiatorPlayerId: "H1",
      ownerPlayerId: "H1",
      position: { x: 52, y: 52 },
      receiverPlayerId: "H7",
      startPosition: { x: 52, y: 52 },
    },
    players: deps.state.players,
  });

  expect(switchLanding.getSwitchLandingAttackContext(
    "home",
    { x: 70, y: 58 },
    { target: { x: 70, y: 58 } },
    profile
  )).toBeNull();
});
