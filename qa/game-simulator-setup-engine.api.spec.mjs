import { expect, test } from "@playwright/test";
import { createGameSimulatorSetupEngine } from "../src/modules/game-simulator/setup-engine.mjs";

function createEngine() {
  const pitch = { length: 105, width: 68 };
  const state = { physicalProfile: "elite", players: [], ball: { position: { x: 52.5, y: 34 } } };
  const teams = {
    home: { color: "#2563eb", accent: "#93c5fd", formation: "4-3-3" },
    away: { color: "#dc2626", accent: "#fecaca", formation: "4-3-3" },
  };
  return createGameSimulatorSetupEngine({
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    ballRadiusMeters: 0.22,
    chooseScoredCandidateWithVariation: (candidates) =>
      [...candidates].sort((a, b) => b.score - a.score)[0] ?? null,
    chooseWeightedOption: (entries) => entries[0],
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    clampToPitch: (point) => ({
      x: Math.min(Math.max(point.x, 0), pitch.length),
      y: Math.min(Math.max(point.y, 0), pitch.width),
    }),
    cloneVector: (point) => ({ x: point.x, y: point.y }),
    competitionPhysicalProfiles: {
      elite: {
        key: "elite",
        label: "Elite",
        maxSpeedMultiplier: 1.1,
        accelerationMultiplier: 1.05,
        reactionTimeMultiplier: 0.9,
        dribbleSpeedMultiplier: 1.02,
        ballPowerMultiplier: 1,
        roleMultipliers: {},
      },
    },
    defaultKickoffTeamId: "home",
    defaultPhysicalProfileKey: "elite",
    defensiveAutopilotProfiles: { "4-3-3": { blockWidth: 30, ballSideShift: 0.55, wideCompression: 0.8, backToBall: 16, backToMidfield: 8, midfieldToForward: 8, pressOffset: 1.2, maxBackLineFromOwnGoal: 34 } },
    defensivePhaseProfiles: { midBlock: { label: "Mid Block", blockWidth: 30, minBlockWidth: 22, maxBlockWidth: 44, ballSideShift: 0.55, wideCompression: 0.8, backToBall: 16, backToMidfield: 8, midfieldToForward: 8, pressOffset: 1.2, maxBackLineFromOwnGoal: 34, minBackLineFromOwnGoal: 12 } },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    formationLayouts: { "4-3-3": [[8, 34], [22, 12], [20, 26], [20, 42], [22, 56], [36, 34], [46, 24], [46, 44], [66, 14], [74, 34], [66, 54]] },
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveAutopilotLineKey: (player) => (player.shortLabel === "GK" ? "gk" : "midfield"),
    getDefensiveCompactLineIntegritySettings: () => null,
    getDefensiveGoalkeeperTarget: () => ({ x: 8, y: 34 }),
    getDefensiveLineCenterY: () => 34,
    getDefensiveLineX: () => 32,
    getDefensiveUnitGap: () => 8,
    getIntelligenceArchetype: () => ({
      baseIntelligence: 75,
      weights: {
        perception: 1,
        decisionSpeed: 1,
        decisionQuality: 1,
        tacticalDiscipline: 1,
        technicalSecurity: 1,
        pressResistance: 1,
        composure: 1,
      },
    }),
    getOffensiveAutopilotProfile: () => ({ shortSupport: 0.5, recycleWindow: 0.5, directness: 0.5, tempo: 0.5, lineBreakBias: 0.5, widthDiscipline: 0.5, overlapBias: 0.5, crossBias: 0.5, switchBias: 0.5, progressionUrgency: 0.5 }),
    getOffensiveRoleKey: () => "connector",
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getOpponentPenaltySpot: () => ({ x: 94, y: 34 }),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPlayerMagnetLabel: (player) => player?.shortLabel ?? "",
    getSprintArchetype: () => ({ key: "balanced", accelerationFactor: 1, maxSpeedFactor: 1, burstDistance: 8, shortBurstBoost: 1 }),
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    getTeamAttackStyleProfile: () => ({ shortSupport: 0.5, tempo: 0.5, directness: 0.5, widthMultiplier: 1 }),
    getTeamDefenseStyleKey: () => "balanced",
    getTeamDefenseStyleProfile: () => ({ label: "Balanced", principleLabel: "Balanced", preferredPhase: "midBlock", pressingIntensity: 0.5, tackleIntent: 0.5, blockWidthMultiplier: 1, ballSideShiftOffset: 0, backToBallOffset: 0, lineGapOffset: 0, pressOffsetMultiplier: 1, lineHeightOffset: 0 }),
    intelligenceLabelBoosts: {},
    invalidateAutoPilotPossessionPlan: () => {},
    isFrontLineRole: () => false,
    isGoalkeeper: (player) => player?.shortLabel === "GK",
    normalize: (from, to) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    },
    pitch,
    playerRadiusMeters: 1.1,
    playerTendencyTemplates: {
      balanced: { label: "Balanced", dribble: 0.5, passAndMove: 0.5, earlyCross: 0.5, overlap: 0.5, lineBreakPass: 0.5, retain: 0.5, boxRun: 0.5, switchPlay: 0.5 },
      "pass-and-move": { label: "Pass and Move", dribble: 0.4, passAndMove: 0.8, earlyCross: 0.4, overlap: 0.4, lineBreakPass: 0.5, retain: 0.5, boxRun: 0.5, switchPlay: 0.5 },
      "ball-retainer": { label: "Ball Retainer", dribble: 0.4, passAndMove: 0.5, earlyCross: 0.3, overlap: 0.3, lineBreakPass: 0.4, retain: 0.8, boxRun: 0.2, switchPlay: 0.6 },
      "box-runner": { label: "Box Runner", dribble: 0.5, passAndMove: 0.5, earlyCross: 0.2, overlap: 0.3, lineBreakPass: 0.3, retain: 0.4, boxRun: 0.85, switchPlay: 0.3 },
      "line-breaker": { label: "Line Breaker", dribble: 0.4, passAndMove: 0.5, earlyCross: 0.4, overlap: 0.3, lineBreakPass: 0.8, retain: 0.5, boxRun: 0.3, switchPlay: 0.6 },
      "overlap-runner": { label: "Overlap Runner", dribble: 0.5, passAndMove: 0.5, earlyCross: 0.7, overlap: 0.8, lineBreakPass: 0.4, retain: 0.4, boxRun: 0.4, switchPlay: 0.4 },
      dribbler: { label: "Dribbler", dribble: 0.8, passAndMove: 0.4, earlyCross: 0.5, overlap: 0.4, lineBreakPass: 0.4, retain: 0.4, boxRun: 0.6, switchPlay: 0.3 },
    },
    randomBetween: (min, max) => (min + max) / 2,
    randomSign: () => 1,
    resolvePreferredFoot: () => "right",
    resolveWeakFootQuality: () => 0.7,
    setPiecePhaseProfiles: { kickoff: { label: "Kick-off" }, goalKick: { label: "Goal kick" }, corner: { label: "Corner" }, freeKick: { label: "Free kick" }, penalty: { label: "Penalty" }, throwIn: { label: "Throw-in" } },
    squadBlueprints: [],
    teamRosterOrder: { home: ["H1"], away: ["A1"] },
    teams,
    vec: (x, y) => ({ x, y }),
    getState: () => state,
  });
}

test("game simulator setup engine owns player factory and formation helpers", () => {
  const engine = createEngine();
  const player = engine.createPlayer({
    id: "H8",
    shortLabel: "8",
    role: "No. 8",
    team: "home",
    position: [46, 24],
    maxSpeed: 8,
    acceleration: 3,
    reactionTime: 0.4,
  });

  expect(player).toEqual(expect.objectContaining({
    id: "H8",
    team: "home",
    color: "#2563eb",
    preferredFoot: "right",
    weakFootQuality: 0.7,
  }));
  expect(player.maxSpeed).toBe(8.8);
  expect(player.acceleration).toBe(3.15);
  expect(player.reactionTime).toBe(0.36);
  expect(player.tendencyProfile.label).toBe("Pass and Move");
  expect(engine.getCompetitionPhysicalLabel("elite")).toBe("Elite");
  expect(engine.getFormationPositions("4-3-3", "away")[0]).toEqual({ x: 97, y: 34 });
  expect(engine.getKickoffSpot()).toEqual({ x: 52.5, y: 34 });
  expect(engine.getPlayerTendency(player, "passAndMove")).toBe(0.8);
});
