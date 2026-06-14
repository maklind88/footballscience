import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets } from "../src/modules/game-simulator/autopilot-defensive-priority-space-protection-targets.mjs";

const pitch = { length: 105, width: 68 };

function createPrioritySpaceDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: { position: { x: 30, y: 50 }, target: { x: 30, y: 50 } },
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      assistZone: 0.52,
      betweenLines: 0.46,
      box: 0.38,
      centralPocket: 0.42,
      cutbackZone: 0.36,
      halfSpace: 0.28,
      primaryLabel: "central pocket",
      value: 0.72,
    }),
    getPlayerMagnetLabel: (player) => player.label ?? player.id,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.roleKey === "gk",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state: stateProxy,
    vec: (x, y) => ({ x, y }),
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

function createGroups() {
  return {
    back: [
      { id: "A4", team: "away", label: "CB", roleKey: "centerBack", position: { x: 49, y: 34 } },
      { id: "A3", team: "away", label: "LB", roleKey: "wideBack", position: { x: 48, y: 54 } },
    ],
    midfield: [
      { id: "A6", team: "away", label: "6", roleKey: "pivot", position: { x: 56, y: 36 } },
      { id: "A8", team: "away", label: "8", roleKey: "connector", position: { x: 58, y: 48 } },
      { id: "A10", team: "away", label: "10", roleKey: "connector", position: { x: 60, y: 43 } },
    ],
    forward: [
      { id: "A9", team: "away", label: "9", roleKey: "striker", position: { x: 66, y: 40 } },
    ],
  };
}

function createTargets(groups) {
  return new Map(
    Object.values(groups)
      .flat()
      .map((player) => [player.id, { ...player.position }])
  );
}

test("game simulator autopilot defensive priority space protection targets expose moved contracts", () => {
  const priority = createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets(createPrioritySpaceDeps());

  expect(typeof priority.getDefensiveThreatResponse).toBe("function");
  expect(typeof priority.getDefensivePrioritySpacePoint).toBe("function");
  expect(typeof priority.pickDefensiveProtectionPlayer).toBe("function");
  expect(typeof priority.applyDefensivePrioritySpaceProtectionTargets).toBe("function");
});

test("game simulator autopilot defensive priority space protection targets score central protection", () => {
  const priority = createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets(createPrioritySpaceDeps());

  const response = priority.getDefensiveThreatResponse("away", { x: 30, y: 36 });

  expect(response.protectCenter).toBeGreaterThan(0.7);
  expect(response.immediatePressure).toBeGreaterThan(0.6);
  expect(response.isGoldenZoneThreat).toBe(true);
  expect(response.isBoxThreat).toBe(true);
});

test("game simulator autopilot defensive priority space protection targets assign screen and cover", () => {
  const priority = createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets(createPrioritySpaceDeps());
  const groups = createGroups();
  const targets = createTargets(groups);
  const ballPoint = { x: 30, y: 50 };
  const profile = {
    threatResponse: priority.getDefensiveThreatResponse("away", ballPoint),
  };

  const labels = priority.applyDefensivePrioritySpaceProtectionTargets(
    "away",
    targets,
    groups,
    groups.forward[0],
    ballPoint,
    profile
  );

  expect(labels).toContain("Protect central pocket");
  expect(labels).toContain("Goal-side cover");
  expect(labels).toContain("Far-post cover");
  expect(labels).toContain("Cutback screen");
  expect(targets.get("A6")).not.toEqual(groups.midfield[0].position);
  expect(targets.get("A4")).not.toEqual(groups.back[0].position);
});

test("game simulator autopilot defensive priority space protection targets read live ball state through dependency boundary", () => {
  const deps = createPrioritySpaceDeps();
  const priority = createGameSimulatorAutopilotDefensivePrioritySpaceProtectionTargets(deps);

  expect(priority.getDefensiveThreatResponse("away").ballFromOwnGoal).toBe(75);

  deps.replaceState({ ball: { position: { x: 70, y: 34 }, target: { x: 70, y: 34 } } });

  expect(priority.getDefensiveThreatResponse("away").ballFromOwnGoal).toBe(35);
});
