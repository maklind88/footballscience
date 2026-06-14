import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotNextAction } from "../src/modules/game-simulator/autopilot-next-action.mjs";

function createFallbackDependencyMap(overrides = {}) {
  const fallback = {
    buildAutoPilotPassCandidates: () => [],
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    cloneVector: (point) => ({ ...point }),
    getPlayerBallControlPoint: (player) => player.position,
    teams: {
      home: { formation: "4-3-3", name: "Home" },
      away: { formation: "4-3-3", name: "Away" },
    },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
  };
  return new Proxy({ ...fallback, ...overrides }, {
    get(target, key) {
      if (key in target) return target[key];
      if (String(key).startsWith("build")) return () => null;
      if (String(key).startsWith("get")) return () => ({ score: 0, labels: [] });
      return undefined;
    },
  });
}

test("game simulator autopilot next action chooses restart candidates through dependency boundary", () => {
  const carrier = { id: "H1", team: "home", position: { x: 12, y: 34 } };
  const state = {
    ball: { ownerPlayerId: null, position: { x: 0, y: 0 }, startPosition: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
    players: [carrier],
  };
  const { chooseAutoPilotNextAction } = createGameSimulatorAutopilotNextAction(createFallbackDependencyMap({
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

  const choice = chooseAutoPilotNextAction();

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
