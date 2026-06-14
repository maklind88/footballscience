import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotOffballWideEntryTargets } from "../src/modules/game-simulator/autopilot-offball-wide-entry-targets.mjs";

const pitch = { length: 105, width: 68 };

function createWideEntryDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      initiatorPlayerId: "H8",
      position: { x: 48, y: 18 },
    },
    players: [
      { id: "H2", team: "home", position: { x: 51, y: 9 }, roleKey: "wideBack", shortLabel: "LB", maxSpeed: 7.7, acceleration: 2.9 },
      { id: "H11", team: "home", position: { x: 58, y: 12 }, roleKey: "wideForward", shortLabel: "LW", maxSpeed: 7.4, acceleration: 2.7 },
      { id: "H8", team: "home", position: { x: 49, y: 23 }, roleKey: "connector", shortLabel: "8", maxSpeed: 7, acceleration: 2.5 },
      { id: "A4", team: "away", position: { x: 64, y: 30 }, roleKey: "back", shortLabel: "CB", maxSpeed: 7, acceleration: 2.4 },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: (player, role) => {
      if (player.roleKey === "wideBack" && role === "runner") return 0.82;
      if (player.roleKey === "wideBack" && role === "crosser") return 0.78;
      return 0.5;
    },
    getOffensiveRoleKey: (player) => player.roleKey,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerMagnetLabel: (player) => player.shortLabel ?? player.id,
    getPlayerTendency: (player, tendency) => (player.roleKey === "wideBack" && tendency === "overlap" ? 0.84 : 0.52),
    getWideOverlapPrincipleFit: () => 0.92,
    getWideOverlapRunTarget: (_teamId, anchorPoint, sideSign) => ({
      x: anchorPoint.x + 9,
      y: anchorPoint.y + sideSign * 4,
    }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
    state: stateProxy,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot offball wide entry targets expose moved overlap contracts", () => {
  const wideEntry = createGameSimulatorAutopilotOffballWideEntryTargets(createWideEntryDeps());

  expect(typeof wideEntry.getSameSideWideBacks).toBe("function");
  expect(typeof wideEntry.chooseWideOverlapRunner).toBe("function");
  expect(typeof wideEntry.getWideEntryPrincipleContext).toBe("function");
  expect(typeof wideEntry.getOffensiveActionPrinciple).toBe("function");
});

test("game simulator autopilot offball wide entry targets read live state through dependency boundary", () => {
  const deps = createWideEntryDeps();
  const wideEntry = createGameSimulatorAutopilotOffballWideEntryTargets(deps);

  expect(wideEntry.getSameSideWideBacks("home", -1).map((player) => player.id)).toEqual(["H2"]);

  deps.replaceState({
    ball: { initiatorPlayerId: "H8", position: { x: 48, y: 18 } },
    players: [
      { id: "H3", team: "home", position: { x: 50, y: 11 }, roleKey: "wideBack", shortLabel: "LB2", maxSpeed: 7.6, acceleration: 2.8 },
    ],
  });

  expect(wideEntry.getSameSideWideBacks("home", -1).map((player) => player.id)).toEqual(["H3"]);
});

test("game simulator autopilot offball wide entry targets preserve wide overlap action principles", () => {
  const wideEntry = createGameSimulatorAutopilotOffballWideEntryTargets(createWideEntryDeps());
  const actionMeta = {
    actionType: "pass",
    carrierPlayerId: "H8",
    receiverPlayerId: "H11",
    beforeSnapshot: {
      ball: {
        ownerPlayerId: "H8",
        position: { x: 48, y: 18 },
      },
    },
  };

  const principle = wideEntry.getOffensiveActionPrinciple(
    "home",
    { x: 59, y: 11 },
    actionMeta,
    { overlapBias: 0.75, widthDiscipline: 0.7 }
  );

  expect(principle).toBeTruthy();
  expect(principle.key).toBe("wide-overlap-entry");
  expect(principle.label).toContain("Wide overload");
  expect(principle.runner.id).toBe("H2");
  expect(principle.scoreBonus).toBeGreaterThan(0.9);
});
