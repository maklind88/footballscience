import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotOffballPrincipleSupportTargets } from "../src/modules/game-simulator/autopilot-offball-principle-support-targets.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createPrincipleSupportDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = [
    { id: "ST", team: "home", roleKey: "striker", position: { x: 78, y: 33 } },
    { id: "WF", team: "home", roleKey: "wideForward", position: { x: 76, y: 16 } },
    { id: "CM", team: "home", roleKey: "connector", position: { x: 67, y: 32 } },
    { id: "DM", team: "home", roleKey: "pivot", position: { x: 59, y: 36 } },
    { id: "GK", team: "home", roleKey: "gk", position: { x: 8, y: 34 } },
  ];
  const state = {
    ball: { initiatorPlayerId: "GK" },
    restartPhase: { type: "corner", sideY: 4 },
  };

  return {
    players,
    pitch,
    state,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point) => point.x,
    getCornerDeliveryTarget: (_teamId, sideY, slot) => ({
      edge: { x: 82, y: 31 },
      farPost: { x: 98, y: 49 },
      nearPost: { x: 96, y: 20 },
      penaltySpot: { x: 94, y: sideY + 30 },
    }[slot] ?? { x: 94, y: 34 }),
    getDepthPoint: (_teamId, attackingDepth, overrides = {}) => ({
      x: attackingDepth,
      y: pitch.width / 2,
      ...overrides,
    }),
    getFormationIdentityTarget: (_teamId, _ballPoint, slot) => ({
      restLock: { x: 58, y: 34 },
      weakSideWidth: { x: 72, y: 58 },
    }[slot] ?? { x: 62, y: 34 }),
    getHighValueAttackTarget: (_teamId, _ballPoint, slot) => ({
      goldenRun: { x: 86, y: 33 },
    }[slot] ?? { x: 82, y: 34 }),
    getMovableAutopilotPlayerByRoles: (_teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) => roleKeys.includes(player.roleKey) && targets.has(player.id) && !excludedIds.has(player.id)) ?? null,
    getMovableAutopilotPlayerByRolesOnSide: (_teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) => roleKeys.includes(player.roleKey) && targets.has(player.id) && !excludedIds.has(player.id)) ?? null,
    getOpponentPenaltySpot: () => ({ x: 94, y: 34 }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.roleKey === "gk",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) > 12,
    lerp: (start, end, weight) => start + (end - start) * weight,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball principle support targets expose support contracts", () => {
  const deps = createPrincipleSupportDeps();
  const targets = createGameSimulatorAutopilotOffballPrincipleSupportTargets(deps);

  expect(typeof targets.getSupportUnderBallTarget).toBe("function");
  expect(typeof targets.getThirdManRunnerTarget).toBe("function");
  expect(typeof targets.getBoxOccupationTarget).toBe("function");
  expect(typeof targets.applyCornerDeliveryPrincipleTargets).toBe("function");
  expect(typeof targets.getGoalkeeperBuildOutSupportTarget).toBe("function");
  expect(typeof targets.applyGoalkeeperBuildOutPrincipleTargets).toBe("function");
  expect(typeof targets.applyBoxOccupationPrincipleTargets).toBe("function");
  expect(typeof targets.applyBetweenLinesPrincipleTargets).toBe("function");
});

test("game simulator autopilot offball principle support targets assign box occupation roles", () => {
  const deps = createPrincipleSupportDeps();
  const targets = createTargets(deps.players);
  const support = createGameSimulatorAutopilotOffballPrincipleSupportTargets(deps);

  const labels = support.applyBoxOccupationPrincipleTargets("home", targets, { x: 80, y: 20 });

  expect(labels).toEqual([
    "Near-post run",
    "Far-post run",
    "Penalty-spot occupation",
    "Edge support",
  ]);
  expect(targets.get("ST")).toMatchObject({ x: 97.4 });
  expect(targets.get("WF")).toMatchObject({ x: 98.2 });
});

test("game simulator autopilot offball principle support targets use injected corner delivery targets", () => {
  const deps = createPrincipleSupportDeps();
  const targets = createTargets(deps.players);
  const support = createGameSimulatorAutopilotOffballPrincipleSupportTargets(deps);

  const labels = support.applyCornerDeliveryPrincipleTargets(
    "home",
    targets,
    { x: 101, y: 4 },
    { beforeSnapshot: { restartPhase: { type: "corner", sideY: 4 } } },
    {}
  );

  expect(labels).toContain("Near-post corner run");
  expect(labels).toContain("Far-post corner run");
  expect(targets.get("ST")).toMatchObject({ x: 96, y: 20 });
});

test("game simulator autopilot offball targets delegate principle support to a focused module", () => {
  const offballTargets = readProjectFile("src/modules/game-simulator/autopilot-offball-targets.mjs");
  const principleSupport = readProjectFile("src/modules/game-simulator/autopilot-offball-principle-support-targets.mjs");

  expect(offballTargets).toContain('from "./autopilot-offball-principle-support-targets.mjs"');
  expect(offballTargets).toContain("createGameSimulatorAutopilotOffballPrincipleSupportTargets({");
  expect(offballTargets).not.toContain("function getSupportUnderBallTarget(");
  expect(offballTargets).not.toContain("function applyCornerDeliveryPrincipleTargets(");
  expect(offballTargets).not.toContain("function applyBetweenLinesPrincipleTargets(");
  expect(principleSupport).toContain("function getSupportUnderBallTarget(");
  expect(principleSupport).toContain("function applyCornerDeliveryPrincipleTargets(");
  expect(principleSupport).toContain("function applyBetweenLinesPrincipleTargets(");
});
