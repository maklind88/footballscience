import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotLiveDefensiveLineControl } from "../src/modules/game-simulator/autopilot-live-defensive-line-control.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createLineControl(overrides = {}) {
  const state = overrides.state || { restartPhase: null };
  const pitch = { length: 105, width: 68 };
  const deps = {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getDefendingDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getDefensiveLineCenterY: () => 34,
    getDefensiveLineDistanceFromOwnGoal: (_teamId, lineKey) => (
      lineKey === "back" ? 20 : lineKey === "midfield" ? 31 : 44
    ),
    getDefensiveLineX: (_teamId, lineKey) => (
      lineKey === "back" ? 20 : lineKey === "midfield" ? 31 : 44
    ),
    getDefensiveUnitGap: (_profile, lineKey) => lineKey === "back" ? 8 : lineKey === "midfield" ? 8.2 : 8.8,
    isGoalkeeper: (player) => player?.role === "GK",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };

  return {
    engine: createGameSimulatorAutopilotLiveDefensiveLineControl(deps),
    state,
  };
}

function createProfile(overrides = {}) {
  return {
    phaseKey: "lowBlock",
    maxBackLineFromOwnGoal: 52,
    minBackLineFromOwnGoal: 8,
    targetBackToMidfield: 10,
    targetBlockHeight: 26,
    ...overrides,
  };
}

test("game simulator autopilot live defensive line control exposes block integrity helpers", () => {
  const { engine } = createLineControl();

  expect(typeof engine.enforceDefensiveMeasuredBlockEnvelope).toBe("function");
  expect(typeof engine.enforceDefensiveCollectiveShiftCohesion).toBe("function");
  expect(typeof engine.getDefensiveCompactLineIntegritySettings).toBe("function");
  expect(typeof engine.enforceDefensiveCompactLineIntegrity).toBe("function");
  expect(engine.getDefensiveCompactLineIntegritySettings(createProfile(), "back")).toMatchObject({
    gap: 8,
    label: "Low-block 8m line integrity",
  });
});

test("game simulator autopilot live defensive line control shapes measured low block envelope", () => {
  const { engine } = createLineControl();
  const profile = createProfile();
  const players = [
    { id: "B1", team: "home", role: "CB", position: { x: 14, y: 10 } },
    { id: "B2", team: "home", role: "CB", position: { x: 18, y: 58 } },
    { id: "M1", team: "home", role: "DM", position: { x: 42, y: 12 } },
    { id: "F1", team: "home", role: "ST", position: { x: 54, y: 56 } },
    { id: "GK", team: "home", role: "GK", position: { x: 5, y: 34 } },
  ];
  const targets = new Map(players.map((player) => [player.id, { ...player.position }]));

  const labels = engine.enforceDefensiveMeasuredBlockEnvelope(
    "home",
    targets,
    { back: players.slice(0, 2), midfield: [players[2]], forward: [players[3]], gk: [players[4]] },
    { x: 35, y: 20 },
    profile
  );

  expect(labels).toContain("Low-block measured envelope");
  expect(targets.get("B1").x).toBeGreaterThan(14);
  expect(targets.get("B2").y).toBeLessThan(58);
  expect(targets.get("GK")).toEqual({ x: 5, y: 34 });
});

test("game simulator autopilot live defensive line control softens protected players", () => {
  const { engine } = createLineControl();
  const profile = createProfile();
  const players = [
    { id: "B1", team: "home", role: "CB", position: { x: 12, y: 12 } },
    { id: "B2", team: "home", role: "CB", position: { x: 30, y: 56 } },
  ];
  const protectedTargets = new Map(players.map((player) => [player.id, { ...player.position }]));
  const openTargets = new Map(players.map((player) => [player.id, { ...player.position }]));

  const labels = engine.enforceDefensiveCompactLineIntegrity(
    "home",
    protectedTargets,
    { back: players },
    { x: 35, y: 20 },
    profile,
    null,
    new Set(["B1"])
  );
  engine.enforceDefensiveCompactLineIntegrity(
    "home",
    openTargets,
    { back: players },
    { x: 35, y: 20 },
    profile
  );

  const protectedMove = Math.hypot(protectedTargets.get("B1").x - 12, protectedTargets.get("B1").y - 12);
  const openMove = Math.hypot(openTargets.get("B1").x - 12, openTargets.get("B1").y - 12);

  expect(labels).toContain("Low-block 8m line integrity");
  expect(protectedMove).toBeGreaterThan(0);
  expect(protectedMove).toBeLessThan(openMove);
  expect(protectedTargets.get("B2").x).toBeLessThan(30);
  expect(protectedTargets.get("B2").y).toBeLessThan(56);
});

test("game simulator autopilot live defensive line control is split out of the live engine", () => {
  const liveEngineSource = readProjectFile("src/modules/game-simulator/autopilot-live-engine.mjs");
  const lineControlSource = readProjectFile("src/modules/game-simulator/autopilot-live-defensive-line-control.mjs");

  expect(liveEngineSource).toContain('from "./autopilot-live-defensive-line-control.mjs"');
  expect(liveEngineSource).toContain("createGameSimulatorAutopilotLiveDefensiveLineControl({");
  expect(liveEngineSource).not.toContain("function enforceDefensiveMeasuredBlockEnvelope(");
  expect(liveEngineSource).not.toContain("function enforceDefensiveCompactLineIntegrity(");
  expect(lineControlSource).toContain("createGameSimulatorAutopilotLiveDefensiveLineControl");
  expect(lineControlSource).toContain("function enforceDefensiveMeasuredBlockEnvelope(");
  expect(lineControlSource).toContain("function enforceDefensiveCompactLineIntegrity(");
});
