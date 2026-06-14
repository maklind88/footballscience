import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotFinalThirdCandidates } from "../src/modules/game-simulator/autopilot-final-third-candidates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createFinalThirdDeps(overrides = {}) {
  const carrier = { id: "H7", team: "home", position: { x: 70, y: 8 }, role: "Wide Forward", shortLabel: "W" };
  const runner = { id: "H9", team: "home", position: { x: 84, y: 34 }, role: "Striker", shortLabel: "ST" };
  const state = overrides.state || {
    players: [carrier, runner, { id: "A1", team: "away", position: { x: 92, y: 34 }, role: "Goalkeeper", shortLabel: "GK" }],
  };
  return {
    carrier,
    runner,
    chooseWideOverlapRunner: () => null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    computePassLaneClarity: () => 0.9,
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({ value: 0.8, lineBreakCount: 1, targetPressure: 0.2, targetThreat: { box: 0.5, centrality: 0.5, primaryLabel: "box" } }),
    getAttackDirectionSign: () => 1,
    getAttackingDepth: (point) => point.x,
    getAutoPilotBoxTarget: () => ({ x: 92, y: 34 }),
    getAutoPilotRoleStrength: () => 0.8,
    getHighValueAttackTarget: () => ({ x: 88, y: 30 }),
    getOffensiveRoleKey: (player) => (player.id === "H9" ? "striker" : "wideForward"),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.6,
    getState: () => state,
    getTeamSupportCountAroundPoint: () => 2,
    getWideSideSign: () => -1,
    isBylineZone: () => false,
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    isPassReceiverOffside: () => false,
    isWideChannel: (point) => point.y <= 14 || point.y >= 54,
    isWidePrincipleZone: (point) => point.y <= 18 || point.y >= 50,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    resolveBallActionProfile: () => ({ averageSpeed: 10 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot final third candidates expose final-third builders", () => {
  const deps = createFinalThirdDeps();
  const candidates = createGameSimulatorAutopilotFinalThirdCandidates(deps);

  expect(typeof candidates.buildAutoPilotBoxDeliveryCandidate).toBe("function");
  expect(typeof candidates.getFinalThirdCombinationVariants).toBe("function");
  expect(typeof candidates.buildAutoPilotFinalThirdCombinationCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotWideOverlapCandidate).toBe("function");

  const boxDelivery = candidates.buildAutoPilotBoxDeliveryCandidate(deps.carrier, deps.carrier.position, {
    crossBias: 0.8,
    deliveryBias: 0.7,
    phaseKey: "finalThird",
    styleLabel: "Wide Overload",
  });

  expect(boxDelivery).toMatchObject({
    actionType: "pass",
    label: "cross",
  });
});

test("game simulator autopilot candidates delegates final-third candidates to a focused module", () => {
  const autopilotCandidates = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const finalThirdCandidates = readProjectFile("src/modules/game-simulator/autopilot-final-third-candidates.mjs");

  expect(autopilotCandidates).toContain('from "./autopilot-final-third-candidates.mjs"');
  expect(autopilotCandidates).toContain("createGameSimulatorAutopilotFinalThirdCandidates({");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotBoxDeliveryCandidate(");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotFinalThirdCombinationCandidate(");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotWideOverlapCandidate(");
  expect(finalThirdCandidates).toContain("function buildAutoPilotBoxDeliveryCandidate(");
  expect(finalThirdCandidates).toContain("function buildAutoPilotFinalThirdCombinationCandidate(");
  expect(finalThirdCandidates).toContain("function buildAutoPilotWideOverlapCandidate(");
});
