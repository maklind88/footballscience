import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotSwitchLandingCandidates } from "../src/modules/game-simulator/autopilot-switch-landing-candidates.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createSwitchLandingDeps(overrides = {}) {
  const carrier = { id: "H7", team: "home", position: { x: 70, y: 8 }, role: "Wide Forward", shortLabel: "W" };
  const receiver = { id: "H8", team: "home", position: { x: 75, y: 26 }, role: "Attacking Midfielder", shortLabel: "AM" };
  const state = overrides.state || {
    restartPhase: null,
    players: [
      carrier,
      receiver,
      { id: "A1", team: "away", position: { x: 92, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
    ],
  };
  return {
    carrier,
    receiver,
    buildAutoPilotBoxDeliveryCandidate: () => null,
    chooseWideOverlapRunner: () => null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.9,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.8,
      lineBreakCount: 1,
      targetThreat: { assistZone: 0.3, box: 0.2 },
    }),
    getAttackDirectionSign: () => 1,
    getAttackingDepth: (point) => point.x,
    getAutoPilotRoleStrength: () => 0.8,
    getOffensiveRoleKey: (player) => (player.id === "H7" ? "wideForward" : "connector"),
    getPitchLaneIndex: (point) => (point.y <= 22 ? 0 : point.y >= 46 ? 2 : 1),
    getPitchThreatProfile: () => ({ assistZone: 0.3, box: 0.2, cutbackZone: 0.2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.15,
    getPlayerTendency: () => 0.6,
    getRecentPossessionSteps: () => [
      {
        actionType: "pass",
        autoPrinciples: ["Switch landing"],
        beforeSnapshot: { ball: { position: { x: 48, y: 56 } } },
        receiverPlayerId: "H7",
        target: carrier.position,
      },
    ],
    getRecordedStepDuration: () => 2,
    getState: () => state,
    getSwitchLandingAttackTarget: () => ({ x: 78, y: 24 }),
    getTeamSupportCountAroundPoint: () => 2,
    getWideSideSign: () => -1,
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    isPassReceiverOffside: () => false,
    isWidePrincipleZone: (point) => point.y <= 18 || point.y >= 50,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot switch landing candidates expose switch continuation builders", () => {
  const deps = createSwitchLandingDeps();
  const candidates = createGameSimulatorAutopilotSwitchLandingCandidates(deps);

  expect(typeof candidates.getLastSwitchLandingActionContext).toBe("function");
  expect(typeof candidates.buildAutoPilotSwitchLandingContinuationCandidate).toBe("function");

  const context = candidates.getLastSwitchLandingActionContext(deps.carrier, deps.carrier.position, {
    switchBias: 0.7,
  });
  expect(context).toMatchObject({
    finalThirdCue: true,
    startsWide: true,
  });

  const candidate = candidates.buildAutoPilotSwitchLandingContinuationCandidate(deps.carrier, deps.carrier.position, {
    carryBias: 0.5,
    deliveryBias: 0.6,
    dribbleBias: 0.5,
    overlapBias: 0.4,
    shortSupport: 0.8,
    switchBias: 0.7,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    label: "cutback edge",
    principleKey: "switch-cutback-edge",
    receiverPlayerId: "H8",
  });
});

test("game simulator autopilot candidates delegates switch landing candidates to a focused module", () => {
  const autopilotCandidates = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const switchLandingCandidates = readProjectFile("src/modules/game-simulator/autopilot-switch-landing-candidates.mjs");

  expect(autopilotCandidates).toContain('from "./autopilot-switch-landing-candidates.mjs"');
  expect(autopilotCandidates).toContain("createGameSimulatorAutopilotSwitchLandingCandidates({");
  expect(autopilotCandidates).not.toContain("function getLastSwitchLandingActionContext(");
  expect(autopilotCandidates).not.toContain("function buildAutoPilotSwitchLandingContinuationCandidate(");
  expect(switchLandingCandidates).toContain("function getLastSwitchLandingActionContext(");
  expect(switchLandingCandidates).toContain("function buildAutoPilotSwitchLandingContinuationCandidate(");
});
