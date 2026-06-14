export const pitch = {
  length: 105,
  width: 68,
  inset: 2,
};
export const teams = {
  home: {
    id: "home",
    name: "Blue Team",
    formation: "4-3-3",
    color: "#0d355d",
    accent: "#81b8ff",
    identity: {
      attackStyle: "control-possession",
      defenseStyle: "mid-block",
    },
  },
  away: {
    id: "away",
    name: "Red Team",
    formation: "3-4-3",
    color: "#a63333",
    accent: "#ff9b9b",
    identity: {
      attackStyle: "vertical-play",
      defenseStyle: "mid-block",
    },
  },
};
export const defaultTeamIdentities = {
  home: {
    attackStyle: "control-possession",
    defenseStyle: "mid-block",
  },
  away: {
    attackStyle: "vertical-play",
    defenseStyle: "mid-block",
  },
};
export const defaultPhysicalProfileKey = "elite-women";
export const competitionPhysicalProfiles = {
  "elite-women": {
    key: "elite-women",
    label: "Elite Women",
    maxSpeedMultiplier: 0.94,
    accelerationMultiplier: 0.96,
    reactionTimeMultiplier: 1.02,
    dribbleSpeedMultiplier: 0.95,
    ballPowerMultiplier: 0.96,
    roleMultipliers: {
      goalkeeper: { maxSpeedMultiplier: 0.96, accelerationMultiplier: 0.96, dribbleSpeedMultiplier: 0.92 },
      "center-back": { maxSpeedMultiplier: 0.97, accelerationMultiplier: 0.97, dribbleSpeedMultiplier: 0.94 },
      "full-back": { maxSpeedMultiplier: 0.98, accelerationMultiplier: 0.99, dribbleSpeedMultiplier: 0.97 },
      "wing-back": { maxSpeedMultiplier: 0.99, accelerationMultiplier: 1, dribbleSpeedMultiplier: 0.98 },
      winger: { maxSpeedMultiplier: 1.01, accelerationMultiplier: 1.01, dribbleSpeedMultiplier: 1 },
      striker: { maxSpeedMultiplier: 1, accelerationMultiplier: 1.01, dribbleSpeedMultiplier: 0.98 },
    },
  },
  "elite-men": {
    key: "elite-men",
    label: "Elite Men",
    maxSpeedMultiplier: 1,
    accelerationMultiplier: 1,
    reactionTimeMultiplier: 1,
    dribbleSpeedMultiplier: 1,
    ballPowerMultiplier: 1,
  },
  "academy-women": {
    key: "academy-women",
    label: "Academy Women",
    maxSpeedMultiplier: 0.88,
    accelerationMultiplier: 0.9,
    reactionTimeMultiplier: 1.08,
    dribbleSpeedMultiplier: 0.9,
    ballPowerMultiplier: 0.9,
    roleMultipliers: {
      winger: { maxSpeedMultiplier: 1.02, accelerationMultiplier: 1.02, dribbleSpeedMultiplier: 1.01 },
      striker: { maxSpeedMultiplier: 1.01, accelerationMultiplier: 1.02, dribbleSpeedMultiplier: 0.99 },
      "wing-back": { maxSpeedMultiplier: 1.01, accelerationMultiplier: 1.01, dribbleSpeedMultiplier: 1 },
    },
  },
  "academy-men": {
    key: "academy-men",
    label: "Academy Men",
    maxSpeedMultiplier: 0.94,
    accelerationMultiplier: 0.95,
    reactionTimeMultiplier: 1.04,
    dribbleSpeedMultiplier: 0.94,
    ballPowerMultiplier: 0.94,
    roleMultipliers: {
      winger: { maxSpeedMultiplier: 1.01, accelerationMultiplier: 1.01, dribbleSpeedMultiplier: 1 },
      striker: { maxSpeedMultiplier: 1.01, accelerationMultiplier: 1.01, dribbleSpeedMultiplier: 0.98 },
    },
  },
};
export const defaultKickoffTeamId = "home";
export const defaultFormations = {
  home: "4-3-3",
  away: "3-4-3",
};
export const teamRosterOrder = {
  home: ["H1", "H2", "H3", "H4", "H5", "H6", "H8", "H10", "H11", "H9", "H7"],
  away: ["A1", "A2", "A3", "A4", "A5", "A6", "A8", "A7", "A11", "A9", "A10"],
};
export const formationLayouts = {
  "4-3-3": [
    [7.5, 34],
    [20, 11],
    [18, 25],
    [18, 43],
    [20, 57],
    [33, 34],
    [40, 23],
    [40, 45],
    [55, 11],
    [60, 34],
    [55, 57],
  ],
  "4-1-4-1": [
    [7.5, 34],
    [20, 11],
    [18, 25],
    [18, 43],
    [20, 57],
    [31, 34],
    [39, 26],
    [39, 42],
    [42, 14],
    [49, 34],
    [42, 54],
  ],
  "3-4-3": [
    [7.5, 34],
    [18, 18],
    [18, 34],
    [18, 50],
    [34, 11],
    [34, 25],
    [34, 43],
    [34, 57],
    [56, 14],
    [60, 34],
    [56, 54],
  ],
  "4-4-2": [
    [7.5, 34],
    [20, 10],
    [18, 24],
    [18, 44],
    [20, 58],
    [36, 12],
    [34, 28],
    [34, 40],
    [36, 56],
    [55, 26],
    [55, 42],
  ],
  "4-2-3-1": [
    [7.5, 34],
    [20, 10],
    [18, 24],
    [18, 44],
    [20, 58],
    [31, 28],
    [31, 40],
    [46, 12],
    [47, 34],
    [46, 56],
    [60, 34],
  ],
  "3-5-2": [
    [7.5, 34],
    [18, 18],
    [18, 34],
    [18, 50],
    [34, 10],
    [34, 24],
    [36, 34],
    [34, 44],
    [34, 58],
    [58, 28],
    [58, 40],
  ],
};
export const playerRadiusMeters = 1.2;
export const ballRadiusMeters = 0.58;
export const sequenceStorageKey = "football-simulator-sequence-v1";
export const sequenceLibraryStorageKey = "football-simulator-sequence-library-v2";
export const defaultScenarioInfo = {
  title: "Scenario",
  text:
    "The starting point is a full-pitch setup with two formations. You can build your own tactical scenario by arranging the players, choosing where the ball travels next, and then reading how many metres each player can cover during the ball action.",
  meta:
    "Every pass, dribble or shot is saved automatically as a step that you can adjust, jump between and replay from the current position.",
};

export const squadBlueprints = [
  { team: "home", id: "H1", shortLabel: "GK", role: "Goalkeeper", position: [7.5, 34], maxSpeed: 5.4, acceleration: 1.9, reactionTime: 0.38 },
  { team: "home", id: "H2", shortLabel: "LB", role: "Left Back", position: [20, 11], maxSpeed: 8.1, acceleration: 2.8, reactionTime: 0.24 },
  { team: "home", id: "H3", shortLabel: "LCB", role: "Left Center Back", position: [18, 25], maxSpeed: 7.2, acceleration: 2.4, reactionTime: 0.26 },
  { team: "home", id: "H4", shortLabel: "RCB", role: "Right Center Back", position: [18, 43], maxSpeed: 7.2, acceleration: 2.4, reactionTime: 0.26 },
  { team: "home", id: "H5", shortLabel: "RB", role: "Right Back", position: [20, 57], maxSpeed: 8.2, acceleration: 2.9, reactionTime: 0.24 },
  { team: "home", id: "H6", shortLabel: "6", role: "Holding Midfielder", position: [33, 34], maxSpeed: 7.7, acceleration: 2.7, reactionTime: 0.2 },
  { team: "home", id: "H8", shortLabel: "8", role: "Right No. 8", position: [40, 45], maxSpeed: 7.9, acceleration: 2.8, reactionTime: 0.18 },
  { team: "home", id: "H10", shortLabel: "10", role: "Left No. 8", position: [40, 23], maxSpeed: 7.9, acceleration: 2.8, reactionTime: 0.18 },
  { team: "home", id: "H11", shortLabel: "LW", role: "Left Winger", position: [55, 11], maxSpeed: 8.9, acceleration: 3.2, reactionTime: 0.16 },
  { team: "home", id: "H9", shortLabel: "ST", role: "Striker", position: [60, 34], maxSpeed: 8.8, acceleration: 3.2, reactionTime: 0.16 },
  { team: "home", id: "H7", shortLabel: "RW", role: "Right Winger", position: [55, 57], maxSpeed: 9, acceleration: 3.3, reactionTime: 0.16 },
  { team: "away", id: "A1", shortLabel: "GK", role: "Goalkeeper", position: [97.5, 34], maxSpeed: 5.3, acceleration: 1.9, reactionTime: 0.38 },
  { team: "away", id: "A2", shortLabel: "LCB", role: "Left Center Back", position: [86, 18], maxSpeed: 7.2, acceleration: 2.4, reactionTime: 0.26 },
  { team: "away", id: "A3", shortLabel: "CB", role: "Center Back", position: [88, 34], maxSpeed: 7.1, acceleration: 2.3, reactionTime: 0.27 },
  { team: "away", id: "A4", shortLabel: "RCB", role: "Right Center Back", position: [86, 50], maxSpeed: 7.2, acceleration: 2.4, reactionTime: 0.26 },
  { team: "away", id: "A5", shortLabel: "LM", role: "Left Wing-Back", position: [70, 11], maxSpeed: 8.5, acceleration: 3, reactionTime: 0.22 },
  { team: "away", id: "A6", shortLabel: "8", role: "Left Central Midfielder", position: [68, 24], maxSpeed: 7.8, acceleration: 2.8, reactionTime: 0.2 },
  { team: "away", id: "A8", shortLabel: "6", role: "Right Central Midfielder", position: [68, 44], maxSpeed: 7.8, acceleration: 2.8, reactionTime: 0.2 },
  { team: "away", id: "A7", shortLabel: "RM", role: "Right Wing-Back", position: [70, 57], maxSpeed: 8.5, acceleration: 3, reactionTime: 0.22 },
  { team: "away", id: "A11", shortLabel: "LW", role: "Left Forward", position: [56, 14], maxSpeed: 8.8, acceleration: 3.1, reactionTime: 0.18 },
  { team: "away", id: "A9", shortLabel: "ST", role: "Centre Forward", position: [54, 34], maxSpeed: 8.8, acceleration: 3.1, reactionTime: 0.18 },
  { team: "away", id: "A10", shortLabel: "RW", role: "Right Forward", position: [56, 54], maxSpeed: 8.8, acceleration: 3.1, reactionTime: 0.18 },
];
export {
  intelligenceRoleArchetypes,
  sprintRoleArchetypes,
  playerTendencyTemplates,
  gameRoleProfiles,
  intelligenceLabelBoosts,
  formationMagnetLabels,
} from "./model-data-player-profiles.mjs";
export const defensiveAutopilotProfiles = {
  "4-3-3": {
    blockWidth: 40,
    ballSideShift: 0.46,
    wideCompression: 0.86,
    backToBall: 18,
    backToMidfield: 10.5,
    midfieldToForward: 10.5,
    pressOffset: 1.8,
    maxBackLineFromOwnGoal: 47,
  },
  "4-1-4-1": {
    blockWidth: 38,
    ballSideShift: 0.5,
    wideCompression: 0.84,
    backToBall: 17,
    backToMidfield: 9.5,
    midfieldToForward: 9.5,
    pressOffset: 1.7,
    maxBackLineFromOwnGoal: 45,
  },
  "3-4-3": {
    blockWidth: 42,
    ballSideShift: 0.44,
    wideCompression: 0.88,
    backToBall: 19,
    backToMidfield: 11,
    midfieldToForward: 11,
    pressOffset: 1.9,
    maxBackLineFromOwnGoal: 49,
  },
  "4-4-2": {
    blockWidth: 38,
    ballSideShift: 0.48,
    wideCompression: 0.84,
    backToBall: 17,
    backToMidfield: 10,
    midfieldToForward: 9,
    pressOffset: 1.75,
    maxBackLineFromOwnGoal: 45,
  },
  "4-2-3-1": {
    blockWidth: 39,
    ballSideShift: 0.47,
    wideCompression: 0.85,
    backToBall: 18,
    backToMidfield: 10,
    midfieldToForward: 10,
    pressOffset: 1.8,
    maxBackLineFromOwnGoal: 46,
  },
  "3-5-2": {
    blockWidth: 42,
    ballSideShift: 0.44,
    wideCompression: 0.88,
    backToBall: 19,
    backToMidfield: 10.5,
    midfieldToForward: 10.5,
    pressOffset: 1.9,
    maxBackLineFromOwnGoal: 49,
  },
};
export const offensiveAutopilotProfiles = {
  "4-3-3": {
    principleLabel: "triangles, high front three and overlapping width",
    width: 58,
    restBehind: 24,
    pivotBehind: 9,
    connectorAhead: 7,
    frontAhead: 14,
    wideDepthBoost: 7,
    runnerBoost: 6,
    wideBackAdvance: 1.05,
    wideForwardNarrowing: 0.24,
    connectorAdvance: 1.1,
    centralOverload: 0.48,
    pivotDrop: 1.4,
    strikerPairSupport: 0,
    runnerPreferences: {
      wideForward: 2.4,
      striker: 1.7,
      connector: 0.8,
      wideBack: 0.8,
    },
  },
  "4-1-4-1": {
    principleLabel: "4-3-3 conversion with wide midfielders released high",
    width: 54,
    restBehind: 23,
    pivotBehind: 9,
    connectorAhead: 6,
    frontAhead: 12,
    wideDepthBoost: 6,
    runnerBoost: 5,
    wideBackAdvance: 0.82,
    wideForwardNarrowing: 0.22,
    connectorAdvance: 1.8,
    centralOverload: 0.5,
    pivotDrop: 2.2,
    strikerPairSupport: 0,
    runnerPreferences: {
      wideForward: 2,
      connector: 1.4,
      striker: 1.2,
      wideBack: 0.4,
    },
  },
  "3-4-3": {
    principleLabel: "wing-backs high, double-pivot protection and front-three pinning",
    width: 62,
    restBehind: 25,
    pivotBehind: 10,
    connectorAhead: 7,
    frontAhead: 14,
    wideDepthBoost: 8,
    runnerBoost: 6.5,
    wideBackAdvance: 1.42,
    wideForwardNarrowing: 0.38,
    connectorAdvance: 0.55,
    centralOverload: 0.34,
    pivotDrop: 2.8,
    strikerPairSupport: 0,
    runnerPreferences: {
      wideBack: 2.4,
      wideForward: 2,
      striker: 1.5,
      connector: 0.4,
    },
  },
  "4-4-2": {
    principleLabel: "front-two occupation, wide counters and paired support",
    width: 52,
    restBehind: 24,
    pivotBehind: 8,
    connectorAhead: 6,
    frontAhead: 13,
    wideDepthBoost: 5,
    runnerBoost: 5.5,
    wideBackAdvance: 0.62,
    wideForwardNarrowing: 0.08,
    connectorAdvance: 0.3,
    centralOverload: 0.2,
    pivotDrop: 0.5,
    strikerPairSupport: 1,
    runnerPreferences: {
      secondStriker: 2.3,
      striker: 2,
      wideForward: 1.4,
      connector: 0.2,
    },
  },
  "4-2-3-1": {
    principleLabel: "double-pivot security with a 10 between lines",
    width: 56,
    restBehind: 24,
    pivotBehind: 9,
    connectorAhead: 7,
    frontAhead: 13,
    wideDepthBoost: 6.5,
    runnerBoost: 6,
    wideBackAdvance: 0.86,
    wideForwardNarrowing: 0.26,
    connectorAdvance: 1.55,
    centralOverload: 0.58,
    pivotDrop: 2.7,
    strikerPairSupport: 0,
    runnerPreferences: {
      connector: 2.1,
      wideForward: 1.8,
      striker: 1.3,
      wideBack: 0.8,
    },
  },
  "3-5-2": {
    principleLabel: "central overload, wing-back width and two-striker combinations",
    width: 60,
    restBehind: 25,
    pivotBehind: 9,
    connectorAhead: 7,
    frontAhead: 13,
    wideDepthBoost: 7,
    runnerBoost: 5.5,
    wideBackAdvance: 1.34,
    wideForwardNarrowing: 0.1,
    connectorAdvance: 0.95,
    centralOverload: 0.64,
    pivotDrop: 1.7,
    strikerPairSupport: 1,
    runnerPreferences: {
      wideBack: 2.2,
      striker: 2,
      connector: 1.1,
    },
  },
};
export const offensivePhaseProfiles = {
  setPiece: {
    label: "Set Piece",
    widthMultiplier: 0.96,
    restBehindOffset: 3,
    supportCompactness: 0.1,
    depthStretch: -1,
    finalThirdPin: 0,
  },
  buildUp: {
    label: "Build-Up",
    widthMultiplier: 1.02,
    restBehindOffset: 2,
    supportCompactness: 0.18,
    depthStretch: -2,
    finalThirdPin: 0,
  },
  progression: {
    label: "Progression",
    widthMultiplier: 1,
    restBehindOffset: 0,
    supportCompactness: 0.12,
    depthStretch: 0,
    finalThirdPin: 1.5,
  },
  finalThird: {
    label: "Final Third",
    widthMultiplier: 0.9,
    restBehindOffset: 4,
    supportCompactness: 0.08,
    depthStretch: 2.5,
    finalThirdPin: 4,
  },
};
export const matchPhaseModel = {
  inPossession: {
    label: "In Possession",
    description: "How the team creates structure and progresses while it owns the ball.",
  },
  outOfPossession: {
    label: "Out of Possession",
    description: "How the team defends space, presses and protects priority zones.",
  },
  transitionToAttack: {
    label: "Transition to Attack",
    description: "The first actions after winning the ball: secure, counter or release runners.",
  },
  transitionToDefend: {
    label: "Transition to Defend",
    description: "The first actions after losing the ball: counter-press, delay or recover shape.",
  },
  setPieces: {
    label: "Set Pieces",
    description: "Restarts such as kick-off, corners, free-kicks, throw-ins, goal-kicks and penalties.",
  },
};
export const setPiecePhaseProfiles = {
  kickoff: {
    label: "Kick-Off",
    principleLabel: "secure the first pass, open support angles and prepare the next attacking pattern",
    restartTeam: defaultKickoffTeamId,
  },
  corner: {
    label: "Corner",
    principleLabel: "attack priority zones, protect the second ball and secure rest defence",
  },
  freeKick: {
    label: "Free-Kick",
    principleLabel: "choose between direct threat, delivery, disguise or short restart",
  },
  throwIn: {
    label: "Throw-In",
    principleLabel: "create a safe first touch, third-player option and pressure escape",
  },
  goalKick: {
    label: "Goal-Kick",
    principleLabel: "build first line, invite or bypass pressure and keep rest defence connected",
  },
  penalty: {
    label: "Penalty",
    principleLabel: "isolate the execution moment and prepare rebound positions",
  },
};
export {
  attackStylePresets,
  possessionRhythmDefaults,
  possessionRhythmByAttackStyle,
  getAttackStyleRhythmProfile,
} from "./model-data-attack-style-profiles.mjs";
export {
  defenseStylePresets,
  defensivePhaseProfiles,
  defensiveAggressionPresets,
} from "./model-data-defense-style-profiles.mjs";
export const pitchSurfacePresets = {
  "natural-grass": {
    key: "natural-grass",
    label: "Natural Grass",
    groundRollFactor: 0.94,
    airCarryFactor: 0.99,
    dribbleCarryFactor: 0.985,
  },
  "hybrid-grass": {
    key: "hybrid-grass",
    label: "Hybrid Grass",
    groundRollFactor: 1,
    airCarryFactor: 1,
    dribbleCarryFactor: 1,
  },
  "football-turf": {
    key: "football-turf",
    label: "Football Turf",
    groundRollFactor: 1.07,
    airCarryFactor: 1.015,
    dribbleCarryFactor: 1.015,
  },
};
export const weatherPresets = {
  dry: {
    key: "dry",
    label: "Dry",
    dribbleTractionFactor: 1.02,
    dribbleControlFactor: 1,
    ballRollFactor: 0.98,
    ballSkidFactor: 0.96,
  },
  damp: {
    key: "damp",
    label: "Damp",
    dribbleTractionFactor: 0.98,
    dribbleControlFactor: 0.98,
    ballRollFactor: 1,
    ballSkidFactor: 1,
  },
  wet: {
    key: "wet",
    label: "Wet",
    dribbleTractionFactor: 0.93,
    dribbleControlFactor: 0.94,
    ballRollFactor: 1.04,
    ballSkidFactor: 1.08,
  },
};
export const firstTouchModes = {
  auto: "Auto",
  kill: "Kill",
  forward: "Forward",
  inside: "Inside",
  outside: "Outside",
  back: "Back",
  across: "Across Body",
};
export function resolvePreferredFoot(blueprint) {
  const role = blueprint?.role?.toLowerCase() ?? "";
  const shortLabel = blueprint?.shortLabel?.toUpperCase() ?? "";
  if (/\bleft\b/.test(role) || shortLabel.startsWith("L")) {
    return "left";
  }
  if (/\bright\b/.test(role) || shortLabel.startsWith("R")) {
    return "right";
  }
  if (/goalkeeper|center back|holding midfielder/.test(role)) {
    return "right";
  }
  if (/attacking midfielder|winger|forward|striker|centre forward/.test(role)) {
    return blueprint.team === "away" && /10|11/.test(blueprint.id) ? "left" : "right";
  }
  return "right";
}
export function resolveWeakFootQuality(blueprint) {
  const role = blueprint?.role?.toLowerCase() ?? "";
  const shortLabel = blueprint?.shortLabel?.toUpperCase() ?? "";
  if (/goalkeeper/.test(role)) {
    return 0.58;
  }
  if (/center back/.test(role) || /^(LCB|RCB|CB)$/.test(shortLabel)) {
    return 0.62;
  }
  if (/winger|forward|striker|centre forward|attacking midfielder/.test(role)) {
    return 0.78;
  }
  if (/holding midfielder|central midfielder|no\. 8/.test(role) || /^(6|8|10)$/.test(shortLabel)) {
    return 0.74;
  }
  if (/back|wing-back/.test(role) || /^(LB|RB|LM|RM)$/.test(shortLabel)) {
    return 0.7;
  }
  return 0.68;
}
export {
  autoBallProfiles,
  autoDribbleProfiles,
} from "./model-data-ball-profiles.mjs";
