import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandActionCommands } from "../src/modules/game-simulator/command-action-commands.mjs";

function createCommandActionDeps(overrides = {}) {
  const events = [];
  const state = overrides.state || {
    ballSpeedMode: "match-realistic",
    firstTouchMode: "auto",
    isRunning: false,
    activeActionTargets: new Map(),
    ball: {
      actionType: "pass",
      ownerPlayerId: "H8",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
      position: { x: 20, y: 34 },
      target: { x: 30, y: 34 },
      startPosition: { x: 20, y: 34 },
      inTransit: true,
      securePossession: { ownerPlayerId: "H8" },
    },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, targetPosition: { x: 20, y: 34 } },
      { id: "H9", team: "home", role: "ST", shortLabel: "H9", position: { x: 30, y: 34 }, targetPosition: { x: 30, y: 34 } },
    ],
    sequence: { steps: [], dirty: false, actionTargets: new Map(), isPlaying: false },
    draftStep: null,
  };
  return {
    events,
    state,
    applyAutopilotsForCurrentAction: () => {},
    applyBallExecutionProfile: () => {},
    applyBestReceiveBodyAngle: () => {},
    applyResolvedBallProfile: () => {},
    canEditScenario: () => true,
    captureSnapshot: () => ({
      ball: {
        ownerPlayerId: state.ball.ownerPlayerId,
        position: { ...state.ball.position },
      },
    }),
    clearAutoPilotReceiveMomentum: () => {},
    clearSecurePossession: () => { state.ball.securePossession = null; },
    cloneVector: (point) => ({ ...point }),
    configureBallTravelProfile: () => {},
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    formatSpeed: (value) => `${value} m/s`,
    getActionSpeed: () => 10,
    getBallOwner: () => state.players.find((player) => player.id === state.ball.ownerPlayerId) || null,
    getOffsideInfo: () => ({ isOffside: false }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getRequestedActionMode: () => null,
    getSelectedPlayer: () => state.players[0],
    getTeamAttackAngle: () => 0,
    hasBallAction: () => Boolean(state.ball.actionType),
    logEvent: (message) => { events.push(message); },
    render: () => {},
    resetPlayerMovementProgress: () => {},
    resolveBallActionProfile: (actionType) => ({
      averageSpeed: actionType === "shot" ? 18 : 9,
      source: "auto",
      key: `${actionType}-profile`,
      label: `${actionType} profile`,
      targetKind: "space",
    }),
    resolveShotTarget: (targetPoint) => targetPoint,
    rotatePlayerBodyToward: () => {},
    setDribbleCarryPathForBall: () => {},
    clampToPitch: (point) => point,
    ...overrides,
  };
}

test("game simulator command action commands expose moved command contract", () => {
  const commands = createGameSimulatorCommandActionCommands(createCommandActionDeps());

  expect(typeof commands.refreshPlannedBallActionProfile).toBe("function");
  expect(typeof commands.clearBallAction).toBe("function");
  expect(typeof commands.setBallOwner).toBe("function");
  expect(typeof commands.issuePassLikeCommand).toBe("function");
  expect(typeof commands.issuePassCommand).toBe("function");
  expect(typeof commands.issueShotCommand).toBe("function");
  expect(typeof commands.issueDribbleCommand).toBe("function");
  expect(typeof commands.issueBallCommand).toBe("function");
});

test("game simulator command action commands clear an active ball action", () => {
  const deps = createCommandActionDeps();
  const commands = createGameSimulatorCommandActionCommands(deps);

  commands.clearBallAction();

  expect(deps.state.ball.actionType).toBeNull();
  expect(deps.state.ball.inTransit).toBe(false);
  expect(deps.state.ball.target).toEqual(deps.state.ball.position);
  expect(deps.state.draftStep).toBeNull();
});

test("game simulator command action commands honor forced shot mode", () => {
  const deps = createCommandActionDeps();
  const commands = createGameSimulatorCommandActionCommands(deps);

  commands.issueBallCommand({ x: 86, y: 31 }, "shot");

  expect(deps.state.draftStep).toMatchObject({
    actionType: "shot",
    profileKey: "shot-profile",
    target: { x: 86, y: 31 },
  });
  expect(deps.state.ball.actionType).toBe("shot");
  expect(deps.state.ball.ownerPlayerId).toBeNull();
  expect(deps.events.at(-1)).toContain("New shot planned");
});
