import { expect, test } from "@playwright/test";
import { createGameSimulatorCanvasRenderer } from "../src/modules/game-simulator/canvas-renderer.mjs";

function createMockContext() {
  const operations = [];
  const methods = [
    "arc",
    "beginPath",
    "clearRect",
    "closePath",
    "ellipse",
    "fill",
    "fillRect",
    "fillText",
    "lineTo",
    "moveTo",
    "restore",
    "rotate",
    "roundRect",
    "save",
    "setLineDash",
    "stroke",
    "strokeRect",
    "translate",
  ];
  const target = {
    operations,
    measureText: (text) => ({ width: String(text ?? "").length * 8 }),
  };
  methods.forEach((method) => {
    target[method] = (...args) => {
      operations.push({ method, args });
    };
  });
  return new Proxy(target, {
    set(object, property, value) {
      object[property] = value;
      operations.push({ property, value });
      return true;
    },
  });
}

function createState() {
  return {
    autoPilotPlay: { active: false },
    autoV2Debug: false,
    draftStep: null,
    drag: null,
    eventLog: [],
    goalFlash: null,
    isRunning: false,
    players: [
      {
        id: "H8",
        team: "home",
        color: "#2563eb",
        accent: "#93c5fd",
        role: "8",
        shortLabel: "H8",
        position: { x: 30, y: 20 },
        bodyAngle: 0,
      },
    ],
    ball: {
      actionType: null,
      height: 0,
      inTransit: false,
      ownerPlayerId: "H8",
      position: { x: 1, y: 1 },
      spinAngle: 0,
      startPosition: { x: 1, y: 1 },
      target: { x: 1, y: 1 },
    },
    sequence: {
      currentFrameIndex: -1,
      isPlaying: false,
      playbackIndex: -1,
      phase: null,
      steps: [],
    },
  };
}

test("game simulator canvas renderer owns visual rendering and live owned-ball sync", () => {
  const ctx = createMockContext();
  const state = createState();
  const calls = [];
  const sync = (name) => () => calls.push(name);
  const renderer = createGameSimulatorCanvasRenderer({
    ballRadiusMeters: 0.22,
    canvas: { width: 960, height: 620 },
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    cloneVector: (point) => ({ x: point.x, y: point.y }),
    computeReachDistance: () => 0,
    ctx,
    gameSimulatorSidebarRenderer: { renderSidebar: sync("sidebar") },
    getActionOrigin: (player) => player.position,
    getActiveExampleOverlay: () => null,
    getBallOwner: () => state.players[0],
    getGoalDirectionSign: () => 1,
    getMetersToPixels: () => 8,
    getPlayerBallControlPoint: (player) => ({
      x: player.position.x + 0.5,
      y: player.position.y + 0.25,
    }),
    getPlayerFacingAngle: (player) => player.bodyAngle ?? 0,
    getPlayerMagnetLabel: (player) => player.shortLabel,
    getProjectedActionDuration: () => 0,
    getRenderedPrimarySelectedPlayerId: () => "H8",
    hasBallAction: () => false,
    isPlayerRenderedSelected: (playerId) => playerId === "H8",
    lerp: (from, to, amount) => from + (to - from) * amount,
    normalize: (from, to) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
      };
    },
    pitch: { length: 105, width: 68 },
    playerRadiusMeters: 1.1,
    syncBallSpeedControls: sync("ball-speed"),
    syncDefensiveAggressionControls: sync("defensive-aggression"),
    syncDefensiveAutopilotButton: sync("defensive-autopilot"),
    syncDribbleSpeedControls: sync("dribble-speed"),
    syncFirstTouchControls: sync("first-touch"),
    syncFormationControls: sync("formation"),
    syncOffensiveAutopilotButton: sync("offensive-autopilot"),
    syncPhysicalProfileControls: sync("physical"),
    syncSurfaceControls: sync("surface"),
    syncTeamIdentityControls: sync("team-identity"),
    syncWeatherControls: sync("weather"),
    toCanvas: (point) => ({ x: point.x * 8, y: point.y * 8 }),
    updatePitchFullscreenHudLayout: sync("hud"),
    updateSequenceButtons: sync("sequence-buttons"),
    win: { __autoV2DebugEnabled: false },
    getState: () => state,
  });

  expect(renderer).toEqual(expect.objectContaining({
    drawPitch: expect.any(Function),
    render: expect.any(Function),
    syncOwnedBallPosition: expect.any(Function),
  }));

  renderer.render();

  expect(state.ball.position).toEqual({ x: 30.5, y: 20.25 });
  expect(state.ball.startPosition).toEqual({ x: 30.5, y: 20.25 });
  expect(state.ball.target).toEqual({ x: 30.5, y: 20.25 });
  expect(calls).toEqual(expect.arrayContaining(["formation", "sequence-buttons", "sidebar", "hud"]));
  expect(ctx.operations.some((operation) => operation.method === "clearRect")).toBe(true);
  expect(ctx.operations.some((operation) => operation.method === "fillRect")).toBe(true);
});
