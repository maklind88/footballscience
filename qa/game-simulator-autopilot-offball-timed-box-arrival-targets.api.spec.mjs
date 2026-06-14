import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballTimedBoxArrivalTargets } from "../src/modules/game-simulator/autopilot-offball-timed-box-arrival-targets.mjs";

const pitch = { length: 105, width: 68 };

function createTimedBoxArrivalDeps(overrides = {}) {
  const state = overrides.state ?? {
    players: [
      { id: "H8", team: "home", position: { x: 64, y: 34 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 80, y: 34 }, roleKey: "striker" },
      { id: "H10", team: "home", position: { x: 74, y: 30 }, roleKey: "secondStriker" },
      { id: "H11", team: "home", position: { x: 72, y: 24 }, roleKey: "wideForward" },
      { id: "H7", team: "home", position: { x: 70, y: 46 }, roleKey: "wideForward" },
      { id: "H6", team: "home", position: { x: 62, y: 36 }, roleKey: "pivot" },
      { id: "H4", team: "home", position: { x: 56, y: 33 }, roleKey: "rest" },
      { id: "A5", team: "away", position: { x: 87, y: 34 }, roleKey: "back" },
    ],
    ball: {
      actionType: "dribble",
      initiatorPlayerId: "H8",
      position: { x: 64, y: 34 },
      speed: 7.5,
      startPosition: { x: 64, y: 34 },
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clampToPitch = (point, margin = 0) => ({
    x: clamp(point.x, margin, pitch.length - margin),
    y: clamp(point.y, margin, pitch.width - margin),
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    clampToPitch,
    computeTimeToCoverDistance: (_player, runDistance) => runDistance / 7.6,
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: () => 0.72,
    getOffensiveRoleKey: (player) => player.roleKey,
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      assistZone: 0.18,
      behindLine: point.x >= 78 ? 0.28 : 0.12,
      box: point.x >= 80 ? 0.26 : 0.08,
      centralPocket: 0.28,
      cutbackZone: 0.12,
      value: 0.5,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerTendency: () => 0.62,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player.roleKey === "goalkeeper",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 8.4 }),
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, clampToPitch(target, 3));
      return true;
    },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball timed box arrival targets expose moved contracts", () => {
  const timedBox = createGameSimulatorAutopilotOffballTimedBoxArrivalTargets(createTimedBoxArrivalDeps());

  expect(typeof timedBox.getTimedBoxArrivalContext).toBe("function");
  expect(typeof timedBox.getTimedBoxArrivalTarget).toBe("function");
  expect(typeof timedBox.chooseTimedBoxArrivalPlayer).toBe("function");
  expect(typeof timedBox.applyTimedFinalThirdBoxArrivals).toBe("function");
});

test("game simulator autopilot offball timed box arrival targets preserve central carry arrivals", () => {
  const deps = createTimedBoxArrivalDeps();
  const timedBox = createGameSimulatorAutopilotOffballTimedBoxArrivalTargets(deps);
  const actionMeta = {
    actionType: "dribble",
    carrierPlayerId: "H8",
    beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 64, y: 34 } } },
    autoPrinciples: ["dribble final-third"],
    speed: 8.4,
  };
  const ballPoint = { x: 84, y: 33 };

  const context = timedBox.getTimedBoxArrivalContext("home", ballPoint, actionMeta, { phaseKey: "openPlay", tempo: 0.68 });

  expect(context.deliveryKind).toBe("centralCarry");
  expect(context.isCentralCarry).toBe(true);

  const targets = createTargets(deps.state.players);
  const result = timedBox.applyTimedFinalThirdBoxArrivals(
    "home",
    targets,
    ballPoint,
    actionMeta,
    { phaseKey: "openPlay", tempo: 0.68 },
    new Set(["H8"])
  );

  expect(result.labels).toContain("Finish lane: central goal run");
  expect(result.labels).toContain("Finish lane: near-post pin");
  expect(result.labels).toContain("Finish lane: far-post hold");
  expect(result.labels).toContain("Finish lane: cutback edge");
  expect(result.labels).toContain("Timed box: rest-defence lock");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(4);
});
