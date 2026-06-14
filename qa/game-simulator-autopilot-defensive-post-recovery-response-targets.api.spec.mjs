import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets } from "../src/modules/game-simulator/autopilot-defensive-post-recovery-response-targets.mjs";

function createPostRecoveryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    players: [
      { id: "H8", team: "home", position: { x: 62, y: 34 }, roleKey: "connector" },
      { id: "H9", team: "home", position: { x: 82, y: 31 }, roleKey: "striker" },
      { id: "H10", team: "home", position: { x: 77, y: 28 }, roleKey: "wideForward" },
      { id: "A1", team: "away", position: { x: 102, y: 34 }, roleKey: "goalkeeper" },
      { id: "A4", team: "away", position: { x: 88, y: 30 }, roleKey: "centerBack" },
      { id: "A5", team: "away", position: { x: 88, y: 38 }, roleKey: "centerBack" },
      { id: "A6", team: "away", position: { x: 78, y: 33 }, roleKey: "pivot" },
      { id: "A8", team: "away", position: { x: 76, y: 38 }, roleKey: "connector" },
      { id: "A9", team: "away", position: { x: 70, y: 34 }, roleKey: "striker" },
    ],
    ball: {
      actionType: "pass",
      startPosition: { x: 62, y: 34 },
      target: { x: 78, y: 31 },
      position: { x: 78, y: 31 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 78, y: 31 },
      receiverPlayerId: "H10",
      carrierPlayerId: "H8",
      beforeSnapshot: {
        ball: {
          position: { x: 62, y: 34 },
          ownerPlayerId: "H8",
        },
      },
      autoPrinciples: ["Line break"],
    },
    sequence: {
      steps: [
        {
          actionType: "recovery",
          profileKey: "loose-ball-recovery",
          possessionTeamId: "home",
          duration: 1.2,
          target: { x: 56, y: 33 },
        },
        {
          actionType: "pass",
          possessionTeamId: "home",
          duration: 2.2,
          target: { x: 65, y: 34 },
        },
      ],
    },
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.72,
      lineBreakCount: 1,
      targetPressure: 0.3,
      targetThreat: {
        value: 0.66,
        behindLine: 0.28,
        centralPocket: 0.34,
        box: 0.18,
        cutbackZone: 0.22,
        assistZone: 0.34,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDepthX: (teamId, depth) => (teamId === "away" ? pitch.length - depth : depth),
    getDistanceFromOwnGoal: (teamId, point) => Math.abs((teamId === "away" ? pitch.length : 0) - point.x),
    getOffensiveAutopilotProfile: () => ({ styleKey: "counter-attack" }),
    getOffensiveRoleKey: (player) => player.roleKey,
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchLaneIndex: (point) => (point.y <= 22 ? 0 : point.y >= 46 ? 4 : 2),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 76 ? 0.62 : 0.42,
      box: point.x >= 82 ? 0.2 : 0.12,
      centralPocket: point.y >= 26 && point.y <= 42 ? 0.3 : 0.12,
      cutbackZone: 0.16,
      assistZone: point.x >= 76 ? 0.28 : 0.12,
    }),
    getPlannedPossessionTeamId: () => "home",
    getRecordedStepDuration: (step) => step.duration ?? 0,
    getRecordedStepPattern: (step) => ({
      family: step.actionType === "pass" ? "line-break" : "secure",
      forwardGain: step.actionType === "pass" ? 9 : 0,
      laneKey: "central",
    }),
    getRecordedStepPossessionTeamId: (step) => step.possessionTeamId,
    getTeamSupportCountAroundPoint: (teamId) => (teamId === "away" ? 1 : 2),
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0),
    isGoalkeeper: (player) => player.roleKey === "goalkeeper",
    isTransitionAttackStyle: (styleKey) => ["counter-attack", "direct-transition"].includes(styleKey),
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => {
      for (const lineKey of lineKeys) {
        const player = (groups[lineKey] ?? []).find((candidate) => !excludedIds.has(candidate.id));
        if (player) {
          return player;
        }
      }
      return null;
    },
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createGroups() {
  return {
    gk: [{ id: "A1", team: "away", position: { x: 102, y: 34 }, roleKey: "goalkeeper" }],
    back: [
      { id: "A4", team: "away", position: { x: 88, y: 30 }, roleKey: "centerBack", shortLabel: "CB" },
      { id: "A5", team: "away", position: { x: 88, y: 38 }, roleKey: "centerBack", shortLabel: "CB" },
    ],
    midfield: [
      { id: "A6", team: "away", position: { x: 78, y: 33 }, roleKey: "pivot", shortLabel: "6" },
      { id: "A8", team: "away", position: { x: 76, y: 38 }, roleKey: "connector", shortLabel: "8" },
    ],
    forward: [{ id: "A9", team: "away", position: { x: 70, y: 34 }, roleKey: "striker", shortLabel: "9" }],
  };
}

test("game simulator autopilot defensive post recovery response targets expose moved contracts", () => {
  const postRecovery = createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets(createPostRecoveryDeps());

  expect(typeof postRecovery.getDefensivePostRecoveryResponseContext).toBe("function");
  expect(typeof postRecovery.getDefensivePostRecoveryResponseTarget).toBe("function");
  expect(typeof postRecovery.getDefensivePostRecoveryOutletOptions).toBe("function");
  expect(typeof postRecovery.applyDefensivePostRecoveryResponseTargets).toBe("function");
});

test("game simulator autopilot defensive post recovery response targets detect counter response context", () => {
  const postRecovery = createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets(createPostRecoveryDeps());

  const context = postRecovery.getDefensivePostRecoveryResponseContext(
    "away",
    { x: 78, y: 31 },
    { styleKey: "counter-press", pressingIntensity: 0.7 }
  );

  expect(context.active).toBe(true);
  expect(context.mode).toBe("delayCounter");
  expect(context.transitionThreat).toBe(true);
  expect(context.finalThirdThreat).toBe(true);
  expect(context.actionsAfterRecovery).toBe(1);
});

test("game simulator autopilot defensive post recovery response targets calculate targets and outlets", () => {
  const postRecovery = createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets(createPostRecoveryDeps());
  const context = postRecovery.getDefensivePostRecoveryResponseContext("away", { x: 78, y: 31 }, { styleKey: "counter-press", pressingIntensity: 0.7 });

  const centralGate = postRecovery.getDefensivePostRecoveryResponseTarget("away", context, "centralGate");
  const boxCover = postRecovery.getDefensivePostRecoveryResponseTarget("away", context, "boxCover");
  const outlets = postRecovery.getDefensivePostRecoveryOutletOptions(context);

  expect(centralGate.x).toBeGreaterThan(50);
  expect(centralGate.y).toBeGreaterThan(30);
  expect(boxCover.x).toBeGreaterThan(80);
  expect(outlets[0].player.team).toBe("home");
});

test("game simulator autopilot defensive post recovery response targets assign recovery shape", () => {
  const postRecovery = createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets(createPostRecoveryDeps());
  const targets = new Map();
  const result = postRecovery.applyDefensivePostRecoveryResponseTargets(
    "away",
    targets,
    createGroups(),
    null,
    { x: 78, y: 31 },
    { styleKey: "counter-press", pressingIntensity: 0.7 }
  );

  expect(result.labels).toContain("Defend post-recovery counter");
  expect(result.labels).toContain("Post-recovery defence: close central gate");
  expect(result.focusPoint).toEqual({ x: 78, y: 31 });
  expect(targets.size).toBeGreaterThanOrEqual(4);
  expect(result.protectedIds.has("A1")).toBe(true);
});
