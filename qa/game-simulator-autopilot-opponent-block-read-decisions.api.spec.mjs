import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOpponentBlockReadDecisions } from "../src/modules/game-simulator/autopilot-opponent-block-read-decisions.mjs";

function createOpponentBlockDeps(overrides = {}) {
  let lineDepths = overrides.lineDepths || { forward: 30, midfield: 42, back: 56 };
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: { position: { x: 42, y: 18 } },
    players: [
      { id: "H1", team: "home", position: { x: 42, y: 18 }, role: "Midfielder" },
      { id: "A1", team: "away", position: { x: 54, y: 19 }, role: "Left Back" },
      { id: "A2", team: "away", position: { x: 56, y: 24 }, role: "Centre Back" },
      { id: "A3", team: "away", position: { x: 58, y: 31 }, role: "Midfielder" },
      { id: "A4", team: "away", position: { x: 60, y: 37 }, role: "Midfielder" },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.62,
      targetGameSpaceKey: "space3",
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotCandidatePattern: () => ({ family: "line-break" }),
    getOpponentDensityAtPoint: () => 3,
    getOpponentLineDepthsForAttackingTeam: () => lineDepths,
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPitchLaneIndex: (laneKey) => ({ leftWide: 0, leftHalf: 1, central: 2, rightHalf: 3, rightWide: 4 }[laneKey] ?? 2),
    getPitchLaneKey: (point) => {
      if (point.y <= 12) return "leftWide";
      if (point.y <= 28) return "leftHalf";
      if (point.y <= 40) return "central";
      if (point.y <= 56) return "rightHalf";
      return "rightWide";
    },
    getPitchThreatProfile: () => ({
      value: 0.52,
      box: 0.12,
      betweenLines: 0.42,
      centralPocket: 0.32,
      behindLine: 0.38,
      cutbackZone: 0.04,
    }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.role === "Goalkeeper",
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    setLineDepths(nextLineDepths) {
      lineDepths = nextLineDepths;
    },
    ...overrides,
  };
  return deps;
}

test("game simulator autopilot opponent block read decisions expose moved contracts", () => {
  const blockRead = createGameSimulatorAutopilotOpponentBlockReadDecisions(createOpponentBlockDeps());

  expect(typeof blockRead.getOpponentBlockReadProfile).toBe("function");
  expect(typeof blockRead.getAutoPilotOpponentBlockReadAdjustment).toBe("function");
});

test("game simulator autopilot opponent block read decisions read live defensive line data", () => {
  const deps = createOpponentBlockDeps();
  const blockRead = createGameSimulatorAutopilotOpponentBlockReadDecisions(deps);

  const highLine = blockRead.getOpponentBlockReadProfile("home", { x: 42, y: 18 });

  deps.setLineDepths({ forward: 42, midfield: 62, back: 84 });
  const deepBlock = blockRead.getOpponentBlockReadProfile("home", { x: 42, y: 18 });

  expect(highLine.highLine).toBeGreaterThan(0.38);
  expect(deepBlock.deepBlock).toBeGreaterThan(0.38);
  expect(deepBlock.highLine).toBeLessThan(highLine.highLine);
});

test("game simulator autopilot opponent block read decisions preserve line-break rewards", () => {
  const blockRead = createGameSimulatorAutopilotOpponentBlockReadDecisions(createOpponentBlockDeps());
  const result = blockRead.getAutoPilotOpponentBlockReadAdjustment(
    {
      actionType: "pass",
      target: { x: 62, y: 35 },
      isLineBreak: true,
      passDistance: 24,
      laneClarity: 0.78,
    },
    { id: "H1", team: "home", position: { x: 42, y: 18 } },
    { x: 42, y: 18 },
    {
      directness: 0.62,
      lineBreakBias: 0.7,
      shortSupport: 0.58,
      switchBias: 0.42,
      widthDiscipline: 0.48,
      deliveryBias: 0.4,
    }
  );

  expect(result.score).toBeGreaterThan(0);
  expect(result.labels).toContain("Find gap between lines");
  expect(result.labels).toContain("Attack high line");
});
