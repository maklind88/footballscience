import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballGenerativePrincipleSupportTargets } from "../src/modules/game-simulator/autopilot-offball-generative-principle-support-targets.mjs";

function createGenerativeSupportDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = [
    { id: "H1", team: "home", roleKey: "connector", position: { x: 42, y: 30 } },
    { id: "H2", team: "home", roleKey: "wideForward", position: { x: 48, y: 12 } },
    { id: "H3", team: "home", roleKey: "striker", position: { x: 58, y: 34 } },
    { id: "H4", team: "home", roleKey: "wideBack", position: { x: 38, y: 56 } },
    { id: "H5", team: "home", roleKey: "pivot", position: { x: 45, y: 34 } },
  ];
  const state = {
    ball: {
      carrierPlayerId: "H9",
      receiverPlayerId: null,
      initiatorPlayerId: "H8",
      startPosition: { x: 34, y: 18 },
      position: { x: 34, y: 18 },
    },
  };
  const noopLabels = () => [];
  const pickPlayer = (_teamId, roleKeys, targets, excludedIds = new Set()) =>
    players.find((player) => roleKeys.includes(player.roleKey) && targets.has(player.id) && !excludedIds.has(player.id)) ?? null;

  return {
    applyBetweenLinesPrincipleTargets: noopLabels,
    applyBoxOccupationPrincipleTargets: () => ["Box occupation"],
    applyCornerDeliveryPrincipleTargets: noopLabels,
    applyFormationIdentityPrincipleTargets: noopLabels,
    applyGameSpaceOffBallPrincipleTargets: noopLabels,
    applyGoalkeeperBuildOutPrincipleTargets: noopLabels,
    applyHighValueSpacePrincipleTargets: noopLabels,
    applyOpenGrassCarrySupportTargets: noopLabels,
    applyOpponentBlockResponsiveTargets: noopLabels,
    applyPositionalPlayOccupationTargets: noopLabels,
    applyPossessionRoutePrincipleTargets: noopLabels,
    applyReceptionSupportPrincipleTargets: noopLabels,
    applyShotReboundPrincipleTargets: noopLabels,
    applyTransitionAttackPrincipleTargets: noopLabels,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getMovableAutopilotPlayerByRoles: pickPlayer,
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getPitchLaneIndex: (point) => (point.y < 22 ? 0 : point.y > 46 ? 2 : 1),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getSupportUnderBallTarget: (_teamId, ballPoint, sideSign) => ({ x: ballPoint.x - 9, y: ballPoint.y - sideSign * 8 }),
    getThirdManRunnerTarget: (_teamId, ballPoint, sideSign) => ({ x: ballPoint.x + 8, y: ballPoint.y + sideSign * 6 }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isWidePrincipleZone: () => true,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state,
    teams: { home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offball generative principle support targets expose moved contract", () => {
  const support = createGameSimulatorAutopilotOffballGenerativePrincipleSupportTargets(createGenerativeSupportDeps());

  expect(typeof support.applyGenerativePrincipleSupportTargets).toBe("function");
});

test("game simulator autopilot offball generative principle support targets preserve wide receiver support", () => {
  const support = createGameSimulatorAutopilotOffballGenerativePrincipleSupportTargets(createGenerativeSupportDeps());
  const targets = new Map([
    ["H1", { x: 42, y: 30 }],
    ["H2", { x: 48, y: 12 }],
    ["H3", { x: 58, y: 34 }],
    ["H4", { x: 38, y: 56 }],
    ["H5", { x: 45, y: 34 }],
  ]);

  const result = support.applyGenerativePrincipleSupportTargets(
    "home",
    targets,
    { x: 55, y: 14 },
    {
      actionType: "pass",
      carrierPlayerId: "H9",
      receiverPlayerId: "H2",
      beforeSnapshot: { ball: { ownerPlayerId: "H9", position: { x: 35, y: 18 } } },
    },
    {}
  );

  expect(result.labels).toEqual(["Underneath support", "Ask question wide"]);
  expect(targets.get("H1")).toEqual({ x: 46, y: 22 });
  expect(result.protectedIds.has("H1")).toBe(true);
  expect(result.protectedIds.has("H2")).toBe(true);
});

test("game simulator autopilot offball generative principle support targets preserve third-man and box triggers", () => {
  const support = createGameSimulatorAutopilotOffballGenerativePrincipleSupportTargets(createGenerativeSupportDeps());
  const targets = new Map([
    ["H1", { x: 42, y: 30 }],
    ["H2", { x: 48, y: 12 }],
    ["H3", { x: 58, y: 34 }],
    ["H4", { x: 38, y: 56 }],
    ["H5", { x: 45, y: 34 }],
  ]);

  const result = support.applyGenerativePrincipleSupportTargets(
    "home",
    targets,
    { x: 74, y: 56 },
    {
      actionType: "pass",
      carrierPlayerId: "H9",
      receiverPlayerId: "H5",
      beforeSnapshot: { ball: { ownerPlayerId: "H9", position: { x: 34, y: 14 } } },
    },
    {}
  );

  expect(result.labels).toEqual([
    "Third-player runner",
    "Find the Third",
    "Change corridor",
    "Box occupation",
    "Attack box",
  ]);
  expect(targets.get("H2")).toEqual({ x: 82, y: 62 });
  expect(targets.get("H4")).toEqual({ x: 82, y: 62 });
  expect(result.protectedIds.has("H2")).toBe(true);
  expect(result.protectedIds.has("H4")).toBe(true);
});
