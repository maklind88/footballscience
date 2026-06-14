import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotReceiverAvailabilityDecisions } from "../src/modules/game-simulator/autopilot-receiver-availability-decisions.mjs";

const pitch = { length: 105, width: 68 };

function createReceiverAvailabilityDeps(overrides = {}) {
  let state = overrides.state ?? {
    players: [
      { id: "H1", team: "home", roleKey: "connector", position: { x: 46, y: 34 } },
      { id: "H2", team: "home", roleKey: "wideForward", position: { x: 58, y: 26 } },
      { id: "A1", team: "away", roleKey: "centreBack", position: { x: 67, y: 46 } },
      { id: "A2", team: "away", roleKey: "centreBack", position: { x: 70, y: 24 } },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (first, second) => Math.abs(first - second),
    ballRadiusMeters: 0.3,
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    computeTimeToCoverDistance: () => overrides.defenderTime ?? 0.42,
    distance,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotCandidateReceiver: (candidate) =>
      state.players.find((player) => player.id === candidate.receiverPlayerId) ?? null,
    getCoverShadowInfluence: () => overrides.coverShadow ?? 0.08,
    getNearestOpponentGap: () => overrides.nearestGap ?? 8.8,
    getOffensiveRoleKey: (player) => player.roleKey,
    getPassLaneRiskProfile: () => ({
      averageSpeed: overrides.averageSpeed ?? 11.5,
      coverShadow: overrides.laneCoverShadow ?? 0.1,
    }),
    getPlayerDecisionContext: () => ({
      profile: {
        composure: overrides.composure ?? 0.76,
        decisionSpeed: overrides.decisionSpeed ?? 0.76,
        perception: overrides.perception ?? 0.76,
        pressResistance: overrides.pressResistance ?? 0.76,
        technicalSecurity: overrides.technicalSecurity ?? 0.76,
      },
    }),
    getPlayerFacingAngle: () => overrides.receiverFacingAngle ?? 0,
    getPlayerPressureLoad: () => overrides.playerPressure ?? 0.24,
    getReceiveFootUsageScore: () => overrides.receiveFoot ?? 0.78,
    getReceiveOrientationScore: () => overrides.receiveOrientation ?? 0.78,
    isFrontLineRole: (roleKey) => ["striker", "secondStriker", "wideForward"].includes(roleKey),
    isSupportRole: (roleKey) => ["pivot", "connector", "wideBack"].includes(roleKey),
    isWideChannel: (point) => Math.abs(point.y - pitch.width / 2) >= 20,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    playerRadiusMeters: 0.8,
    projectPointOnSegmentWithRatio: (_point, _start, target) => ({
      point: target,
      ratio: overrides.projectionRatio ?? 0.86,
    }),
    state: stateProxy,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot receiver availability decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotReceiverAvailabilityDecisions(createReceiverAvailabilityDeps());

  expect(typeof decisions.getReceiverAvailabilityProfile).toBe("function");
  expect(typeof decisions.getAutoPilotReceiverAvailabilityAdjustment).toBe("function");
  expect(typeof decisions.getAutoPilotReceivePressureTrapAdjustment).toBe("function");
});

test("game simulator autopilot receiver availability decisions reward clean forward receivers", () => {
  const decisions = createGameSimulatorAutopilotReceiverAvailabilityDecisions(createReceiverAvailabilityDeps());
  const carrier = { id: "H1", team: "home", position: { x: 46, y: 34 }, roleKey: "connector" };
  const candidate = {
    actionType: "pass",
    forwardGain: 12,
    isLineBreak: true,
    passDistance: 14,
    receiverPlayerId: "H2",
    receiverPressure: 0.24,
    target: { x: 58, y: 26 },
  };

  const profile = decisions.getReceiverAvailabilityProfile(candidate, carrier, carrier.position, {});
  const adjustment = decisions.getAutoPilotReceiverAvailabilityAdjustment(
    candidate,
    carrier,
    carrier.position,
    { lineBreakBias: 0.72, shortSupport: 0.62 }
  );

  expect(profile.availability).toBeGreaterThan(0.65);
  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Available receiver");
});

test("game simulator autopilot receiver availability decisions punish locked receive traps", () => {
  const deps = createReceiverAvailabilityDeps({
    averageSpeed: 9.5,
    coverShadow: 0.9,
    defenderTime: 0.22,
    laneCoverShadow: 1.2,
    nearestGap: 2.4,
    playerPressure: 0.78,
    receiveFoot: 0.4,
    receiveOrientation: 0.38,
    state: {
      players: [
        { id: "H1", team: "home", roleKey: "connector", position: { x: 46, y: 34 } },
        { id: "H2", team: "home", roleKey: "wideForward", position: { x: 58, y: 8 } },
        { id: "A1", team: "away", roleKey: "fullBack", position: { x: 59, y: 8.5 } },
        { id: "A2", team: "away", roleKey: "centreBack", position: { x: 60, y: 12 } },
      ],
    },
    technicalSecurity: 0.42,
    pressResistance: 0.38,
    composure: 0.4,
  });
  const decisions = createGameSimulatorAutopilotReceiverAvailabilityDecisions(deps);
  const carrier = { id: "H1", team: "home", position: { x: 46, y: 34 }, roleKey: "connector" };

  const adjustment = decisions.getAutoPilotReceivePressureTrapAdjustment(
    {
      actionType: "pass",
      forwardGain: 12,
      passDistance: 20,
      receiverPlayerId: "H2",
      receiverPressure: 0.78,
      target: { x: 58, y: 8 },
    },
    carrier,
    carrier.position,
    { shortSupport: 0.4 }
  );

  expect(adjustment.score).toBeLessThan(0);
  expect(adjustment.labels).toContain("Receive trap: avoid locked feet");
  expect(adjustment.context.trapPressure).toBeGreaterThan(0.7);
});

test("game simulator autopilot receiver availability decisions read live state through dependency boundary", () => {
  const deps = createReceiverAvailabilityDeps();
  const decisions = createGameSimulatorAutopilotReceiverAvailabilityDecisions(deps);
  const carrier = { id: "H1", team: "home", position: { x: 46, y: 34 }, roleKey: "connector" };

  expect(decisions.getReceiverAvailabilityProfile(
    { actionType: "pass", receiverPlayerId: "H2", target: { x: 58, y: 26 } },
    carrier,
    carrier.position,
    {}
  )?.receiver.id).toBe("H2");

  deps.replaceState({
    players: [
      { id: "H1", team: "home", roleKey: "connector", position: { x: 46, y: 34 } },
      { id: "H9", team: "home", roleKey: "striker", position: { x: 66, y: 34 } },
    ],
  });

  expect(decisions.getReceiverAvailabilityProfile(
    { actionType: "pass", receiverPlayerId: "H9", target: { x: 66, y: 34 } },
    carrier,
    carrier.position,
    {}
  )?.receiver.id).toBe("H9");
});
