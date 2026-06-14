import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballHighValueSpaceTargets } from "../src/modules/game-simulator/autopilot-offball-high-value-space-targets.mjs";

const pitch = { length: 105, width: 68 };

const initialPlayers = [
  { id: "H9", team: "home", roleKey: "striker", position: { x: 63, y: 34 } },
  { id: "H8", team: "home", roleKey: "connector", position: { x: 55, y: 29 } },
  { id: "H6", team: "home", roleKey: "pivot", position: { x: 52, y: 32 } },
  { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 54 } },
  { id: "A4", team: "away", roleKey: "centreBack", position: { x: 76, y: 34 } },
];

function createHighValueSpaceDeps(overrides = {}) {
  let state = overrides.state ?? {
    players: initialPlayers,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const pickPlayer = (teamId, roleKeys, targets, excludedIds = new Set()) =>
    state.players.find((player) => (
      player.team === teamId &&
      !excludedIds.has(player.id) &&
      targets.has(player.id) &&
      roleKeys.includes(player.roleKey)
    )) ?? null;

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
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getPitchThreatProfile: () => ({
      assistZone: 0.2,
      betweenLines: 0.46,
      box: 0.38,
      centralPocket: 0.44,
      primaryLabel: "central pocket",
      value: 0.58,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
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
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

function createTargets(players = initialPlayers) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball high value space targets expose moved contracts", () => {
  const highValueSpace = createGameSimulatorAutopilotOffballHighValueSpaceTargets(createHighValueSpaceDeps());

  expect(typeof highValueSpace.getHighValueAttackTarget).toBe("function");
  expect(typeof highValueSpace.applyHighValueSpacePrincipleTargets).toBe("function");
});

test("game simulator autopilot offball high value space targets preserve danger-space support", () => {
  const deps = createHighValueSpaceDeps();
  const highValueSpace = createGameSimulatorAutopilotOffballHighValueSpaceTargets(deps);
  const targets = createTargets();
  const excludedIds = new Set();

  const labels = highValueSpace.applyHighValueSpacePrincipleTargets(
    "home",
    targets,
    { x: 60, y: 30 },
    { actionType: "pass" },
    {},
    excludedIds
  );

  expect(labels).toContain("Attack central pocket");
  expect(labels).toContain("Support the next action");
  expect(labels).toContain("Edge-of-box security");
  expect(targets.get("H9").x).toBeGreaterThan(74);
  expect(targets.get("H8").x).toBeCloseTo(61.5, 1);
  expect(targets.get("H6").x).toBe(74);
  expect(excludedIds.has("H9")).toBe(true);
  expect(excludedIds.has("H8")).toBe(true);
  expect(excludedIds.has("H6")).toBe(true);
});

test("game simulator autopilot offball high value space targets stay quiet outside threat cues", () => {
  const deps = createHighValueSpaceDeps({
    getPitchThreatProfile: () => ({
      assistZone: 0.1,
      betweenLines: 0.1,
      box: 0.1,
      centralPocket: 0.1,
      primaryLabel: "safe lane",
      value: 0.2,
    }),
  });
  const highValueSpace = createGameSimulatorAutopilotOffballHighValueSpaceTargets(deps);

  expect(highValueSpace.applyHighValueSpacePrincipleTargets(
    "home",
    createTargets(),
    { x: 40, y: 30 },
    { actionType: "pass" },
    {},
    new Set()
  )).toEqual([]);
});
