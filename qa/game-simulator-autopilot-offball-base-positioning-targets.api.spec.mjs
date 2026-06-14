import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballBasePositioningTargets } from "../src/modules/game-simulator/autopilot-offball-base-positioning-targets.mjs";

const pitch = { length: 105, width: 68 };

function createBasePositioningDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      carrierPlayerId: "H8",
      receiverPlayerId: null,
      initiatorPlayerId: "H8",
    },
    players: [
      { id: "H2", team: "home", position: { x: 48, y: 9 }, roleKey: "wideBack", maxSpeed: 7.5, acceleration: 2.8, intelligenceProfile: { perception: 0.72 } },
      { id: "H7", team: "home", position: { x: 58, y: 12 }, roleKey: "wideForward", maxSpeed: 8.1, acceleration: 3.1, intelligenceProfile: { perception: 0.78 } },
      { id: "H8", team: "home", position: { x: 55, y: 31 }, roleKey: "connector", maxSpeed: 7.2, acceleration: 2.5, intelligenceProfile: { perception: 0.76 } },
      { id: "H9", team: "home", position: { x: 76, y: 34 }, roleKey: "striker", maxSpeed: 7.8, acceleration: 2.9, intelligenceProfile: { perception: 0.74 } },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    clampToPitch: (point, margin = 0) => ({
      x: clamp(point.x, margin, pitch.length - margin),
      y: clamp(point.y, margin, pitch.width - margin),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    gameRoleProfiles: {
      connector: { label: "Connector" },
      striker: { label: "Striker" },
      wideBack: { label: "Wide Back" },
      wideForward: { label: "Wide Forward" },
    },
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthX: (teamId, depth) => (teamId === "home" ? depth : pitch.length - depth),
    getFormationPositions: () => [
      { x: 44, y: 8 },
      { x: 56, y: 12 },
      { x: 52, y: 31 },
      { x: 74, y: 34 },
    ],
    getLaneCenterY: (laneKey) => ({
      leftWide: 6,
      leftHalf: 22,
      central: 34,
      rightHalf: 46,
      rightWide: 62,
    })[laneKey] ?? 34,
    getOffensiveRoleKey: (player) => player.roleKey,
    getPlayerTendency: (player, tendency) => {
      if (player.roleKey === "wideForward" && tendency === "boxRun") return 0.82;
      if (player.roleKey === "wideBack" && tendency === "overlap") return 0.78;
      return 0.5;
    },
    getSecondLastOpponentLineX: () => 70,
    getSideLaneKeys: (baseY) => (
      baseY < pitch.width / 2
        ? { wide: "leftWide", half: "leftHalf" }
        : { wide: "rightWide", half: "rightHalf" }
    ),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isFrontLineRole: (roleKey) => ["striker", "wideForward", "secondStriker"].includes(roleKey),
    isGoalkeeper: (player) => player.roleKey === "gk",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state: stateProxy,
    teamRosterOrder: { home: ["H2", "H7", "H8", "H9"], away: [] },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

const attackingProfile = {
  centralOverload: 0.42,
  connectorAdvance: 0,
  connectorAhead: 5,
  crossBias: 0.42,
  directness: 0.64,
  dribbleBias: 0.5,
  finalThirdPin: 5,
  formation: "4-3-3",
  frontAhead: 11,
  overlapBias: 0.62,
  phaseKey: "finalThird",
  pivotBehind: 10,
  pivotDrop: 0,
  restBehind: 16,
  runnerBoost: 7,
  runnerPreferences: { wideForward: 1.1, striker: 0.9 },
  shortSupport: 0.54,
  strikerPairSupport: 0,
  supportCompactness: 0.12,
  switchBias: 0.48,
  wideBackAdvance: 1,
  wideDepthBoost: 8,
  wideForwardNarrowing: 0.24,
  widthDiscipline: 0.72,
};

test("game simulator autopilot offball base positioning targets expose moved contracts", () => {
  const basePositioning = createGameSimulatorAutopilotOffballBasePositioningTargets(createBasePositioningDeps());

  expect(typeof basePositioning.getPlayerRoleModel).toBe("function");
  expect(typeof basePositioning.getOffensiveAutopilotTarget).toBe("function");
  expect(typeof basePositioning.chooseOffensiveAutopilotRunner).toBe("function");
  expect(typeof basePositioning.enforceOffensiveOnsideLineAwareness).toBe("function");
  expect(typeof basePositioning.enforceOffensiveOccupationZones).toBe("function");
});

test("game simulator autopilot offball base positioning targets preserve runner target depth", () => {
  const basePositioning = createGameSimulatorAutopilotOffballBasePositioningTargets(createBasePositioningDeps());
  const player = { id: "H7", team: "home", position: { x: 58, y: 12 }, roleKey: "wideForward" };

  const target = basePositioning.getOffensiveAutopilotTarget(
    player,
    { x: 60, y: 14 },
    { actionType: "pass" },
    attackingProfile,
    12,
    true
  );

  expect(target.x).toBeGreaterThan(70);
  expect(target.y).toBeGreaterThan(9);
  expect(target.y).toBeLessThan(26);
});

test("game simulator autopilot offball base positioning targets preserve onside line awareness", () => {
  const basePositioning = createGameSimulatorAutopilotOffballBasePositioningTargets(createBasePositioningDeps());
  const targets = new Map([
    ["H9", { x: 82, y: 34 }],
  ]);

  const labels = basePositioning.enforceOffensiveOnsideLineAwareness(
    "home",
    targets,
    { x: 65, y: 34 },
    attackingProfile
  );

  expect(labels).toContain("Onside line awareness");
  expect(targets.get("H9").x).toBeLessThan(75);
});

test("game simulator autopilot offball base positioning targets read live state through dependency boundary", () => {
  const deps = createBasePositioningDeps();
  const basePositioning = createGameSimulatorAutopilotOffballBasePositioningTargets(deps);

  expect(basePositioning.chooseOffensiveAutopilotRunner(
    "home",
    new Map([
      ["H7", { x: 76, y: 16 }],
      ["H9", { x: 77, y: 34 }],
    ]),
    { actionType: "pass" },
    { x: 60, y: 14 },
    attackingProfile
  )?.id).toBe("H9");

  deps.replaceState({
    ball: { carrierPlayerId: "H8" },
    players: [
      { id: "H10", team: "home", position: { x: 59, y: 35 }, roleKey: "striker", maxSpeed: 8.3, acceleration: 3.2, intelligenceProfile: { perception: 0.82 } },
    ],
  });

  expect(basePositioning.chooseOffensiveAutopilotRunner(
    "home",
    new Map([
      ["H10", { x: 78, y: 35 }],
    ]),
    { actionType: "pass" },
    { x: 60, y: 34 },
    attackingProfile
  )?.id).toBe("H10");
});
