import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveThrowInTargets } from "../src/modules/game-simulator/autopilot-defensive-throw-in-targets.mjs";

function createThrowInDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      position: { x: 64, y: 2 },
      target: { x: 60, y: 13 },
    },
    draftStep: null,
    restartPhase: { type: "throwIn", teamId: "home", point: { x: 64, y: 2 } },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
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
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from, to, amount) => {
      const total = Math.hypot(to.x - from.x, to.y - from.y);
      if (!total) {
        return { ...from };
      }
      const ratio = Math.min(1, amount / total);
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
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

function createThrowInGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", position: { x: 102, y: 34 } }],
    back: [
      { id: "A2", team: "away", lineKey: "back", label: "RB", position: { x: 68, y: 10 } },
      { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 76, y: 24 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 63, y: 18 } },
      { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 62, y: 26 } },
      { id: "A10", team: "away", lineKey: "midfield", label: "10", position: { x: 58, y: 22 } },
    ],
    forward: [
      { id: "A11", team: "away", lineKey: "forward", label: "W", position: { x: 58, y: 9 } },
      { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 53, y: 34 } },
    ],
  };
}

test("game simulator autopilot defensive throw in targets expose moved throw in contracts", () => {
  const throwInTargets = createGameSimulatorAutopilotDefensiveThrowInTargets(createThrowInDeps());

  expect(typeof throwInTargets.getDefensiveThrowInContext).toBe("function");
  expect(typeof throwInTargets.getDefensiveThrowInTarget).toBe("function");
  expect(typeof throwInTargets.applyDefensiveThrowInSetPieceTargets).toBe("function");
});

test("game simulator autopilot defensive throw in targets detect opponent throw in restarts", () => {
  const throwInTargets = createGameSimulatorAutopilotDefensiveThrowInTargets(createThrowInDeps());
  const context = throwInTargets.getDefensiveThrowInContext("away", { x: 60, y: 13 });

  expect(context?.attackingTeamId).toBe("home");
  expect(context?.isShortThrow).toBe(true);
  expect(throwInTargets.getDefensiveThrowInContext("home", { x: 60, y: 13 })).toBeNull();
});

test("game simulator autopilot defensive throw in targets assign touchline trap coverage", () => {
  const throwInTargets = createGameSimulatorAutopilotDefensiveThrowInTargets(createThrowInDeps());
  const targets = new Map();

  const result = throwInTargets.applyDefensiveThrowInSetPieceTargets(
    "away",
    targets,
    createThrowInGroups(),
    { x: 60, y: 14 },
    { phaseKey: "midBlock" }
  );

  expect(result.active).toBe(true);
  expect(result.labels).toContain("Two-metre throw-in pressure");
  expect(result.labels).toContain("Touchline trap");
  expect(result.labels).toContain("Inside lane cover");
  expect(result.presser?.team).toBe("away");
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
