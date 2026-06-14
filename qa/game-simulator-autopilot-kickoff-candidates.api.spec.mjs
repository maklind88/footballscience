import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotKickoffCandidates } from "../src/modules/game-simulator/autopilot-kickoff-candidates.mjs";

function createKickoffDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: { type: "kickoff", teamId: "home", supportPlayerId: "H8" },
    sequence: { steps: [] },
    players: [
      { id: "H2", team: "home", position: { x: 24, y: 34 }, roleKey: "wideBack", shortLabel: "LB" },
      { id: "H8", team: "home", position: { x: 47, y: 34 }, roleKey: "connector", shortLabel: "CM" },
      { id: "H9", team: "home", position: { x: 52, y: 34 }, roleKey: "striker", shortLabel: "ST" },
    ],
  };
  return {
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.82,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getKickoffSupportId: () => "H8",
    getOffensiveRoleKey: (player) => player.roleKey,
    getPitchLaneIndex: (lane) => (lane === "leftWide" ? 0 : lane === "central" ? 2 : 4),
    getPitchLaneKey: (point) => (point.y < 20 ? "leftWide" : point.y > 48 ? "rightWide" : "central"),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.18,
    getState: () => state,
    getWideSideSign: (point) => {
      const position = point?.position || point;
      return position?.y < pitch.width / 2 ? -1 : 1;
    },
    isLastStepKickoffResetForTeam: () => false,
    kickoffOpeningProfiles: {
      "secure-backline": {
        key: "secure-backline",
        label: "Secure backline",
        receiverRoles: ["rest", "gk", "wideBack"],
        firstTouchMode: "inside",
      },
    },
    pitch,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

function createProfile(overrides = {}) {
  return {
    directness: 0.42,
    lineBreakBias: 0.5,
    recycleWindow: 0.64,
    switchBias: 0.46,
    ...overrides,
  };
}

test("game simulator autopilot kickoff candidates expose moved kickoff contracts", () => {
  const candidates = createGameSimulatorAutopilotKickoffCandidates(createKickoffDeps());

  expect(typeof candidates.buildAutoPilotKickoffCandidate).toBe("function");
  expect(typeof candidates.getLastKickoffOpeningProfile).toBe("function");
  expect(typeof candidates.getKickoffOpeningCandidateFit).toBe("function");
  expect(typeof candidates.buildAutoPilotPostKickoffResetCandidate).toBe("function");
});

test("game simulator autopilot kickoff candidates build kickoff reset", () => {
  const deps = createKickoffDeps();
  const candidates = createGameSimulatorAutopilotKickoffCandidates(deps);
  const carrier = deps.getPlayerById("H9");

  const candidate = candidates.buildAutoPilotKickoffCandidate(carrier, carrier.position, createProfile());

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H8",
    label: "kick-off reset",
  });
});

test("game simulator autopilot kickoff candidates build post-kickoff reset", () => {
  const deps = createKickoffDeps({
    isLastStepKickoffResetForTeam: () => true,
  });
  const candidates = createGameSimulatorAutopilotKickoffCandidates(deps);
  const carrier = deps.getPlayerById("H8");

  const candidate = candidates.buildAutoPilotPostKickoffResetCandidate(carrier, carrier.position, createProfile());

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H2",
    label: "secure-backline",
  });
});
