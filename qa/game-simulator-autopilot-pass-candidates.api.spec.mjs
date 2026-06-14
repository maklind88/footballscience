import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotPassCandidates } from "../src/modules/game-simulator/autopilot-pass-candidates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createPassDeps(overrides = {}) {
  const carrier = { id: "H6", team: "home", position: { x: 55, y: 34 }, role: "Central Midfielder", shortLabel: "CM" };
  const receiver = { id: "H8", team: "home", position: { x: 65, y: 34 }, role: "Attacking Midfielder", shortLabel: "AM" };
  const state = overrides.state || {
    players: [
      carrier,
      receiver,
      { id: "A1", team: "away", position: { x: 92, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
    ],
  };
  return {
    carrier,
    receiver,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.9,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.8,
      spacePriority: { score: 0.6 },
      value: 0.8,
    }),
    getActionThreatGain: () => 0.5,
    getAttackDirectionSign: () => 1,
    getAttackingDepth: (point) => point.x,
    getAutoPilotRoleStrength: () => 0.8,
    getForwardFacingSpaceTwoContext: () => ({ active: true }),
    getOffensiveRoleKey: (player) => (player.id === "H8" ? "connector" : "connector"),
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: () => ({
      assistZone: 0.1,
      betweenLines: 0.5,
      centralPocket: 0.55,
      cutbackZone: 0.1,
      halfSpace: 0.4,
      value: 0.75,
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.6,
    getPossessionRhythmContext: () => ({ backPasses: 0, duration: 5, forwardPasses: 1, sidewaysPasses: 0, steps: 2 }),
    getState: () => state,
    getTeamSupportCountAroundPoint: () => 2,
    getWideEntryPrincipleContext: () => null,
    isPassReceiverOffside: () => false,
    isWideChannel: () => false,
    pitch: { length: 105, width: 68 },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot pass candidates expose pass candidate builder", () => {
  const deps = createPassDeps();
  const candidates = createGameSimulatorAutopilotPassCandidates(deps);

  expect(typeof candidates.buildAutoPilotPassCandidates).toBe("function");

  const passCandidates = candidates.buildAutoPilotPassCandidates(deps.carrier, deps.carrier.position, {
    crossBias: 0.4,
    directness: 0.55,
    firstTouchForwardBias: 0.7,
    lineBreakBias: 0.7,
    overlapBias: 0.4,
    passBias: 0.7,
    phaseKey: "middleThird",
    progressionUrgency: 0.7,
    recycleWindow: 0.5,
    routeOneBias: 0.2,
    runnerPreferences: { connector: 0.5 },
    shortSupport: 0.7,
    sidewaysTolerance: 1,
    styleLabel: "Balanced",
    switchBias: 0.4,
    targetPossessionSeconds: 8,
    tempo: 0.7,
  });

  expect(passCandidates[0]).toMatchObject({
    actionType: "pass",
    isLineBreak: true,
    label: "line-breaking pass",
    receiverPlayerId: "H8",
  });
});

test("game simulator autopilot candidates delegates pass candidates to a focused module", () => {
  const autopilotCandidates = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const passCandidates = readProjectFile("src/modules/game-simulator/autopilot-pass-candidates.mjs");

  expect(autopilotCandidates).toContain('from "./autopilot-pass-candidates.mjs"');
  expect(autopilotCandidates).toContain("createGameSimulatorAutopilotPassCandidates({");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotPassCandidates(");
  expect(passCandidates).toContain("function buildAutoPilotPassCandidates(");
});
