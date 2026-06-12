import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveCornerTargets } from "../src/modules/game-simulator/autopilot-defensive-corner-targets.mjs";

function createCornerDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      position: { x: 105, y: 0 },
      target: { x: 94, y: 32 },
    },
    draftStep: null,
    restartPhase: { type: "corner", teamId: "home", sideY: 0 },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneRestartPhase: (restart) => (restart ? { ...restart } : null),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getCornerKickSpot: (teamId, sideY) => ({ x: teamId === "home" ? pitch.length : 0, y: sideY <= pitch.width / 2 ? 0 : pitch.width }),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createCornerGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 95, y: 30 } },
      { id: "A5", team: "away", lineKey: "back", label: "CB", position: { x: 95, y: 38 } },
      { id: "A2", team: "away", lineKey: "back", label: "RB", position: { x: 92, y: 22 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 88, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 88, y: 42 } },
      { id: "A10", team: "away", lineKey: "midfield", label: "10", position: { x: 82, y: 28 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 78, y: 35 } },
      { id: "A11", team: "away", lineKey: "forward", label: "W", position: { x: 78, y: 12 } },
    ],
  };
}

test("game simulator autopilot defensive corner targets expose moved corner contracts", () => {
  const cornerTargets = createGameSimulatorAutopilotDefensiveCornerTargets(createCornerDeps());

  expect(typeof cornerTargets.getDefensiveCornerContext).toBe("function");
  expect(typeof cornerTargets.getDefensiveCornerTarget).toBe("function");
  expect(typeof cornerTargets.applyDefensiveCornerSetPieceTargets).toBe("function");
});

test("game simulator autopilot defensive corner targets detect opponent corner restarts", () => {
  const cornerTargets = createGameSimulatorAutopilotDefensiveCornerTargets(createCornerDeps());
  const context = cornerTargets.getDefensiveCornerContext("away", { x: 94, y: 32 });

  expect(context?.attackingTeamId).toBe("home");
  expect(context?.isShortCorner).toBe(false);
  expect(cornerTargets.getDefensiveCornerContext("home", { x: 94, y: 32 })).toBeNull();
});

test("game simulator autopilot defensive corner targets apply zonal set-piece positions", () => {
  const cornerTargets = createGameSimulatorAutopilotDefensiveCornerTargets(createCornerDeps());
  const targets = new Map();

  const result = cornerTargets.applyDefensiveCornerSetPieceTargets(
    "away",
    targets,
    createCornerGroups(),
    { x: 94, y: 32 },
    { phaseKey: "boxDefending" }
  );

  expect(result.active).toBe(true);
  expect(result.labels).toContain("GK controls six-yard line");
  expect(result.labels).toContain("Near-post protection");
  expect(targets.has("A1")).toBe(true);
  expect(targets.size).toBeGreaterThanOrEqual(7);
});
