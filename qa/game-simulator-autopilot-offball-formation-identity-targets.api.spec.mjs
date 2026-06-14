import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballFormationIdentityTargets } from "../src/modules/game-simulator/autopilot-offball-formation-identity-targets.mjs";

const pitch = { length: 105, width: 68 };

const initialPlayers = [
  { id: "H2", team: "home", roleKey: "wideBack", position: { x: 49, y: 12 } },
  { id: "H8", team: "home", roleKey: "connector", position: { x: 52, y: 18 } },
  { id: "H7", team: "home", roleKey: "wideForward", position: { x: 55, y: 10 } },
  { id: "H9", team: "home", roleKey: "striker", position: { x: 63, y: 34 } },
  { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 56 } },
  { id: "H6", team: "home", roleKey: "pivot", position: { x: 48, y: 31 } },
  { id: "H4", team: "home", roleKey: "rest", position: { x: 38, y: 36 } },
  { id: "A4", team: "away", roleKey: "centreBack", position: { x: 74, y: 34 } },
];

function createFormationIdentityDeps(overrides = {}) {
  let state = overrides.state ?? {
    players: initialPlayers,
  };
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
    getOffensiveRoleKey: (player) => player?.roleKey,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
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
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

function createTargets(players = initialPlayers) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

const profile = {
  formation: "4-3-3",
  overlapBias: 0.64,
  restBehind: 22,
  shortSupport: 0.58,
  widthDiscipline: 0.68,
};

test("game simulator autopilot offball formation identity targets expose moved contracts", () => {
  const formationIdentity = createGameSimulatorAutopilotOffballFormationIdentityTargets(createFormationIdentityDeps());

  expect(typeof formationIdentity.getFormationIdentityTarget).toBe("function");
  expect(typeof formationIdentity.applyFormationIdentityPrincipleTargets).toBe("function");
});

test("game simulator autopilot offball formation identity targets preserve 4-3-3 wide entry", () => {
  const deps = createFormationIdentityDeps();
  const formationIdentity = createGameSimulatorAutopilotOffballFormationIdentityTargets(deps);
  const targets = createTargets();
  const excludedIds = new Set(["H7"]);

  const labels = formationIdentity.applyFormationIdentityPrincipleTargets(
    "home",
    targets,
    { x: 56, y: 10 },
    { actionType: "pass", receiverPlayerId: "H7" },
    profile,
    excludedIds
  );

  expect(labels).toContain("4-3-3 overlap");
  expect(labels).toContain("8/10 half-space support");
  expect(labels).toContain("9 pins the line");
  expect(labels).toContain("Far-side W attacks");
  expect(targets.get("H2").y).toBeCloseTo(3.2, 1);
  expect(targets.get("H9").x).toBeGreaterThan(67);
  expect(targets.get("H11").y).toBeGreaterThan(50);
  expect(excludedIds.has("H2")).toBe(true);
  expect(excludedIds.has("H9")).toBe(true);
});

test("game simulator autopilot offball formation identity targets return empty when no formation cue is active", () => {
  const deps = createFormationIdentityDeps();
  const formationIdentity = createGameSimulatorAutopilotOffballFormationIdentityTargets(deps);
  const targets = createTargets();

  expect(formationIdentity.applyFormationIdentityPrincipleTargets(
    "home",
    targets,
    { x: 30, y: 34 },
    { actionType: "pass", receiverPlayerId: "H8" },
    profile,
    new Set()
  )).toEqual([]);
});
