import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveEngine } from "../src/modules/game-simulator/autopilot-live-engine.mjs";

function createLiveEngineDeps(overrides = {}) {
  let state = overrides.state || {
    ball: {
      position: { x: 52, y: 34 },
      target: { x: 58, y: 30 },
      actionType: "pass",
      ownerPlayerId: "H8",
    },
    players: [
      { id: "H8", team: "home", role: "CM", position: { x: 45, y: 34 }, targetPosition: { x: 45, y: 34 } },
      { id: "A6", team: "away", role: "DM", position: { x: 58, y: 34 }, targetPosition: { x: 58, y: 34 } },
    ],
    draftStep: null,
    sequence: { steps: [] },
  };
  const pitch = { length: 105, width: 68 };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(a - b),
    buildDefensiveAutopilotTargets: () => new Map(),
    buildOffensiveAutopilotTargets: () => new Map(),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: () => 0.8,
    defensiveAutopilotProfiles: { balanced: { key: "balanced" } },
    defensivePhaseProfiles: { midBlock: { key: "midBlock" } },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionInitiator: () => state.players[0],
    getActionOrigin: (player) => player.position,
    getActionSpaceValue: () => 0.4,
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackStyleRhythmProfile: () => ({ tempo: 1 }),
    getAttackingGameSpaceProfile: () => ({ value: 0.5 }),
    getAutoPilotRoleStrength: () => 0.7,
    getBallNearSupportTriangleTarget: () => ({ x: 50, y: 34 }),
    getCurrentActionDuration: () => 0,
    getDefensiveDribblePressTarget: () => ({ x: 52, y: 34 }),
    getDefensiveThreatResponse: () => ({ pressure: 0.5 }),
    getDribblePressureReference: () => ({ point: { x: 52, y: 34 } }),
    getFormationPositions: () => [],
    getKickoffDefensivePhaseKey: () => "midBlock",
    getOpponentPressureAtPoint: () => 0.2,
    getOrientationTurnDelay: () => 0,
    getOrientationMovementProfile: () => ({ speedMultiplier: 1, recoveryModifier: 1 }),
    getPitchSurfacePreset: () => ({ playerSpeed: 1 }),
    getPitchThreatProfile: () => ({ value: 0.4, depth: 45, centrality: 0.5 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ pressure: 0.2, profile: { decisionSpeed: 0.8, tacticalDiscipline: 0.8 } }),
    getPlayerFacingAngle: () => 0,
    getPlayerMagnetLabel: (player) => player.role,
    getPlayerPressureLoad: () => 0.2,
    getProjectedActionDuration: () => 0,
    getSecondLastOpponentLineX: () => 55,
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getTeamAttackStyleKey: () => "balanced",
    getTeamAttackStyleProfile: () => ({ tempo: 1 }),
    getTeamDefenseStyleKey: () => "balanced",
    getTeamDefenseStyleProfile: () => ({ preferredPhase: "midBlock" }),
    getWeatherPreset: () => ({ playerSpeed: 1 }),
    getWideSideSign: (pointOrPlayer) => ((pointOrPlayer?.y ?? pointOrPlayer?.position?.y ?? 34) < pitch.width / 2 ? -1 : 1),
    hasBallAction: () => false,
    isAerialFlightStyle: () => false,
    isGoalkeeper: (player) => player?.role === "GK",
    lerp: (start, end, weight) => start + (end - start) * weight,
    logEvent: () => {},
    materializeBallProfile: (profile) => profile,
    moveTowards: (from, to, maxDistance) => {
      const gap = Math.hypot(to.x - from.x, to.y - from.y);
      if (!gap || gap <= maxDistance) return { ...to };
      return { x: from.x + ((to.x - from.x) / gap) * maxDistance, y: from.y + ((to.y - from.y) / gap) * maxDistance };
    },
    normalize: (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    },
    normalizeAngle: (angle) => angle,
    offensiveAutopilotProfiles: { balanced: { key: "balanced" } },
    offensivePhaseProfiles: { buildUp: { key: "buildUp" } },
    pitch,
    resolveBallCurveDirection: () => 0,
    rotatePlayerBodyAlongMovement: () => {},
    rotatePlayerBodyToward: () => {},
    teamRosterOrder: { home: ["H8"], away: ["A6"] },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    updateActionPlayers: () => {},
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live engine exposes moved movement and line helpers", () => {
  const engine = createGameSimulatorAutopilotLiveEngine(createLiveEngineDeps());

  expect(typeof engine.getDefensiveAutopilotFocusPoint).toBe("function");
  expect(typeof engine.getDefensiveAutoV2Intent).toBe("function");
  expect(typeof engine.applyDefensiveAutoV2RelationshipLayer).toBe("function");
  expect(typeof engine.moveDefensiveAutoV2Player).toBe("function");
  expect(typeof engine.alignArrivedDefensiveAutopilotPlayers).toBe("function");
  expect(typeof engine.computeTimeToCoverDistance).toBe("function");
  expect(typeof engine.getActionSpeed).toBe("function");
  expect(typeof engine.configureBallTravelProfile).toBe("function");
  expect(typeof engine.getActionDistance).toBe("function");
  expect(typeof engine.getRequestedActionMode).toBe("function");
  expect(typeof engine.getOffensiveAutopilotFocusPoint).toBe("function");
  expect(typeof engine.getOtherTeamId).toBe("function");
  expect(typeof engine.getOffensivePhaseKey).toBe("function");
  expect(typeof engine.getOffensiveRoleKey).toBe("function");
  expect(typeof engine.getPitchLaneKey).toBe("function");
  expect(typeof engine.getDefensivePhaseKey).toBe("function");
  expect(typeof engine.getDefensiveAutopilotLineKey).toBe("function");
  expect(typeof engine.getDefensiveAutopilotProfile).toBe("function");
  expect(typeof engine.getDefensiveLineActionAdjustment).toBe("function");
  expect(typeof engine.getDefensiveLineDistanceFromOwnGoal).toBe("function");
  expect(typeof engine.getDefensiveLineX).toBe("function");
  expect(typeof engine.getDefensiveLineWidth).toBe("function");
  expect(typeof engine.getDefensiveLineCenterY).toBe("function");
  expect(typeof engine.enforceDefensiveUnitCompactness).toBe("function");
  expect(typeof engine.getDefensiveUnitGap).toBe("function");
  expect(typeof engine.enforceDefensiveLineChainSpacing).toBe("function");
  expect(typeof engine.enforceDefensiveVerticalBlockConnections).toBe("function");
  expect(typeof engine.enforceDefensiveMeasuredBlockEnvelope).toBe("function");
  expect(typeof engine.enforceDefensiveCollectiveShiftCohesion).toBe("function");
  expect(typeof engine.getDefensiveCompactLineIntegritySettings).toBe("function");
  expect(typeof engine.enforceDefensiveCompactLineIntegrity).toBe("function");
  expect(typeof engine.scanAutoV2DecisionTriggers).toBe("function");
  expect(typeof engine.applyOffensiveAutoV2RelationshipLayer).toBe("function");
  expect(typeof engine.buildOffensiveAutoV2Intents).toBe("function");
  expect(typeof engine.getRecentPossessionSteps).toBe("function");
  expect(typeof engine.getRecordedStepPossessionTeamId).toBe("function");
  expect(typeof engine.getPossessionRhythmContext).toBe("function");
  expect(typeof engine.getLaneForSideSign).toBe("function");
  expect(typeof engine.getWideOverlapPrincipleFit).toBe("function");
  expect(typeof engine.getWideOverlapRunTarget).toBe("function");
  expect(typeof engine.moveOffensiveAutoV2Player).toBe("function");
  expect(typeof engine.applyAutopilotsForCurrentAction).toBe("function");
});

test("game simulator autopilot live engine reads current state through dependency boundary", () => {
  const deps = createLiveEngineDeps();
  const engine = createGameSimulatorAutopilotLiveEngine(deps);

  expect(engine.getDefensiveAutopilotFocusPoint({ defensiveAutopilot: { teamId: "away" } })).toEqual({ x: 58, y: 30 });

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, target: { x: 60, y: 40 } },
  });
  expect(engine.getDefensiveAutopilotFocusPoint({ defensiveAutopilot: { teamId: "away" } })).toEqual({ x: 60, y: 40 });
});
