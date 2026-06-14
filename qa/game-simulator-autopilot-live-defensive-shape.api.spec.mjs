import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveDefensiveShape } from "../src/modules/game-simulator/autopilot-live-defensive-shape.mjs";

function createDefensiveShapeDeps(overrides = {}) {
  let state =
    overrides.state ??
    {
      ball: {
        actionType: "pass",
        ownerPlayerId: "H8",
        position: { x: 42, y: 34 },
        startPosition: { x: 42, y: 34 },
        target: { x: 68, y: 34 },
      },
      draftStep: {
        actionType: "pass",
        carrierPlayerId: "H8",
        receiverPlayerId: "H9",
        beforeSnapshot: {
          ball: {
            ownerPlayerId: "H8",
            position: { x: 42, y: 34 },
          },
        },
        target: { x: 68, y: 34 },
      },
      players: [
        { id: "H8", team: "home", role: "CM", position: { x: 42, y: 34 } },
        { id: "H9", team: "home", role: "ST", position: { x: 68, y: 34 } },
        { id: "A1", team: "away", role: "GK", position: { x: 100, y: 34 } },
        { id: "A5", team: "away", role: "CB", position: { x: 76, y: 30 } },
        { id: "A7", team: "away", role: "LW", position: { x: 64, y: 12 } },
      ],
      restartPhase: null,
    };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const defensivePhaseProfiles = {
    boxDefending: {
      key: "boxDefending",
      label: "Box Defending",
      blockWidth: 36,
      minBlockWidth: 28,
      maxBlockWidth: 42,
      ballSideShift: 0.44,
      wideCompression: 0.82,
      backToBall: 11,
      backToMidfield: 7,
      midfieldToForward: 6,
      pressOffset: 1,
      minBackLineFromOwnGoal: 8,
      maxBackLineFromOwnGoal: 24,
      formationGapWeight: 0.35,
      formationWidthWeight: 0.35,
    },
    lowBlock: {
      key: "lowBlock",
      label: "Low Block",
      blockWidth: 42,
      minBlockWidth: 34,
      maxBlockWidth: 48,
      ballSideShift: 0.5,
      wideCompression: 0.84,
      backToBall: 14,
      backToMidfield: 9,
      midfieldToForward: 7,
      pressOffset: 1.15,
      minBackLineFromOwnGoal: 10,
      maxBackLineFromOwnGoal: 38,
      formationGapWeight: 0.4,
      formationWidthWeight: 0.4,
    },
    midBlock: {
      key: "midBlock",
      label: "Mid Block",
      blockWidth: 48,
      minBlockWidth: 38,
      maxBlockWidth: 56,
      ballSideShift: 0.56,
      wideCompression: 0.86,
      backToBall: 18,
      backToMidfield: 10,
      midfieldToForward: 9,
      pressOffset: 1.3,
      minBackLineFromOwnGoal: 12,
      maxBackLineFromOwnGoal: 54,
      formationGapWeight: 0.45,
      formationWidthWeight: 0.45,
    },
    highPress: {
      key: "highPress",
      label: "High Press",
      blockWidth: 52,
      minBlockWidth: 42,
      maxBlockWidth: 62,
      ballSideShift: 0.62,
      wideCompression: 0.9,
      backToBall: 23,
      backToMidfield: 11,
      midfieldToForward: 10,
      pressOffset: 1.6,
      minBackLineFromOwnGoal: 18,
      maxBackLineFromOwnGoal: 78,
      formationGapWeight: 0.4,
      formationWidthWeight: 0.45,
    },
  };
  const defensiveAutopilotProfiles = {
    "4-3-3": {
      blockWidth: 48,
      ballSideShift: 0.56,
      wideCompression: 0.86,
      backToBall: 18,
      backToMidfield: 10,
      midfieldToForward: 9,
      pressOffset: 1.3,
      maxBackLineFromOwnGoal: 54,
    },
    "4-2-3-1": {
      blockWidth: 46,
      ballSideShift: 0.53,
      wideCompression: 0.84,
      backToBall: 17,
      backToMidfield: 9.2,
      midfieldToForward: 8.6,
      pressOffset: 1.22,
      maxBackLineFromOwnGoal: 52,
    },
  };
  const styleProfiles = {
    away: {
      label: "Balanced",
      principleLabel: "Compact block",
      preferredPhase: "midBlock",
      pressingIntensity: 0.58,
      tackleIntent: 0.48,
      blockWidthMultiplier: 1,
      ballSideShiftOffset: 0,
      backToBallOffset: 0,
      lineGapOffset: 0,
      pressOffsetMultiplier: 1,
      lineHeightOffset: 0,
    },
  };

  return {
    clamp,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (start, target) => ({
      lineBreakCount: target.x > 62 ? 1 : 0,
      value: target.x > 62 ? 0.44 : 0.16,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingGameSpaceProfile: (point) => ({ key: point.x > 62 ? "space3" : "space2" }),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveThreatResponse: () => ({ protectCenter: 0.4, isBoxThreat: false, isGoldenZoneThreat: false }),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getKickoffDefensivePhaseKey: () => "highPress",
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPitchThreatProfile: (point) => ({
      behindLine: point.x > 62 ? 0.3 : 0.1,
      value: point.x > 62 ? 0.36 : 0.28,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerMagnetLabel: (player) => {
      if (player.role === "GK") return "GK";
      if (player.role === "CB") return "CB";
      if (player.role === "LB") return "LB";
      if (player.role === "RB") return "RB";
      if (player.role === "ST") return "9";
      if (player.role === "LW" || player.role === "RW") return "W";
      return "8";
    },
    getPlayerPressureLoad: () => 0.5,
    getTeamDefenseStyleKey: () => "balanced",
    getTeamDefenseStyleProfile: (teamId) => styleProfiles[teamId] ?? styleProfiles.away,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-2-3-1" } },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live defensive shape exposes phase, profile, and line geometry contracts", () => {
  const shape = createGameSimulatorAutopilotLiveDefensiveShape(createDefensiveShapeDeps());

  expect(typeof shape.getDefensivePhaseKey).toBe("function");
  expect(typeof shape.getDefensiveAutopilotLineKey).toBe("function");
  expect(typeof shape.getDefensiveAutopilotProfile).toBe("function");
  expect(typeof shape.getDefensiveLineActionAdjustment).toBe("function");
  expect(typeof shape.getDefensiveLineDistanceFromOwnGoal).toBe("function");
  expect(typeof shape.getDefensiveLineX).toBe("function");
  expect(typeof shape.getDefensiveLineWidth).toBe("function");
  expect(typeof shape.getDefensiveLineCenterY).toBe("function");
});

test("game simulator autopilot live defensive shape resolves phase and formation line roles from live state", () => {
  const deps = createDefensiveShapeDeps();
  const shape = createGameSimulatorAutopilotLiveDefensiveShape(deps);

  expect(shape.getDefensivePhaseKey("away", { x: 20, y: 34 }, "pass")).toBe("highPress");
  expect(shape.getDefensivePhaseKey("away", { x: 70, y: 34 }, "pass")).toBe("lowBlock");
  expect(shape.getDefensivePhaseKey("away", { x: 86, y: 10 }, "shot")).toBe("boxDefending");
  expect(shape.getDefensiveAutopilotLineKey({ id: "A5", team: "away", role: "CB" }, "4-2-3-1", "midBlock")).toBe("back");
  expect(shape.getDefensiveAutopilotLineKey({ id: "A7", team: "away", role: "LW" }, "4-3-3", "midBlock")).toBe("midfield");
  expect(shape.getDefensiveAutopilotLineKey({ id: "A7", team: "away", role: "LW" }, "4-3-3", "highPress")).toBe("forward");

  deps.replaceState({ ...deps.getState(), restartPhase: { type: "kickoff" } });
  expect(shape.getDefensivePhaseKey("away", { x: 52, y: 34 }, "pass")).toBe("highPress");
});

test("game simulator autopilot live defensive shape builds profiles and line geometry", () => {
  const shape = createGameSimulatorAutopilotLiveDefensiveShape(createDefensiveShapeDeps());
  const profile = shape.getDefensiveAutopilotProfile("away", { x: 50, y: 34 }, "midBlock");

  expect(profile.formation).toBe("4-2-3-1");
  expect(profile.phaseKey).toBe("midBlock");
  expect(profile.phaseLabel).toBe("Mid Block");
  expect(profile.styleKey).toBe("balanced");
  expect(profile.threatResponse.protectCenter).toBe(0.4);
  expect(profile.lineActionAdjustment.mode).toBe("drop");

  const backDepth = shape.getDefensiveLineDistanceFromOwnGoal("away", "back", { x: 50, y: 34 }, profile);
  const midfieldDepth = shape.getDefensiveLineDistanceFromOwnGoal("away", "midfield", { x: 50, y: 34 }, profile);
  expect(backDepth).toBeGreaterThan(12);
  expect(midfieldDepth).toBeGreaterThan(backDepth);
  expect(shape.getDefensiveLineX("away", "back", { x: 50, y: 34 }, profile)).toBeCloseTo(105 - backDepth, 3);
  expect(shape.getDefensiveLineWidth("midfield", profile, { x: 50, y: 34 }, 4)).toBeGreaterThan(20);
  expect(shape.getDefensiveLineCenterY("midfield", profile, { x: 50, y: 48 }, 28)).toBeGreaterThan(34);
});

test("game simulator autopilot live defensive shape reacts to depth threats and low-risk backward passes", () => {
  const deps = createDefensiveShapeDeps();
  const shape = createGameSimulatorAutopilotLiveDefensiveShape(deps);

  const depthThreat = shape.getDefensiveLineActionAdjustment("away", { x: 68, y: 34 }, "midBlock");
  expect(depthThreat.mode).toBe("drop");
  expect(depthThreat.shift).toBeLessThan(0);
  expect(depthThreat.lineBreakCount).toBe(1);

  deps.replaceState({
    ...deps.getState(),
    ball: {
      actionType: "pass",
      ownerPlayerId: "H8",
      position: { x: 68, y: 34 },
      startPosition: { x: 68, y: 34 },
      target: { x: 56, y: 34 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H9",
      beforeSnapshot: {
        ball: {
          ownerPlayerId: "H8",
          position: { x: 68, y: 34 },
        },
      },
      target: { x: 56, y: 34 },
    },
  });

  const backwardPass = shape.getDefensiveLineActionAdjustment("away", { x: 56, y: 34 }, "midBlock");
  expect(backwardPass.mode).toBe("step");
  expect(backwardPass.shift).toBeGreaterThan(0);
  expect(backwardPass.forwardGain).toBeLessThan(0);
});
