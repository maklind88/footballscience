import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorOffensiveAutopilotTargetBuilder } from "../src/modules/game-simulator/autopilot-offensive-target-builder.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createFallbackDependencyMap(overrides = {}) {
  const emptyLabels = () => [];
  const emptyTargetResult = () => ({ labels: [], protectedIds: new Set() });
  return {
    applyAttackingBoxOccupationChainTargets: emptyTargetResult,
    applyAutopilotTargetVariation: () => undefined,
    applyBallNearSupportTriangleTargets: emptyLabels,
    applyBlindsideChannelRunTargets: emptyTargetResult,
    applyGenerativePrincipleSupportTargets: emptyTargetResult,
    applyLocalSuperioritySupportTargets: emptyTargetResult,
    applyLooseBallRecoverySupportTargets: emptyTargetResult,
    applyOffensivePassingGeometryTargets: emptyTargetResult,
    applyOffensiveRestDefenceNetTargets: emptyTargetResult,
    applyOffensiveSecondBallAnticipationTargets: emptyTargetResult,
    applyPasserContinuationTargets: emptyTargetResult,
    applyPostRecoveryAttackSupportTargets: emptyTargetResult,
    applyPressEscapeContinuationTargets: emptyTargetResult,
    applyPressResistanceEscapeSupportTargets: emptyTargetResult,
    applySpaceTwoContinuationTargets: emptyTargetResult,
    applySpaceTwoForwardFacingTargets: emptyTargetResult,
    applySwitchLandingAttackTargets: emptyTargetResult,
    applyThirdManChainSupportTargets: emptyTargetResult,
    applyTimedFinalThirdBoxArrivals: emptyTargetResult,
    chooseOffensiveAutopilotRunner: () => null,
    enforceOffensiveFiveLaneOccupation: emptyLabels,
    enforceOffensiveOccupationZones: () => undefined,
    enforceOffensiveOnsideLineAwareness: emptyLabels,
    enforceOffensiveStructureBalance: emptyLabels,
    enforceOffensiveTargetSpacing: () => undefined,
    getFormationPositions: () => [{ x: 15, y: 18 }, { x: 25, y: 42 }],
    getOffensiveActionPrinciple: () => null,
    getOffensiveAutopilotProfile: () => ({
      phaseKey: "buildUp",
      phaseLabel: "Build Up",
      styleLabel: "Balanced",
    }),
    getOffensiveAutopilotTarget: (player, ballPoint, _actionMeta, _profile, baseY, isRunner = false) => ({
      x: ballPoint.x + (isRunner ? 18 : 8),
      y: baseY,
      intent: isRunner ? "run-behind" : "support",
      playerId: player.id,
    }),
    getOffensivePhaseKey: () => "buildUp",
    pitch: { length: 105, width: 68 },
    shouldSkipOffensiveAutopilotPlayer: () => false,
    teamRosterOrder: { home: ["H1", "H2"], away: ["A1"] },
    teams: {
      home: { formation: "4-3-3", name: "Home" },
      away: { formation: "4-3-3", name: "Away" },
    },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offensive target builder creates team targets through dependency boundary", () => {
  const targetCalls = [];
  const state = {
    ball: {
      actionType: "pass",
      carrierPlayerId: "H1",
      receiverPlayerId: "H2",
      initiatorPlayerId: "H1",
      ownerPlayerId: "H1",
    },
    players: [
      { id: "H1", team: "home", position: { x: 20, y: 18 } },
      { id: "H2", team: "home", position: { x: 34, y: 42 } },
      { id: "A1", team: "away", position: { x: 55, y: 35 } },
    ],
  };
  const builder = createGameSimulatorOffensiveAutopilotTargetBuilder(createFallbackDependencyMap({
    getState: () => state,
    getOffensiveAutopilotTarget: (...args) => {
      targetCalls.push(args);
      const [player, ballPoint, _actionMeta, _profile, baseY, isRunner = false] = args;
      return {
        x: ballPoint.x + (isRunner ? 18 : 8),
        y: baseY,
        intent: isRunner ? "run-behind" : "support",
        playerId: player.id,
      };
    },
  }));

  const result = builder.buildOffensiveAutopilotTargets("home", { x: 30, y: 34 });

  expect(result.targets).toBeInstanceOf(Map);
  expect([...result.targets.keys()]).toEqual(["H1", "H2"]);
  expect(result.targets.get("H1")).toMatchObject({ playerId: "H1", y: 18, intent: "support" });
  expect(result.targets.get("H2")).toMatchObject({ playerId: "H2", y: 42, intent: "support" });
  expect(targetCalls).toHaveLength(2);
  expect(result.profile).toMatchObject({ phaseKey: "buildUp", styleLabel: "Balanced" });
});

test("game simulator autopilot offensive target builder preserves principle label chain", () => {
  const state = {
    ball: {
      actionType: "pass",
      carrierPlayerId: "H1",
      receiverPlayerId: "H2",
      initiatorPlayerId: "H1",
      ownerPlayerId: "H1",
    },
    players: [
      { id: "H1", team: "home", position: { x: 20, y: 18 } },
      { id: "H2", team: "home", position: { x: 34, y: 42 } },
    ],
  };
  const builder = createGameSimulatorOffensiveAutopilotTargetBuilder(createFallbackDependencyMap({
    applyBallNearSupportTriangleTargets: () => ["ball-near triangle"],
    applyGenerativePrincipleSupportTargets: () => ({
      labels: ["support angle"],
      protectedIds: new Set(["H2"]),
    }),
    enforceOffensiveFiveLaneOccupation: () => ["five-lane occupation"],
    enforceOffensiveStructureBalance: () => ["structure balance"],
    getState: () => state,
  }));

  const result = builder.buildOffensiveAutopilotTargets("home", { x: 30, y: 34 });

  expect(result.principle).toMatchObject({ key: "generative-principle-chain" });
  expect(result.principle.label).toContain("support angle");
  expect(result.principle.label).toContain("structure balance");
  expect(result.principle.label).toContain("five-lane occupation");
  expect(result.principle.label).toContain("ball-near triangle");
});

test("game simulator autopilot offensive target builder is wired out of target composer", () => {
  const targets = readProjectFile("src/modules/game-simulator/autopilot-targets.mjs");
  const offensiveBuilder = readProjectFile("src/modules/game-simulator/autopilot-offensive-target-builder.mjs");

  expect(targets).toContain('from "./autopilot-offensive-target-builder.mjs"');
  expect(targets).toContain("createGameSimulatorOffensiveAutopilotTargetBuilder(deps)");
  expect(targets).not.toContain("function buildOffensiveAutopilotTargets(");
  expect(offensiveBuilder).toContain("createGameSimulatorOffensiveAutopilotTargetBuilder");
  expect(offensiveBuilder).toContain("function buildOffensiveAutopilotTargets(");
});
