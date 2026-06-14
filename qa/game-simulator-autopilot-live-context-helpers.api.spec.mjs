import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveContextHelpers } from "../src/modules/game-simulator/autopilot-live-context-helpers.mjs";

function createLiveContextDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      actionType: "pass",
      carrierPlayerId: null,
      initiatorPlayerId: null,
      ownerPlayerId: "H8",
      position: { x: 52, y: 34 },
      target: { x: 58, y: 30 },
    },
    draftStep: null,
    players: [
      { id: "H8", team: "home", role: "8", position: { x: 45, y: 34 } },
      { id: "H9", team: "home", role: "9", position: { x: 65, y: 34 } },
      { id: "A6", team: "away", role: "6", position: { x: 58, y: 34 } },
    ],
    restartPhase: null,
    selectedPlayerId: null,
  };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    cloneVector: (point) => ({ ...point }),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: (point, teamId) => teamId === "home" ? point.x : pitch.length - point.x,
    getAttackStyleRhythmProfile: () => ({
      progressionUrgency: 0.56,
      recycleWindow: 2.8,
      sidewaysTolerance: 0.42,
      targetSeconds: 8,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerMagnetLabel: (player) => player?.role,
    getTeamAttackStyleKey: () => "balanced",
    getTeamAttackStyleProfile: () => ({
      carryBias: 0.38,
      crossBias: 0.45,
      deliveryBias: 0.42,
      directness: 0.48,
      dribbleBias: 0.36,
      firstTouchForwardBias: 0.5,
      frontAheadOffset: 1.2,
      label: "Balanced",
      lineBreakBias: 0.48,
      overlapBias: 0.44,
      passBias: 0.62,
      principleLabel: "balanced occupation",
      restBehindOffset: 0.8,
      risk: 0.46,
      routeOneBias: 0.08,
      shootBias: 0.36,
      shortSupport: 0.58,
      supportCompactnessMultiplier: 1.05,
      switchBias: 0.5,
      tempo: 0.54,
      widthMultiplier: 1.02,
    }),
    offensiveAutopilotProfiles: {
      "4-3-3": {
        frontAhead: 11,
        principleLabel: "4-3-3 spacing",
        restBehind: 22,
        width: 58,
      },
    },
    offensivePhaseProfiles: {
      buildUp: {
        depthStretch: -1.2,
        label: "Build up",
        restBehindOffset: -1,
        supportCompactness: 0.14,
        widthMultiplier: 0.94,
      },
      finalThird: {
        depthStretch: 2.4,
        label: "Final third",
        restBehindOffset: 1.6,
        supportCompactness: 0.1,
        widthMultiplier: 0.98,
      },
      progression: {
        depthStretch: 0.5,
        label: "Progression",
        restBehindOffset: 0,
        supportCompactness: 0.12,
        widthMultiplier: 1,
      },
      setPiece: {
        depthStretch: 0,
        label: "Set piece",
        restBehindOffset: 0,
        supportCompactness: 0.1,
        widthMultiplier: 0.96,
      },
    },
    pitch,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live context helpers expose moved contracts", () => {
  const helpers = createGameSimulatorAutopilotLiveContextHelpers(createLiveContextDeps());

  expect(typeof helpers.getOffensiveAutopilotFocusPoint).toBe("function");
  expect(typeof helpers.isOffensiveAutopilotPlayer).toBe("function");
  expect(typeof helpers.getOtherTeamId).toBe("function");
  expect(typeof helpers.getPlannedPossessionTeamId).toBe("function");
  expect(typeof helpers.getDefendingDirectionSign).toBe("function");
  expect(typeof helpers.getDepthX).toBe("function");
  expect(typeof helpers.getDistanceFromOwnGoal).toBe("function");
  expect(typeof helpers.getOffensivePhaseKey).toBe("function");
  expect(typeof helpers.getOffensiveAutopilotProfile).toBe("function");
  expect(typeof helpers.getOffensiveRoleKey).toBe("function");
  expect(typeof helpers.getPitchLaneKey).toBe("function");
  expect(typeof helpers.getPitchLaneIndex).toBe("function");
  expect(typeof helpers.getAttackingThirdKey).toBe("function");
  expect(typeof helpers.getLaneCenterY).toBe("function");
  expect(typeof helpers.getSideLaneKeys).toBe("function");
  expect(helpers.autoPilotPossessionIntentLabels.progress).toBe("Progress through pressure");
});

test("game simulator autopilot live context helpers read current state through dependency boundary", () => {
  const deps = createLiveContextDeps();
  const helpers = createGameSimulatorAutopilotLiveContextHelpers(deps);

  expect(helpers.getPlannedPossessionTeamId()).toBe("home");
  expect(helpers.getOffensiveAutopilotFocusPoint({
    offensiveAutopilot: { ballFocusPoint: { x: 61, y: 29 }, teamId: "home" },
  })).toEqual({ x: 61, y: 29 });

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, ownerPlayerId: "A6" },
  });

  expect(helpers.getPlannedPossessionTeamId()).toBe("away");
});

test("game simulator autopilot live context helpers resolve teams phases roles and lanes", () => {
  const deps = createLiveContextDeps();
  const helpers = createGameSimulatorAutopilotLiveContextHelpers(deps);

  expect(helpers.getOtherTeamId("home")).toBe("away");
  expect(helpers.getOtherTeamId("away")).toBe("home");
  expect(helpers.getDefendingDirectionSign("home")).toBe(1);
  expect(helpers.getDefendingDirectionSign("away")).toBe(-1);
  expect(helpers.getDepthX("away", 20)).toBe(85);
  expect(helpers.getDistanceFromOwnGoal("away", { x: 80, y: 34 })).toBe(25);

  expect(helpers.getOffensivePhaseKey("home", { x: 25, y: 34 }, "pass")).toBe("buildUp");
  expect(helpers.getOffensivePhaseKey("home", { x: 55, y: 34 }, "pass")).toBe("progression");
  expect(helpers.getOffensivePhaseKey("home", { x: 78, y: 34 }, "pass")).toBe("finalThird");
  expect(helpers.getOffensivePhaseKey("home", { x: 35, y: 34 }, "shot")).toBe("finalThird");

  deps.replaceState({ ...deps.getState(), restartPhase: { type: "freeKick" } });
  expect(helpers.getOffensivePhaseKey("home", { x: 25, y: 34 }, "pass")).toBe("setPiece");

  const profile = helpers.getOffensiveAutopilotProfile("home", { x: 55, y: 34 }, "progression");
  expect(profile.formation).toBe("4-3-3");
  expect(profile.phaseKey).toBe("progression");
  expect(profile.styleKey).toBe("balanced");
  expect(profile.principleLabel).toContain("4-3-3 spacing");

  expect(helpers.isOffensiveAutopilotPlayer({ team: "home" }, { offensiveAutopilot: { teamId: "home" } })).toBe(true);
  expect(helpers.getOffensiveRoleKey({ team: "home", role: "9" })).toBe("striker");
  expect(helpers.getPitchLaneKey({ x: 50, y: 5 })).toBe("leftWide");
  expect(helpers.getPitchLaneKey({ x: 50, y: 34 })).toBe("central");
  expect(helpers.getPitchLaneKey({ x: 50, y: 64 })).toBe("rightWide");
  expect(helpers.getPitchLaneIndex("rightHalf")).toBe(3);
  expect(helpers.getAttackingThirdKey({ x: 70, y: 34 }, "home")).toBe("finish");
  expect(helpers.getLaneCenterY("central", profile)).toBe(34);
  expect(helpers.getSideLaneKeys(20)).toEqual({ wide: "leftWide", half: "leftHalf" });
});
