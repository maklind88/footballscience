import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePenaltyTargets } from "../src/modules/game-simulator/autopilot-defensive-penalty-targets.mjs";

function createPenaltyDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      position: { x: 94, y: 34 },
      target: { x: 105, y: 34 },
    },
    draftStep: null,
    restartPhase: { type: "penalty", teamId: "home" },
  };
  return {
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getRestartActionMeta: () => ({
      target: state.ball.target,
      beforeSnapshot: {
        restartPhase: state.restartPhase,
        ball: { position: state.ball.position },
      },
    }),
    getWideSideSign: (point) => {
      if (!point || !Number.isFinite(point.y)) {
        return 0;
      }
      return point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0;
    },
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createPenaltyGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", position: { x: 104, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 91, y: 28 } },
      { id: "A5", team: "away", lineKey: "back", label: "CB", position: { x: 91, y: 40 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 84, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 82, y: 44 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 74, y: 34 } },
      { id: "A11", team: "away", lineKey: "forward", label: "W", position: { x: 74, y: 18 } },
    ],
  };
}

test("game simulator autopilot defensive penalty targets expose moved penalty contracts", () => {
  const penaltyTargets = createGameSimulatorAutopilotDefensivePenaltyTargets(createPenaltyDeps());

  expect(typeof penaltyTargets.getDefensivePenaltyContext).toBe("function");
  expect(typeof penaltyTargets.getDefensivePenaltyTarget).toBe("function");
  expect(typeof penaltyTargets.applyDefensivePenaltySetPieceTargets).toBe("function");
});

test("game simulator autopilot defensive penalty targets detect opponent penalty restarts", () => {
  const penaltyTargets = createGameSimulatorAutopilotDefensivePenaltyTargets(createPenaltyDeps());
  const context = penaltyTargets.getDefensivePenaltyContext("away", { x: 94, y: 34 });

  expect(context?.attackingTeamId).toBe("home");
  expect(context?.penaltyPoint).toEqual({ x: 94, y: 34 });
  expect(penaltyTargets.getDefensivePenaltyContext("home", { x: 94, y: 34 })).toBeNull();
});

test("game simulator autopilot defensive penalty targets assign rebound and clearance players", () => {
  const penaltyTargets = createGameSimulatorAutopilotDefensivePenaltyTargets(createPenaltyDeps());
  const targets = new Map();

  const result = penaltyTargets.applyDefensivePenaltySetPieceTargets(
    "away",
    targets,
    createPenaltyGroups(),
    { x: 94, y: 34 },
    { phaseKey: "boxDefending" }
  );

  expect(result.active).toBe(true);
  expect(result.labels).toContain("GK on penalty line");
  expect(result.labels).toContain("Penalty rebound line");
  expect(result.labels).toContain("Clearance outlets");
  expect(targets.has("A1")).toBe(true);
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
