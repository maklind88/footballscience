import { expect, test } from "@playwright/test";
import { createGameSimulatorPointerController } from "../src/modules/game-simulator/pointer-controller.mjs";

function createController(overrides = {}) {
  const state = overrides.state || {
    isRunning: false,
    selectedPlayerId: "p1",
    sequence: { isPlaying: false },
    drag: null,
    players: [
      { id: "p1", shortLabel: "MH", role: "8", position: { x: 10, y: 10 } },
      { id: "p2", shortLabel: "AD", role: "CB", position: { x: 10.2, y: 10.1 } },
    ],
    ball: { position: { x: 20, y: 20 }, ownerPlayerId: "", actionType: "" },
  };
  const calls = [];
  const selectedPlayerIds = overrides.selectedPlayerIds || ["p1"];
  const pointerCaptures = new Set();
  const canvas = {
    setPointerCapture: (pointerId) => pointerCaptures.add(pointerId),
    releasePointerCapture: (pointerId) => pointerCaptures.delete(pointerId),
    hasPointerCapture: (pointerId) => pointerCaptures.has(pointerId),
  };
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const controller = createGameSimulatorPointerController({
    canvas,
    getState: () => state,
    playerRadiusMeters: 0.8,
    ballRadiusMeters: 0.3,
    pitch: { inset: 2, length: 100, width: 68 },
    distance,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    cloneVector: (point) => ({ x: point.x, y: point.y }),
    normalizeSelectedPlayerIds: (ids) => Array.from(new Set(ids)),
    hasBallAction: () => false,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerBallControlPoint: (player) => player.position,
    refreshPlannedBallActionProfile: () => calls.push("refresh-profile"),
    getPointerRequestedActionMode: () => null,
    issuePassCommand: () => calls.push("pass"),
    issueBallCommand: () => calls.push("ball-command"),
    consumePointerActionMode: () => calls.push("consume-mode"),
    clearBallAction: () => calls.push("clear-ball"),
    logEvent: (message) => calls.push(`log:${message}`),
    isSelectionModifierActive: () => false,
    toggleSelectedPlayer: (playerId) => calls.push(`toggle:${playerId}`),
    isPlayerSelected: (playerId) => selectedPlayerIds.includes(playerId),
    setSingleSelectedPlayer: (playerId) => calls.push(`single:${playerId}`),
    setSelectedPlayers: (ids, primaryId) => calls.push(`selected:${ids.join(",")}:${primaryId}`),
    getSelectedPlayerIds: () => [...selectedPlayerIds],
    getActionOrigin: (player) => player.position,
    getEditableRadius: () => 10,
    eventToPitch: (event) => event.point,
    clampToPitch: (point) => point,
    subtract: (first, second) => ({ x: first.x - second.x, y: first.y - second.y }),
    clampToCircle: (point) => point,
    rotatePlayerBodyAlongMovement: () => calls.push("rotate"),
    clearSecurePossession: () => calls.push("clear-secure"),
    markSimulatorDirty: () => calls.push("dirty"),
    clearSelectedPlayers: () => calls.push("clear-selected"),
    render: () => calls.push("render"),
  });
  return { controller, state, calls, pointerCaptures };
}

test("game simulator pointer controller keeps hit testing topmost and ball-aware", () => {
  const { controller } = createController();

  expect(controller.pickPlayer({ x: 10.1, y: 10.1 })?.id).toBe("p2");
  expect(controller.isBallHit({ x: 20.2, y: 20.1 })).toBe(true);
  expect(controller.isBallHit({ x: 22, y: 22 })).toBe(false);
});

test("game simulator pointer controller clears selected players on double click", () => {
  const { controller, calls } = createController();

  controller.handleCanvasDoubleClick();

  expect(calls).toEqual(["clear-selected", "log:All players deselected.", "render"]);
});

test("game simulator pointer controller starts a player drag without writing outside state", () => {
  const { controller, state, calls, pointerCaptures } = createController();

  controller.handlePointerDown({ pointerId: 7, point: { x: 10.2, y: 10.1 } });

  expect(state.drag).toMatchObject({
    type: "player",
    pointerId: 7,
    playerId: "p2",
    playerIds: ["p1"],
  });
  expect(pointerCaptures.has(7)).toBe(true);
  expect(calls).toContain("render");
});
