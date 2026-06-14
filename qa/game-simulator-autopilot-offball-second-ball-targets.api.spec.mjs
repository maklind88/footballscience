import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballSecondBallTargets } from "../src/modules/game-simulator/autopilot-offball-second-ball-targets.mjs";

const pitch = { length: 105, width: 68 };

function createSecondBallDeps(overrides = {}) {
  const state = overrides.state ?? {
    players: [
      { id: "H8", team: "home", position: { x: 52, y: 31 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 79, y: 41 }, roleKey: "striker" },
      { id: "H10", team: "home", position: { x: 70, y: 35 }, roleKey: "secondStriker" },
      { id: "H7", team: "home", position: { x: 68, y: 53 }, roleKey: "wideForward" },
      { id: "H11", team: "home", position: { x: 64, y: 29 }, roleKey: "connector" },
      { id: "H6", team: "home", position: { x: 58, y: 33 }, roleKey: "pivot" },
      { id: "H2", team: "home", position: { x: 55, y: 55 }, roleKey: "wideBack" },
      { id: "H4", team: "home", position: { x: 48, y: 34 }, roleKey: "rest" },
      { id: "A4", team: "away", position: { x: 76, y: 39 }, roleKey: "back" },
    ],
    ball: {
      actionType: "pass",
      initiatorPlayerId: "H8",
      startPosition: { x: 52, y: 31 },
      position: { x: 52, y: 31 },
      target: { x: 81, y: 42 },
    },
    restartPhase: null,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clampToPitch = (point, margin = 0) => ({
    x: clamp(point.x, margin, pitch.length - margin),
    y: clamp(point.y, margin, pitch.width - margin),
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getPlayerById = (playerId) => state.players.find((player) => player.id === playerId) ?? null;
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const getMovableAutopilotPlayerByRoles = (teamId, roleKeys, targets, excludedIds, referencePoint) => state.players
    .filter((player) => player.team === teamId && targets.has(player.id) && !excludedIds.has(player.id))
    .filter((player) => roleKeys.includes(player.roleKey))
    .sort((first, second) => {
      const roleDiff = roleKeys.indexOf(first.roleKey) - roleKeys.indexOf(second.roleKey);
      if (roleDiff) {
        return roleDiff;
      }
      return distance(first.position, referencePoint) - distance(second.position, referencePoint);
    })[0] ?? null;

  return {
    clamp,
    clampToPitch,
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      targetThreat: {
        assistZone: 0.42,
        behindLine: 0.34,
        box: 0.24,
        cutbackZone: 0.18,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getMovableAutopilotPlayerByRoles,
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPlayerById,
    getPlayerPressureLoad: () => 0.62,
    getWideSideSign,
    isAerialFlightStyle: (flightStyle) => flightStyle === "lofted",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    resolveBallActionProfile: () => ({
      key: "route-one",
      label: "Route one delivery",
      flightStyle: "lofted",
    }),
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, clampToPitch(target, 3));
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargets(players) {
  return new Map(players.filter((player) => player.team === "home").map((player) => [player.id, { ...player.position }]));
}

test("game simulator autopilot offball second ball targets expose moved contracts", () => {
  const secondBall = createGameSimulatorAutopilotOffballSecondBallTargets(createSecondBallDeps());

  expect(typeof secondBall.getSecondBallAnticipationContext).toBe("function");
  expect(typeof secondBall.getOffensiveSecondBallAnticipationTarget).toBe("function");
  expect(typeof secondBall.applyOffensiveSecondBallAnticipationTargets).toBe("function");
});

test("game simulator autopilot offball second ball targets preserve route-one anticipation", () => {
  const deps = createSecondBallDeps();
  const secondBall = createGameSimulatorAutopilotOffballSecondBallTargets(deps);
  const actionMeta = {
    actionType: "pass",
    carrierPlayerId: "H8",
    receiverPlayerId: "H9",
    beforeSnapshot: {
      ball: {
        ownerPlayerId: "H8",
        position: { x: 52, y: 31 },
      },
    },
    target: { x: 81, y: 42 },
    autoPrinciples: ["second-ball route-one"],
  };

  const context = secondBall.getSecondBallAnticipationContext("home", actionMeta.target, actionMeta, { phaseKey: "openPlay" });

  expect(context.aerial).toBe(true);
  expect(context.delivery).toBe(true);
  expect(context.finalThirdLanding).toBe(true);
  expect(context.lineBreakLanding).toBe(true);

  const targets = createTargets(deps.state.players);
  const result = secondBall.applyOffensiveSecondBallAnticipationTargets(
    "home",
    targets,
    actionMeta.target,
    actionMeta,
    { phaseKey: "openPlay" }
  );

  expect(result.labels).toContain("Second ball: contest support");
  expect(result.labels).toContain("Second ball: drop-zone collector");
  expect(result.labels).toContain("Second ball: far-side collector");
  expect(result.labels).toContain("Second ball: rest-defence lock");
  expect(result.protectedIds.size).toBeGreaterThanOrEqual(4);
  expect(targets.get("H10")).not.toEqual({ x: 70, y: 35 });
  expect(targets.get("H6")).not.toEqual({ x: 58, y: 33 });
});
