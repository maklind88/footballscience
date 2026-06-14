import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorDefensiveAutopilotTargetBuilder } from "../src/modules/game-simulator/autopilot-defensive-target-builder.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createTargetResult(overrides = {}) {
  return {
    active: false,
    labels: [],
    protectedIds: new Set(),
    presser: null,
    focusPoint: null,
    ...overrides,
  };
}

function createFallbackDependencyMap(overrides = {}) {
  const emptyLabels = () => [];
  const emptyTargetResult = () => createTargetResult();
  return {
    applyAutopilotTargetVariation: () => undefined,
    applyDefensiveBackLineHandoverTargets: emptyLabels,
    applyDefensiveBoxDeliveryChainTargets: emptyTargetResult,
    applyDefensiveCarryContainmentTargets: emptyTargetResult,
    applyDefensiveCentralAccessGateTargets: emptyTargetResult,
    applyDefensiveChanceDenialTargets: emptyTargetResult,
    applyDefensiveCornerSetPieceTargets: emptyTargetResult,
    applyDefensiveEmergencyCoverTargets: emptyTargetResult,
    applyDefensiveFreeKickSetPieceTargets: emptyTargetResult,
    applyDefensiveGameSpaceResponseTargets: emptyTargetResult,
    applyDefensiveGoalkeeperShotSetTarget: emptyLabels,
    applyDefensiveGoalkeeperSweeperTarget: emptyLabels,
    applyDefensiveLineBreakAdvantageCollapseTargets: emptyTargetResult,
    applyDefensiveLocalOverloadResponseTargets: emptyTargetResult,
    applyDefensiveLooseBallRecoveryTrapTargets: emptyTargetResult,
    applyDefensiveOpenPlayTriggerTargets: emptyTargetResult,
    applyDefensivePassLaneDenialTargets: emptyTargetResult,
    applyDefensivePenaltySetPieceTargets: emptyTargetResult,
    applyDefensivePostRecoveryResponseTargets: emptyTargetResult,
    applyDefensivePressChainSupportTargets: emptyTargetResult,
    applyDefensivePresserAngleTarget: emptyTargetResult,
    applyDefensivePressureCoverBalanceTargets: emptyTargetResult,
    applyDefensivePrioritySpaceProtectionTargets: emptyLabels,
    applyDefensiveReceiveContinuationTargets: emptyTargetResult,
    applyDefensiveReceptionTrapTargets: emptyTargetResult,
    applyDefensiveRouteAnticipationTargets: emptyTargetResult,
    applyDefensiveRunnerTrackingTargets: emptyTargetResult,
    applyDefensiveSecondBallAnticipationTargets: emptyTargetResult,
    applyDefensiveSwitchLandingLockTargets: emptyTargetResult,
    applyDefensiveSwitchRecoveryTargets: emptyTargetResult,
    applyDefensiveThrowInSetPieceTargets: emptyTargetResult,
    applyGoalkeeperBuildOutPressTargets: emptyTargetResult,
    applyNegativeTransitionDefensiveTargets: emptyTargetResult,
    chooseDefensiveAutopilotPresser: () => null,
    chooseDefensiveDribblePresser: () => null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    enforceDefensiveBlockGeometryLock: emptyLabels,
    enforceDefensiveCollectiveShiftCohesion: emptyLabels,
    enforceDefensiveCompactLineIntegrity: emptyLabels,
    enforceDefensiveLineChainSpacing: emptyLabels,
    enforceDefensiveLineStaggering: emptyLabels,
    enforceDefensiveMeasuredBlockEnvelope: emptyLabels,
    enforceDefensiveOffsideLineControl: emptyLabels,
    enforceDefensiveUnitCompactness: emptyLabels,
    enforceDefensiveVerticalBlockConnections: emptyLabels,
    getDefensiveAutopilotLineKey: (player) => player.lineKey,
    getDefensiveAutopilotProfile: () => ({
      phaseKey: "midBlock",
      phaseLabel: "Mid Block",
      styleLabel: "Balanced Block",
    }),
    getDefensiveDribblePressTarget: (player, reference) => ({
      x: reference.x,
      y: reference.y,
      intent: "dribble-press",
      playerId: player.id,
    }),
    getDefensiveGoalkeeperTarget: () => ({ x: 8, y: 34, intent: "goalkeeper-set" }),
    getDefensiveLineActionLabels: () => ["line action"],
    getDefensiveLineCenterY: (_lineKey, _profile, ballPoint) => ballPoint.y,
    getDefensiveLineWidth: () => 24,
    getDefensiveLineX: (_teamId, lineKey) => ({ back: 24, midfield: 38, forward: 52 }[lineKey] ?? 20),
    getDefensivePhaseKey: () => "midBlock",
    getDefensivePressTarget: (_teamId, ballPoint, _profile, player) => ({
      x: ballPoint.x - 3,
      y: ballPoint.y,
      intent: "press",
      playerId: player.id,
    }),
    getDribblePressureReference: () => null,
    getFormationPositions: () => [
      { x: 8, y: 34 },
      { x: 24, y: 18 },
      { x: 38, y: 34 },
      { x: 52, y: 50 },
    ],
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    teamRosterOrder: { away: ["A1", "A2", "A3", "A4"] },
    teams: { away: { formation: "4-3-3", name: "Away" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot defensive target builder creates line targets through dependency boundary", () => {
  const state = {
    players: [
      { id: "A1", team: "away", lineKey: "gk", position: { x: 8, y: 34 } },
      { id: "A2", team: "away", lineKey: "back", position: { x: 24, y: 18 } },
      { id: "A3", team: "away", lineKey: "midfield", position: { x: 38, y: 34 } },
      { id: "A4", team: "away", lineKey: "forward", position: { x: 52, y: 50 } },
      { id: "H1", team: "home", lineKey: "forward", position: { x: 62, y: 34 } },
    ],
  };
  const presser = state.players.find((player) => player.id === "A4");
  const builder = createGameSimulatorDefensiveAutopilotTargetBuilder(createFallbackDependencyMap({
    chooseDefensiveAutopilotPresser: () => presser,
    getState: () => state,
  }));

  const result = builder.buildDefensiveAutopilotTargets("away", { x: 60, y: 34 });

  expect(result.targets).toBeInstanceOf(Map);
  expect([...result.targets.keys()]).toEqual(["A1", "A2", "A3", "A4"]);
  expect(result.targets.get("A1")).toMatchObject({ intent: "goalkeeper-set" });
  expect(result.targets.get("A2")).toMatchObject({ x: 24 });
  expect(result.targets.get("A3")).toMatchObject({ x: 38 });
  expect(result.targets.get("A4")).toMatchObject({ intent: "press", playerId: "A4" });
  expect(result.presser).toBe(presser);
  expect(result.profile).toMatchObject({ phaseKey: "midBlock", styleLabel: "Balanced Block" });
});

test("game simulator autopilot defensive target builder preserves protection label chain", () => {
  const state = {
    players: [
      { id: "A1", team: "away", lineKey: "gk", position: { x: 8, y: 34 } },
      { id: "A2", team: "away", lineKey: "back", position: { x: 24, y: 18 } },
      { id: "A3", team: "away", lineKey: "midfield", position: { x: 38, y: 34 } },
      { id: "A4", team: "away", lineKey: "forward", position: { x: 52, y: 50 } },
    ],
  };
  const builder = createGameSimulatorDefensiveAutopilotTargetBuilder(createFallbackDependencyMap({
    applyDefensiveOpenPlayTriggerTargets: () => createTargetResult({
      labels: ["open-play trigger"],
      protectedIds: new Set(["A3"]),
      focusPoint: { x: 58, y: 34 },
    }),
    applyDefensivePressureCoverBalanceTargets: () => createTargetResult({
      labels: ["pressure cover"],
    }),
    applyDefensivePrioritySpaceProtectionTargets: () => ["priority space"],
    applyDefensiveGoalkeeperSweeperTarget: () => ["keeper sweeper"],
    enforceDefensiveUnitCompactness: () => ["unit compactness"],
    getState: () => state,
  }));

  const result = builder.buildDefensiveAutopilotTargets("away", { x: 60, y: 34 });

  expect(result.protectionLabels).toEqual(expect.arrayContaining([
    "line action",
    "open-play trigger",
    "priority space",
    "pressure cover",
    "unit compactness",
    "keeper sweeper",
  ]));
  expect(result.focusPoint).toEqual({ x: 58, y: 34 });
});

test("game simulator autopilot defensive target builder is wired out of target composer", () => {
  const targets = readProjectFile("src/modules/game-simulator/autopilot-targets.mjs");
  const defensiveBuilder = readProjectFile("src/modules/game-simulator/autopilot-defensive-target-builder.mjs");

  expect(targets).toContain('from "./autopilot-defensive-target-builder.mjs"');
  expect(targets).toContain("createGameSimulatorDefensiveAutopilotTargetBuilder(deps)");
  expect(targets).not.toContain("function buildDefensiveAutopilotTargets(");
  expect(defensiveBuilder).toContain("createGameSimulatorDefensiveAutopilotTargetBuilder");
  expect(defensiveBuilder).toContain("function buildDefensiveAutopilotTargets(");
});
