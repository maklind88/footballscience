import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballRestDefenceNetTargets } from "../src/modules/game-simulator/autopilot-offball-rest-defence-net-targets.mjs";

const pitch = { length: 105, width: 68 };

function createRestDefenceDeps(overrides = {}) {
  const players = overrides.players ?? [
    { id: "H5", team: "home", roleKey: "rest", position: { x: 40, y: 34 } },
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 47, y: 32 } },
    { id: "H4", team: "home", roleKey: "rest", position: { x: 39, y: 44 } },
    { id: "H7", team: "home", roleKey: "wideBack", position: { x: 50, y: 16 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 56, y: 30 } },
    { id: "H11", team: "home", roleKey: "wideForward", position: { x: 63, y: 15 } },
    { id: "H12", team: "home", roleKey: "secondStriker", position: { x: 64, y: 41 } },
    { id: "H10", team: "home", roleKey: "connector", position: { x: 58, y: 27 } },
  ];
  const state = overrides.state ?? {
    players,
    ball: {
      actionType: "dribble",
      position: { x: 58, y: 27 },
      initiatorPlayerId: "H10",
      receiverPlayerId: null,
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    cloneVector: (point) => ({ ...point }),
    getActionSpaceValue: () => ({
      value: 0.68,
      lineBreakCount: 2,
      targetPressure: 0.5,
      targetThreat: {
        assistZone: 0.34,
        box: 0.18,
        cutbackZone: 0.12,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDepthX: (teamId, depth) => (teamId === "home" ? depth : pitch.length - depth),
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
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
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

test("game simulator autopilot offball rest-defence net targets expose moved contracts", () => {
  const restDefence = createGameSimulatorAutopilotOffballRestDefenceNetTargets(createRestDefenceDeps());

  expect(typeof restDefence.getOffensiveRestDefenceNetContext).toBe("function");
  expect(typeof restDefence.getOffensiveRestDefenceNetTarget).toBe("function");
  expect(typeof restDefence.applyOffensiveRestDefenceNetTargets).toBe("function");
});

test("game simulator autopilot offball rest-defence net targets read transition risk context", () => {
  const restDefence = createGameSimulatorAutopilotOffballRestDefenceNetTargets(createRestDefenceDeps());

  const context = restDefence.getOffensiveRestDefenceNetContext(
    "home",
    { x: 68, y: 24 },
    {
      actionType: "dribble",
      beforeSnapshot: { ball: { position: { x: 56, y: 28 } } },
      target: { x: 68, y: 24 },
    },
    { risk: 0.72, tempo: 0.7, styleKey: "gegenpress" }
  );

  expect(context.highAttack).toBe(true);
  expect(context.restNeed).toBeGreaterThan(0.55);
  expect(context.counterPressReadiness).toBeGreaterThan(0.55);
  expect(context.sideSign).toBe(-1);
});

test("game simulator autopilot offball rest-defence net targets preserve cover geometry", () => {
  const restDefence = createGameSimulatorAutopilotOffballRestDefenceNetTargets(createRestDefenceDeps());
  const context = {
    actionType: "dribble",
    actionSpace: { targetPressure: 0.5 },
    ballDepth: 68,
    counterPressReadiness: 0.75,
    highAttack: true,
    restNeed: 0.7,
    sideSign: -1,
    targetPoint: { x: 68, y: 24 },
    transitionRisk: 0.82,
  };

  const centralAnchor = restDefence.getOffensiveRestDefenceNetTarget("home", context, "centralAnchor", { restBehind: 22 });
  const counterPress = restDefence.getOffensiveRestDefenceNetTarget("home", context, "closeCounterPress", {});
  const recoveryLine = restDefence.getOffensiveRestDefenceNetTarget("home", context, "recoveryLine", { restBehind: 22 });

  expect(centralAnchor.x).toBeLessThan(68);
  expect(counterPress.x).toBeLessThan(68);
  expect(counterPress.y).toBeLessThan(24);
  expect(recoveryLine.x).toBeLessThan(centralAnchor.x);
});

test("game simulator autopilot offball rest-defence net targets assign rest network", () => {
  const restDefence = createGameSimulatorAutopilotOffballRestDefenceNetTargets(createRestDefenceDeps());
  const targets = new Map([
    ["H5", { x: 40, y: 34 }],
    ["H6", { x: 47, y: 32 }],
    ["H4", { x: 39, y: 44 }],
    ["H7", { x: 50, y: 16 }],
    ["H8", { x: 56, y: 30 }],
    ["H11", { x: 63, y: 15 }],
    ["H12", { x: 64, y: 41 }],
  ]);

  const result = restDefence.applyOffensiveRestDefenceNetTargets(
    "home",
    targets,
    { x: 68, y: 24 },
    {
      actionType: "dribble",
      beforeSnapshot: { ball: { position: { x: 56, y: 28 }, ownerPlayerId: "H10" } },
      carrierPlayerId: "H10",
      target: { x: 68, y: 24 },
    },
    { risk: 0.72, tempo: 0.7, styleKey: "gegenpress", widthDiscipline: 0.7, switchBias: 0.6 },
    new Set()
  );

  expect(result.labels).toContain("Rest-defence net: central anchor");
  expect(result.labels).toContain("Rest-defence net: ball-side screen");
  expect(result.labels).toContain("Rest-defence net: recovery line");
  expect(result.protectedIds.has("H5")).toBe(true);
  expect(targets.get("H5").x).toBeLessThan(68);
  expect(targets.get("H4").x).toBeLessThan(68);
});
