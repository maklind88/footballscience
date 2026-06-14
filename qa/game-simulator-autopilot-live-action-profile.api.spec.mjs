import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveActionProfile } from "../src/modules/game-simulator/autopilot-live-action-profile.mjs";

function createLiveActionProfileDeps(overrides = {}) {
  let state = overrides.state ?? {
    actionMode: "shot",
    keyboardActionMode: "pass",
    ballSpeedMode: "realistic",
    dribbleSpeed: 5.5,
    ball: {
      actionType: "pass",
      currentSpeed: 12,
      executionQuality: 0.82,
      inTransit: false,
      laneClarity: 0.8,
      profileMode: "firm",
      speed: 12,
      startPosition: { x: 40, y: 34 },
      target: { x: 52, y: 34 },
    },
    draftStep: null,
    players: [
      { id: "H8", team: "home", role: "CM", position: { x: 40, y: 34 } },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionInitiator: () => state.players[0],
    getPitchSurfacePreset: () => ({ airCarryFactor: 1.03, groundRollFactor: 1 }),
    getPlayerDecisionContext: () => ({
      pressure: 0.42,
      profile: {
        decisionQuality: 0.74,
        executionUnderPressure: 0.7,
      },
    }),
    getWeatherPreset: () => ({ ballRollFactor: 0.98 }),
    isAerialFlightStyle: (flightStyle) => flightStyle === "lofted" || flightStyle === "aerial",
    lerp: (start, end, weight) => start + (end - start) * weight,
    materializeBallProfile: () => ({
      launchMultiplier: 1.18,
      rollFloor: 0.7,
      flightStyle: "ground",
      peakHeight: 0.05,
      controlHeightThreshold: 0.14,
      landingPhaseStart: 0.6,
      curveAmount: 0.08,
      spinRate: 2.2,
    }),
    resolveBallCurveDirection: () => -1,
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live action profile exposes moved contracts", () => {
  const actionProfile = createGameSimulatorAutopilotLiveActionProfile(createLiveActionProfileDeps());

  expect(typeof actionProfile.getActionSpeed).toBe("function");
  expect(typeof actionProfile.configureBallTravelProfile).toBe("function");
  expect(typeof actionProfile.getActionDistance).toBe("function");
  expect(typeof actionProfile.getRequestedActionMode).toBe("function");
});

test("game simulator autopilot live action profile reads current state through dependency boundary", () => {
  const deps = createLiveActionProfileDeps({
    getActionInitiator: () => null,
  });
  const actionProfile = createGameSimulatorAutopilotLiveActionProfile(deps);

  expect(actionProfile.getActionSpeed()).toBe(12);

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, speed: 9 },
  });

  expect(actionProfile.getActionSpeed()).toBe(9);
});

test("game simulator autopilot live action profile preserves dribble travel profile", () => {
  const deps = createLiveActionProfileDeps({
    state: {
      ...createLiveActionProfileDeps().getState(),
      ball: {
        ...createLiveActionProfileDeps().getState().ball,
        actionType: "dribble",
      },
    },
  });
  const actionProfile = createGameSimulatorAutopilotLiveActionProfile(deps);

  actionProfile.configureBallTravelProfile("dribble", 7.5, 4.2);

  expect(deps.getState().ball.launchSpeed).toBe(4.2);
  expect(deps.getState().ball.currentSpeed).toBe(4.2);
  expect(deps.getState().ball.finalSpeed).toBe(4.2);
  expect(deps.getState().ball.deceleration).toBe(0);
  expect(deps.getState().ball.flightStyle).toBe("ground");
  expect(deps.getState().ball.trackDistanceTotal).toBe(7.5);
});

test("game simulator autopilot live action profile materializes pass travel profile", () => {
  const deps = createLiveActionProfileDeps();
  const actionProfile = createGameSimulatorAutopilotLiveActionProfile(deps);

  actionProfile.configureBallTravelProfile("pass", 20, 10);

  expect(deps.getState().ball.launchSpeed).toBeGreaterThan(10);
  expect(deps.getState().ball.finalSpeed).toBeGreaterThan(0.45);
  expect(deps.getState().ball.deceleration).toBeGreaterThan(0);
  expect(deps.getState().ball.curveDirection).toBe(-1);
  expect(deps.getState().ball.trackDistanceTotal).toBe(20);
  expect(deps.getState().ball.trackDistanceCovered).toBe(0);
});

test("game simulator autopilot live action profile resolves distance and requested mode", () => {
  const deps = createLiveActionProfileDeps({
    state: {
      ...createLiveActionProfileDeps().getState(),
      ball: {
        ...createLiveActionProfileDeps().getState().ball,
        actionType: null,
        inTransit: false,
      },
      draftStep: null,
    },
  });
  const actionProfile = createGameSimulatorAutopilotLiveActionProfile(deps);

  expect(actionProfile.getActionDistance()).toBe(0);
  expect(actionProfile.getRequestedActionMode()).toBe("pass");

  deps.replaceState({
    ...deps.getState(),
    keyboardActionMode: null,
    ball: {
      ...deps.getState().ball,
      inTransit: true,
      startPosition: { x: 40, y: 34 },
      target: { x: 46, y: 42 },
    },
  });

  expect(actionProfile.getActionDistance()).toBe(10);
  expect(actionProfile.getRequestedActionMode()).toBe("shot");
});
