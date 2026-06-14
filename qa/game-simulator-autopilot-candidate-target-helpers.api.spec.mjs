import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotCandidateTargetHelpers } from "../src/modules/game-simulator/autopilot-candidate-target-helpers.mjs";

function createCandidateTargetDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    players: [
      { id: "H1", team: "home", position: { x: 12, y: 34 }, roleKey: "goalkeeper" },
      { id: "H3", team: "home", position: { x: 74, y: 14 }, roleKey: "wideBack" },
      { id: "H6", team: "home", position: { x: 76, y: 36 }, roleKey: "pivot" },
      { id: "H8", team: "home", position: { x: 82, y: 30 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 86, y: 34 }, roleKey: "striker", preferredFoot: "right" },
      { id: "H10", team: "home", position: { x: 80, y: 18 }, roleKey: "connector" },
      { id: "H11", team: "home", position: { x: 84, y: 18 }, roleKey: "wideForward" },
      { id: "A1", team: "away", position: { x: 94, y: 34 }, roleKey: "goalkeeper" },
    ],
  };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    computePassLaneClarity: () => 0.82,
    computeTimeToCoverDistance: (_player, gap) => gap / 7,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotRoleStrength: (player, strength) => {
      if (strength === "finisher" && player.roleKey === "striker") {
        return 0.9;
      }
      if (strength === "runner" && ["striker", "wideForward"].includes(player.roleKey)) {
        return 0.84;
      }
      if (strength === "receiver") {
        return 0.78;
      }
      return 0.65;
    },
    getFootUsageScore: () => 0.8,
    getGoalMouthTarget: (teamId, y) => ({ x: teamId === "home" ? pitch.length : 0, y }),
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerPressureLoad: () => 0.2,
    getShotWindowProfile: () => ({
      laneClarity: 0.8,
      goalkeeperOpenness: 0.7,
      angleQuality: 0.72,
      blockRisk: 0.18,
    }),
    getState: () => state,
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : 1),
    isGoalkeeper: (player) => player.roleKey === "goalkeeper",
    isWideChannel: (point) => point.y <= 20 || point.y >= 48,
    pitch,
    resolveShotTarget: (goal) => goal,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    win: {
      laneClarity: 0.8,
      goalkeeperOpenness: 0.7,
      angleQuality: 0.72,
      blockRisk: 0.18,
    },
    ...overrides,
  };
}

test("game simulator autopilot candidate target helpers expose moved target contracts", () => {
  const helpers = createGameSimulatorAutopilotCandidateTargetHelpers(createCandidateTargetDeps());

  expect(typeof helpers.getAutoPilotShotTarget).toBe("function");
  expect(typeof helpers.getAutoPilotBoxTarget).toBe("function");
  expect(typeof helpers.getCornerDeliveryTarget).toBe("function");
  expect(typeof helpers.chooseCornerDeliveryRunner).toBe("function");
  expect(typeof helpers.getFreeKickDeliveryTarget).toBe("function");
  expect(typeof helpers.chooseFreeKickShortReceiver).toBe("function");
});

test("game simulator autopilot candidate target helpers calculate shot and box targets", () => {
  const helpers = createGameSimulatorAutopilotCandidateTargetHelpers(createCandidateTargetDeps());
  const shooter = { id: "H9", team: "home", position: { x: 86, y: 34 }, roleKey: "striker" };

  const shotTarget = helpers.getAutoPilotShotTarget("home", shooter);
  const cutbackTarget = helpers.getAutoPilotBoxTarget("home", { position: { x: 82, y: 18 } }, "cutback");
  const farPostTarget = helpers.getAutoPilotBoxTarget("home", { position: { x: 82, y: 18 } }, "far-post");

  expect(shotTarget.x).toBe(105);
  expect(shotTarget.y).not.toBe(34);
  expect(cutbackTarget).toMatchObject({ x: 90.5, y: 31.5 });
  expect(farPostTarget.x).toBeGreaterThan(94);
  expect(farPostTarget.y).toBeGreaterThan(34);
});

test("game simulator autopilot candidate target helpers calculate restart delivery targets", () => {
  const helpers = createGameSimulatorAutopilotCandidateTargetHelpers(createCandidateTargetDeps());

  const cornerTarget = helpers.getCornerDeliveryTarget("home", 4, "nearPost");
  const freeKickTarget = helpers.getFreeKickDeliveryTarget("home", { x: 78, y: 18 }, "farPost");

  expect(cornerTarget.x).toBeGreaterThan(94);
  expect(cornerTarget.y).toBeLessThan(34);
  expect(freeKickTarget.x).toBeGreaterThan(94);
  expect(freeKickTarget.y).toBeGreaterThan(34);
});

test("game simulator autopilot candidate target helpers choose restart receivers", () => {
  const deps = createCandidateTargetDeps();
  const helpers = createGameSimulatorAutopilotCandidateTargetHelpers(deps);
  const carrier = deps.getState().players.find((player) => player.id === "H10");

  const cornerTarget = helpers.getCornerDeliveryTarget("home", 4, "nearPost");
  const cornerRunner = helpers.chooseCornerDeliveryRunner("home", cornerTarget, "H10", "nearPost");
  const shortReceiver = helpers.chooseFreeKickShortReceiver("home", carrier, carrier.position, { shortSupport: 0.75 });

  expect(cornerRunner.player.team).toBe("home");
  expect(cornerRunner.player.id).not.toBe("H10");
  expect(cornerRunner.score).toBeGreaterThan(0);
  expect(shortReceiver.receiver.team).toBe("home");
  expect(shortReceiver.receiver.id).not.toBe("H10");
  expect(shortReceiver.passDistance).toBeGreaterThanOrEqual(4.5);
  expect(shortReceiver.passDistance).toBeLessThanOrEqual(18);
});
