import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorDefensiveOpenPlayTargetBuilder } from "../src/modules/game-simulator/autopilot-defensive-open-play-target-builder.mjs";
import { createGameSimulatorDefensiveRestartTransitionTargets } from "../src/modules/game-simulator/autopilot-defensive-restart-transition-targets.mjs";
import { createGameSimulatorDefensiveShapeTargetBuilder } from "../src/modules/game-simulator/autopilot-defensive-shape-target-builder.mjs";

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

function createShapeDeps(overrides = {}) {
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    getDefensiveAutopilotLineKey: (player) => player.lineKey,
    getDefensiveAutopilotProfile: () => ({ phaseKey: "midBlock", phaseLabel: "Mid Block" }),
    getDefensiveGoalkeeperTarget: () => ({ x: 8, y: 34, intent: "goalkeeper-set" }),
    getDefensiveLineCenterY: (_lineKey, _profile, ballPoint) => ballPoint.y,
    getDefensiveLineWidth: () => 24,
    getDefensiveLineX: (_teamId, lineKey) => ({ back: 24, midfield: 38, forward: 52 }[lineKey] ?? 20),
    getDefensivePhaseKey: () => "midBlock",
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
    ...overrides,
  };
}

function createOpenPlayDeps(overrides = {}) {
  const emptyLabels = () => [];
  const emptyTargetResult = () => createTargetResult();
  return {
    applyAutopilotTargetVariation: () => undefined,
    applyDefensiveBackLineHandoverTargets: emptyLabels,
    applyDefensiveBoxDeliveryChainTargets: emptyTargetResult,
    applyDefensiveCarryContainmentTargets: emptyTargetResult,
    applyDefensiveCentralAccessGateTargets: emptyTargetResult,
    applyDefensiveChanceDenialTargets: emptyTargetResult,
    applyDefensiveEmergencyCoverTargets: emptyTargetResult,
    applyDefensiveGameSpaceResponseTargets: emptyTargetResult,
    applyDefensiveGoalkeeperShotSetTarget: emptyLabels,
    applyDefensiveGoalkeeperSweeperTarget: emptyLabels,
    applyDefensiveLineBreakAdvantageCollapseTargets: emptyTargetResult,
    applyDefensiveLocalOverloadResponseTargets: emptyTargetResult,
    applyDefensiveLooseBallRecoveryTrapTargets: emptyTargetResult,
    applyDefensiveOpenPlayTriggerTargets: emptyTargetResult,
    applyDefensivePassLaneDenialTargets: emptyTargetResult,
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
    applyGoalkeeperBuildOutPressTargets: emptyTargetResult,
    chooseDefensiveAutopilotPresser: () => null,
    chooseDefensiveDribblePresser: () => null,
    enforceDefensiveBlockGeometryLock: emptyLabels,
    enforceDefensiveCollectiveShiftCohesion: emptyLabels,
    enforceDefensiveCompactLineIntegrity: emptyLabels,
    enforceDefensiveLineChainSpacing: emptyLabels,
    enforceDefensiveLineStaggering: emptyLabels,
    enforceDefensiveMeasuredBlockEnvelope: emptyLabels,
    enforceDefensiveOffsideLineControl: emptyLabels,
    enforceDefensiveUnitCompactness: emptyLabels,
    enforceDefensiveVerticalBlockConnections: emptyLabels,
    getDefensiveDribblePressTarget: (player, reference) => ({ ...reference, playerId: player.id }),
    getDefensiveLineActionLabels: () => ["line action"],
    getDefensivePressTarget: (_teamId, ballPoint, _profile, player) => ({
      x: ballPoint.x - 3,
      y: ballPoint.y,
      intent: "press",
      playerId: player.id,
    }),
    getDribblePressureReference: () => null,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot defensive target builder parts create base shape targets", () => {
  const state = {
    players: [
      { id: "A1", team: "away", lineKey: "gk", position: { x: 8, y: 34 } },
      { id: "A2", team: "away", lineKey: "back", position: { x: 24, y: 18 } },
      { id: "A3", team: "away", lineKey: "midfield", position: { x: 38, y: 34 } },
      { id: "A4", team: "away", lineKey: "forward", position: { x: 52, y: 50 } },
      { id: "H1", team: "home", lineKey: "forward", position: { x: 62, y: 34 } },
    ],
  };
  const { buildDefensiveShapeTargets } = createGameSimulatorDefensiveShapeTargetBuilder(createShapeDeps({
    getState: () => state,
  }));

  const result = buildDefensiveShapeTargets("away", { x: 60, y: 34 });

  expect(result.profile).toMatchObject({ phaseKey: "midBlock" });
  expect(result.groups.gk.map((player) => player.id)).toEqual(["A1"]);
  expect(result.groups.back.map((player) => player.id)).toEqual(["A2"]);
  expect(result.groups.midfield.map((player) => player.id)).toEqual(["A3"]);
  expect(result.groups.forward.map((player) => player.id)).toEqual(["A4"]);
  expect(result.targets.get("A1")).toMatchObject({ intent: "goalkeeper-set" });
  expect(result.targets.get("A2")).toMatchObject({ x: 24 });
});

test("game simulator autopilot defensive target builder parts resolve restart and negative transition early", () => {
  const variationCalls = [];
  const presser = { id: "A4" };
  const targets = new Map([["A4", { x: 50, y: 34 }]]);
  const groups = { gk: [], back: [], midfield: [], forward: [presser] };
  const profile = { phaseKey: "midBlock", phaseLabel: "Mid Block" };
  const { resolveDefensiveRestartTransitionTargets } = createGameSimulatorDefensiveRestartTransitionTargets({
    applyAutopilotTargetVariation: (...args) => variationCalls.push(args),
    applyDefensiveCornerSetPieceTargets: () => createTargetResult(),
    applyDefensiveFreeKickSetPieceTargets: () => createTargetResult(),
    applyDefensivePenaltySetPieceTargets: () => createTargetResult(),
    applyDefensiveThrowInSetPieceTargets: () => createTargetResult(),
    applyNegativeTransitionDefensiveTargets: () => createTargetResult({
      active: true,
      mode: "counterPress",
      labels: ["negative transition"],
      protectedIds: new Set(["A3"]),
      presser,
      focusPoint: { x: 58, y: 34 },
    }),
  });

  const result = resolveDefensiveRestartTransitionTargets({
    teamId: "away",
    targets,
    groups,
    ballPoint: { x: 60, y: 34 },
    profile,
  });

  expect(result).toMatchObject({
    presser,
    profile: { phaseKey: "transitionToDefend", phaseLabel: "Negative Transition" },
    protectionLabels: ["negative transition"],
    focusPoint: { x: 58, y: 34 },
  });
  expect(variationCalls).toHaveLength(1);
  expect([...variationCalls[0][4]]).toEqual(["A4", "A3"]);
});

test("game simulator autopilot defensive target builder parts preserve open-play press chain output", () => {
  const presser = { id: "A4", team: "away" };
  const targets = new Map([["A4", { x: 52, y: 50 }]]);
  const groups = { gk: [], back: [], midfield: [], forward: [presser] };
  const { buildDefensiveOpenPlayTargets } = createGameSimulatorDefensiveOpenPlayTargetBuilder(createOpenPlayDeps({
    applyDefensiveOpenPlayTriggerTargets: () => createTargetResult({
      labels: ["open-play trigger"],
      protectedIds: new Set(["A3"]),
      focusPoint: { x: 58, y: 34 },
    }),
    applyDefensivePressureCoverBalanceTargets: () => createTargetResult({ labels: ["pressure cover"] }),
    applyDefensivePrioritySpaceProtectionTargets: () => ["priority space"],
    chooseDefensiveAutopilotPresser: () => presser,
    enforceDefensiveUnitCompactness: () => ["unit compactness"],
  }));

  const result = buildDefensiveOpenPlayTargets({
    teamId: "away",
    targets,
    groups,
    ballPoint: { x: 60, y: 34 },
    profile: { phaseKey: "midBlock" },
  });

  expect(result.targets.get("A4")).toMatchObject({ intent: "press", playerId: "A4" });
  expect(result.presser).toBe(presser);
  expect(result.protectionLabels).toEqual(expect.arrayContaining([
    "line action",
    "open-play trigger",
    "priority space",
    "pressure cover",
    "unit compactness",
  ]));
  expect(result.focusPoint).toEqual({ x: 58, y: 34 });
});

test("game simulator autopilot defensive target builder parts are wired through the orchestrator", () => {
  const orchestrator = readProjectFile("src/modules/game-simulator/autopilot-defensive-target-builder.mjs");
  const shape = readProjectFile("src/modules/game-simulator/autopilot-defensive-shape-target-builder.mjs");
  const restartTransition = readProjectFile("src/modules/game-simulator/autopilot-defensive-restart-transition-targets.mjs");
  const openPlay = readProjectFile("src/modules/game-simulator/autopilot-defensive-open-play-target-builder.mjs");

  expect(orchestrator).toContain('from "./autopilot-defensive-shape-target-builder.mjs"');
  expect(orchestrator).toContain('from "./autopilot-defensive-restart-transition-targets.mjs"');
  expect(orchestrator).toContain('from "./autopilot-defensive-open-play-target-builder.mjs"');
  expect(orchestrator).not.toContain("const cornerSetPiece = applyDefensiveCornerSetPieceTargets(");
  expect(orchestrator).not.toContain("const dribbleReference = getDribblePressureReference()");
  expect(shape).toContain("createGameSimulatorDefensiveShapeTargetBuilder");
  expect(restartTransition).toContain("resolveDefensiveRestartTransitionTargets");
  expect(openPlay).toContain("buildDefensiveOpenPlayTargets");
});
