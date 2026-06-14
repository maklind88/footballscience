import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotRoleResponsibilityDecisions } from "../src/modules/game-simulator/autopilot-role-responsibility-decisions.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createRoleResponsibilityDeps(overrides = {}) {
  const carrier = { id: "H6", team: "home", position: { x: 52, y: 34 }, role: "Central Midfielder", shortLabel: "CM" };
  const receiver = { id: "H8", team: "home", position: { x: 63, y: 34 }, role: "Attacking Midfielder", shortLabel: "AM" };
  const players = [carrier, receiver];

  return {
    carrier,
    receiver,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.82,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.7,
      targetPressure: 0.24,
      targetThreat: { box: 0.08, centralPocket: 0.44, value: 0.66 },
      value: 0.72,
    }),
    getAttackingDepth: (point) => point.x,
    getAutoPilotCandidatePattern: () => ({
      family: "third-player",
      forwardGain: 8,
      passDistance: 12,
      receiverRoleKey: "connector",
    }),
    getOffensiveRoleKey: (player) => (player.id === "H6" ? "connector" : "connector"),
    getOpponentPressureAtPoint: () => 0.24,
    getPitchThreatProfile: (point) => ({
      box: point.x >= 70 ? 0.18 : 0.08,
      centralPocket: point.x >= 60 ? 0.42 : 0.2,
      halfSpace: 0.2,
      value: point.x >= 60 ? 0.64 : 0.38,
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.32,
    getPotentialPassReceiverAtTarget: () => receiver,
    isFrontLineRole: (roleKey) => ["striker", "secondStriker", "wideForward"].includes(roleKey),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))].slice(0, 3),
    ...overrides,
  };
}

test("game simulator autopilot role responsibility decisions expose role fit contracts", () => {
  const decisions = createGameSimulatorAutopilotRoleResponsibilityDecisions(createRoleResponsibilityDeps());

  expect(typeof decisions.getAutoPilotCandidateReceiver).toBe("function");
  expect(typeof decisions.getAutoPilotRoleResponsibilityAdjustment).toBe("function");
});

test("game simulator autopilot role responsibility decisions reward connector line-breaking responsibility", () => {
  const deps = createRoleResponsibilityDeps();
  const decisions = createGameSimulatorAutopilotRoleResponsibilityDecisions(deps);

  const adjustment = decisions.getAutoPilotRoleResponsibilityAdjustment(
    {
      actionType: "pass",
      forwardGain: 8,
      isLineBreak: true,
      laneClarity: 0.82,
      passDistance: 12,
      receiverPlayerId: "H8",
      target: { x: 64, y: 34 },
    },
    deps.carrier,
    deps.carrier.position,
    { directness: 0.5 }
  );

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Role fit: connect and break lines");
  expect(adjustment.context).toMatchObject({
    roleKey: "connector",
    highValueAction: true,
  });
});

test("game simulator autopilot decision engine delegates role responsibility to a focused module", () => {
  const decisionEngine = readProjectFile("src/modules/game-simulator/autopilot-decision-engine.mjs");
  const roleResponsibility = readProjectFile("src/modules/game-simulator/autopilot-role-responsibility-decisions.mjs");

  expect(decisionEngine).toContain('from "./autopilot-role-responsibility-decisions.mjs"');
  expect(decisionEngine).toContain("createGameSimulatorAutopilotRoleResponsibilityDecisions({");
  expect(decisionEngine).not.toContain("function getAutoPilotCandidateReceiver(");
  expect(decisionEngine).not.toContain("function getAutoPilotRoleResponsibilityAdjustment(");
  expect(roleResponsibility).toContain("function getAutoPilotCandidateReceiver(");
  expect(roleResponsibility).toContain("function getAutoPilotRoleResponsibilityAdjustment(");
});
