import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceBallProfiles } from "../src/modules/game-simulator/action-space-ball-profiles.mjs";

const pitch = { length: 105, width: 68 };

function createBallProfileTemplate(key, label, overrides = {}) {
  return {
    key,
    label,
    minDistance: 0,
    maxDistance: 45,
    averageSpeedRange: [9, 13],
    launchMultiplierRange: [1, 1.16],
    rollFloorRange: [1.1, 2.2],
    flightStyle: "ground",
    peakHeightRange: [0, 0],
    controlHeightRange: [0.12, 0.12],
    landingPhaseRange: [0.58, 0.58],
    curveRange: [0, 0],
    spinRateRange: [0, 0],
    ...overrides,
  };
}

function createBallProfilesDeps(overrides = {}) {
  const { state: overrideState, ...restOverrides } = overrides;
  let state = overrideState ?? {
    time: 0,
    ballSpeedMode: "auto",
    dribbleSpeed: 5.2,
    dribbleSpeedMode: "auto",
    surfacePreset: "hybrid-grass",
    weatherPreset: "damp",
    defensiveAggressionPreset: "balanced",
    ball: {
      position: { x: 20, y: 34 },
      target: { x: 34, y: 34 },
      startPosition: { x: 20, y: 34 },
      actionType: "pass",
      manualSpeed: 11,
      speed: 10,
      currentSpeed: 10,
      launchSpeed: 12,
      finalSpeed: 8,
      elapsedTravelTime: 0,
      inTransit: true,
      trackDistanceCovered: 0,
      trackDistanceTotal: 0,
      flightStyle: "ground",
      peakHeight: 0,
      height: 0,
      controlHeightThreshold: 0.12,
      landingPhaseStart: 0.58,
    },
    players: [
      { id: "H8", team: "home", role: "Central Midfielder", shortLabel: "8", roleKey: "connector", position: { x: 20, y: 34 }, bodyAngle: 0 },
      { id: "H9", team: "home", role: "Striker", shortLabel: "9", roleKey: "striker", position: { x: 34, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", role: "Centre Back", shortLabel: "CB", roleKey: "back", position: { x: 43, y: 36 }, bodyAngle: Math.PI },
    ],
    sequence: { phase: "play", steps: [] },
    restartPhase: null,
    draftStep: null,
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
    set(_target, property, value) {
      state[property] = value;
      return true;
    },
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getPlayerById = (playerId) => state.players.find((player) => player.id === playerId) ?? null;

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))),
    autoBallProfiles: {
      "firm-feet": createBallProfileTemplate("firm-feet", "Firm To Feet"),
      "short-feet": createBallProfileTemplate("short-feet", "Short To Feet", { averageSpeedRange: [7, 10] }),
      "line-break": createBallProfileTemplate("line-break", "Line Break", { averageSpeedRange: [10, 14] }),
      "driven-feet": createBallProfileTemplate("driven-feet", "Driven To Feet", { averageSpeedRange: [13, 17] }),
      "into-space": createBallProfileTemplate("into-space", "Into Space"),
      "lead-space": createBallProfileTemplate("lead-space", "Lead Space"),
      "switch": createBallProfileTemplate("switch", "Switch", { flightStyle: "lofted", peakHeightRange: [1.6, 3.2] }),
      "cross": createBallProfileTemplate("cross", "Cross", { flightStyle: "lofted", peakHeightRange: [2.2, 4.5] }),
      "cutback": createBallProfileTemplate("cutback", "Cutback"),
      "throw-in": createBallProfileTemplate("throw-in", "Throw In", { averageSpeedRange: [6, 8] }),
      "gk-short-build": createBallProfileTemplate("gk-short-build", "GK Short Build"),
      "onto-9": createBallProfileTemplate("onto-9", "Onto 9"),
      "box-shot": createBallProfileTemplate("box-shot", "Box Shot", { flightStyle: "driven", averageSpeedRange: [18, 22] }),
      "edge-shot": createBallProfileTemplate("edge-shot", "Edge Shot", { flightStyle: "driven", averageSpeedRange: [20, 24] }),
      "long-shot": createBallProfileTemplate("long-shot", "Long Shot", { flightStyle: "driven", averageSpeedRange: [21, 26] }),
    },
    autoDribbleProfiles: {
      "eight-carry": {
        key: "eight-carry",
        label: "8 Carry",
        pressurePenalty: 0.18,
        lanePressurePenalty: 0.16,
        tightSpeed: 4.2,
        openSpeed: 6.4,
        distanceBoost: [0.1, 0.75],
        minSpeed: 3.4,
        maxSpeed: 7.2,
      },
    },
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    cloneVector: (point) => ({ ...point }),
    defensiveAggressionPresets: { balanced: { pressure: 0.5 } },
    distance,
    getActionSpeed: () => state.ball.speed || 10,
    getActionSpaceValue: (_startPoint, targetPoint) => ({
      openTarget: 0.76,
      value: targetPoint.x >= 32 ? 0.58 : 0.35,
      targetThreat: {
        value: targetPoint.x >= 32 ? 0.58 : 0.35,
        behindLine: targetPoint.x >= 38 ? 0.34 : 0.12,
        centralPocket: 0.24,
        betweenLines: 0.32,
      },
      startThreat: { value: 0.28 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: () => 0.72,
    getBallOwner: () => state.players[0] ?? null,
    getCompetitionPhysicalProfile: () => ({ ballPowerMultiplier: 1 }),
    getFootUsageScore: () => 0.86,
    getOffensiveAutopilotProfile: () => ({ carryBias: 0.66, dribbleBias: 0.62 }),
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPressureAtPoint: () => 0.18,
    getOrientationMovementProfile: () => ({ speedMultiplier: 0.96 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 34 ? 0.58 : 0.3,
      behindLine: point.x >= 38 ? 0.34 : 0.12,
      centralPocket: 0.24,
      betweenLines: 0.32,
    }),
    getPlayerById,
    getPlayerDecisionContext: () => ({
      pressure: 0.18,
      maxSpeed: 8.2,
      profile: {
        composure: 0.78,
        decisionQuality: 0.8,
        decisionSpeed: 0.78,
        pressResistance: 0.76,
        technicalSecurity: 0.82,
      },
    }),
    getPlayerFacingAngle: (player) => player?.bodyAngle ?? 0,
    getPlayerMagnetLabel: (player) => player?.shortLabel ?? player?.id ?? "",
    getPlayerPressureLoad: () => 0.18,
    getRemainingBallDistance: () => distance(state.ball.position, state.ball.target),
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    hasBallAction: () => state.ball.actionType !== null,
    isBylineZone: (point, teamId) => teamId === "home" ? point.x >= pitch.length - 8 : point.x <= 8,
    isCutbackTarget: () => false,
    isGoalkeeper: (player) => /goalkeeper/i.test(player?.role ?? "") || player?.shortLabel === "GK",
    isInsideOpponentBox: (point, teamId) => teamId === "home" ? point.x >= pitch.length - 16.5 : point.x <= 16.5,
    isWideChannel: (point) => point.y <= 14 || point.y >= pitch.width - 14,
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from, to, step) => {
      const length = distance(from, to);
      if (length <= step || length <= 0.001) {
        return { ...to };
      }
      return {
        x: from.x + ((to.x - from.x) / length) * step,
        y: from.y + ((to.y - from.y) / length) * step,
      };
    },
    normalize: (from, to) => {
      const length = distance(from, to);
      return length <= 0.001 ? { x: 0, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    },
    normalizeAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
    pitch,
    pitchSurfacePresets: { "hybrid-grass": { dribbleCarryFactor: 1 } },
    state: stateProxy,
    subtract: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    weatherPresets: { damp: { dribbleTractionFactor: 0.98, dribbleControlFactor: 0.96 } },
    getState: () => state,
    getPlayerByIdFromState: getPlayerById,
    replaceState(nextState) {
      state = nextState;
    },
    ...restOverrides,
  };
}

test("game simulator action space ball profiles expose moved contracts", () => {
  const profiles = createGameSimulatorActionSpaceBallProfiles(createBallProfilesDeps());

  expect(typeof profiles.getBallProfileDistanceRatio).toBe("function");
  expect(typeof profiles.getPitchSurfacePreset).toBe("function");
  expect(typeof profiles.getWeatherPreset).toBe("function");
  expect(typeof profiles.getDefensiveAggressionPreset).toBe("function");
  expect(typeof profiles.isAerialFlightStyle).toBe("function");
  expect(typeof profiles.getFlightStyleLabel).toBe("function");
  expect(typeof profiles.resolveBallCurveDirection).toBe("function");
  expect(typeof profiles.getBallTravelProgress).toBe("function");
  expect(typeof profiles.getBallTravelPoint).toBe("function");
  expect(typeof profiles.materializeBallProfile).toBe("function");
  expect(typeof profiles.getManualBallProfile).toBe("function");
  expect(typeof profiles.resolveAutoDribbleProfile).toBe("function");
  expect(typeof profiles.setDribbleCarryPathForBall).toBe("function");
  expect(typeof profiles.resolveAutoBallProfile).toBe("function");
  expect(typeof profiles.resolveBallActionProfile).toBe("function");
  expect(typeof profiles.applyResolvedBallProfile).toBe("function");
  expect(typeof profiles.getBallProfileLabel).toBe("function");
  expect(typeof profiles.getDisplayedBallSpeed).toBe("function");
  expect(typeof profiles.getRemainingBallTravelTime).toBe("function");
  expect(typeof profiles.updateBallFlightHeight).toBe("function");
  expect(typeof profiles.getBallFlightControlFactor).toBe("function");
});

test("game simulator action space ball profiles preserve profile resolution and apply state", () => {
  const deps = createBallProfilesDeps();
  const profiles = createGameSimulatorActionSpaceBallProfiles(deps);
  const carrier = deps.getPlayerByIdFromState("H8");

  const profile = profiles.resolveBallActionProfile(
    "pass",
    { x: 20, y: 34 },
    { x: 34, y: 34 },
    carrier,
    "H9",
    "auto"
  );
  profiles.applyResolvedBallProfile(profile);

  expect(profile.key).toBe("line-break");
  expect(deps.getState().ball.profileKey).toBe("line-break");
  expect(deps.getState().ball.speed).toBe(profile.averageSpeed);
});

test("game simulator action space ball profiles preserve dribble carry path state", () => {
  const deps = createBallProfilesDeps();
  const profiles = createGameSimulatorActionSpaceBallProfiles(deps);
  const carrier = deps.getPlayerByIdFromState("H8");

  const path = profiles.setDribbleCarryPathForBall(carrier, { x: 20, y: 34 }, { x: 36, y: 38 });

  expect(path.totalDistance).toBeGreaterThan(0);
  expect(deps.getState().ball.dribblePath).toBe(path);
  expect(deps.getState().ball.trackDistanceTotal).toBeGreaterThan(0);
});

test("game simulator action space ball profiles read live state through dependency boundary", () => {
  const deps = createBallProfilesDeps({
    state: {
      ballSpeedMode: "auto",
      dribbleSpeed: 5,
      dribbleSpeedMode: "auto",
      surfacePreset: "hybrid-grass",
      weatherPreset: "damp",
      defensiveAggressionPreset: "balanced",
      ball: {
        position: { x: 25, y: 34 },
        startPosition: { x: 20, y: 34 },
        target: { x: 40, y: 34 },
        actionType: "pass",
        inTransit: true,
        trackDistanceCovered: 5,
        trackDistanceTotal: 20,
        flightStyle: "lofted",
        peakHeight: 4,
        height: 0,
        controlHeightThreshold: 0.45,
        landingPhaseStart: 0.58,
      },
      players: [],
      sequence: { phase: "play", steps: [] },
    },
  });
  const profiles = createGameSimulatorActionSpaceBallProfiles(deps);

  expect(profiles.getBallTravelProgress()).toBeCloseTo(0.25);
  profiles.updateBallFlightHeight();
  expect(deps.getState().ball.height).toBeGreaterThan(0);

  deps.replaceState({
    ballSpeedMode: "auto",
    dribbleSpeed: 5,
    dribbleSpeedMode: "auto",
    surfacePreset: "hybrid-grass",
    weatherPreset: "damp",
    defensiveAggressionPreset: "balanced",
    ball: {
      position: { x: 30, y: 34 },
      startPosition: { x: 20, y: 34 },
      target: { x: 40, y: 34 },
      actionType: "pass",
      inTransit: true,
      trackDistanceCovered: 10,
      trackDistanceTotal: 20,
      flightStyle: "lofted",
      peakHeight: 4,
      height: 0,
      controlHeightThreshold: 0.45,
      landingPhaseStart: 0.58,
    },
    players: [],
    sequence: { phase: "play", steps: [] },
  });

  expect(profiles.getBallTravelProgress()).toBeCloseTo(0.5);
  profiles.updateBallFlightHeight();
  expect(deps.getState().ball.height).toBeCloseTo(4);
});
