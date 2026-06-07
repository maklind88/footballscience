import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceMetrics } from "../src/modules/game-simulator/action-space-metrics.mjs";

function createMetricsDeps(overrides = {}) {
  let state = overrides.state || {
    ball: {
      position: { x: 20, y: 34 },
      target: { x: 32, y: 34 },
      startPosition: { x: 20, y: 34 },
      actionType: "pass",
      profileKey: "auto",
      currentSpeed: 10,
      launchSpeed: 12,
      finalSpeed: 8,
      deceleration: 0,
      elapsedTravelTime: 0,
      inTransit: true,
    },
    players: [
      { id: "H8", team: "home", position: { x: 20, y: 34 }, bodyAngle: 0 },
      { id: "H9", team: "home", position: { x: 36, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", position: { x: 45, y: 34 }, bodyAngle: Math.PI },
    ],
    draftStep: null,
    sequence: { steps: [] },
    surfacePreset: "hybrid",
    weatherPreset: "clear",
  };
  const pitch = { length: 105, width: 68 };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(a - b),
    autoBallProfiles: { pass: { averageSpeed: 10 }, shot: { averageSpeed: 22 } },
    autoDribbleProfiles: { balanced: { averageSpeed: 5 } },
    ballRadiusMeters: 0.11,
    blendAngles: (a, b, weightA = 0.5, weightB = 0.5) => ((a * weightA) + (b * weightB)) / (weightA + weightB),
    buildPlayerIntelligenceProfile: () => ({ vision: 0.7, decision: 0.7 }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: () => 1,
    defensiveAggressionPresets: { balanced: { pressure: 0.5 } },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    firstTouchModes: { auto: { label: "Auto" } },
    getActionSpeed: () => 10,
    getAutoPilotFlowContext: () => ({ recentFrontLineTargets: 0 }),
    getAutoPilotRoleStrength: () => 0.7,
    getBallAwareBodyAngle: () => 0,
    getBallControlOffsetMeters: () => 0,
    getBallOwner: () => state.players[0],
    getCompetitionPhysicalProfile: () => ({ tempo: 1 }),
    getDefensiveAutopilotLineKey: () => "midfield",
    getDefensivePhaseKey: () => "midBlock",
    getFootUsageScore: () => 0.8,
    getGoalkeeperForTeam: () => null,
    getNearestOpponentGap: () => 12,
    getOffensiveAutopilotProfile: () => ({ phaseKey: "buildUp", styleKey: "balanced" }),
    getOffensiveRoleKey: () => "connector",
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPitchLaneIndex: () => 2,
    getPitchLaneKey: () => "central",
    getPlannedPossessionTeamId: () => "home",
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ pressure: 0.2 }),
    getPlayerFacingAngle: () => 0,
    getPlayerMagnetLabel: (player) => player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.5,
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getTeamSupportCountAroundPoint: () => 1,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isFrontLineRole: (roleKey) => roleKey === "striker",
    isSupportRole: (roleKey) => roleKey === "connector",
    keepSecurePossessionOnlyForOwner: () => {},
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from) => from,
    normalize: () => ({ x: 1, y: 0 }),
    normalizeAngle: (angle) => angle,
    pitch,
    pitchSurfacePresets: { hybrid: { ballSpeed: 1 } },
    playerRadiusMeters: 0.6,
    projectPointOnSegmentWithRatio: () => ({ point: { x: 30, y: 34 }, ratio: 0.5 }),
    rotatePlayerBodyTowardAngle: () => {},
    setSecurePossessionAfterControlledTouch: () => {},
    subtract: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    vec: (x, y) => ({ x, y }),
    weatherPresets: { clear: { ballSpeed: 1 } },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space metrics expose moved helpers", () => {
  const metrics = createGameSimulatorActionSpaceMetrics(createMetricsDeps());

  expect(typeof metrics.getRemainingBallDistance).toBe("function");
  expect(typeof metrics.getPitchThreatProfile).toBe("function");
  expect(typeof metrics.resolveBallActionProfile).toBe("function");
  expect(typeof metrics.getShotWindowProfile).toBe("function");
});

test("game simulator action space metrics read live state through dependency boundary", () => {
  const deps = createMetricsDeps();
  const metrics = createGameSimulatorActionSpaceMetrics(deps);

  expect(metrics.getRemainingBallDistance()).toBe(12);

  deps.replaceState({
    ball: {
      position: { x: 20, y: 34 },
      target: { x: 50, y: 34 },
      startPosition: { x: 20, y: 34 },
      actionType: "pass",
      inTransit: true,
    },
    players: [],
    sequence: { steps: [] },
  });

  expect(metrics.getRemainingBallDistance()).toBe(30);
});
