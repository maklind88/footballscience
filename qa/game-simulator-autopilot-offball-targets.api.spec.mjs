import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballTargets } from "../src/modules/game-simulator/autopilot-offball-targets.mjs";

function createOffballDeps(overrides = {}) {
  let state = overrides.state || {
    players: [
      { id: "H1", team: "home", position: { x: 35, y: 14 }, role: "Left Back" },
      { id: "H2", team: "home", position: { x: 44, y: 20 }, role: "Left Winger" },
      { id: "A1", team: "away", position: { x: 62, y: 34 }, role: "Centre Back" },
    ],
    sequence: { steps: [] },
  };
  const pitch = { length: 105, width: 68 };
  return {
    addPointNoise: (point) => point,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    gameRoleProfiles: {},
    getActionSpaceValue: () => ({
      value: 0.5,
      lineBreakCount: 1,
      openTarget: 0.7,
      targetPressure: 0.2,
      startThreat: { value: 0.3, centralPocket: 0.1 },
      targetThreat: { value: 0.5, box: 0.1, centralPocket: 0.2, betweenLines: 0.2, cutbackZone: 0 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({
      key: "space2",
      index: 2,
      lineDepths: { forward: 30, midfield: 45, back: 65 },
      nextLineDepth: 65,
    }),
    getAutoPilotPossessionPlan: () => ({ route: { lanes: ["leftHalf"] }, opening: { lanes: ["leftWide"] } }),
    getAutoPilotPossessionRouteStage: () => 1,
    getAutoPilotRoleStrength: () => 0.7,
    getCarryLaneOpenSpaceScore: () => 0.8,
    getDefensiveAutopilotLineKey: () => "back",
    getDepthX: (teamId, depth) => (teamId === "home" ? depth : pitch.length - depth),
    getFormationPositions: () => [{ x: 35, y: 14 }, { x: 42, y: 20 }],
    getLaneCenterY: () => 20,
    getNearestOpponentGapInCarryLane: () => 12,
    getNearestOpponentGapToPoint: () => 12,
    getOffensiveAutopilotProfile: () => ({ phaseKey: "buildUp", styleKey: "balanced", widthDiscipline: 0.7, switchBias: 0.5, overlapBias: 0.6 }),
    getOffensivePhaseKey: () => "buildUp",
    getOffensiveRoleKey: (player) => (player.role.includes("Back") ? "wideBack" : player.role.includes("Winger") ? "wideForward" : "connector"),
    getOpponentBlockReadProfile: () => ({ ballSideCompression: 0.2, lineGap: 0.2, highLine: 0.1, deepBlock: 0.1, nearBallPressure: 0.2 }),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentLineDepthsForAttackingTeam: () => ({ forward: 30, midfield: 45, back: 65 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: 34 }),
    getOpponentPressureAtPoint: () => 0.2,
    getPitchLaneIndex: () => 1,
    getPitchLaneKey: () => "leftHalf",
    getPitchSpaceProfile: () => ({ value: 0.4, box: 0.1, cutbackZone: 0, gameSpaceIndex: 2, depth: 45 }),
    getPitchThreatProfile: () => ({ value: 0.4, box: 0.1, cutbackZone: 0, centralPocket: 0.2, betweenLines: 0.2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerMagnetLabel: (player) => player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.5,
    getPossessionRhythmContext: () => ({ steps: 0, duration: 1 }),
    getRecordedStepDuration: () => 1,
    getRecordedStepPattern: () => ({ family: "secure", lane: "leftHalf" }),
    getRecordedStepPossessionTeamId: () => "home",
    getSecondLastOpponentLineX: () => 58,
    getSecurePossessionSnapshotForTeam: () => null,
    getShotWindowProfile: () => ({ quality: 0.5 }),
    getSideLaneKeys: () => ["leftWide", "leftHalf"],
    getState: () => state,
    getWideOverlapPrincipleFit: () => 1,
    getWideOverlapRunTarget: (teamId, point) => point,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isAerialFlightStyle: () => false,
    isFrontLineRole: (roleKey) => roleKey === "wideForward" || roleKey === "striker",
    isGoalkeeper: () => false,
    isTransitionAttackStyle: () => false,
    isWideChannel: () => false,
    isWidePrincipleZone: () => true,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 10 }),
    teamRosterOrder: { home: ["H1", "H2"], away: ["A1"] },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot offball targets expose moved target helpers", () => {
  const offball = createGameSimulatorAutopilotOffballTargets(createOffballDeps());

  expect(typeof offball.chooseWideOverlapRunner).toBe("function");
  expect(typeof offball.applyGenerativePrincipleSupportTargets).toBe("function");
  expect(typeof offball.applyGameSpaceOffBallPrincipleTargets).toBe("function");
  expect(typeof offball.getHighValueAttackTarget).toBe("function");
});

test("game simulator autopilot offball targets read live state through dependency boundary", () => {
  const deps = createOffballDeps();
  const offball = createGameSimulatorAutopilotOffballTargets(deps);

  expect(offball.getSameSideWideBacks("home", -1).map((player) => player.id)).toEqual(["H1"]);

  deps.replaceState({
    players: [{ id: "H9", team: "home", position: { x: 38, y: 12 }, role: "Left Back" }],
    sequence: { steps: [] },
  });

  expect(offball.getSameSideWideBacks("home", -1).map((player) => player.id)).toEqual(["H9"]);
});
