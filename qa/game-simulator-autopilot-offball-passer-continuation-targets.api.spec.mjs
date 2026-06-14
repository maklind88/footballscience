import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPasserContinuationTargets } from "../src/modules/game-simulator/autopilot-offball-passer-continuation-targets.mjs";

function createPasserContinuationDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state =
    overrides.state ??
    {
      ball: {
        actionType: "pass",
        initiatorPlayerId: "H2",
        position: { x: 45, y: 14 },
        receiverPlayerId: "H7",
        startPosition: { x: 45, y: 14 },
        target: { x: 55, y: 18 },
      },
      players: [
        { id: "H2", team: "home", roleKey: "wideBack", position: { x: 45, y: 14 } },
        { id: "H6", team: "home", roleKey: "pivot", position: { x: 44, y: 34 } },
        { id: "H7", team: "home", roleKey: "wideForward", position: { x: 55, y: 18 } },
        { id: "H8", team: "home", roleKey: "connector", position: { x: 50, y: 24 } },
        { id: "H9", team: "home", roleKey: "striker", position: { x: 63, y: 34 } },
        { id: "H11", team: "home", roleKey: "wideForward", position: { x: 56, y: 52 } },
        { id: "H12", team: "home", roleKey: "wideBack", position: { x: 45, y: 58 } },
        { id: "H15", team: "home", roleKey: "rest", position: { x: 41, y: 34 } },
      ],
    };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const canUsePlayer = (player, teamId, roleKey, assignedIds, sideSign = null) =>
    player?.team === teamId &&
    player.roleKey === roleKey &&
    !assignedIds.has(player.id) &&
    (sideSign === null || getWideSideSign(player) === sideSign);
  const findPlayerByRoles = (teamId, roleKeys, assignedIds, sideSign = null) => {
    for (const roleKey of roleKeys) {
      const player = state.players.find((candidate) => canUsePlayer(candidate, teamId, roleKey, assignedIds, sideSign));
      if (player) return player;
    }
    return null;
  };

  return {
    clamp,
    clampToPitch: (point, padding = 0) => ({
      x: clamp(point.x, padding, pitch.length - padding),
      y: clamp(point.y, padding, pitch.width - padding),
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: () => 0.66,
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getLaneCenterY: (laneKey) => {
      const lanes = { leftWide: 7, leftHalf: 22, rightHalf: 46, rightWide: 61 };
      return lanes[laneKey] ?? pitch.width / 2;
    },
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, _targets, assignedIds) =>
      findPlayerByRoles(teamId, roleKeys, assignedIds),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, _targets, assignedIds, sideSign) =>
      findPlayerByRoles(teamId, roleKeys, assignedIds, sideSign),
    getOffensiveRoleKey: (player) => player?.roleKey ?? null,
    getPitchThreatProfile: () => ({
      betweenLines: 0.34,
      centralPocket: 0.3,
      halfSpace: 0.32,
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerTendency: (player, tendencyKey) => {
      if (player?.id === "H2" && tendencyKey === "overlap") return 0.82;
      if (tendencyKey === "passAndMove" || tendencyKey === "boxRun") return 0.68;
      return 0.5;
    },
    getReceptionSupportTarget: (_teamId, hubPoint, slot) => {
      const offsets = {
        under: { x: -8, y: 5 },
        inside: { x: 2, y: 8 },
        beyond: { x: 12, y: 0 },
        outside: { x: 6, y: -12 },
        weakSide: { x: 8, y: 24 },
        restLink: { x: -16, y: 12 },
      };
      const offset = offsets[slot] ?? { x: 0, y: 0 };
      return { x: hubPoint.x + offset.x, y: hubPoint.y + offset.y };
    },
    getWideSideSign,
    isGoalkeeper: (player) => player?.roleKey === "goalkeeper",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) > 16,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target) return false;
      targets.set(player.id, target);
      return true;
    },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargetMap(state) {
  return new Map(state.players.map((player) => [player.id, { ...player.position }]));
}

function createProfile(overrides = {}) {
  return {
    directness: 0.66,
    overlapBias: 0.65,
    phaseKey: "buildUp",
    shortSupport: 0.68,
    supportCompactness: 0.5,
    switchBias: 0.62,
    ...overrides,
  };
}

test("game simulator autopilot offball passer continuation targets expose moved contracts", () => {
  const passerContinuation = createGameSimulatorAutopilotOffballPasserContinuationTargets(createPasserContinuationDeps());

  expect(typeof passerContinuation.getPasserContinuationTarget).toBe("function");
  expect(typeof passerContinuation.applyPasserContinuationTargets).toBe("function");
  expect(typeof passerContinuation.applyThirdManChainSupportTargets).toBe("function");
});

test("game simulator autopilot offball passer continuation targets move the passer after a pass", () => {
  const deps = createPasserContinuationDeps();
  const passerContinuation = createGameSimulatorAutopilotOffballPasserContinuationTargets(deps);
  const profile = createProfile();
  const passer = deps.state.players.find((player) => player.id === "H2");
  const receiver = deps.state.players.find((player) => player.id === "H7");
  const continuation = passerContinuation.getPasserContinuationTarget(
    "home",
    passer,
    receiver,
    { x: 45, y: 14 },
    { x: 55, y: 18 },
    profile
  );
  expect(continuation.label).toBe("Pass-and-move: overlap after pass");
  expect(continuation.target.x).toBeGreaterThan(55);

  const targets = createTargetMap(deps.state);
  const actionMeta = {
    actionType: "pass",
    beforeSnapshot: { ball: { ownerPlayerId: "H2", position: { x: 45, y: 14 } } },
    carrierPlayerId: "H2",
    receiverPlayerId: "H7",
  };
  expect(
    passerContinuation.applyPasserContinuationTargets("home", targets, { x: 55, y: 18 }, actionMeta, {
      ...profile,
      phaseKey: "setPiece",
    }).labels
  ).toEqual([]);

  const applied = passerContinuation.applyPasserContinuationTargets("home", targets, { x: 55, y: 18 }, actionMeta, profile);
  expect(applied.labels).toEqual(["Pass-and-move: overlap after pass"]);
  expect(applied.protectedIds.has("H2")).toBe(true);
  expect(targets.get("H2").x).toBeGreaterThan(55);
});

test("game simulator autopilot offball passer continuation targets protect third-man chain support", () => {
  const deps = createPasserContinuationDeps();
  const passerContinuation = createGameSimulatorAutopilotOffballPasserContinuationTargets(deps);
  const targets = createTargetMap(deps.state);
  const actionMeta = {
    actionType: "pass",
    autoPrinciples: ["third-man wall pass"],
    beforeSnapshot: { ball: { ownerPlayerId: "H2", position: { x: 45, y: 14 } } },
    carrierPlayerId: "H2",
    receiverPlayerId: "H7",
  };

  const inactive = passerContinuation.applyThirdManChainSupportTargets(
    "home",
    targets,
    { x: 55, y: 18 },
    { ...actionMeta, actionType: "dribble" },
    createProfile()
  );
  expect(inactive.labels).toEqual([]);

  const applied = passerContinuation.applyThirdManChainSupportTargets("home", targets, { x: 55, y: 18 }, actionMeta, createProfile());
  expect(applied.labels).toContain("Third-man chain: bounce support");
  expect(applied.labels).toContain("Third-man chain: next-line runner");
  expect(applied.labels).toContain("Third-man chain: rest link");
  expect(applied.protectedIds.size).toBeGreaterThanOrEqual(3);
  expect(targets.get("H9").x).toBeGreaterThan(55);
});
