import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveDefensiveAutoV2 } from "../src/modules/game-simulator/autopilot-live-defensive-auto-v2.mjs";

const pitch = { length: 105, width: 68 };

function createLiveDefensiveAutoV2Deps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      position: { x: 50, y: 34 },
      target: { x: 58, y: 30 },
    },
    players: [
      { id: "A4", team: "away", roleKey: "back", position: { x: 62, y: 25 } },
      { id: "A5", team: "away", roleKey: "back", position: { x: 63, y: 42 } },
      { id: "A6", team: "away", roleKey: "midfield", position: { x: 52, y: 31 } },
      { id: "A9", team: "away", roleKey: "forward", position: { x: 45, y: 34 } },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    clampToCircle: (point, center, radius) => {
      if (!Number.isFinite(radius)) {
        return { ...point };
      }
      const gap = distance(center, point);
      if (gap <= radius) {
        return { ...point };
      }
      return {
        x: center.x + ((point.x - center.x) / gap) * radius,
        y: center.y + ((point.y - center.y) / gap) * radius,
      };
    },
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionOrigin: (player) => player.actionOrigin ?? player.position,
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveAutopilotGroupsForTeam: (teamId) => ({
      back: state.players.filter((player) => player.team === teamId && player.roleKey === "back"),
      midfield: state.players.filter((player) => player.team === teamId && player.roleKey === "midfield"),
      forward: state.players.filter((player) => player.team === teamId && player.roleKey === "forward"),
    }),
    getDefensiveAutopilotLineKey: (player) => player.roleKey,
    getDefensiveAutopilotProfile: () => ({
      phaseKey: "midBlock",
      minBackLineFromOwnGoal: 22,
      maxBackLineFromOwnGoal: 58,
    }),
    getDefensiveDribblePressTarget: () => ({ x: 49, y: 34 }),
    getDefensiveLineCenterY: () => pitch.width / 2,
    getDefensiveLineDistanceFromOwnGoal: (_teamId, lineKey) => (lineKey === "back" ? 38 : 50),
    getDefensiveLineWidth: () => 18,
    getDefensiveLineX: (teamId, lineKey) => {
      const depth = lineKey === "back" ? 38 : lineKey === "midfield" ? 50 : 60;
      return teamId === "home" ? depth : pitch.length - depth;
    },
    getDefensivePhaseKey: () => "midBlock",
    getDefensiveUnitGap: (_profile, lineKey) => (lineKey === "back" ? 8.5 : 9),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDribblePressureReference: () => ({ targetPoint: { x: 50, y: 34 } }),
    getEditableRadius: () => Infinity,
    getPlayerDecisionContext: () => ({
      acceleration: 3.2,
      maxSpeed: 7.1,
      reactionTime: 0,
      profile: {
        tacticalDiscipline: 0.78,
        perception: 0.72,
      },
    }),
    getPlayerFacingAngle: () => 0,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player.roleKey === "goalkeeper",
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalizeAngle: (angle) => angle,
    pitch,
    rotatePlayerBodyAlongMovement: (player) => {
      player.rotatedAlongMovement = true;
    },
    rotatePlayerBodyToward: (player) => {
      player.rotatedTowardFocus = true;
    },
    teams: { away: { formation: "4-3-3" }, home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live defensive auto v2 exposes moved contracts", () => {
  const defensive = createGameSimulatorAutopilotLiveDefensiveAutoV2(createLiveDefensiveAutoV2Deps());

  expect(typeof defensive.getDefensiveAutopilotFocusPoint).toBe("function");
  expect(typeof defensive.isDefensiveAutopilotPlayer).toBe("function");
  expect(typeof defensive.getDefensiveAutoV2Intent).toBe("function");
  expect(typeof defensive.buildDefensiveAutoV2Intents).toBe("function");
  expect(typeof defensive.applyDefensiveAutoV2RelationshipLayer).toBe("function");
  expect(typeof defensive.moveDefensiveAutoV2Player).toBe("function");
  expect(typeof defensive.alignArrivedDefensiveAutopilotPlayers).toBe("function");
});

test("game simulator autopilot live defensive auto v2 reads live state through dependency boundary", () => {
  const deps = createLiveDefensiveAutoV2Deps();
  const defensive = createGameSimulatorAutopilotLiveDefensiveAutoV2(deps);

  expect(defensive.getDefensiveAutopilotFocusPoint({ defensiveAutopilot: { teamId: "away" } })).toEqual({ x: 58, y: 30 });

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, target: { x: 60, y: 40 } },
  });

  expect(defensive.getDefensiveAutopilotFocusPoint({ defensiveAutopilot: { teamId: "away" } })).toEqual({ x: 60, y: 40 });
});

test("game simulator autopilot live defensive auto v2 builds press and line intents", () => {
  const deps = createLiveDefensiveAutoV2Deps();
  const defensive = createGameSimulatorAutopilotLiveDefensiveAutoV2(deps);
  const plannedPositions = new Map(deps.getState().players.map((player) => [player.id, player.position]));

  const intents = defensive.buildDefensiveAutoV2Intents(
    "away",
    deps.getState().players,
    plannedPositions,
    { phaseKey: "midBlock", lineActionAdjustment: { mode: "hold" } },
    "A9"
  );

  expect(intents.A9.type).toBe("press-ball");
  expect(intents.A4.type).toBe("protect-space");
  expect(intents.A6.relationship).toBe("protect pass lane");
});

test("game simulator autopilot live defensive auto v2 keeps relationships connected", () => {
  const deps = createLiveDefensiveAutoV2Deps();
  const defensive = createGameSimulatorAutopilotLiveDefensiveAutoV2(deps);
  const plannedPositions = new Map(deps.getState().players.map((player) => [player.id, { ...player.position }]));

  const labels = defensive.applyDefensiveAutoV2RelationshipLayer(
    "away",
    plannedPositions,
    {
      phaseKey: "midBlock",
      minBackLineFromOwnGoal: 22,
      maxBackLineFromOwnGoal: 58,
    },
    { x: 50, y: 34 },
    deps.getState().players.find((player) => player.id === "A9")
  );

  expect(labels).toContain("Auto v2: back line stays connected");
  expect(plannedPositions.get("A4").x).toBeGreaterThan(62);
  expect(plannedPositions.get("A4").x).toBeLessThanOrEqual(67.1);
  expect(Math.abs(plannedPositions.get("A4").y - plannedPositions.get("A5").y)).toBeLessThan(17);
});

test("game simulator autopilot live defensive auto v2 moves players with acceleration state", () => {
  const deps = createLiveDefensiveAutoV2Deps({
    getPlayerFacingAngle: () => Math.PI,
  });
  const defensive = createGameSimulatorAutopilotLiveDefensiveAutoV2(deps);
  const player = { id: "A6", team: "away", roleKey: "midfield", position: { x: 52, y: 31 } };

  defensive.moveDefensiveAutoV2Player(
    player,
    { x: 48, y: 31 },
    { defensiveAutopilot: { teamId: "away" } },
    { type: "cover-lane", lineKey: "midfield", urgency: 0.76 },
    0.5,
    { x: 50, y: 34 }
  );

  expect(player.position.x).toBeLessThan(52);
  expect(player.position.x).toBeGreaterThan(47.8);
  expect(player.autoV2Velocity.x).toBeLessThan(0);
  expect(player.rotatedAlongMovement).toBe(true);
});
