import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballSpaceTwoTargets } from "../src/modules/game-simulator/autopilot-offball-space-two-targets.mjs";

function createSpaceTwoDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state =
    overrides.state ??
    {
      ball: {
        actionType: "pass",
        carrierPlayerId: "H8",
        initiatorPlayerId: "H8",
        position: { x: 48, y: 24 },
        receiverPlayerId: "H9",
        startPosition: { x: 48, y: 24 },
        target: { x: 58, y: 22 },
      },
      players: [
        { id: "H2", team: "home", roleKey: "wideBack", position: { x: 46, y: 12 } },
        { id: "H6", team: "home", roleKey: "pivot", position: { x: 45, y: 34 } },
        { id: "H7", team: "home", roleKey: "wideForward", position: { x: 55, y: 18 } },
        { id: "H8", team: "home", roleKey: "connector", position: { x: 48, y: 24 } },
        { id: "H9", team: "home", roleKey: "striker", position: { x: 61, y: 32 } },
        { id: "H10", team: "home", roleKey: "connector", position: { x: 54, y: 26 } },
        { id: "H11", team: "home", roleKey: "wideForward", position: { x: 56, y: 52 } },
        { id: "H12", team: "home", roleKey: "wideBack", position: { x: 45, y: 58 } },
        { id: "H13", team: "home", roleKey: "secondStriker", position: { x: 63, y: 38 } },
        { id: "H14", team: "home", roleKey: "connector", position: { x: 53, y: 42 } },
        { id: "H15", team: "home", roleKey: "rest", position: { x: 42, y: 34 } },
      ],
    };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getWideSideSign = (pointOrPlayer) => {
    const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
    return y < pitch.width / 2 ? -1 : 1;
  };
  const roleKeyFor = (player) => player?.roleKey ?? null;
  const canUsePlayer = (player, teamId, roleKeys, assignedIds) =>
    player?.team === teamId && roleKeys.includes(roleKeyFor(player)) && !assignedIds.has(player.id);
  const findPlayerByRoles = (teamId, roleKeys, assignedIds, sideSign = null) => {
    for (const roleKey of roleKeys) {
      const player = state.players.find(
        (candidate) =>
          canUsePlayer(candidate, teamId, [roleKey], assignedIds) &&
          (sideSign === null || getWideSideSign(candidate) === sideSign)
      );
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
    getActionSpaceValue: () => ({
      forwardGain: 10,
      gameSpaceGain: 1,
      lineBreakCount: 1,
      targetGameSpaceKey: "space2",
      value: 0.52,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2" }),
    getDepthPoint: (teamId, depth, pointOverrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: pointOverrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, _targets, assignedIds) =>
      findPlayerByRoles(teamId, roleKeys, assignedIds),
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, _targets, assignedIds, sideSign) =>
      findPlayerByRoles(teamId, roleKeys, assignedIds, sideSign),
    getOffensiveAutopilotProfile: () => ({
      directness: 0.7,
      overlapBias: 0.65,
      restBehind: 22,
      runnerBoost: 0.7,
      shortSupport: 0.78,
      switchBias: 0.62,
      width: 58,
      widthDiscipline: 0.7,
    }),
    getOffensivePhaseKey: () => "buildUp",
    getOpponentPressureAtPoint: () => 0.5,
    getPitchThreatProfile: () => ({
      behindLine: 0.24,
      betweenLines: 0.36,
      centralPocket: 0.35,
      halfSpace: 0.38,
    }),
    getWideSideSign,
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) > 16,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target) return false;
      targets.set(player.id, target);
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createTargetMap(state) {
  return new Map(state.players.map((player) => [player.id, { ...player.position }]));
}

function createSpaceTwoProfile(overrides = {}) {
  return {
    directness: 0.7,
    overlapBias: 0.65,
    phaseKey: "buildUp",
    restBehind: 22,
    runnerBoost: 0.7,
    shortSupport: 0.78,
    switchBias: 0.62,
    width: 58,
    widthDiscipline: 0.7,
    ...overrides,
  };
}

test("game simulator autopilot offball space two targets expose moved contracts", () => {
  const spaceTwo = createGameSimulatorAutopilotOffballSpaceTwoTargets(createSpaceTwoDeps());

  expect(typeof spaceTwo.getSpaceTwoForwardFacingTarget).toBe("function");
  expect(typeof spaceTwo.applySpaceTwoForwardFacingTargets).toBe("function");
  expect(typeof spaceTwo.getSpaceTwoContinuationContext).toBe("function");
  expect(typeof spaceTwo.getSpaceTwoContinuationTarget).toBe("function");
  expect(typeof spaceTwo.applySpaceTwoContinuationTargets).toBe("function");
});

test("game simulator autopilot offball space two targets shape forward-facing support around the hub", () => {
  const deps = createSpaceTwoDeps();
  const spaceTwo = createGameSimulatorAutopilotOffballSpaceTwoTargets(deps);
  const profile = createSpaceTwoProfile();
  const actionMeta = {
    actionType: "pass",
    beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 48, y: 24 } } },
    carrierPlayerId: "H8",
    offensiveAutopilot: { principleKey: "space 2 forward" },
    receiverPlayerId: "H9",
  };

  expect(
    spaceTwo.applySpaceTwoForwardFacingTargets("home", createTargetMap(deps.state), { x: 58, y: 22 }, actionMeta, {
      ...profile,
      phaseKey: "setPiece",
    }).labels
  ).toEqual([]);
  expect(
    spaceTwo.applySpaceTwoForwardFacingTargets(
      "home",
      createTargetMap(deps.state),
      { x: 58, y: 22 },
      { ...actionMeta, actionType: "shot" },
      profile
    ).labels
  ).toEqual([]);

  const nextLineTarget = spaceTwo.getSpaceTwoForwardFacingTarget("home", { x: 58, y: 22 }, "nextLinePin", -1, profile);
  const restTarget = spaceTwo.getSpaceTwoForwardFacingTarget("home", { x: 58, y: 22 }, "restLock", -1, profile);
  expect(nextLineTarget.x).toBeGreaterThan(58);
  expect(restTarget.x).toBeLessThan(58);

  const targets = createTargetMap(deps.state);
  const applied = spaceTwo.applySpaceTwoForwardFacingTargets("home", targets, { x: 58, y: 22 }, actionMeta, profile);
  expect(applied.labels).toContain("Space 2: bounce support");
  expect(applied.labels).toContain("Space 2: pin next line");
  expect(applied.labels).toContain("Space 2: rest-defence lock");
  expect(applied.protectedIds.size).toBeGreaterThanOrEqual(3);
  expect(targets.get("H6").x).toBeLessThan(58);
});

test("game simulator autopilot offball space two targets continue attacks with third-man and rest-shield support", () => {
  const deps = createSpaceTwoDeps();
  const spaceTwo = createGameSimulatorAutopilotOffballSpaceTwoTargets(deps);
  const profile = createSpaceTwoProfile();
  const actionMeta = {
    actionType: "pass",
    autoPrinciples: ["third-man space 2"],
    beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 48, y: 24 } } },
    carrierPlayerId: "H8",
    receiverPlayerId: "H9",
  };

  const context = spaceTwo.getSpaceTwoContinuationContext("home", { x: 66, y: 22 }, actionMeta, profile);
  expect(context.mode).toBe("finalThird");
  expect(context.targetDepth).toBe(66);

  const runnerTarget = spaceTwo.getSpaceTwoContinuationTarget("home", context, "runnerBeyond");
  expect(runnerTarget.x).toBeGreaterThan(context.hubPoint.x);

  const targets = createTargetMap(deps.state);
  const applied = spaceTwo.applySpaceTwoContinuationTargets("home", targets, { x: 66, y: 22 }, actionMeta, profile);
  expect(applied.labels).toContain("Space 2 continuation: third-man release");
  expect(applied.labels).toContain("Space 2 continuation: run beyond");
  expect(applied.labels).toContain("Space 2 continuation: rest shield");
  expect(applied.protectedIds.size).toBeGreaterThanOrEqual(3);
});
