import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballBlindsideChannelTargets } from "../src/modules/game-simulator/autopilot-offball-blindside-channel-targets.mjs";

function createBlindsideDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state =
    overrides.state ??
    {
      ball: {
        actionType: "pass",
        initiatorPlayerId: "H8",
        position: { x: 45, y: 24 },
        speed: 13,
        startPosition: { x: 45, y: 24 },
      },
      players: [
        { id: "H2", team: "home", role: "Left Back", position: { x: 46, y: 12 } },
        { id: "H7", team: "home", role: "Left Winger", position: { x: 54, y: 22 } },
        { id: "H8", team: "home", role: "Midfielder", position: { x: 45, y: 24 } },
        { id: "H9", team: "home", role: "Striker", position: { x: 58, y: 34 } },
        { id: "H11", team: "home", role: "Right Winger", position: { x: 55, y: 52 } },
        { id: "A5", team: "away", role: "Centre Back", position: { x: 64, y: 34 } },
      ],
    };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const roleKeyFor = (player) => {
    if (player.role.includes("Back")) return "wideBack";
    if (player.role.includes("Winger")) return "wideForward";
    if (player.role.includes("Striker")) return "striker";
    return "connector";
  };

  return {
    clamp,
    clampToPitch: (point, padding = 0) => ({
      x: clamp(point.x, padding, pitch.length - padding),
      y: clamp(point.y, padding, pitch.width - padding),
    }),
    computeTimeToCoverDistance: (_player, runDistance) => runDistance / 9,
    distance,
    getActionSpaceValue: () => ({ lineBreakCount: 1, value: 0.48 }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space3" }),
    getAutoPilotRoleStrength: (player, strengthKey) => (roleKeyFor(player) === "wideForward" && strengthKey === "runner" ? 0.9 : 0.58),
    getDepthPoint: (teamId, depth, overrides = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: overrides.y ?? pitch.width / 2,
    }),
    getOffensiveRoleKey: roleKeyFor,
    getOpponentLineDepthsForAttackingTeam: () => ({ back: 64, midfield: 48, forward: 35 }),
    getPitchThreatProfile: () => ({
      behindLine: 0.3,
      centralPocket: 0.3,
      opponentLineDepths: { back: 64, midfield: 48, forward: 35 },
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerTendency: (player, tendencyKey) => {
      if (player.id === "H7" && (tendencyKey === "boxRun" || tendencyKey === "passAndMove")) return 0.85;
      return 0.54;
    },
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) > 16,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 13 }),
    setAutopilotPrincipleTarget: (targets, player, target) => {
      if (!player || !target) return false;
      targets.set(player.id, target);
      return true;
    },
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot offball blindside channel targets expose moved contracts", () => {
  const blindside = createGameSimulatorAutopilotOffballBlindsideChannelTargets(createBlindsideDeps());

  expect(typeof blindside.getBlindsideChannelRunContext).toBe("function");
  expect(typeof blindside.getBlindsideChannelRunTarget).toBe("function");
  expect(typeof blindside.chooseBlindsideChannelRunner).toBe("function");
  expect(typeof blindside.applyBlindsideChannelRunTargets).toBe("function");
});

test("game simulator autopilot offball blindside channel targets detect depth cues and targets behind the line", () => {
  const blindside = createGameSimulatorAutopilotOffballBlindsideChannelTargets(createBlindsideDeps());
  const profile = { directness: 0.58, lineBreakBias: 0.66, overlapBias: 0.6, phaseKey: "buildUp", switchBias: 0.6, tempo: 0.7 };
  const actionMeta = {
    actionType: "pass",
    beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 45, y: 24 } } },
    receiverPlayerId: "H9",
  };

  expect(blindside.getBlindsideChannelRunContext("home", { x: 60, y: 20 }, actionMeta, { ...profile, phaseKey: "setPiece" })).toBeNull();

  const context = blindside.getBlindsideChannelRunContext("home", { x: 60, y: 20 }, actionMeta, profile);
  expect(context.breakLine).toBe(true);
  expect(context.forwardGain).toBe(15);
  expect(context.arrivalWindow).toBeGreaterThan(context.eta);
  expect(context.sideSign).toBe(-1);

  context.profile = profile;
  const runTarget = blindside.getBlindsideChannelRunTarget("home", context, "blindsideRun");
  const restTarget = blindside.getBlindsideChannelRunTarget("home", context, "restScreen");
  expect(runTarget.x).toBeGreaterThan(64);
  expect(runTarget.y).toBeGreaterThan(20);
  expect(restTarget.x).toBeLessThan(context.targetPoint.x);
});

test("game simulator autopilot offball blindside channel targets choose and protect timed runners", () => {
  const blindside = createGameSimulatorAutopilotOffballBlindsideChannelTargets(createBlindsideDeps());
  const profile = { directness: 0.7, lineBreakBias: 0.7, overlapBias: 0.62, phaseKey: "buildUp", switchBias: 0.62, tempo: 0.65 };
  const actionMeta = {
    actionType: "pass",
    beforeSnapshot: { ball: { ownerPlayerId: "H8", position: { x: 45, y: 24 } } },
    receiverPlayerId: "H9",
  };
  const targets = new Map([
    ["H2", { x: 48, y: 12 }],
    ["H7", { x: 55, y: 22 }],
    ["H8", { x: 45, y: 24 }],
    ["H9", { x: 59, y: 34 }],
    ["H11", { x: 56, y: 52 }],
  ]);
  const context = blindside.getBlindsideChannelRunContext("home", { x: 60, y: 20 }, actionMeta, profile);
  context.profile = profile;
  const target = blindside.getBlindsideChannelRunTarget("home", context, "blindsideRun");

  expect(blindside.chooseBlindsideChannelRunner("home", targets, new Set(), ["wideForward", "striker"], target, context)?.id).toBe("H7");

  const applied = blindside.applyBlindsideChannelRunTargets("home", targets, { x: 60, y: 20 }, actionMeta, profile, new Set(["H8"]));
  expect(applied.labels).toEqual([
    "Blindside run behind line",
    "Near-channel run",
    "Wide channel release",
    "Far-side blindside run",
  ]);
  expect(applied.protectedIds.has("H7")).toBe(true);
  expect(applied.protectedIds.has("H8")).toBe(false);
  expect(targets.get("H7").x).toBeGreaterThan(64);
});
