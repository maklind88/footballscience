import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballTransitionAttackTargets } from "../src/modules/game-simulator/autopilot-offball-transition-attack-targets.mjs";

const pitch = { length: 105, width: 68 };

function createTransitionAttackDeps(overrides = {}) {
  const players = overrides.players ?? [
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 44, y: 34 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 50, y: 30 } },
    { id: "H7", team: "home", roleKey: "wideBack", position: { x: 49, y: 15 } },
    { id: "H9", team: "home", roleKey: "striker", position: { x: 61, y: 31 } },
    { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 13 } },
    { id: "H5", team: "home", roleKey: "rest", position: { x: 38, y: 34 } },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthPoint: (teamId, depth, overrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) =>
        player.team === teamId &&
        roleKeys.includes(player.roleKey) &&
        targets.has(player.id) &&
        !excludedIds.has(player.id)
      ) ?? null,
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) =>
        player.team === teamId &&
        roleKeys.includes(player.roleKey) &&
        targets.has(player.id) &&
        !excludedIds.has(player.id)
      ) ?? null,
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.2,
    getSecurePossessionSnapshotForTeam: () => ({
      ownerPlayerId: "H8",
      point: { x: 50, y: 30 },
      minDistanceToExpire: 8,
      reason: "interception",
    }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isTransitionAttackStyle: (styleKey) => styleKey === "direct",
    isWideChannel: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offball transition attack targets expose moved contracts", () => {
  const targets = createGameSimulatorAutopilotOffballTransitionAttackTargets(createTransitionAttackDeps());

  expect(typeof targets.getTransitionAttackTarget).toBe("function");
  expect(typeof targets.applyTransitionAttackPrincipleTargets).toBe("function");
});

test("game simulator autopilot offball transition attack targets preserve lane geometry", () => {
  const targets = createGameSimulatorAutopilotOffballTransitionAttackTargets(createTransitionAttackDeps());

  const counterRunner = targets.getTransitionAttackTarget(
    "home",
    { x: 52, y: 26 },
    "counterRunner",
    -1,
    { frontAhead: 12 }
  );
  const restLock = targets.getTransitionAttackTarget(
    "home",
    { x: 52, y: 26 },
    "restLock",
    -1,
    { restBehind: 22 }
  );

  expect(counterRunner.x).toBeGreaterThan(70);
  expect(counterRunner.y).toBeGreaterThan(30);
  expect(restLock.x).toBeLessThan(52);
  expect(restLock.y).toBeGreaterThan(26);
});

test("game simulator autopilot offball transition attack targets assign transition chain", () => {
  const transition = createGameSimulatorAutopilotOffballTransitionAttackTargets(createTransitionAttackDeps());
  const targets = new Map([
    ["H6", { x: 44, y: 34 }],
    ["H7", { x: 49, y: 15 }],
    ["H8", { x: 50, y: 30 }],
    ["H9", { x: 61, y: 31 }],
    ["H11", { x: 58, y: 13 }],
    ["H5", { x: 38, y: 34 }],
  ]);

  const labels = transition.applyTransitionAttackPrincipleTargets(
    "home",
    targets,
    { x: 56, y: 28 },
    { beforeSnapshot: { ball: { position: { x: 50, y: 30 } } } },
    { styleKey: "direct", directness: 0.72, progressionUrgency: 0.7, tempo: 0.68, widthDiscipline: 0.7 },
    new Set()
  );

  expect(labels).toContain("Transition: secure first pass");
  expect(labels).toContain("Transition: depth runner");
  expect(labels).toContain("Transition: rest-defence lock");
  expect(targets.get("H6").x).toBeLessThan(56);
  expect(targets.get("H9").x).toBeGreaterThan(70);
  expect(targets.get("H5").x).toBeLessThan(56);
});

test("game simulator autopilot offball transition attack targets ignore stale regain", () => {
  const transition = createGameSimulatorAutopilotOffballTransitionAttackTargets(createTransitionAttackDeps({
    getSecurePossessionSnapshotForTeam: () => ({
      ownerPlayerId: "H8",
      point: { x: 30, y: 30 },
      minDistanceToExpire: 4,
    }),
  }));
  const targets = new Map([["H6", { x: 44, y: 34 }]]);

  expect(transition.applyTransitionAttackPrincipleTargets(
    "home",
    targets,
    { x: 56, y: 28 },
    {},
    { styleKey: "direct" },
    new Set()
  )).toEqual([]);
});
