import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets } from "../src/modules/game-simulator/autopilot-offball-post-recovery-attack-support-targets.mjs";

const pitch = { length: 105, width: 68 };

function createPostRecoveryDeps(overrides = {}) {
  const players = overrides.players ?? [
    { id: "H10", team: "home", roleKey: "connector", position: { x: 48, y: 30 } },
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 47, y: 34 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 54, y: 31 } },
    { id: "H7", team: "home", roleKey: "wideBack", position: { x: 50, y: 15 } },
    { id: "H9", team: "home", roleKey: "striker", position: { x: 62, y: 32 } },
    { id: "H11", team: "home", roleKey: "wideForward", position: { x: 58, y: 16 } },
    { id: "H12", team: "home", roleKey: "secondStriker", position: { x: 59, y: 40 } },
    { id: "H5", team: "home", roleKey: "rest", position: { x: 38, y: 34 } },
    { id: "A4", team: "away", roleKey: "back", position: { x: 68, y: 33 } },
  ];
  const state = overrides.state ?? {
    players,
    ball: {
      actionType: "pass",
      position: { x: 48, y: 30 },
      ownerPlayerId: "H10",
      initiatorPlayerId: "H10",
      receiverPlayerId: "H8",
    },
    sequence: {
      steps: [
        {
          actionType: "recovery",
          profileKey: "loose-ball-recovery",
          teamId: "home",
          target: { x: 43, y: 31 },
          duration: 1,
        },
        {
          actionType: "pass",
          teamId: "home",
          target: { x: 48, y: 30 },
          duration: 1,
          pattern: { family: "secure", forwardGain: 4, laneKey: "center" },
        },
      ],
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionSpaceValue: () => ({
      value: 0.58,
      lineBreakCount: 1,
      openTarget: 0.76,
      targetPressure: 0.22,
      targetThreat: {
        assistZone: 0.18,
        behindLine: 0.24,
        box: 0.12,
        centralPocket: 0.32,
        cutbackZone: 0.08,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getCarryLaneOpenSpaceScore: () => 0.82,
    getDepthPoint: (teamId, depth, overrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overrides.y ?? pitch.width / 2,
    }),
    getMovableAutopilotPlayerByRoles: (teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) =>
        player.team === teamId &&
        roleKeys.includes(player.roleKey) &&
        targets.has(player.id) &&
        !excludedIds.has(player.id)
      ) ?? null,
    getMovableAutopilotPlayerByRolesOnSide: (teamId, roleKeys, targets, excludedIds = new Set()) =>
      players.find((player) =>
        player.team === teamId &&
        roleKeys.includes(player.roleKey) &&
        targets.has(player.id) &&
        !excludedIds.has(player.id)
      ) ?? null,
    getNearestOpponentGapInCarryLane: () => 14,
    getOpponentPressureAtPoint: () => 0.22,
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.18,
    getRecordedStepDuration: (step) => step?.duration ?? 1,
    getRecordedStepPattern: (step) => step?.pattern ?? { family: "secure", forwardGain: 4, laneKey: "center" },
    getRecordedStepPossessionTeamId: (step) => step?.teamId,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.roleKey === "goalkeeper",
    isTransitionAttackStyle: (styleKey) => styleKey === "direct",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !targets.has(player.id)) {
        return false;
      }
      targets.set(player.id, target);
      return true;
    },
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offball post-recovery attack support targets expose moved contracts", () => {
  const targets = createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets(createPostRecoveryDeps());

  expect(typeof targets.getPostRecoveryAttackSupportContext).toBe("function");
  expect(typeof targets.getPostRecoveryAttackSupportTarget).toBe("function");
  expect(typeof targets.applyPostRecoveryAttackSupportTargets).toBe("function");
});

test("game simulator autopilot offball post-recovery attack support targets read context with local support fallback", () => {
  const targets = createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets(createPostRecoveryDeps());

  const context = targets.getPostRecoveryAttackSupportContext(
    "home",
    { x: 62, y: 28 },
    {
      actionType: "pass",
      beforeSnapshot: { ball: { position: { x: 48, y: 30 }, ownerPlayerId: "H10" } },
      receiverPlayerId: "H8",
      target: { x: 62, y: 28 },
    },
    { directness: 0.68, progressionUrgency: 0.62, styleKey: "direct" }
  );

  expect(context.active).toBe(true);
  expect(context.mode).toBe("counter");
  expect(context.localSupport).toBeGreaterThan(0);
  expect(context.forwardOpenSpace).toBeGreaterThan(0.7);
});

test("game simulator autopilot offball post-recovery attack support targets preserve target geometry", () => {
  const targets = createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets(createPostRecoveryDeps());
  const context = {
    targetPoint: { x: 62, y: 28 },
    startPoint: { x: 48, y: 30 },
    finalThirdCue: false,
    sideSign: -1,
  };

  const runner = targets.getPostRecoveryAttackSupportTarget(
    "home",
    context,
    "counterRunner",
    -1,
    { directness: 0.72 }
  );
  const restLock = targets.getPostRecoveryAttackSupportTarget(
    "home",
    context,
    "restLock",
    -1,
    { restBehind: 22 }
  );

  expect(runner.x).toBeGreaterThan(75);
  expect(restLock.x).toBeLessThan(62);
  expect(restLock.y).toBeGreaterThan(28);
});

test("game simulator autopilot offball post-recovery attack support targets assign support chain", () => {
  const postRecovery = createGameSimulatorAutopilotOffballPostRecoveryAttackSupportTargets(createPostRecoveryDeps());
  const targets = new Map([
    ["H6", { x: 47, y: 34 }],
    ["H7", { x: 50, y: 15 }],
    ["H8", { x: 54, y: 31 }],
    ["H9", { x: 62, y: 32 }],
    ["H11", { x: 58, y: 16 }],
    ["H12", { x: 59, y: 40 }],
    ["H5", { x: 38, y: 34 }],
  ]);

  const result = postRecovery.applyPostRecoveryAttackSupportTargets(
    "home",
    targets,
    { x: 62, y: 28 },
    {
      actionType: "pass",
      beforeSnapshot: { ball: { position: { x: 48, y: 30 }, ownerPlayerId: "H10" } },
      carrierPlayerId: "H10",
      receiverPlayerId: "H8",
      target: { x: 62, y: 28 },
    },
    { directness: 0.72, progressionUrgency: 0.68, styleKey: "direct", widthDiscipline: 0.7 },
    new Set()
  );

  expect(result.labels).toContain("Post-recovery attacking support: counter");
  expect(result.labels).toContain("Post-recovery attack: depth runner");
  expect(result.labels).toContain("Post-recovery attack: rest-defence lock");
  expect(result.protectedIds.has("H9")).toBe(true);
  expect(targets.get("H9").x).toBeGreaterThan(75);
  expect(targets.get("H5").x).toBeLessThan(62);
});
