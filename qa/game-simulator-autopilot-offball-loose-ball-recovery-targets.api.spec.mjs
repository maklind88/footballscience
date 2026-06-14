import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballLooseBallRecoveryTargets } from "../src/modules/game-simulator/autopilot-offball-loose-ball-recovery-targets.mjs";

function createLooseBallRecoveryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = {
    ball: {
      actionType: "recovery",
      profileKey: "loose-ball-recovery",
      carrierPlayerId: "H9",
      initiatorPlayerId: "H8",
    },
  };
  const players = [
    { id: "H1", roleKey: "pivot" },
    { id: "H2", roleKey: "connector" },
    { id: "H3", roleKey: "striker" },
    { id: "H4", roleKey: "wideBack" },
    { id: "H5", roleKey: "rest" },
  ];
  const pickPlayer = (_teamId, roleKeys, targets, excludedIds = new Set()) =>
    players.find((player) => roleKeys.includes(player.roleKey) && targets.has(player.id) && !excludedIds.has(player.id)) ?? null;

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pitch.width / 2,
      ...pointOverrides,
    }),
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getMovableAutopilotPlayerByRolesOnSide: pickPlayer,
    getOpponentPressureAtPoint: () => 0.28,
    getPitchThreatProfile: () => ({ depth: 58 }),
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : 1),
    isTransitionAttackStyle: () => true,
    isWidePrincipleZone: () => true,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offball loose-ball recovery targets expose moved contracts", () => {
  const recovery = createGameSimulatorAutopilotOffballLooseBallRecoveryTargets(createLooseBallRecoveryDeps());

  expect(typeof recovery.getLooseBallRecoverySupportTarget).toBe("function");
  expect(typeof recovery.applyLooseBallRecoverySupportTargets).toBe("function");
});

test("game simulator autopilot offball loose-ball recovery targets preserve support geometry", () => {
  const recovery = createGameSimulatorAutopilotOffballLooseBallRecoveryTargets(createLooseBallRecoveryDeps());

  expect(recovery.getLooseBallRecoverySupportTarget(
    "home",
    { x: 52, y: 18 },
    "widthRelease",
    -1,
    { widthDiscipline: 0.8 }
  )).toEqual({ x: 57.8, y: 5.600000000000001 });
});

test("game simulator autopilot offball loose-ball recovery targets assign and protect recovery chain", () => {
  const recovery = createGameSimulatorAutopilotOffballLooseBallRecoveryTargets(createLooseBallRecoveryDeps());
  const targets = new Map([
    ["H1", { x: 35, y: 30 }],
    ["H2", { x: 40, y: 28 }],
    ["H3", { x: 48, y: 34 }],
    ["H4", { x: 42, y: 12 }],
    ["H5", { x: 30, y: 34 }],
  ]);

  const result = recovery.applyLooseBallRecoverySupportTargets(
    "home",
    targets,
    { x: 52, y: 18 },
    { actionType: "recovery", profileKey: "loose-ball-recovery" },
    { directness: 0.72, widthDiscipline: 0.7, restDefence: 0.64 }
  );

  expect(result.labels).toEqual([
    "Loose-ball recovery support",
    "Recovery: secure first pass",
    "Recovery: inside bounce angle",
    "Recovery: forward outlet",
    "Recovery: width release",
    "Recovery: rest-defence lock",
  ]);
  expect([...result.protectedIds]).toEqual(["H1", "H2", "H3", "H4", "H5"]);
  expect(targets.get("H3").x).toBeGreaterThan(60);
});
