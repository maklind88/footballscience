import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveDefensiveLineGeometry } from "../src/modules/game-simulator/autopilot-live-defensive-line-geometry.mjs";

function createLineGeometry(overrides = {}) {
  const state = overrides.state || { restartPhase: null };
  const pitch = { length: 105, width: 68 };
  const deps = {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    getDefendingDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getDefensiveLineCenterY: () => 34,
    getDefensiveLineDistanceFromOwnGoal: (_teamId, lineKey) => (
      lineKey === "back" ? 22 : lineKey === "midfield" ? 33 : 45
    ),
    getDefensiveLineWidth: () => 18,
    getDefensiveLineX: (_teamId, lineKey) => (
      lineKey === "back" ? 22 : lineKey === "midfield" ? 33 : 45
    ),
    getDistanceFromOwnGoal: (_teamId, point) => point.x,
    getOwnGoalCenter: () => ({ x: 0, y: 34 }),
    getWideSideSign: (point) => point.y < pitch.width / 2 ? -1 : 1,
    isGoalkeeper: (player) => player?.role === "GK",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    ...overrides,
  };

  return {
    engine: createGameSimulatorAutopilotLiveDefensiveLineGeometry(deps),
    state,
  };
}

function createProfile(overrides = {}) {
  return {
    phaseKey: "lowBlock",
    lineActionAdjustment: { mode: "hold" },
    maxBackLineFromOwnGoal: 52,
    minBackLineFromOwnGoal: 8,
    playerGap: {
      back: { min: 7, max: 9 },
      midfield: { min: 7.5, max: 9.5 },
    },
    threatResponse: {},
    ...overrides,
  };
}

test("game simulator autopilot live defensive line geometry compacts low-block units", () => {
  const { engine } = createLineGeometry();
  const profile = createProfile();
  const players = [
    { id: "B1", team: "home", role: "CB", position: { x: 14, y: 12 } },
    { id: "B2", team: "home", role: "CB", position: { x: 15, y: 56 } },
    { id: "GK", team: "home", role: "GK", position: { x: 5, y: 34 } },
  ];
  const targets = new Map(players.map((player) => [player.id, { ...player.position }]));

  expect(engine.getDefensiveUnitGap(profile, "back")).toBe(8);
  const labels = engine.enforceDefensiveUnitCompactness(
    "home",
    targets,
    { back: players },
    { x: 30, y: 18 },
    profile
  );

  expect(labels).toContain("Low-block unit spacing");
  expect(targets.get("B1").x).toBeGreaterThan(14);
  expect(targets.get("B2").y).toBeLessThan(56);
  expect(targets.get("GK")).toEqual({ x: 5, y: 34 });
});

test("game simulator autopilot live defensive line geometry preserves line chain and depth", () => {
  const { engine } = createLineGeometry();
  const profile = createProfile({ phaseKey: "midBlock" });
  const players = [
    { id: "B1", team: "home", role: "CB", position: { x: 38, y: 30 } },
    { id: "B2", team: "home", role: "CB", position: { x: 41, y: 32 } },
  ];
  const targets = new Map(players.map((player) => [player.id, { ...player.position }]));
  const ballPoint = { x: 40, y: 24 };

  const chainLabels = engine.enforceDefensiveLineChainSpacing(
    "home",
    targets,
    { back: players },
    ballPoint,
    profile
  );

  expect(chainLabels).toContain("Defensive chain spacing");
  expect(Math.abs(targets.get("B2").y - targets.get("B1").y)).toBeGreaterThan(2);

  const beforeDepth = targets.get("B1").x;
  const verticalLabels = engine.enforceDefensiveVerticalBlockConnections(
    "home",
    targets,
    { back: players },
    ballPoint,
    profile
  );

  expect(verticalLabels).toContain("Vertical block connection");
  expect(targets.get("B1").x).toBeLessThan(beforeDepth);
});
