import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotLineBreakCandidates } from "../src/modules/game-simulator/autopilot-line-break-candidates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createLineBreakDeps(overrides = {}) {
  const carrier = { id: "H6", team: "home", position: { x: 55, y: 34 }, role: "Central Midfielder", shortLabel: "CM" };
  const runner = { id: "H9", team: "home", position: { x: 72, y: 34 }, role: "Striker", shortLabel: "ST" };
  const state = overrides.state || {
    players: [
      carrier,
      runner,
      { id: "A1", team: "away", position: { x: 92, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
    ],
  };
  return {
    carrier,
    runner,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    computePassLaneClarity: () => 0.9,
    computeTimeToCoverDistance: () => 0.6,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.8,
      lineBreakCount: 1,
      targetPressure: 0.2,
      targetThreat: {
        betweenLines: 0.5,
        box: 0.1,
        centralPocket: 0.5,
        halfSpace: 0.45,
        primaryLabel: "central pocket",
      },
    }),
    getAttackDirectionSign: () => 1,
    getAttackingDepth: (point) => point.x,
    getAutoPilotRoleStrength: () => 0.8,
    getDepthX: (teamId, depth) => depth,
    getForwardProgressionWindow: () => ({ active: true, urgency: 0.7 }),
    getHighValueAttackTarget: () => ({ x: 82, y: 34 }),
    getOffensiveRoleKey: (player) => (player.id === "H9" ? "striker" : "connector"),
    getPitchThreatProfile: () => ({
      behindLine: 0.6,
      centralPocket: 0.5,
      primaryLabel: "space behind",
      value: 0.8,
    }),
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.15,
    getPlayerTendency: () => 0.6,
    getState: () => state,
    getTeamSupportCountAroundPoint: () => 2,
    getWideSideSign: () => 1,
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    isPassReceiverOffside: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    resolveBallActionProfile: () => ({ averageSpeed: 24 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot line break candidates expose through-ball and between-lines builders", () => {
  const deps = createLineBreakDeps();
  const candidates = createGameSimulatorAutopilotLineBreakCandidates(deps);

  expect(typeof candidates.buildAutoPilotThroughBallCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotBetweenLinesCandidate).toBe("function");

  const throughBall = candidates.buildAutoPilotThroughBallCandidate(deps.carrier, deps.carrier.position, {
    directness: 0.85,
    lineBreakBias: 0.8,
    phaseKey: "middleThird",
    routeOneBias: 0.4,
    styleLabel: "Vertical",
  });

  expect(throughBall).toMatchObject({
    actionType: "pass",
    isLineBreak: true,
    label: "through ball",
    principleKey: "pass-into-space",
  });
});

test("game simulator autopilot candidates delegates line break candidates to a focused module", () => {
  const autopilotCandidates = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const lineBreakCandidates = readProjectFile("src/modules/game-simulator/autopilot-line-break-candidates.mjs");

  expect(autopilotCandidates).toContain('from "./autopilot-line-break-candidates.mjs"');
  expect(autopilotCandidates).toContain("createGameSimulatorAutopilotLineBreakCandidates({");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotThroughBallCandidate(");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotBetweenLinesCandidate(");
  expect(lineBreakCandidates).toContain("function buildAutoPilotThroughBallCandidate(");
  expect(lineBreakCandidates).toContain("function buildAutoPilotBetweenLinesCandidate(");
});
