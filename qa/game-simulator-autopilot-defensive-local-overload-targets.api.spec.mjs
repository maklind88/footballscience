import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveLocalOverloadTargets } from "../src/modules/game-simulator/autopilot-defensive-local-overload-targets.mjs";

function createLocalOverloadDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    players: [
      { id: "H8", team: "home", position: { x: 48, y: 34 }, role: "Midfielder", shortLabel: "8" },
      { id: "H9", team: "home", position: { x: 58, y: 34 }, role: "Striker", shortLabel: "9" },
      { id: "H6", team: "home", position: { x: 52, y: 34 }, role: "Defensive Midfielder", shortLabel: "6" },
      { id: "H10", team: "home", position: { x: 58, y: 27 }, role: "Attacking Midfielder", shortLabel: "10" },
      { id: "H11", team: "home", position: { x: 64, y: 39 }, role: "Winger", shortLabel: "W" },
      { id: "A1", team: "away", position: { x: 104, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
      { id: "A6", team: "away", position: { x: 56, y: 35 }, role: "Defensive Midfielder", shortLabel: "6" },
      { id: "A8", team: "away", position: { x: 62, y: 41 }, role: "Midfielder", shortLabel: "8" },
      { id: "A4", team: "away", position: { x: 69, y: 33 }, role: "Centre Back", shortLabel: "CB" },
      { id: "A5", team: "away", position: { x: 76, y: 45 }, role: "Centre Back", shortLabel: "CB" },
      { id: "A9", team: "away", position: { x: 47, y: 30 }, role: "Striker", shortLabel: "9" },
    ],
    ball: {
      actionType: "pass",
      position: { x: 48, y: 34 },
      startPosition: { x: 48, y: 34 },
      target: { x: 58, y: 34 },
      ownerPlayerId: "H8",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 58, y: 34 },
      carrierPlayerId: "H8",
      receiverPlayerId: "H9",
      beforeSnapshot: { ball: { position: { x: 48, y: 34 }, ownerPlayerId: "H8" } },
      autoPrinciples: ["Support triangle", "Central access"],
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const clampToPitch = (point) => ({
    x: clamp(point.x, 0, pitch.length),
    y: clamp(point.y, 0, pitch.width),
  });
  return {
    clamp,
    clampToPitch,
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      targetThreat: { value: 0.58, box: 0.12, centralPocket: 0.34, betweenLines: 0.36 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOffensiveAutopilotProfile: () => ({ styleKey: "balanced", phaseKey: "buildUp" }),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 58 ? 0.58 : 0.42,
      box: point.x >= 62 ? 0.14 : 0.08,
      centralPocket: point.y >= 24 && point.y <= 44 ? 0.34 : 0.12,
      betweenLines: point.x >= 52 ? 0.36 : 0.16,
    }),
    getPlannedPossessionTeamId: () => "home",
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      if (!Number.isFinite(y)) {
        return 0;
      }
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.id === "A1",
    isWidePrincipleZone: (point) => point.y < 17 || point.y > 51,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, assignedIds, target, preferLabels = []) => {
      const players = lineKeys.flatMap((key) => groups[key] || []);
      const scored = players
        .filter((player) => !assignedIds.has(player.id))
        .map((player) => ({
          player,
          score:
            distance(player.position, target) -
            (preferLabels.includes(player.shortLabel) ? 3 : 0),
        }))
        .sort((a, b) => a.score - b.score);
      return scored[0]?.player || null;
    },
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))].slice(0, 3),
    ...overrides,
  };
}

function createGroups(state) {
  return {
    gk: state.players.filter((player) => player.id === "A1"),
    back: state.players.filter((player) => ["A4", "A5"].includes(player.id)),
    midfield: state.players.filter((player) => ["A6", "A8"].includes(player.id)),
    forward: state.players.filter((player) => player.id === "A9"),
  };
}

test("game simulator autopilot defensive local overload targets expose moved contracts", () => {
  const deps = createLocalOverloadDeps();
  const targets = createGameSimulatorAutopilotDefensiveLocalOverloadTargets(deps);

  expect(typeof targets.getActualLocalSuperiorityProfile).toBe("function");
  expect(typeof targets.getDefensiveLocalOverloadContext).toBe("function");
  expect(typeof targets.getDefensiveLocalOverloadTarget).toBe("function");
  expect(typeof targets.applyDefensiveLocalOverloadResponseTargets).toBe("function");
});

test("game simulator autopilot defensive local overload targets map attacking support sectors", () => {
  const deps = createLocalOverloadDeps();
  const targets = createGameSimulatorAutopilotDefensiveLocalOverloadTargets(deps);

  const profile = targets.getActualLocalSuperiorityProfile(
    "home",
    "away",
    { x: 58, y: 34 },
    new Set(["H8", "H9"]),
    16
  );

  expect(profile.supportCount).toBeGreaterThanOrEqual(3);
  expect(profile.sectorVariety).toBeGreaterThanOrEqual(3);
  expect(profile.sectors.under).toBeGreaterThanOrEqual(1);
  expect(profile.sectors.forward).toBeGreaterThanOrEqual(1);
});

test("game simulator autopilot defensive local overload targets detect central lock context", () => {
  const deps = createLocalOverloadDeps();
  const targets = createGameSimulatorAutopilotDefensiveLocalOverloadTargets(deps);
  const presser = deps.state.players.find((player) => player.id === "A6");

  const context = targets.getDefensiveLocalOverloadContext("away", { x: 58, y: 34 }, presser, {
    phaseKey: "midBlock",
  });

  expect(context).toBeTruthy();
  expect(context.mode).toBe("centralLock");
  expect(context.supportTriangle).toBe(true);
  expect(context.centralRisk).toBe(true);
  expect(context.overloadScore).toBeGreaterThan(0.62);
});

test("game simulator autopilot defensive local overload targets assign pressure and cover", () => {
  const deps = createLocalOverloadDeps();
  const targets = createGameSimulatorAutopilotDefensiveLocalOverloadTargets(deps);
  const groups = createGroups(deps.state);
  const targetMap = new Map(
    deps.state.players
      .filter((player) => player.team === "away")
      .map((player) => [player.id, { ...player.position }])
  );
  const presser = deps.state.players.find((player) => player.id === "A6");

  const result = targets.applyDefensiveLocalOverloadResponseTargets(
    "away",
    targetMap,
    groups,
    presser,
    { x: 58, y: 34 },
    { phaseKey: "midBlock" },
    new Set()
  );

  expect(result.labels).toContain("Defensive local overload response: central lock");
  expect(result.labels).toContain("Local overload: pressure ball");
  expect(result.labels).toContain("Local overload: deny bounce pass");
  expect(result.focusPoint).toEqual({ x: 58, y: 34 });
  expect(targetMap.get("A6")).not.toEqual({ x: 56, y: 35 });
});
