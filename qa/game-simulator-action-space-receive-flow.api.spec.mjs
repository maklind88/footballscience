import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceReceiveFlow } from "../src/modules/game-simulator/action-space-receive-flow.mjs";

const pitch = { length: 105, width: 68 };

function createReceiveFlowDeps(overrides = {}) {
  let state = overrides.state ?? {
    time: 0,
    ball: {
      position: { x: 35, y: 34 },
      target: { x: 35, y: 34 },
      startPosition: { x: 28, y: 34 },
      firstTouchMode: "auto",
      targetKind: "into-space",
      receiverPlayerId: null,
      profileKey: "line-break",
      ownerPlayerId: null,
    },
    autoPilotPlay: { receiveMomentum: null },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", roleKey: "connector", position: { x: 35, y: 34 }, bodyAngle: 0 },
      { id: "H9", team: "home", role: "ST", shortLabel: "H9", roleKey: "striker", position: { x: 49, y: 34 }, bodyAngle: 0 },
      { id: "H6", team: "home", role: "DM", shortLabel: "H6", roleKey: "pivot", position: { x: 29, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", roleKey: "back", position: { x: 52, y: 34 }, bodyAngle: Math.PI },
    ],
    sequence: { steps: [] },
    restartPhase: null,
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
    set(_target, property, value) {
      state[property] = value;
      return true;
    },
  });
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const getPlayerById = (playerId) => state.players.find((player) => player.id === playerId) ?? null;

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))),
    blendAngles: (a, b, weightA = 0.5, weightB = 0.5) => ((a * weightA) + (b * weightB)) / (weightA + weightB),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, inset = 0) => ({
      x: Math.max(inset, Math.min(pitch.length - inset, point.x)),
      y: Math.max(inset, Math.min(pitch.width - inset, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: () => 0.82,
    distance,
    firstTouchModes: {
      auto: { label: "Auto" },
      forward: { label: "Forward" },
      inside: { label: "Inside" },
      kill: { label: "Kill" },
    },
    getActionSpaceValue: (_startPoint, target) => {
      const targetThreat = {
        value: target.x >= 45 ? 0.62 : 0.34,
        centrality: 0.7,
        betweenLines: target.x >= 34 ? 0.38 : 0.1,
        centralPocket: target.x >= 34 ? 0.32 : 0.1,
        box: target.x >= 70 ? 0.28 : 0.1,
      };
      return {
        targetThreat,
        lineBreakCount: target.x >= 45 ? 1 : 0,
        openTarget: 0.78,
        value: targetThreat.value,
      };
    },
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotFlowContext: () => ({
      carrierJustReceived: true,
      pressure: 0.24,
      lastCarrierId: "H6",
      lastReceiverId: "H8",
      recentWideTargets: 0,
    }),
    getAutoPilotRoleStrength: () => 0.76,
    getBallControlOffsetMeters: () => 0,
    getBestReceiveBodyAngle: () => 0,
    getCarryLaneOpenSpaceScore: () => 0.82,
    getForwardProgressionWindow: () => ({ openLane: 0.78 }),
    getNearestOpponentGap: () => 8.5,
    getNearestOpponentGapInCarryLane: () => 9,
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getOpponentDensityAtPoint: () => 1,
    getPitchLaneIndex: (point) => Math.max(0, Math.min(4, Math.floor(point.y / (pitch.width / 5)))),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 45 ? 0.62 : 0.34,
      centrality: 0.7,
      betweenLines: point.x >= 34 ? 0.38 : 0.1,
      centralPocket: point.x >= 34 ? 0.32 : 0.1,
      box: point.x >= 70 ? 0.28 : 0.1,
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById,
    getPlayerDecisionContext: () => ({
      pressure: 0.24,
      profile: { decisionQuality: 0.82, technicalSecurity: 0.82 },
    }),
    getPlayerFacingAngle: (player) => player.bodyAngle ?? 0,
    getPlayerMagnetLabel: (player) => player.shortLabel ?? player.id,
    getPlayerPressureLoad: () => 0.24,
    getPlayerTendency: () => 0.72,
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    getTeamDensityAtPoint: () => 1,
    getTeamSupportCountAroundPoint: () => 1,
    isFrontLineRole: (roleKey) => roleKey === "striker",
    isPassReceiverOffside: () => false,
    isPlayerFacingForward: () => true,
    isSupportRole: (roleKey) => roleKey === "connector" || roleKey === "pivot",
    isWideChannel: (point) => point.y <= 14 || point.y >= pitch.width - 14,
    keepSecurePossessionOnlyForOwner: () => {},
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalizeAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
    pitch,
    rotatePlayerBodyTowardAngle: (player, angle) => {
      player.bodyAngle = angle;
    },
    setSecurePossessionAfterControlledTouch: () => {},
    state: stateProxy,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    getState: () => state,
    getPlayerByIdFromState: getPlayerById,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space receive flow exposes moved contracts", () => {
  const flow = createGameSimulatorActionSpaceReceiveFlow(createReceiveFlowDeps());

  expect(typeof flow.getFirstTouchModeLabel).toBe("function");
  expect(typeof flow.resolveFirstTouchMode).toBe("function");
  expect(typeof flow.getFirstTouchDirectionAngle).toBe("function");
  expect(typeof flow.getFirstTouchDistance).toBe("function");
  expect(typeof flow.clearAutoPilotReceiveMomentum).toBe("function");
  expect(typeof flow.setAutoPilotReceiveMomentum).toBe("function");
  expect(typeof flow.getAutoPilotReceiveMomentum).toBe("function");
  expect(typeof flow.getAutoPilotReceiveMomentumAdjustment).toBe("function");
  expect(typeof flow.getAutoPilotFirstActionAfterReceiveAdjustment).toBe("function");
  expect(typeof flow.getAutoPilotReceiveFlowContext).toBe("function");
  expect(typeof flow.getAutoPilotReceiveFlowAdjustment).toBe("function");
  expect(typeof flow.getReceiveContinuationCarryTarget).toBe("function");
  expect(typeof flow.buildAutoPilotReceiveContinuationCandidate).toBe("function");
  expect(typeof flow.applyControlledFirstTouch).toBe("function");
  expect(typeof flow.shouldUseAutoPilotActiveFirstTouch).toBe("function");
});

test("game simulator action space receive flow preserves controlled first touch momentum", () => {
  const deps = createReceiveFlowDeps();
  const flow = createGameSimulatorActionSpaceReceiveFlow(deps);
  const state = deps.getState();
  const carrier = deps.getPlayerByIdFromState("H8");

  const mode = flow.applyControlledFirstTouch(carrier, { x: 28, y: 34 }, 0.82, "forward");

  expect(mode).toBe("forward");
  expect(state.ball.ownerPlayerId).toBe("H8");
  expect(state.autoPilotPlay.receiveMomentum?.ownerPlayerId).toBe("H8");
  expect(state.autoPilotPlay.receiveMomentum?.mode).toBe("forward");
});

test("game simulator action space receive flow scores the first action after receive", () => {
  const deps = createReceiveFlowDeps();
  const flow = createGameSimulatorActionSpaceReceiveFlow(deps);
  const carrier = deps.getPlayerByIdFromState("H8");

  flow.setAutoPilotReceiveMomentum(carrier, "inside", { x: 28, y: 34 }, 0.82, 0, 1.2);
  const result = flow.getAutoPilotReceiveMomentumAdjustment(
    { actionType: "dribble", target: { x: 44, y: 34 }, forwardGain: 9 },
    carrier,
    carrier.position,
    { tempo: 0.7, switchBias: 0.6 }
  );

  expect(result.score).toBeGreaterThan(0);
  expect(result.labels).toContain("Carry first touch");
});

test("game simulator action space receive flow builds a continuation candidate", () => {
  const deps = createReceiveFlowDeps();
  const flow = createGameSimulatorActionSpaceReceiveFlow(deps);
  const carrier = deps.getPlayerByIdFromState("H8");

  flow.setAutoPilotReceiveMomentum(carrier, "inside", { x: 28, y: 34 }, 0.82, 0, 1.2);
  const candidate = flow.buildAutoPilotReceiveContinuationCandidate(carrier, carrier.position, {
    carryBias: 0.68,
    deliveryBias: 0.58,
    dribbleBias: 0.7,
    lineBreakBias: 0.66,
    shortSupport: 0.62,
    switchBias: 0.56,
    tempo: 0.7,
  });

  expect(candidate).toBeTruthy();
  expect(["pass", "dribble"]).toContain(candidate.actionType);
  expect(candidate.principleLabel).toContain("Receive flow");
});

test("game simulator action space receive flow reads live state through dependency boundary", () => {
  const deps = createReceiveFlowDeps();
  const flow = createGameSimulatorActionSpaceReceiveFlow(deps);
  const initialCarrier = deps.getPlayerByIdFromState("H8");

  expect(flow.getAutoPilotReceiveFlowContext(initialCarrier, initialCarrier.position, { shootBias: 0.5 }).depth).toBe(35);

  deps.replaceState({
    time: 0,
    ball: {
      position: { x: 62, y: 34 },
      target: { x: 62, y: 34 },
      startPosition: { x: 55, y: 34 },
      firstTouchMode: "auto",
      profileKey: "line-break",
    },
    autoPilotPlay: { receiveMomentum: null },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", roleKey: "connector", position: { x: 62, y: 34 }, bodyAngle: 0 },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", roleKey: "back", position: { x: 69, y: 34 }, bodyAngle: Math.PI },
    ],
    sequence: { steps: [] },
    restartPhase: null,
  });

  const nextCarrier = deps.getPlayerByIdFromState("H8");
  expect(flow.getAutoPilotReceiveFlowContext(nextCarrier, nextCarrier.position, { shootBias: 0.5 }).depth).toBe(62);
});
