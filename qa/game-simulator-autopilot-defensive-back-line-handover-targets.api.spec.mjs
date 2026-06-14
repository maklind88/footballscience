import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveBackLineHandoverTargets } from "../src/modules/game-simulator/autopilot-defensive-back-line-handover-targets.mjs";

function createBackLineHandoverDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      position: { x: 50, y: 34 },
      startPosition: { x: 50, y: 34 },
      target: { x: 70, y: 42 },
      ownerPlayerId: "H8",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 70, y: 42 },
      receiverPlayerId: "H9",
      beforeSnapshot: { ball: { position: { x: 50, y: 34 }, ownerPlayerId: "H8" } },
      offensiveAutopilot: { principleLabel: "Run behind" },
      autoPrinciples: ["Line break"],
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clampToPitch = (point) => ({
    x: clamp(point.x, 0, pitch.length),
    y: clamp(point.y, 0, pitch.width),
  });
  return {
    clamp,
    clampToPitch,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveLineDistanceFromOwnGoal: () => 24,
    getDefensiveRunnerThreats: () => [
      {
        player: { id: "H9", team: "home", position: { x: 72, y: 44 } },
        isChannelRun: true,
        isBlindsideRun: false,
        isDepthThreat: true,
        isBoxThreat: false,
      },
    ],
    getDefensiveUnitGap: () => 8,
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({ behindLine: 0.36 }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      if (!Number.isFinite(y)) {
        return 0;
      }
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.id === "A1",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot defensive back line handover targets expose moved contracts", () => {
  const targets = createGameSimulatorAutopilotDefensiveBackLineHandoverTargets(createBackLineHandoverDeps());

  expect(typeof targets.getDefensiveBackLineHandoverContext).toBe("function");
  expect(typeof targets.applyDefensiveBackLineHandoverTargets).toBe("function");
});

test("game simulator autopilot defensive back line handover targets detect depth handover context", () => {
  const targets = createGameSimulatorAutopilotDefensiveBackLineHandoverTargets(createBackLineHandoverDeps());

  const context = targets.getDefensiveBackLineHandoverContext("away", { x: 62, y: 40 }, {
    phaseKey: "midBlock",
  });

  expect(context).toBeTruthy();
  expect(context.isChannelThreat).toBe(true);
  expect(context.isDeepThreat).toBe(true);
  expect(context.dropDepth).toBeGreaterThan(3);
  expect(context.sideSign).toBe(1);
});

test("game simulator autopilot defensive back line handover targets reshape back line and midfield screen", () => {
  const targets = createGameSimulatorAutopilotDefensiveBackLineHandoverTargets(createBackLineHandoverDeps());
  const back = [
    { id: "A4", team: "away", position: { x: 84, y: 25 } },
    { id: "A5", team: "away", position: { x: 84, y: 34 } },
    { id: "A6", team: "away", position: { x: 84, y: 43 } },
  ];
  const midfield = [
    { id: "A8", team: "away", position: { x: 75, y: 30 } },
    { id: "A10", team: "away", position: { x: 75, y: 40 } },
  ];
  const targetMap = new Map([...back, ...midfield].map((player) => [player.id, { ...player.position }]));

  const labels = targets.applyDefensiveBackLineHandoverTargets(
    "away",
    targetMap,
    { back, midfield },
    { x: 62, y: 40 },
    { phaseKey: "midBlock", backToMidfield: 10, minBackLineFromOwnGoal: 6, maxBackLineFromOwnGoal: 64 }
  );

  expect(labels).toContain("Back line handover against channel run");
  expect(labels).toContain("Midfield screens second ball behind line");
  expect(targetMap.get("A5").x).toBeGreaterThan(84);
  expect(targetMap.get("A8").x).toBeGreaterThan(75);
});
