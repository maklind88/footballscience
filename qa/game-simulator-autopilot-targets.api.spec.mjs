import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotTargets } from "../src/modules/game-simulator/autopilot-targets.mjs";

function createFallbackDependencyMap(overrides = {}) {
  const emptyLabels = () => [];
  const emptyTargetResult = () => ({ labels: [], protectedIds: new Set() });
  const fallback = {
    applyAutopilotTargetVariation: () => undefined,
    buildAutoPilotPassCandidates: () => [],
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    enforceDefensiveBlockGeometryLock: emptyLabels,
    enforceDefensiveCollectiveShiftCohesion: emptyLabels,
    enforceDefensiveCompactLineIntegrity: emptyLabels,
    enforceDefensiveLineChainSpacing: emptyLabels,
    enforceDefensiveLineStaggering: emptyLabels,
    enforceDefensiveMeasuredBlockEnvelope: emptyLabels,
    enforceDefensiveOffsideLineControl: emptyLabels,
    enforceDefensiveUnitCompactness: emptyLabels,
    enforceDefensiveVerticalBlockConnections: emptyLabels,
    enforceOffensiveFiveLaneOccupation: emptyLabels,
    enforceOffensiveOccupationZones: () => undefined,
    enforceOffensiveOnsideLineAwareness: emptyLabels,
    enforceOffensiveStructureBalance: emptyLabels,
    enforceOffensiveTargetSpacing: () => undefined,
    getDefensiveLineActionLabels: emptyLabels,
    getFormationPositions: () => [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    getOffensiveActionPrinciple: () => null,
    getPlayerBallControlPoint: (player) => player.position,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    shouldSkipOffensiveAutopilotPlayer: () => false,
    teamRosterOrder: { home: ["H1", "H2"], away: ["A1", "A2"] },
    teams: {
      home: { formation: "4-3-3", name: "Home" },
      away: { formation: "4-3-3", name: "Away" },
    },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
  };
  return new Proxy({ ...fallback, ...overrides }, {
    get(target, key) {
      if (key in target) return target[key];
      if (String(key).startsWith("apply")) return emptyTargetResult;
      if (String(key).startsWith("build")) return () => null;
      if (String(key).startsWith("get")) return () => ({ score: 0, labels: [] });
      return undefined;
    },
  });
}

test("game simulator autopilot targets factory exposes moved target builders", () => {
  const state = {
    ball: { ownerPlayerId: "H1", position: { x: 10, y: 10 }, startPosition: { x: 10, y: 10 }, target: { x: 10, y: 10 } },
    players: [{ id: "H1", team: "home", position: { x: 10, y: 10 } }],
  };
  const targets = createGameSimulatorAutopilotTargets(createFallbackDependencyMap({
    getState: () => state,
  }));

  expect(typeof targets.buildOffensiveAutopilotTargets).toBe("function");
  expect(typeof targets.buildDefensiveAutopilotTargets).toBe("function");
  expect(typeof targets.chooseAutoPilotNextAction).toBe("function");
});

test("game simulator autopilot next-action builder reads current state through dependency boundary", () => {
  const carrier = { id: "H1", team: "home", position: { x: 12, y: 34 } };
  const state = {
    ball: { ownerPlayerId: null, position: { x: 0, y: 0 }, startPosition: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
    players: [carrier],
  };
  const targets = createGameSimulatorAutopilotTargets(createFallbackDependencyMap({
    getState: () => state,
    getAutoPilotPossessionPlayer: () => carrier,
    getOffensiveAutopilotProfile: () => ({ phaseLabel: "Build Up", styleLabel: "Balanced", phaseKey: "buildUp" }),
    buildAutoPilotKickoffCandidate: () => ({
      actionType: "pass",
      target: { x: 20, y: 34 },
      score: 3,
      label: "kickoff pass",
      reason: "restart pattern",
    }),
  }));

  const choice = targets.chooseAutoPilotNextAction();

  expect(choice).toMatchObject({
    actionType: "pass",
    carrier,
    teamId: "home",
    phaseLabel: "Build Up",
    styleLabel: "Balanced",
    formation: "4-3-3",
  });
  expect(state.ball.ownerPlayerId).toBe("H1");
  expect(state.ball.position).toEqual({ x: 12, y: 34 });
});
