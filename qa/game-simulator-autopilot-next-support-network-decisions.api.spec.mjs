import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotNextSupportNetworkDecisions } from "../src/modules/game-simulator/autopilot-next-support-network-decisions.mjs";

function createNextSupportNetworkDeps(overrides = {}) {
  const state = overrides.state || {
    players: [
      { id: "H1", team: "home", position: { x: 40, y: 34 }, role: "Central Midfielder" },
      { id: "H2", team: "home", position: { x: 55, y: 34 }, role: "Striker" },
      { id: "H3", team: "home", position: { x: 47, y: 34 }, role: "Defensive Midfielder" },
      { id: "H4", team: "home", position: { x: 53, y: 26 }, role: "Central Midfielder" },
      { id: "H5", team: "home", position: { x: 63, y: 34 }, role: "Striker" },
      { id: "H6", team: "home", position: { x: 55, y: 47 }, role: "Right Back" },
      { id: "A1", team: "away", position: { x: 58, y: 34 }, role: "Centre Back" },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  return {
    clamp,
    computeTimeToCoverDistance: (_player, runDistance) => runDistance / 8,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAutoPilotCandidateReceiver: (candidate) =>
      state.players.find((player) => player.id === candidate.receiverPlayerId) || null,
    getAutoPilotRoleStrength: () => 0.72,
    getOffensiveRoleKey: (player) => ({
      H1: "connector",
      H2: "striker",
      H3: "pivot",
      H4: "connector",
      H5: "striker",
      H6: "wideBack",
    }[player.id] || "connector"),
    getOpponentPressureAtPoint: () => 0.22,
    getPitchThreatProfile: () => ({
      value: 0.56,
      betweenLines: 0.36,
      centralPocket: 0.32,
    }),
    getPlayerPressureLoad: () => 0.28,
    getPlayerTendency: () => 0.66,
    getReceptionSupportTarget: (_teamId, target, slot, sideSign) => {
      const attackSign = 1;
      const slotTargets = {
        under: { x: target.x - attackSign * 8, y: target.y },
        inside: { x: target.x - attackSign * 2, y: target.y - sideSign * 8 },
        beyond: { x: target.x + attackSign * 8, y: target.y },
        outside: { x: target.x, y: target.y + sideSign * 13 },
        restLink: { x: target.x - attackSign * 14, y: target.y },
        weakSide: { x: target.x, y: target.y - sideSign * 18 },
      };
      return slotTargets[slot] || target;
    },
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      if (!Number.isFinite(y)) {
        return 0;
      }
      if (y < 22) {
        return -1;
      }
      if (y > 46) {
        return 1;
      }
      return 0;
    },
    isGoalkeeper: () => false,
    isWidePrincipleZone: (point) => point.y < 17 || point.y > 51,
    resolveBallActionProfile: () => ({ averageSpeed: 12 }),
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels) => [...new Set(labels)],
    ...overrides,
  };
}

test("game simulator autopilot next support network decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotNextSupportNetworkDecisions(createNextSupportNetworkDeps());

  expect(typeof decisions.estimateAutoPilotCandidateDuration).toBe("function");
  expect(typeof decisions.getNextSupportSlotRoleFit).toBe("function");
  expect(typeof decisions.getAutoPilotNextSupportNetworkProfile).toBe("function");
  expect(typeof decisions.getAutoPilotNextSupportNetworkAdjustment).toBe("function");
});

test("game simulator autopilot next support network decisions estimate action duration", () => {
  const decisions = createGameSimulatorAutopilotNextSupportNetworkDecisions(createNextSupportNetworkDeps());

  expect(decisions.estimateAutoPilotCandidateDuration(
    { actionType: "pass", target: { x: 52, y: 34 }, receiverPlayerId: "H2" },
    { id: "H1", team: "home" },
    { x: 40, y: 34 }
  )).toBeCloseTo(1);
});

test("game simulator autopilot next support network decisions map arrival slots", () => {
  const decisions = createGameSimulatorAutopilotNextSupportNetworkDecisions(createNextSupportNetworkDeps());
  const carrier = { id: "H1", team: "home", position: { x: 40, y: 34 } };
  const candidate = {
    actionType: "pass",
    target: { x: 55, y: 34 },
    receiverPlayerId: "H2",
    receiverPressure: 0.28,
    forwardGain: 15,
    passDistance: 15,
  };

  const network = decisions.getAutoPilotNextSupportNetworkProfile(candidate, carrier, { x: 40, y: 34 }, {
    shortSupport: 0.82,
    overlapBias: 0.62,
    switchBias: 0.62,
  });

  expect(network.arrivalCount).toBeGreaterThanOrEqual(3);
  expect(network.underAvailable).toBe(true);
  expect(network.insideAvailable).toBe(true);
  expect(network.beyondAvailable).toBe(true);
  expect(network.coveredRequiredSlots).toBeGreaterThanOrEqual(2);
});

test("game simulator autopilot next support network decisions reward ready reception support", () => {
  const decisions = createGameSimulatorAutopilotNextSupportNetworkDecisions(createNextSupportNetworkDeps());
  const carrier = { id: "H1", team: "home", position: { x: 40, y: 34 } };
  const candidate = {
    actionType: "pass",
    target: { x: 55, y: 34 },
    receiverPlayerId: "H2",
    receiverPressure: 0.28,
    forwardGain: 15,
    passDistance: 15,
    isLineBreak: true,
  };

  const result = decisions.getAutoPilotNextSupportNetworkAdjustment(candidate, carrier, { x: 40, y: 34 }, {
    shortSupport: 0.82,
    directness: 0.7,
    overlapBias: 0.62,
    switchBias: 0.62,
  });

  expect(result.score).toBeGreaterThan(0.35);
  expect(result.labels).toContain("Next support ready");
  expect(result.labels).toContain("Reception triangle ready");
  expect(result.labels).toContain("Depth option ready");
});
