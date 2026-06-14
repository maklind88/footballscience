import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotLiveOffensiveAutoV2 } from "../src/modules/game-simulator/autopilot-live-offensive-auto-v2.mjs";

const pitch = { length: 105, width: 68 };

function createLiveOffensiveAutoV2Deps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      inTransit: false,
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      position: { x: 50, y: 34 },
      startPosition: { x: 48, y: 34 },
      target: { x: 62, y: 30 },
    },
	    players: [
	      { id: "H2", team: "home", role: "RB", position: { x: 44, y: 10 } },
	      { id: "H4", team: "home", role: "CB", position: { x: 30, y: 26 } },
      { id: "H6", team: "home", role: "6", position: { x: 42, y: 34 } },
      { id: "H8", team: "home", role: "8", position: { x: 50, y: 34 } },
      { id: "H7", team: "home", role: "W", position: { x: 56, y: 18 } },
      { id: "H9", team: "home", role: "9", position: { x: 70, y: 34 } },
      { id: "A4", team: "away", role: "CB", position: { x: 45, y: 27 } },
      { id: "A5", team: "away", role: "CB", position: { x: 44, y: 41 } },
      { id: "A6", team: "away", role: "6", position: { x: 58, y: 34 } },
    ],
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
	  const getOffensiveRoleKey = (player) => ({
	    RB: "wideBack",
	    LB: "wideBack",
	    WB: "wideBack",
	    CB: "rest",
    "6": "pivot",
    "8": "connector",
    "10": "connector",
    W: "wideForward",
    "9": "striker",
  })[player?.role] ?? "connector";

  return {
    angleDifference: (first, second) => Math.abs(first - second),
    clamp,
    clampToCircle: (point, center, radius) => {
      if (!Number.isFinite(radius)) return { ...point };
      const gap = distance(center, point);
      if (gap <= radius) return { ...point };
      return {
        x: center.x + ((point.x - center.x) / gap) * radius,
        y: center.y + ((point.y - center.y) / gap) * radius,
      };
    },
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    distance,
    getActionOrigin: (player) => player.actionOrigin ?? player.position,
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: (point, teamId) => teamId === "home" ? point.x : pitch.length - point.x,
    getAutoPilotRoleStrength: (player, role) => {
      if (role === "runner" && player.role === "9") return 1;
      if (role === "receiver" && (player.role === "8" || player.role === "W")) return 0.9;
      return 0.45;
    },
    getBallNearSupportTriangleTarget: (_teamId, ballPoint, slot, sideSign) => ({
      underSupport: { x: ballPoint.x - 9, y: ballPoint.y + 2 },
      insideAngle: { x: ballPoint.x - 2, y: ballPoint.y - sideSign * 8 },
      beyondOption: { x: ballPoint.x + 10, y: ballPoint.y + 5 },
      outsideWidth: { x: ballPoint.x + 2, y: sideSign < 0 ? 7 : 61 },
      restLock: { x: ballPoint.x - 16, y: pitch.width / 2 },
    })[slot],
    getDistanceFromOwnGoal: (teamId, point) => teamId === "home" ? point.x : pitch.length - point.x,
    getEditableRadius: () => Infinity,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint: (_teamId, point) => (point.x >= 58 ? 0.58 : 0.24),
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerFacingAngle: () => 0,
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isGoalkeeper: (player) => player?.role === "GK",
    isWidePrincipleZone: (point) => Math.abs((point?.y ?? pitch.width / 2) - pitch.width / 2) >= 20,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot live offensive auto v2 exposes moved contracts", () => {
  const offensive = createGameSimulatorAutopilotLiveOffensiveAutoV2(createLiveOffensiveAutoV2Deps());

  expect(typeof offensive.cloneOffensiveAutopilotIntents).toBe("function");
  expect(typeof offensive.cloneAutoV2DecisionTriggers).toBe("function");
  expect(typeof offensive.scanAutoV2DecisionTriggers).toBe("function");
  expect(typeof offensive.weightOffensiveAutoV2Intent).toBe("function");
  expect(typeof offensive.getOffensiveAutoV2Intent).toBe("function");
  expect(typeof offensive.setReachableOffensiveAutoV2Target).toBe("function");
  expect(typeof offensive.pickOffensiveAutoV2Player).toBe("function");
  expect(typeof offensive.applyOffensiveAutoV2RelationshipLayer).toBe("function");
  expect(typeof offensive.buildOffensiveAutoV2Intents).toBe("function");
});

test("game simulator autopilot live offensive auto v2 clones saved triggers and intents safely", () => {
  const offensive = createGameSimulatorAutopilotLiveOffensiveAutoV2(createLiveOffensiveAutoV2Deps());
  const clonedIntents = offensive.cloneOffensiveAutopilotIntents({
    H8: { type: "offer-angle", urgency: 0.72, startDelay: 0.1, relationship: "playable angle" },
    H9: { label: "Run behind" },
  });
  const clonedTriggers = offensive.cloneAutoV2DecisionTriggers({
    forwardFacing: 0.8,
    labels: ["forward-facing"],
  });

  expect(clonedIntents.H8).toEqual({
    type: "offer-angle",
    label: "Offer angle",
    urgency: 0.72,
    roleKey: null,
    startDelay: 0.1,
    relationship: "playable angle",
  });
  expect(clonedIntents.H9.type).toBe("offer-angle");
  expect(clonedTriggers.forwardFacing).toBe(0.8);
  expect(clonedTriggers.ballPressure).toBe(0);
  expect(clonedTriggers.labels).toEqual(["forward-facing"]);
});

test("game simulator autopilot live offensive auto v2 scans decision triggers from current state", () => {
  const offensive = createGameSimulatorAutopilotLiveOffensiveAutoV2(createLiveOffensiveAutoV2Deps());
  const triggers = offensive.scanAutoV2DecisionTriggers(
    "home",
    { x: 62, y: 30 },
    { actionType: "pass", carrierPlayerId: "H8", receiverPlayerId: "H7" },
    { phaseKey: "progression" }
  );

  expect(triggers.forwardFacing).toBeGreaterThan(0.9);
  expect(triggers.highBackLine).toBeGreaterThan(0.5);
  expect(triggers.receiverPressure).toBeGreaterThan(0.5);
  expect(triggers.centralCongestion).toBeGreaterThan(0.3);
  expect(triggers.labels).toContain("ball-carrier forward-facing");
  expect(triggers.labels).toContain("high defensive line");
});

test("game simulator autopilot live offensive auto v2 connects support relationships", () => {
  const deps = createLiveOffensiveAutoV2Deps();
  const offensive = createGameSimulatorAutopilotLiveOffensiveAutoV2(deps);
  const plannedPositions = new Map(
    deps.getState().players
      .filter((player) => player.team === "home")
      .map((player) => [player.id, { ...player.position }])
  );
  const triggers = {
    ballPressure: 0.62,
    centralClosed: 0.62,
    centralCongestion: 0.6,
    forwardFacing: 0.86,
    highBackLine: 0.82,
    labels: ["ball-carrier pressured", "high defensive line"],
    poorTouchLooseBall: 0,
    receiverPressure: 0.52,
    restDefenseBalance: 0.4,
  };

  const labels = offensive.applyOffensiveAutoV2RelationshipLayer(
    "home",
    plannedPositions,
    { phaseKey: "progression", widthDiscipline: 0.7 },
    { x: 62, y: 30 },
    { carrierPlayerId: "H8", offensiveAutopilot: { triggers } },
    deps.getState().players.find((player) => player.id === "H9")
  );

  expect(labels).toContain("Auto v2 trigger: pressure creates support behind");
	  expect(labels).toContain("Auto v2 trigger: receiver pressure creates escape angle");
	  expect(labels).toContain("Auto v2 trigger: central lane closed, hold width");
	  expect(plannedPositions.get("H6")).toEqual({ x: 53, y: 32 });
	  expect(plannedPositions.get("H7")).toEqual({ x: 60, y: 38 });
	  expect(plannedPositions.get("H2")).toEqual({ x: 64, y: 7 });
});

test("game simulator autopilot live offensive auto v2 builds weighted player intents", () => {
  const deps = createLiveOffensiveAutoV2Deps();
  const offensive = createGameSimulatorAutopilotLiveOffensiveAutoV2(deps);
  const attackingPlayers = deps.getState().players.filter((player) => player.team === "home");
  const plannedPositions = new Map(attackingPlayers.map((player) => [player.id, { ...player.position }]));
  plannedPositions.set("H9", { x: 76, y: 32 });
  plannedPositions.set("H7", { x: 62, y: 8 });
  const triggers = {
    ballPressure: 0.18,
    centralClosed: 0.6,
    centralCongestion: 0.5,
    forwardFacing: 0.9,
    highBackLine: 0.75,
    labels: ["ball-carrier forward-facing", "high defensive line"],
    poorTouchLooseBall: 0,
    receiverPressure: 0.2,
    restDefenseBalance: 0.7,
  };

  const intents = offensive.buildOffensiveAutoV2Intents(
    "home",
    attackingPlayers,
    plannedPositions,
    { phaseKey: "progression" },
    { x: 62, y: 30 },
    { offensiveAutopilot: { triggers } },
    "H9"
  );

  expect(intents.H9.type).toBe("run-behind");
  expect(intents.H7.type).toBe("hold-width");
  expect(intents.H9.relationship).toContain("high defensive line");
  expect(intents.H4.type).toBe("rest-defense");
});
