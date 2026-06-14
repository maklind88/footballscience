import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotDribbleCandidates } from "../src/modules/game-simulator/autopilot-dribble-candidates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createDribbleDeps(overrides = {}) {
  const carrier = { id: "H7", team: "home", position: { x: 55, y: 34 }, role: "Wide Forward", shortLabel: "W" };
  return {
    carrier,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({ spacePriority: { score: 0.7 }, value: 0.8 }),
    getActionThreatGain: () => 0.6,
    getAttackDirectionSign: () => 1,
    getAutoPilotFlowContext: () => ({ carrierJustReceived: true, consecutivePasses: 2 }),
    getAutoPilotRoleStrength: () => 0.8,
    getBreakawayCarryTarget: () => null,
    getCarryLaneOpenSpaceScore: () => 0.8,
    getCarryRunwayProfile: () => ({ forwardGain: 10, openSpaceScore: 0.7, runwayScore: 0.8, shouldExtend: true }),
    getAttackingDepth: (point) => point.x,
    getForwardFacingSpaceTwoContext: () => ({ active: true }),
    getForwardProgressionWindow: () => ({ active: true, openLane: 0.8, urgency: 0.7 }),
    getNearestOpponentGapInCarryLane: () => 14,
    getOffensiveAutopilotProfile: () => ({ carryBias: 0.8, dribbleBias: 0.8 }),
    getOffensiveRoleKey: () => "wideForward",
    getOpenGrassCarryContext: () => null,
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getPitchThreatProfile: () => ({ betweenLines: 0.4, centralPocket: 0.4, halfSpace: 0.5, value: 0.7 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerPressureLoad: () => 0.15,
    getPlayerTendency: () => 0.7,
    getRunwayCarryTarget: () => null,
    isWideChannel: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot dribble candidates expose dribble candidate builder", () => {
  const deps = createDribbleDeps();
  const candidates = createGameSimulatorAutopilotDribbleCandidates(deps);

  expect(typeof candidates.getAutoPilotDribbleTarget).toBe("function");
  expect(typeof candidates.buildAutoPilotDribbleCandidate).toBe("function");

  const dribble = candidates.buildAutoPilotDribbleCandidate(deps.carrier, deps.carrier.position, {
    carryBias: 0.8,
    dribbleBias: 0.8,
    phaseKey: "middleThird",
  });

  expect(dribble).toMatchObject({
    actionType: "dribble",
    isOpenGrassCarry: true,
    isRunwayCarry: true,
  });
});

test("game simulator autopilot candidates delegates dribble candidates to a focused module", () => {
  const autopilotCandidates = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const dribbleCandidates = readProjectFile("src/modules/game-simulator/autopilot-dribble-candidates.mjs");

  expect(autopilotCandidates).toContain('from "./autopilot-dribble-candidates.mjs"');
  expect(autopilotCandidates).toContain("createGameSimulatorAutopilotDribbleCandidates({");
  expect(autopilotCandidates).not.toContain("function getAutoPilotDribbleTarget(");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotDribbleCandidate(");
  expect(dribbleCandidates).toContain("function getAutoPilotDribbleTarget(");
  expect(dribbleCandidates).toContain("function buildAutoPilotDribbleCandidate(");
});
