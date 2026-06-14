import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotGoalkeeperDistributionCandidates } from "../src/modules/game-simulator/autopilot-goalkeeper-distribution-candidates.mjs";

function createGoalkeeperDistributionDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    players: [
      { id: "H1", team: "home", position: { x: 12, y: 34 }, roleKey: "gk", shortLabel: "GK" },
      { id: "H2", team: "home", position: { x: 22, y: 16 }, roleKey: "wideBack", shortLabel: "LB" },
      { id: "H6", team: "home", position: { x: 24, y: 34 }, roleKey: "pivot", shortLabel: "DM" },
      { id: "H9", team: "home", position: { x: 50, y: 34 }, roleKey: "striker", shortLabel: "ST" },
      { id: "A1", team: "away", position: { x: 94, y: 34 }, roleKey: "gk", shortLabel: "GK" },
      { id: "A9", team: "away", position: { x: 45, y: 34 }, roleKey: "striker", shortLabel: "ST" },
    ],
  };
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.86,
    computeTimeToCoverDistance: (_player, gap) => gap / 7,
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotRoleStrength: (player, strength) => {
      if (strength === "runner" && ["striker", "wideForward"].includes(player.roleKey)) {
        return 0.88;
      }
      if (strength === "receiver") {
        return 0.82;
      }
      return 0.64;
    },
    getDepthPoint: (teamId, depth, options = {}) => ({
      x: teamId === "home" ? depth : pitch.length - depth,
      y: options.y ?? pitch.width / 2,
    }),
    getOffensiveRoleKey: (player) => player.roleKey,
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.2,
    getState: () => state,
    getTeamSupportCountAroundPoint: (teamId, point, excludedIds = new Set(), radius = 12) => (
      state.players.reduce((count, player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || player.roleKey === "gk") {
          return count;
        }
        return count + (distance(player.position, point) <= radius ? 1 : 0);
      }, 0)
    ),
    getWideSideSign: (point) => {
      const position = point?.position || point;
      return position?.y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player.roleKey === "gk",
    pitch,
    resolveBallActionProfile: () => ({ averageSpeed: 18 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator autopilot goalkeeper distribution candidates expose moved contracts", () => {
  const candidates = createGameSimulatorAutopilotGoalkeeperDistributionCandidates(createGoalkeeperDistributionDeps());

  expect(typeof candidates.getGoalkeeperDistributionPressure).toBe("function");
  expect(typeof candidates.getGoalkeeperDirectReleaseTarget).toBe("function");
  expect(typeof candidates.buildAutoPilotGoalkeeperDistributionCandidate).toBe("function");
});

test("game simulator autopilot goalkeeper distribution candidates score press pressure", () => {
  const calm = createGameSimulatorAutopilotGoalkeeperDistributionCandidates(createGoalkeeperDistributionDeps());
  const pressed = createGameSimulatorAutopilotGoalkeeperDistributionCandidates(createGoalkeeperDistributionDeps({
    state: {
      restartPhase: null,
      players: [
        { id: "H1", team: "home", position: { x: 12, y: 34 }, roleKey: "gk" },
        { id: "A7", team: "away", position: { x: 21, y: 32 }, roleKey: "wideForward" },
        { id: "A9", team: "away", position: { x: 25, y: 37 }, roleKey: "striker" },
        { id: "A10", team: "away", position: { x: 33, y: 27 }, roleKey: "connector" },
      ],
    },
  }));

  expect(pressed.getGoalkeeperDistributionPressure("home", { x: 12, y: 34 })).toBeGreaterThan(
    calm.getGoalkeeperDistributionPressure("home", { x: 12, y: 34 })
  );
});

test("game simulator autopilot goalkeeper distribution candidates build short distribution", () => {
  const candidates = createGameSimulatorAutopilotGoalkeeperDistributionCandidates(createGoalkeeperDistributionDeps());
  const carrier = { id: "H1", team: "home", position: { x: 12, y: 34 }, roleKey: "gk", shortLabel: "GK" };

  const candidate = candidates.buildAutoPilotGoalkeeperDistributionCandidate(carrier, carrier.position, {
    shortSupport: 0.9,
    routeOneBias: 0.1,
    directness: 0.2,
    frontAhead: 0,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    label: "gk build-out",
    principleKey: "gk-build-out",
  });
  expect(["H2", "H6"]).toContain(candidate.receiverPlayerId);
});

test("game simulator autopilot goalkeeper distribution candidates build direct release", () => {
  const state = {
    restartPhase: null,
    players: [
      { id: "H1", team: "home", position: { x: 12, y: 34 }, roleKey: "gk", shortLabel: "GK" },
      { id: "H9", team: "home", position: { x: 50, y: 34 }, roleKey: "striker", shortLabel: "ST" },
      { id: "A1", team: "away", position: { x: 94, y: 34 }, roleKey: "gk", shortLabel: "GK" },
      { id: "A9", team: "away", position: { x: 24, y: 34 }, roleKey: "striker", shortLabel: "ST" },
    ],
  };
  const candidates = createGameSimulatorAutopilotGoalkeeperDistributionCandidates(createGoalkeeperDistributionDeps({
    state,
  }));
  const carrier = state.players[0];

  const candidate = candidates.buildAutoPilotGoalkeeperDistributionCandidate(carrier, carrier.position, {
    shortSupport: 0.38,
    routeOneBias: 0.82,
    directness: 0.8,
    frontAhead: 8,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    label: "gk release",
    principleKey: "gk-direct-release",
    principleRunnerPlayerId: "H9",
  });
  expect(candidate.isLineBreak).toBe(true);
});
