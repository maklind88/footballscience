import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballStructureTargets } from "../src/modules/game-simulator/autopilot-offball-structure-targets.mjs";

function createStructureDeps(overrides = {}) {
  let currentState = overrides.state || {
    players: [
      { id: "H2", team: "home", position: { x: 45, y: 12 }, role: "Left Winger" },
      { id: "H3", team: "home", position: { x: 42, y: 30 }, role: "Central Midfielder" },
      { id: "H4", team: "home", position: { x: 44, y: 37 }, role: "Central Midfielder" },
      { id: "H5", team: "home", position: { x: 48, y: 34 }, role: "Striker" },
      { id: "H6", team: "home", position: { x: 38, y: 33 }, role: "Defensive Midfielder" },
      { id: "H7", team: "home", position: { x: 40, y: 57 }, role: "Right Back" },
      { id: "A1", team: "away", position: { x: 66, y: 34 }, role: "Centre Back" },
    ],
  };
  const state = new Proxy({}, {
    get(_target, property) {
      return currentState[property];
    },
    set(_target, property, value) {
      currentState[property] = value;
      return true;
    },
  });
  const pitch = { length: 105, width: 68 };
  const roleMap = {
    "Left Winger": "wideForward",
    "Right Back": "wideBack",
    "Central Midfielder": "connector",
    "Defensive Midfielder": "pivot",
    Striker: "striker",
    "Centre Back": "back",
  };
  const laneCenters = {
    leftWide: 7,
    leftHalf: 21,
    central: 34,
    rightHalf: 47,
    rightWide: 61,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    addPointNoise: (point, radius) => ({ ...point, x: point.x + radius }),
    clamp,
    clampToPitch: (point) => ({
      x: clamp(point.x, 0, pitch.length),
      y: clamp(point.y, 0, pitch.width),
    }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefensiveAutopilotLineKey: () => "back",
    getDepthPoint: (teamId, depth, point = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: point.y ?? pitch.width / 2,
    }),
    getLaneCenterY: (laneKey) => laneCenters[laneKey] ?? pitch.width / 2,
    getOffensiveRoleKey: (player) => player.roleKey ?? roleMap[player.role] ?? "connector",
    getPitchLaneKey: (point) => {
      if (point.y <= 12) return "leftWide";
      if (point.y <= 28) return "leftHalf";
      if (point.y <= 40) return "central";
      if (point.y <= 56) return "rightHalf";
      return "rightWide";
    },
    getPitchSpaceProfile: () => ({ box: 0.08, cutbackZone: 0.04, wideCorridor: 0.42 }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 18,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceState(nextState) {
      currentState = nextState;
    },
    ...overrides,
  };
  return deps;
}

function createTargets(players) {
  return new Map(players.map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball structure targets expose moved contracts", () => {
  const structureTargets = createGameSimulatorAutopilotOffballStructureTargets(createStructureDeps());

  expect(typeof structureTargets.enforceOffensiveStructureBalance).toBe("function");
  expect(typeof structureTargets.enforceOffensiveFiveLaneOccupation).toBe("function");
  expect(typeof structureTargets.applyAutopilotTargetVariation).toBe("function");
});

test("game simulator autopilot offball structure targets preserve five-lane shape", () => {
  const deps = createStructureDeps();
  const structureTargets = createGameSimulatorAutopilotOffballStructureTargets(deps);
  const targets = createTargets(deps.state.players);
  const profile = {
    formation: "4-3-3",
    phaseKey: "buildUp",
    width: 60,
    widthDiscipline: 0.72,
    switchBias: 0.58,
    overlapBias: 0.62,
    shortSupport: 0.64,
    supportCompactness: 0.55,
    runnerBoost: 7,
    directness: 0.55,
    restBehind: 22,
  };

  const labels = structureTargets.enforceOffensiveFiveLaneOccupation(
    "home",
    targets,
    { x: 52, y: 54 },
    { actionType: "pass" },
    profile,
    new Set()
  );
  const strongWideTarget = structureTargets.getFiveLaneOccupationSlotTarget("home", { x: 52, y: 54 }, "strongWide", 1, profile);

  expect(labels.some((label) => label.startsWith("Five-lane:"))).toBe(true);
  expect(strongWideTarget.y).toBeGreaterThan(56);
  expect([...targets.values()].some((target) => target.y > 56)).toBe(true);
});

test("game simulator autopilot offball structure targets read live state through dependency boundary", () => {
  const deps = createStructureDeps();
  const structureTargets = createGameSimulatorAutopilotOffballStructureTargets(deps);
  let targets = new Map([["H7", { x: 40, y: 57 }]]);

  expect(structureTargets.getStructureBalanceCandidates("home", targets, new Set(), ["wideBack"], { x: 55, y: 60 }, 1).map((player) => player.id)).toEqual(["H7"]);

  deps.replaceState({
    players: [{ id: "H9", team: "home", position: { x: 39, y: 58 }, role: "Right Back" }],
  });
  targets = new Map([["H9", { x: 39, y: 58 }]]);

  expect(structureTargets.getStructureBalanceCandidates("home", targets, new Set(), ["wideBack"], { x: 55, y: 60 }, 1).map((player) => player.id)).toEqual(["H9"]);
});
