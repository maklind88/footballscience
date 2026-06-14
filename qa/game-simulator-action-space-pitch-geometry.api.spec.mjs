import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpacePitchGeometry } from "../src/modules/game-simulator/action-space-pitch-geometry.mjs";

const pitch = { length: 105, width: 68 };

function createPitchGeometryDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: { position: { x: 72, y: 34 } },
    players: [
      { id: "H9", team: "home", role: "Striker", shortLabel: "9", position: { x: 86, y: 34 } },
      { id: "A1", team: "away", role: "Goalkeeper", shortLabel: "GK", position: { x: 100, y: 34 } },
      { id: "A4", team: "away", role: "Centre Back", shortLabel: "CB", position: { x: 82, y: 30 } },
      { id: "A5", team: "away", role: "Centre Back", shortLabel: "CB", position: { x: 78, y: 38 } },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, inset = 0) => ({
      x: Math.max(inset, Math.min(pitch.length - inset, point.x)),
      y: Math.max(inset, Math.min(pitch.width - inset, point.y)),
    }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getBallOwner: () => state.players[0] ?? null,
    getPlannedPossessionTeamId: () => "home",
    getPlayerBallControlPoint: (player) => player.position,
    pitch,
    state: stateProxy,
    vec: (x, y) => ({ x, y }),
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space pitch geometry exposes moved contracts", () => {
  const geometry = createGameSimulatorActionSpacePitchGeometry(createPitchGeometryDeps());

  expect(typeof geometry.getOpponentGoalSide).toBe("function");
  expect(typeof geometry.getGoalLineX).toBe("function");
  expect(typeof geometry.getGoalDirectionSign).toBe("function");
  expect(typeof geometry.isBetweenGoalPosts).toBe("function");
  expect(typeof geometry.getGoalNetDisplayPoint).toBe("function");
  expect(typeof geometry.resolveShotTarget).toBe("function");
  expect(typeof geometry.getOwnGoalCenter).toBe("function");
  expect(typeof geometry.getOpponentPenaltySpot).toBe("function");
  expect(typeof geometry.getSecondLastOpponentLineX).toBe("function");
  expect(typeof geometry.getOffsideInfo).toBe("function");
  expect(typeof geometry.isPassReceiverOffside).toBe("function");
  expect(typeof geometry.isWideChannel).toBe("function");
  expect(typeof geometry.isBylineZone).toBe("function");
  expect(typeof geometry.isInsideOpponentBox).toBe("function");
  expect(typeof geometry.isInsideOwnBox).toBe("function");
  expect(typeof geometry.isCutbackTarget).toBe("function");
  expect(typeof geometry.isGoalkeeper).toBe("function");
});

test("game simulator action space pitch geometry preserves goal and box helpers", () => {
  const geometry = createGameSimulatorActionSpacePitchGeometry(createPitchGeometryDeps());

  expect(geometry.getOpponentGoalSide("home")).toBe("right");
  expect(geometry.getGoalLineX("right")).toBe(105);
  expect(geometry.getGoalDirectionSign("left")).toBe(-1);
  expect(geometry.isBetweenGoalPosts(34)).toBe(true);
  expect(geometry.getGoalNetDisplayPoint("right", 80)).toEqual({ x: 104.45, y: 37.4 });
  expect(geometry.resolveShotTarget({ x: 101, y: 40 }, { team: "home" })).toEqual({ x: 107.6, y: 40 });
  expect(geometry.getOwnGoalCenter("home")).toEqual({ x: 0, y: 34 });
  expect(geometry.getOpponentPenaltySpot("home")).toEqual({ x: 94, y: 34 });
  expect(geometry.isWideChannel({ x: 50, y: 8 })).toBe(true);
  expect(geometry.isBylineZone({ x: 99, y: 30 }, "home")).toBe(true);
  expect(geometry.isInsideOpponentBox({ x: 93, y: 34 }, "home")).toBe(true);
  expect(geometry.isInsideOwnBox({ x: 12, y: 34 }, "home")).toBe(true);
  expect(geometry.isCutbackTarget({ x: 88, y: 34 }, "home")).toBe(true);
  expect(geometry.isGoalkeeper({ role: "Goalkeeper", shortLabel: "GK" })).toBe(true);
});

test("game simulator action space pitch geometry reads live state for offside lines", () => {
  const deps = createPitchGeometryDeps();
  const geometry = createGameSimulatorActionSpacePitchGeometry(deps);
  const receiver = { id: "H9", team: "home", role: "Striker", shortLabel: "9", position: { x: 86, y: 34 } };

  expect(geometry.getSecondLastOpponentLineX("home")).toBe(82);
  expect(geometry.getOffsideInfo(receiver, { x: 72, y: 34 })).toMatchObject({
    isOffside: true,
    lineX: 82,
  });

  deps.replaceState({
    ball: { position: { x: 72, y: 34 } },
    players: [
      receiver,
      { id: "A1", team: "away", role: "Goalkeeper", shortLabel: "GK", position: { x: 100, y: 34 } },
      { id: "A4", team: "away", role: "Centre Back", shortLabel: "CB", position: { x: 89, y: 30 } },
      { id: "A5", team: "away", role: "Centre Back", shortLabel: "CB", position: { x: 88, y: 38 } },
    ],
  });

  expect(geometry.getSecondLastOpponentLineX("home")).toBe(89);
  expect(geometry.isPassReceiverOffside(receiver, { x: 72, y: 34 })).toBe(false);
});
