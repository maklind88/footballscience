import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpacePitchSpaceProfiles } from "../src/modules/game-simulator/action-space-pitch-space-profiles.mjs";

function createPitchSpaceDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: { position: { x: 60, y: 34 } },
    players: [
      { id: "H6", team: "home", role: "CM", position: { x: 56, y: 34 } },
      { id: "A9", team: "away", role: "ST", position: { x: 48, y: 34 } },
      { id: "A6", team: "away", role: "CM", position: { x: 66, y: 34 } },
      { id: "A4", team: "away", role: "CB", position: { x: 84, y: 34 } },
      { id: "A1", team: "away", role: "GK", position: { x: 101, y: 34 } },
    ],
  };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });

  return {
    clamp,
    getDefensiveAutopilotLineKey: (player) => {
      if (player.role === "GK") return "gk";
      if (player.role === "ST") return "forward";
      if (player.role === "CM") return "midfield";
      return "back";
    },
    getDefensivePhaseKey: () => "midBlock",
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPitchLaneKey: (point) => {
      if (point.y < pitch.width * 0.2) return "leftWide";
      if (point.y < pitch.width * 0.4) return "leftHalf";
      if (point.y <= pitch.width * 0.6) return "central";
      if (point.y <= pitch.width * 0.8) return "rightHalf";
      return "rightWide";
    },
    pitch,
    state: stateProxy,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    vec: (x, y) => ({ x, y }),
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space pitch space profiles expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpacePitchSpaceProfiles(createPitchSpaceDeps());

  expect(typeof metrics.getAttackDirectionSign).toBe("function");
  expect(typeof metrics.getAttackingDepth).toBe("function");
  expect(typeof metrics.getOpponentGoalCenter).toBe("function");
  expect(typeof metrics.getDepthZoneKey).toBe("function");
  expect(typeof metrics.getDepthZoneLabel).toBe("function");
  expect(typeof metrics.getLaneLabel).toBe("function");
  expect(typeof metrics.getGoldenZoneScore).toBe("function");
  expect(typeof metrics.isGoldenZone).toBe("function");
  expect(typeof metrics.getMedianNumber).toBe("function");
  expect(typeof metrics.getDepthQuantile).toBe("function");
  expect(typeof metrics.getOpponentLineDepthsForAttackingTeam).toBe("function");
  expect(typeof metrics.getAttackingGameSpaceProfile).toBe("function");
  expect(typeof metrics.getPitchSpaceProfile).toBe("function");
  expect(typeof metrics.getPitchThreatProfile).toBe("function");
});

test("game simulator action space pitch space profiles classify direction, lanes, and goal center", () => {
  const metrics = createGameSimulatorActionSpacePitchSpaceProfiles(createPitchSpaceDeps());

  expect(metrics.getAttackDirectionSign("home")).toBe(1);
  expect(metrics.getAttackDirectionSign("away")).toBe(-1);
  expect(metrics.getAttackingDepth({ x: 72, y: 34 }, "away")).toBe(33);
  expect(metrics.getOpponentGoalCenter("home")).toEqual({ x: 105, y: 34 });
  expect(metrics.getDepthZoneLabel(metrics.getDepthZoneKey({ x: 72, y: 34 }, "home"))).toBe("chance-creation space");
  expect(metrics.getLaneLabel("leftHalf")).toBe("left half-space");
});

test("game simulator action space pitch space profiles preserve line and threat relationships", () => {
  const metrics = createGameSimulatorActionSpacePitchSpaceProfiles(createPitchSpaceDeps());

  expect(metrics.getOpponentLineDepthsForAttackingTeam("home")).toMatchObject({
    forward: 48,
    midfield: 66,
    back: 84,
    gk: 101,
  });

  const gameSpace = metrics.getAttackingGameSpaceProfile({ x: 72, y: 34 }, "home");
  const pitchSpace = metrics.getPitchSpaceProfile({ x: 72, y: 34 }, "home");
  const threat = metrics.getPitchThreatProfile({ x: 72, y: 34 }, "home");

  expect(gameSpace.key).toBe("space2");
  expect(pitchSpace.gameSpaceKey).toBe("space2");
  expect(pitchSpace.centralPocket).toBeGreaterThan(0.9);
  expect(pitchSpace.primaryLabel).toBe("central pocket");
  expect(threat.value).toBeGreaterThan(0.3);
});

test("game simulator action space pitch space profiles preserve null fallbacks", () => {
  const metrics = createGameSimulatorActionSpacePitchSpaceProfiles(createPitchSpaceDeps());

  expect(metrics.getGoldenZoneScore(null, "home")).toBe(0);
  expect(metrics.isGoldenZone(null, "home")).toBe(false);
  expect(metrics.getPitchSpaceProfile(null, "home")).toMatchObject({
    laneKey: "central",
    primaryLabel: "open space",
    value: 0,
  });
  expect(metrics.getPitchThreatProfile(null, "home")).toMatchObject({
    laneKey: "central",
    primaryLabel: "open space",
    value: 0,
  });
});
