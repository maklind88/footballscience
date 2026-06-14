import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionLandingBounce } from "../src/modules/game-simulator/ball-resolution-landing-bounce.mjs";

function createLandingBounceDeps(overrides = {}) {
  const state = overrides.state ?? {
    ball: {
      actionType: "pass",
      bounceCount: 0,
      controlRadius: 1.2,
      curveAmount: 0.3,
      currentSpeed: 10,
      finalSpeed: 7.4,
      flightStyle: "lofted",
      height: 1.7,
      inTransit: false,
      ownerPlayerId: "H8",
      position: { x: 32, y: 34 },
      profileKey: "switch",
      profileLabel: "Switch",
      profileMode: "auto",
      securePossession: { ownerPlayerId: "H8" },
      spinRate: 4,
      startPosition: { x: 14, y: 34 },
      target: { x: 32, y: 34 },
      targetKind: "into-space",
      trackDistanceTotal: 32,
    },
  };
  const travelProfiles = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    clamp,
    clampToPitch: (point) => ({
      x: clamp(point.x, 0, 105),
      y: clamp(point.y, 0, 68),
    }),
    clearSecurePossession: () => {
      state.ball.securePossession = null;
    },
    cloneVector: (point) => ({ ...point }),
    configureBallTravelProfile: (...args) => {
      travelProfiles.push(args);
    },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getPitchSurfacePreset: () => ({ groundRollFactor: 1.05 }),
    getWeatherPreset: () => ({ ballRollFactor: 0.96, ballSkidFactor: 1.08 }),
    isAerialFlightStyle: (style) => style === "lofted" || style === "aerial",
    state,
    travelProfiles,
    ...overrides,
  };
}

test("game simulator ball resolution landing bounce exposes moved contracts", () => {
  const deps = createLandingBounceDeps();
  const landingBounce = createGameSimulatorBallResolutionLandingBounce(deps);

  expect(typeof landingBounce.shouldTriggerLandingBounce).toBe("function");
  expect(typeof landingBounce.startLandingBounceSkid).toBe("function");
});

test("game simulator ball resolution landing bounce gates realistic bounce triggers", () => {
  const deps = createLandingBounceDeps();
  const landingBounce = createGameSimulatorBallResolutionLandingBounce(deps);

  expect(landingBounce.shouldTriggerLandingBounce("cross", false)).toBe(false);
  expect(landingBounce.shouldTriggerLandingBounce("pass", false)).toBe(true);

  deps.state.ball.trackDistanceTotal = 8;
  expect(landingBounce.shouldTriggerLandingBounce("pass", false)).toBe(false);

  deps.state.ball.trackDistanceTotal = 32;
  deps.state.ball.targetKind = "to-feet";
  expect(landingBounce.shouldTriggerLandingBounce("pass", true)).toBe(false);

  deps.state.ball.bounceCount = 1;
  deps.state.ball.targetKind = "into-space";
  expect(landingBounce.shouldTriggerLandingBounce("shot", false)).toBe(false);
});

test("game simulator ball resolution landing bounce starts a playable skid", () => {
  const deps = createLandingBounceDeps();
  const landingBounce = createGameSimulatorBallResolutionLandingBounce(deps);

  expect(landingBounce.startLandingBounceSkid({ x: 25, y: 34 })).toBe(true);

  expect(deps.state.ball.bounceCount).toBe(1);
  expect(deps.state.ball.inTransit).toBe(true);
  expect(deps.state.ball.ownerPlayerId).toBeNull();
  expect(deps.state.ball.securePossession).toBeNull();
  expect(deps.state.ball.target.x).toBeGreaterThan(deps.state.ball.position.x);
  expect(deps.travelProfiles).toHaveLength(1);
  expect(deps.travelProfiles[0][0]).toBe("pass");
  expect(deps.travelProfiles[0][3].targetKind).toBe("into-space");
});
