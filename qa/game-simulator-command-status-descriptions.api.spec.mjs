import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandStatusDescriptions } from "../src/modules/game-simulator/command-status-descriptions.mjs";

function createCommandStatusDescriptions(overrides = {}) {
  const state = overrides.state || {
    ball: { actionType: "pass", elapsedTravelTime: 0, inTransit: false },
    isRunning: false,
    sequence: { isPlaying: false, phase: null },
  };

  return createGameSimulatorCommandStatusDescriptions({
    getFirstTouchModeLabel: (mode) => mode === "forward" ? "Forward" : mode,
    getPlayerById: (playerId) => ({ id: playerId, shortLabel: playerId === "H9" ? "Nine" : playerId }),
    getRequestedActionMode: () => null,
    hasBallAction: () => Boolean(state.ball.actionType),
    setPiecePhaseProfiles: { corner: { label: "Corner" }, freeKick: { label: "Free Kick" } },
    state,
    teams: { home: { name: "Home" }, away: { name: "Away" } },
    ...overrides,
  });
}

test("game simulator command status descriptions reports live ball status and selected action labels", () => {
  const state = {
    ball: { actionType: null, elapsedTravelTime: 0.5, inTransit: true },
    isRunning: false,
    sequence: { isPlaying: false, phase: null },
  };
  const descriptions = createCommandStatusDescriptions({
    getRequestedActionMode: () => "shot",
    hasBallAction: () => false,
    state,
  });

  expect(descriptions.getBallStatus()).toBe("Paused");
  expect(descriptions.getActionTypeLabel()).toBe("Shot Selected");

  state.sequence = { isPlaying: true, phase: "transition" };
  state.isRunning = true;

  expect(descriptions.getBallStatus()).toBe("Transition");
  expect(descriptions.getActionTypeLabel()).toBe("Transition");
});

test("game simulator command status descriptions describes receiver and first touch", () => {
  const descriptions = createCommandStatusDescriptions();

  const description = descriptions.describeStep(
    {
      actionType: "pass",
      firstTouchMode: "forward",
      profileLabel: "Driven",
      receiverPlayerId: "H9",
      restartPhase: { type: "corner" },
      target: { x: 44.25, y: 17.5 },
    },
    2
  );

  expect(description.title).toBe("Step 3: Corner Pass");
  expect(description.meta).toBe("Driven • To Nine • First Touch: Forward");
});

test("game simulator command status descriptions describes restart outcomes", () => {
  const descriptions = createCommandStatusDescriptions();

  expect(
    descriptions.describeStep(
      {
        actionType: "shot",
        goal: { concedingTeamId: "away", scoringTeamId: "home" },
        target: { x: 105, y: 34 },
      },
      0
    )
  ).toEqual({
    title: "Step 1: Goal",
    meta: "Home score. Next restart: Away kick-off",
  });

  expect(
    descriptions.describeStep(
      {
        actionType: "pass",
        nextRestartPhase: { teamId: "away", type: "throwIn" },
        profileLabel: "Switch",
        target: { x: 105, y: 70 },
      },
      4
    )
  ).toEqual({
    title: "Step 5: Ball Out",
    meta: "Switch • Next restart: Away throw-in",
  });
});
