export function createGameSimulatorSetupEngine(deps = {}) {
  const {
    angleBetween,
    ballRadiusMeters,
    chooseScoredCandidateWithVariation,
    chooseWeightedOption,
    clamp,
    clampToPitch,
    cloneVector,
    competitionPhysicalProfiles,
    defaultKickoffTeamId,
    defaultPhysicalProfileKey,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance,
    formationLayouts,
    getAttackDirectionSign,
    getDefensiveAutopilotLineKey,
    getDefensiveCompactLineIntegritySettings,
    getDefensiveGoalkeeperTarget,
    getDefensiveLineCenterY,
    getDefensiveLineX,
    getDefensiveUnitGap,
    getIntelligenceArchetype,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getOtherTeamId,
    getPlayerMagnetLabel,
    getSprintArchetype,
    getTeamAttackAngle,
    getTeamAttackStyleProfile,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    intelligenceLabelBoosts,
    invalidateAutoPilotPossessionPlan,
    isFrontLineRole,
    isGoalkeeper,
    normalize,
    pitch,
    playerRadiusMeters,
    playerTendencyTemplates,
    randomBetween,
    randomSign,
    resolvePreferredFoot,
    resolveWeakFootQuality,
    setPiecePhaseProfiles,
    squadBlueprints,
    teamRosterOrder,
    teams,
    vec,
    getState,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

  function roundTo(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
  }
  function getActivePhysicalProfileKey() {
  try {
  return state?.physicalProfile ?? defaultPhysicalProfileKey;
  } catch {
  return defaultPhysicalProfileKey;
  }
  }
  function getCompetitionPhysicalProfile(profileKey = null) {
  const resolvedKey = profileKey ?? getActivePhysicalProfileKey();
  return competitionPhysicalProfiles[resolvedKey] ?? competitionPhysicalProfiles[defaultPhysicalProfileKey];
  }
  function getCompetitionPhysicalLabel(profileKey = null) {
  return getCompetitionPhysicalProfile(profileKey).label;
  }
  function getRolePhysicalMultipliers(playerLike, profileKey = null) {
  const physicalProfile = getCompetitionPhysicalProfile(profileKey);
  const archetype = getSprintArchetype(playerLike);
  return physicalProfile.roleMultipliers?.[archetype.key] ?? {};
  }
  function buildPlayerPhysicalProfile(blueprint, profileKey = null) {
  const physicalProfile = getCompetitionPhysicalProfile(profileKey);
  const roleMultipliers = getRolePhysicalMultipliers(blueprint, physicalProfile.key);
  const baseMaxSpeed = blueprint.baseMaxSpeed ?? blueprint.maxSpeed;
  const baseAcceleration = blueprint.baseAcceleration ?? blueprint.acceleration;
  const baseReactionTime = blueprint.baseReactionTime ?? blueprint.reactionTime;
  const maxSpeedMultiplier =
  physicalProfile.maxSpeedMultiplier * (roleMultipliers.maxSpeedMultiplier ?? 1);
  const accelerationMultiplier =
  physicalProfile.accelerationMultiplier * (roleMultipliers.accelerationMultiplier ?? 1);
  const reactionTimeMultiplier =
  physicalProfile.reactionTimeMultiplier * (roleMultipliers.reactionTimeMultiplier ?? 1);
  const dribbleSpeedMultiplier =
  physicalProfile.dribbleSpeedMultiplier * (roleMultipliers.dribbleSpeedMultiplier ?? 1);
  return {
  key: physicalProfile.key,
  label: physicalProfile.label,
  archetypeKey: getSprintArchetype(blueprint).key,
  baseMaxSpeed,
  baseAcceleration,
  baseReactionTime,
  maxSpeed: roundTo(baseMaxSpeed * maxSpeedMultiplier, 1),
  acceleration: roundTo(baseAcceleration * accelerationMultiplier, 2),
  reactionTime: roundTo(baseReactionTime * reactionTimeMultiplier, 2),
  dribbleSpeedMultiplier,
  ballPowerMultiplier: physicalProfile.ballPowerMultiplier,
  };
  }
  function applyPhysicalProfileToPlayer(player, profileKey = null) {
  const physicalProfile = buildPlayerPhysicalProfile(player, profileKey);
  player.baseMaxSpeed = physicalProfile.baseMaxSpeed;
  player.baseAcceleration = physicalProfile.baseAcceleration;
  player.baseReactionTime = physicalProfile.baseReactionTime;
  player.maxSpeed = physicalProfile.maxSpeed;
  player.acceleration = physicalProfile.acceleration;
  player.reactionTime = physicalProfile.reactionTime;
  player.physicalProfile = physicalProfile;
  }
  function applyPhysicalProfileToPlayers(players, profileKey = null) {
  players.forEach((player) => applyPhysicalProfileToPlayer(player, profileKey));
  }
  function intelligenceScoreToMetric(intelligence, weight, floor = 0.44, ceiling = 0.96) {
  const normalized = clamp((intelligence - 60) / 25, 0, 1);
  return clamp(floor + normalized * 0.38 * weight, floor, ceiling);
  }
  function buildPlayerIntelligenceProfile(blueprint) {
  const archetype = getIntelligenceArchetype(blueprint);
  const intelligence = clamp(
  archetype.baseIntelligence + (intelligenceLabelBoosts[blueprint.shortLabel] ?? 0),
  68,
  90
  );
  const profile = {
  intelligence,
  perception: intelligenceScoreToMetric(intelligence, archetype.weights.perception),
  decisionSpeed: intelligenceScoreToMetric(intelligence, archetype.weights.decisionSpeed),
  decisionQuality: intelligenceScoreToMetric(intelligence, archetype.weights.decisionQuality),
  tacticalDiscipline: intelligenceScoreToMetric(intelligence, archetype.weights.tacticalDiscipline),
  technicalSecurity: intelligenceScoreToMetric(intelligence, archetype.weights.technicalSecurity),
  pressResistance: intelligenceScoreToMetric(intelligence, archetype.weights.pressResistance),
  composure: intelligenceScoreToMetric(intelligence, archetype.weights.composure),
  };
  profile.executionUnderPressure = clamp(
  profile.technicalSecurity * 0.5 +
  profile.pressResistance * 0.25 +
  profile.composure * 0.25,
  0.4,
  0.96
  );
  return profile;
  }
  function buildPlayerSprintProfile(blueprint) {
  const archetype = getSprintArchetype(blueprint);
  return {
  key: archetype.key,
  accelerationFactor: archetype.accelerationFactor,
  maxSpeedFactor: archetype.maxSpeedFactor,
  burstDistance: archetype.burstDistance,
  shortBurstBoost: archetype.shortBurstBoost,
  };
  }
  function getDefaultPlayerTendencyKey(blueprint) {
  const role = blueprint.role ?? "";
  const label = blueprint.shortLabel ?? "";
  if (/goalkeeper/i.test(role)) {
  return "ball-retainer";
  }
  if (/wing-back/i.test(role) || /back/i.test(role) || /^(LB|RB|LM|RM)$/i.test(label)) {
  return "overlap-runner";
  }
  if (/winger|forward/i.test(role) || /^(LW|RW)$/i.test(label)) {
  return "dribbler";
  }
  if (/striker|centre forward/i.test(role) || /^ST$/i.test(label)) {
  return "box-runner";
  }
  if (/holding midfielder/i.test(role) || label === "6") {
  return "ball-retainer";
  }
  if (/no\. 8|central midfielder|attacking midfielder/i.test(role) || label === "8" || label === "10") {
  return "pass-and-move";
  }
  if (/center back/i.test(role) || /^(LCB|RCB|CB)$/i.test(label)) {
  return "line-breaker";
  }
  return "balanced";
  }
  function buildPlayerTendencyProfile(blueprint) {
  const key = blueprint.tendencyKey ?? getDefaultPlayerTendencyKey(blueprint);
  const template = playerTendencyTemplates[key] ?? playerTendencyTemplates.balanced;
  return {
  key,
  label: template.label,
  dribble: template.dribble,
  passAndMove: template.passAndMove,
  earlyCross: template.earlyCross,
  overlap: template.overlap,
  lineBreakPass: template.lineBreakPass,
  retain: template.retain,
  boxRun: template.boxRun,
  switchPlay: template.switchPlay,
  };
  }
  function getPlayerTendency(player, tendencyKey) {
  return clamp(player?.tendencyProfile?.[tendencyKey] ?? 0.5, 0, 1);
  }
  function getKickoffSpot() {
  return vec(pitch.length / 2, pitch.width / 2);
  }
  function getKickoffTakerId(teamId = defaultKickoffTeamId) {
  return teamId === "away" ? "A9" : "H9";
  }
  function findTeamPlayerByMagnetLabel(teamId, label, players = state.players) {
  return players.find((player) => player.team === teamId && getPlayerMagnetLabel(player) === label) ?? null;
  }
  function getKickoffSupportId(teamId = defaultKickoffTeamId, players = state.players) {
  return (
  findTeamPlayerByMagnetLabel(teamId, "6", players)?.id ??
  findTeamPlayerByMagnetLabel(teamId, "8", players)?.id ??
  findTeamPlayerByMagnetLabel(teamId, "10", players)?.id ??
  (teamId === "away" ? "A8" : "H6")
  );
  }
  function chooseKickoffSupportId(teamId = defaultKickoffTeamId, players = state.players) {
  const formation = teams[teamId]?.formation ?? "4-3-3";
  const styleProfile = getTeamAttackStyleProfile(teamId);
  const candidates = players
  .filter((player) => getPlayerTeamId(player) === teamId && !isGoalkeeper(player) && player.id !== getKickoffTakerId(teamId))
  .map((player) => {
  const label = getPlayerMagnetLabel(player);
  const roleKey = getOffensiveRoleKey(player, formation);
  const roleScore =
  roleKey === "pivot"
  ? 1.1 + styleProfile.shortSupport * 0.5
  : roleKey === "connector"
  ? 0.92 + styleProfile.tempo * 0.42
  : roleKey === "secondStriker"
  ? 0.68 + styleProfile.directness * 0.44
  : roleKey === "wideBack"
  ? 0.42 + styleProfile.widthMultiplier * 0.18
  : 0.16;
  const labelScore =
  label === "6"
  ? 0.38
  : label === "8"
  ? 0.32
  : label === "10"
  ? 0.28 + styleProfile.directness * 0.16
  : 0;
  return {
  player,
  score: roleScore + labelScore + randomBetween(-0.18, 0.22),
  };
  })
  .filter((candidate) => candidate.score >= 0.32);
  return chooseScoredCandidateWithVariation(candidates, styleProfile, {
  tolerance: 0.95,
  temperature: 0.36,
  })?.player.id ?? getKickoffSupportId(teamId, players);
  }
  function getKickoffSupportPoint(teamId, support = null) {
  const kickoffSpot = getKickoffSpot();
  const styleProfile = getTeamAttackStyleProfile(teamId);
  const sign = getAttackDirectionSign(teamId);
  const label = getPlayerMagnetLabel(support);
  const diagonalPreference =
  label === "8" || label === "10"
  ? 1
  : styleProfile.directness >= 0.62
  ? 0.8
  : 0.45;
  const side = randomSign();
  const dropDistance = randomBetween(4.7, 7.4) + (styleProfile.shortSupport - 0.5) * 0.9;
  const diagonalDistance = randomBetween(1.4, 5.8) * diagonalPreference;
  return clampToPitch({
  x: kickoffSpot.x - sign * dropDistance,
  y: kickoffSpot.y + side * diagonalDistance,
  }, 2);
  }
  const kickoffOpeningProfiles = {
  "secure-backline": {
  key: "secure-backline",
  label: "secure back-line opening",
  receiverRoles: ["rest", "gk", "pivot"],
  firstTouchMode: "inside",
  weight: (profile) =>
  0.36 + profile.shortSupport * 0.4 + profile.recycleWindow * 0.34 + (profile.directness < 0.5 ? 0.18 : 0),
  },
  "pivot-turnout": {
  key: "pivot-turnout",
  label: "pivot turnout",
  receiverRoles: ["pivot", "connector", "rest"],
  firstTouchMode: "forward",
  weight: (profile) =>
  0.32 + profile.shortSupport * 0.28 + profile.tempo * 0.24 + profile.lineBreakBias * 0.18,
  },
  "wide-release": {
  key: "wide-release",
  label: "wide release",
  receiverRoles: ["wideBack", "connector", "wideForward"],
  firstTouchMode: "inside",
  weight: (profile) =>
  0.22 + profile.widthDiscipline * 0.34 + profile.overlapBias * 0.32 + profile.crossBias * 0.22 + profile.switchBias * 0.12,
  },
  "weak-side-shift": {
  key: "weak-side-shift",
  label: "weak-side shift",
  receiverRoles: ["wideBack", "pivot", "connector"],
  firstTouchMode: "inside",
  weight: (profile) =>
  0.2 + profile.switchBias * 0.46 + profile.widthDiscipline * 0.2 + (profile.directness < 0.58 ? 0.12 : 0),
  },
  "vertical-second-touch": {
  key: "vertical-second-touch",
  label: "vertical second touch",
  receiverRoles: ["connector", "secondStriker", "wideBack", "pivot"],
  firstTouchMode: "forward",
  weight: (profile) =>
  0.16 + profile.directness * 0.44 + profile.lineBreakBias * 0.34 + profile.progressionUrgency * 0.26 + profile.tempo * 0.12,
  },
  };
  const kickoffOpeningMemory = {
  home: [],
  away: [],
  };
  function getRecentKickoffOpeningPenalty(teamId, openingKey) {
  if (!teamId || !openingKey) {
  return 0;
  }
  return (kickoffOpeningMemory[teamId] ?? []).reduce((penalty, key, index) => {
  if (key !== openingKey) {
  return penalty;
  }
  return penalty + (index === 0 ? 0.52 : 0.18 / (index + 0.75));
  }, 0);
  }
  function rememberKickoffOpening(teamId, openingKey) {
  if (!teamId || !openingKey || !kickoffOpeningMemory[teamId]) {
  return;
  }
  const memory = kickoffOpeningMemory[teamId];
  memory.unshift(openingKey);
  if (memory.length > 10) {
  memory.length = 10;
  }
  }
  function chooseKickoffOpeningProfile(teamId) {
  const profile = getOffensiveAutopilotProfile(teamId, getKickoffSpot(), "setPiece");
  const entries = Object.entries(kickoffOpeningProfiles);
  const selectedEntry = chooseWeightedOption(entries, ([key, opening]) => {
  const repeatPenalty = getRecentKickoffOpeningPenalty(teamId, key);
  return opening.weight(profile) + randomBetween(-0.05, 0.12) - repeatPenalty;
  });
  const [, opening] = selectedEntry ?? entries[0];
  rememberKickoffOpening(teamId, opening.key);
  return opening;
  }
  function clampKickoffPlayerToOwnHalf(point, teamId) {
  const center = getKickoffSpot();
  const isHome = teamId === "home";
  return {
  x: isHome
  ? clamp(point.x, 2, center.x - 1.8)
  : clamp(point.x, center.x + 1.8, pitch.length - 2),
  y: clamp(point.y, 2, pitch.width - 2),
  };
  }
  function applyKickoffShapeVariation(players, kickoffTeamId, protectedIds = new Set()) {
  const center = getKickoffSpot();
  players.forEach((player) => {
  const teamId = getPlayerTeamId(player);
  if (!teamId || protectedIds.has(player.id)) {
  return;
  }
  const attackSign = getAttackDirectionSign(teamId);
  const isKickoffTeam = teamId === kickoffTeamId;
  const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
  const attackProfile = getTeamAttackStyleProfile(teamId);
  const defenseProfile = getTeamDefenseStyleProfile(teamId);
  let xShift = randomBetween(-1.2, 1.2);
  let yShift = randomBetween(-2.1, 2.1);
  if (isKickoffTeam) {
  const stretch =
  (attackProfile.directness - 0.5) * 2.6 +
  (attackProfile.tempo - 0.5) * 1.5;
  const widthPull =
  roleKey === "wideBack" || roleKey === "wideForward"
  ? randomBetween(0.4, 2.4) * Math.sign(player.position.y - center.y || randomSign())
  : 0;
  const frontPush = isFrontLineRole(roleKey) ? randomBetween(0.6, 2.6) : 0;
  const restDrop = roleKey === "rest" || roleKey === "pivot" ? randomBetween(-1.8, 0.6) : 0;
  xShift += attackSign * (stretch + frontPush + restDrop);
  yShift += widthPull;
  } else {
  const pressIntent = defenseProfile.pressingIntensity ?? 0.5;
  const lineIntent = defenseProfile.preferredPhase === "highPress"
  ? 2.8
  : defenseProfile.preferredPhase === "lowBlock" || defenseProfile.preferredPhase === "boxDefending"
  ? -1.8
  : 0.4;
  const compactPull = defenseProfile.blockWidthMultiplier <= 0.92 ? 0.18 : 0.08;
  xShift += attackSign * (lineIntent + pressIntent * randomBetween(0.2, 1.8));
  yShift += (center.y - player.position.y) * compactPull + randomBetween(-1.1, 1.1);
  }
  player.position = clampKickoffPlayerToOwnHalf({
  x: player.position.x + xShift,
  y: player.position.y + yShift,
  }, teamId);
  player.bodyAngle = getTeamAttackAngle(teamId);
  });
  }
  function getKickoffDefensivePhaseKey(teamId) {
  const preferredPhase = getTeamDefenseStyleProfile(teamId).preferredPhase;
  if (preferredPhase === "highPress") {
  return "highPress";
  }
  if (preferredPhase === "lowBlock" || preferredPhase === "boxDefending") {
  return "lowBlock";
  }
  return "midBlock";
  }
  function getKickoffDefensiveSetupProfile(teamId, phaseKey = getKickoffDefensivePhaseKey(teamId)) {
  const formation = teams[teamId]?.formation ?? "4-3-3";
  const formationProfile = defensiveAutopilotProfiles[formation] ?? defensiveAutopilotProfiles["4-3-3"];
  const referenceProfile = defensiveAutopilotProfiles["4-3-3"];
  const phaseProfile = defensivePhaseProfiles[phaseKey] ?? defensivePhaseProfiles.midBlock;
  const styleKey = getTeamDefenseStyleKey(teamId);
  const styleProfile = getTeamDefenseStyleProfile(teamId);
  const gapWeight = phaseProfile.formationGapWeight ?? 0.4;
  const widthWeight = phaseProfile.formationWidthWeight ?? 0.45;
  return {
  ...phaseProfile,
  formation,
  phaseKey,
  phaseLabel: phaseProfile.label,
  styleKey,
  styleLabel: styleProfile.label,
  stylePrincipleLabel: styleProfile.principleLabel,
  threatResponse: {},
  lineActionAdjustment: {
  mode: "hold",
  shift: 0,
  heightDelta: 0,
  label: null,
  },
  pressingIntensity: styleProfile.pressingIntensity,
  tackleIntent: styleProfile.tackleIntent,
  blockWidth: clamp(
  (phaseProfile.blockWidth + (formationProfile.blockWidth - referenceProfile.blockWidth) * widthWeight) *
  styleProfile.blockWidthMultiplier,
  phaseProfile.minBlockWidth,
  phaseProfile.maxBlockWidth
  ),
  ballSideShift: clamp(
  phaseProfile.ballSideShift +
  (formationProfile.ballSideShift - referenceProfile.ballSideShift) * 0.45 +
  styleProfile.ballSideShiftOffset,
  0.36,
  0.82
  ),
  wideCompression: clamp(
  phaseProfile.wideCompression +
  (formationProfile.wideCompression - referenceProfile.wideCompression) * 0.35,
  0.7,
  0.92
  ),
  backToBall: clamp(
  phaseProfile.backToBall +
  (formationProfile.backToBall - referenceProfile.backToBall) * gapWeight +
  styleProfile.backToBallOffset,
  5,
  30
  ),
  backToMidfield: clamp(
  phaseProfile.backToMidfield +
  (formationProfile.backToMidfield - referenceProfile.backToMidfield) * gapWeight +
  styleProfile.lineGapOffset,
  4.5,
  12.5
  ),
  midfieldToForward: clamp(
  phaseProfile.midfieldToForward +
  (formationProfile.midfieldToForward - referenceProfile.midfieldToForward) * gapWeight +
  styleProfile.lineGapOffset,
  4.5,
  12.5
  ),
  pressOffset: clamp(
  (phaseProfile.pressOffset + (formationProfile.pressOffset - referenceProfile.pressOffset) * 0.35) *
  styleProfile.pressOffsetMultiplier,
  0.55,
  2.7
  ),
  maxBackLineFromOwnGoal: clamp(
  phaseProfile.maxBackLineFromOwnGoal +
  (formationProfile.maxBackLineFromOwnGoal - referenceProfile.maxBackLineFromOwnGoal) * 0.35 +
  styleProfile.lineHeightOffset,
  phaseProfile.minBackLineFromOwnGoal + 3,
  pitch.length - 8
  ),
  minBackLineFromOwnGoal: clamp(
  (phaseProfile.minBackLineFromOwnGoal ?? 9) + styleProfile.lineHeightOffset,
  7,
  pitch.length - 22
  ),
  };
  }
  function applyKickoffDefensiveStructure(players, kickoffTeamId) {
  const defendingTeamId = getOtherTeamId(kickoffTeamId);
  if (!defendingTeamId) {
  return;
  }
  const kickoffSpot = getKickoffSpot();
  const phaseKey = getKickoffDefensivePhaseKey(defendingTeamId);
  const profile = getKickoffDefensiveSetupProfile(defendingTeamId, phaseKey);
  const formation = teams[defendingTeamId]?.formation ?? "4-3-3";
  const roster = teamRosterOrder[defendingTeamId] ?? [];
  const basePositions = getFormationPositions(formation, defendingTeamId);
  const baseYById = new Map(
  roster.map((playerId, index) => [playerId, basePositions[index]?.y ?? pitch.width / 2])
  );
  const groups = {
  gk: [],
  back: [],
  midfield: [],
  forward: [],
  };
  players
  .filter((player) => getPlayerTeamId(player) === defendingTeamId)
  .forEach((player) => {
  groups[getDefensiveAutopilotLineKey(player, formation, phaseKey)].push(player);
  });
  Object.values(groups).forEach((group) => {
  group.sort((a, b) => (baseYById.get(a.id) ?? a.position.y) - (baseYById.get(b.id) ?? b.position.y));
  });
  groups.gk.forEach((player) => {
  const target = getDefensiveGoalkeeperTarget(defendingTeamId, kickoffSpot, profile);
  player.position = clampKickoffPlayerToOwnHalf(target, defendingTeamId);
  player.bodyAngle = angleBetween(player.position, kickoffSpot);
  player.actionOrigin = null;
  player.movementProgress = 0;
  });
  ["back", "midfield", "forward"].forEach((lineKey) => {
  const linePlayers = groups[lineKey].filter((player) => !isGoalkeeper(player));
  if (!linePlayers.length) {
  return;
  }
  const integritySettings = getDefensiveCompactLineIntegritySettings(profile, lineKey);
  const gap =
  integritySettings?.gap ??
  clamp(getDefensiveUnitGap(profile, lineKey), lineKey === "forward" ? 8.5 : 8, lineKey === "forward" ? 12 : 10.5);
  const lineWidth = gap * Math.max(0, linePlayers.length - 1);
  const lineX = getDefensiveLineX(defendingTeamId, lineKey, kickoffSpot, profile);
  const centerY = getDefensiveLineCenterY(lineKey, profile, kickoffSpot, lineWidth);
  linePlayers.forEach((player, index) => {
  const slot = {
  x: lineX,
  y: clamp(centerY - lineWidth / 2 + gap * index, 3.2, pitch.width - 3.2),
  };
  player.position = clampKickoffPlayerToOwnHalf(clampToPitch(slot, 2.2), defendingTeamId);
  player.bodyAngle = angleBetween(player.position, kickoffSpot);
  player.actionOrigin = null;
  player.movementProgress = 0;
  });
  });
  }
  function getBallControlOffsetMeters() {
  return playerRadiusMeters * 0.72 + ballRadiusMeters * 0.48;
  }
  function placePlayerWithControlPoint(player, controlPoint, facingAngle = getTeamAttackAngle(player.team)) {
  player.bodyAngle = facingAngle;
  player.position = getPlayerPositionForControlPoint(player, controlPoint, facingAngle);
  player.actionOrigin = null;
  player.movementProgress = 0;
  }
  function getPlayerPositionForControlPoint(player, controlPoint, facingAngle = getTeamAttackAngle(player.team)) {
  const controlOffset = getBallControlOffsetMeters();
  return clampToPitch({
  x: controlPoint.x - Math.cos(facingAngle) * controlOffset,
  y: controlPoint.y - Math.sin(facingAngle) * controlOffset,
  }, 2);
  }
  function getPlayerTeamId(player) {
  if (player?.team) {
  return player.team;
  }
  const blueprint = squadBlueprints.find((candidate) => candidate.id === player?.id);
  if (blueprint?.team) {
  return blueprint.team;
  }
  if (typeof player?.id === "string") {
  if (player.id.startsWith("H")) return "home";
  if (player.id.startsWith("A")) return "away";
  }
  return null;
  }
  function constrainPlayersForKickoff(players, kickoffTeamId = defaultKickoffTeamId) {
  const center = getKickoffSpot();
  const centerCircleBuffer = 10.2;
  players.forEach((player) => {
  if (player.id === getKickoffTakerId(kickoffTeamId)) {
  return;
  }
  const playerTeamId = getPlayerTeamId(player);
  const isHome = playerTeamId === "home";
  const ownHalfX = isHome
  ? Math.min(player.position.x, center.x - 1.8)
  : Math.max(player.position.x, center.x + 1.8);
  player.position = {
  x: ownHalfX,
  y: player.position.y,
  };
  if (playerTeamId !== kickoffTeamId && distance(player.position, center) < centerCircleBuffer) {
  const direction = normalize(center, player.position);
  const fallbackDirection = isHome ? vec(-1, 0) : vec(1, 0);
  const outward = Math.abs(direction.x) + Math.abs(direction.y) > 0 ? direction : fallbackDirection;
  player.position = clampToPitch({
  x: center.x + outward.x * centerCircleBuffer,
  y: center.y + outward.y * centerCircleBuffer,
  }, 2);
  player.position.x = isHome
  ? Math.min(player.position.x, center.x - 1.8)
  : Math.max(player.position.x, center.x + 1.8);
  }
  player.actionOrigin = null;
  player.movementProgress = 0;
  });
  }
  function applyKickoffSetup(targetState = state, { teamId = defaultKickoffTeamId, resetFormations = true } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const kickoffSpot = getKickoffSpot();
  const taker = targetState.players.find((player) => player.id === getKickoffTakerId(teamId));
  const supportId = chooseKickoffSupportId(teamId, targetState.players);
  const support = targetState.players.find((player) => player.id === supportId);
  const facingAngle = getTeamAttackAngle(teamId);
  const supportPoint = getKickoffSupportPoint(teamId, support);
  const takerFacingAngle = support ? angleBetween(kickoffSpot, supportPoint) : facingAngle;
  const supportFacingAngle = angleBetween(supportPoint, kickoffSpot);
  const openingProfile = chooseKickoffOpeningProfile(teamId);
  applyKickoffShapeVariation(targetState.players, teamId, new Set([taker?.id, support?.id].filter(Boolean)));
  applyKickoffDefensiveStructure(targetState.players, teamId);
  constrainPlayersForKickoff(targetState.players, teamId);
  if (support) {
  support.position = supportPoint;
  support.bodyAngle = supportFacingAngle;
  support.actionOrigin = null;
  support.movementProgress = 0;
  }
  if (taker) {
  placePlayerWithControlPoint(taker, kickoffSpot, takerFacingAngle);
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "kickoff",
  teamId,
  label: setPiecePhaseProfiles.kickoff.label,
  supportPlayerId: support?.id ?? null,
  openingKey: openingProfile.key,
  openingLabel: openingProfile.label,
  };
  targetState.ball.position = cloneVector(kickoffSpot);
  targetState.ball.startPosition = cloneVector(kickoffSpot);
  targetState.ball.target = cloneVector(kickoffSpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function getGoalKickTakerId(teamId = "home", players = state.players) {
  const roster = teamRosterOrder[teamId] ?? [];
  return (
  players.find((player) => getPlayerTeamId(player) === teamId && isGoalkeeper(player))?.id ??
  roster[0] ??
  null
  );
  }
  function getGoalKickSpot(teamId = "home") {
  return {
  x: teamId === "home" ? 5.8 : pitch.length - 5.8,
  y: pitch.width / 2,
  };
  }
  function applyGoalKickSetup(targetState = state, { teamId = "home", resetFormations = false } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const takerId = getGoalKickTakerId(teamId, targetState.players);
  const taker = targetState.players.find((player) => player.id === takerId);
  const goalKickSpot = getGoalKickSpot(teamId);
  const facingAngle = getTeamAttackAngle(teamId);
  if (taker) {
  placePlayerWithControlPoint(taker, goalKickSpot, facingAngle);
  taker.actionOrigin = null;
  taker.movementProgress = 0;
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "goalKick",
  teamId,
  label: setPiecePhaseProfiles.goalKick.label,
  };
  targetState.ball.position = cloneVector(goalKickSpot);
  targetState.ball.startPosition = cloneVector(goalKickSpot);
  targetState.ball.target = cloneVector(goalKickSpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function getCornerKickSpot(teamId = "home", sideY = 0) {
  return {
  x: teamId === "home" ? pitch.length - 0.65 : 0.65,
  y: sideY <= pitch.width / 2 ? 0.65 : pitch.width - 0.65,
  };
  }
  function getCornerKickTakerId(teamId = "home", sideY = 0, players = state.players) {
  const roster = teamRosterOrder[teamId] ?? [];
  const goalkeeperId = roster[0] ?? null;
  const cornerSpot = getCornerKickSpot(teamId, sideY);
  const teamPlayers = players
  .filter((player) => getPlayerTeamId(player) === teamId && player.id !== goalkeeperId)
  .map((player) => ({
  player,
  distanceToCorner: distance(player.position, cornerSpot),
  rosterIndex: roster.indexOf(player.id),
  }))
  .sort((a, b) => a.distanceToCorner - b.distanceToCorner || a.rosterIndex - b.rosterIndex);
  return teamPlayers[0]?.player.id ?? roster.find((id) => id !== goalkeeperId) ?? goalkeeperId ?? null;
  }
  function applyCornerSetup(targetState = state, { teamId = "home", sideY = 0, resetFormations = false } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const cornerSpot = getCornerKickSpot(teamId, sideY);
  const takerId = getCornerKickTakerId(teamId, sideY, targetState.players);
  const taker = targetState.players.find((player) => player.id === takerId);
  const deliveryTarget = getOpponentPenaltySpot(teamId);
  const facingAngle = angleBetween(cornerSpot, deliveryTarget);
  if (taker) {
  placePlayerWithControlPoint(taker, cornerSpot, facingAngle);
  taker.actionOrigin = null;
  taker.movementProgress = 0;
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "corner",
  teamId,
  label: setPiecePhaseProfiles.corner.label,
  sideY: cornerSpot.y,
  };
  targetState.ball.position = cloneVector(cornerSpot);
  targetState.ball.startPosition = cloneVector(cornerSpot);
  targetState.ball.target = cloneVector(cornerSpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function getRestartTakerId(teamId = "home", point = getKickoffSpot(), players = state.players, preferredLabels = []) {
  const roster = teamRosterOrder[teamId] ?? [];
  const goalkeeperId = roster[0] ?? null;
  const preferred = new Set(preferredLabels);
  const candidates = players
  .filter((player) => getPlayerTeamId(player) === teamId && player.id !== goalkeeperId)
  .map((player) => {
  const label = getPlayerMagnetLabel(player);
  const rosterIndex = roster.indexOf(player.id);
  const setPieceBonus =
  (preferred.has(label) ? 0.72 : 0) +
  (label === "10" ? 0.24 : label === "9" ? 0.2 : label === "8" ? 0.16 : label === "W" ? 0.12 : 0);
  return {
  player,
  score: setPieceBonus - distance(player.position, point) * 0.016 - Math.max(rosterIndex, 0) * 0.006,
  };
  })
  .sort((a, b) => b.score - a.score);
  return candidates[0]?.player.id ?? roster.find((id) => id !== goalkeeperId) ?? goalkeeperId ?? null;
  }
  function applyFreeKickSetup(targetState = state, { teamId = "home", point = getKickoffSpot(), resetFormations = false } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const freeKickSpot = clampToPitch(point, 1.8);
  const takerId = getRestartTakerId(teamId, freeKickSpot, targetState.players, ["10", "8", "W", "9"]);
  const taker = targetState.players.find((player) => player.id === takerId);
  const facingAngle = angleBetween(freeKickSpot, getOpponentGoalCenter(teamId));
  if (taker) {
  placePlayerWithControlPoint(taker, freeKickSpot, facingAngle);
  taker.actionOrigin = null;
  taker.movementProgress = 0;
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "freeKick",
  teamId,
  label: setPiecePhaseProfiles.freeKick.label,
  point: cloneVector(freeKickSpot),
  };
  targetState.ball.position = cloneVector(freeKickSpot);
  targetState.ball.startPosition = cloneVector(freeKickSpot);
  targetState.ball.target = cloneVector(freeKickSpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function applyPenaltySetup(targetState = state, { teamId = "home", resetFormations = false } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const penaltySpot = getOpponentPenaltySpot(teamId);
  const takerId = getRestartTakerId(teamId, penaltySpot, targetState.players, ["9", "10", "W", "8"]);
  const taker = targetState.players.find((player) => player.id === takerId);
  const facingAngle = angleBetween(penaltySpot, getOpponentGoalCenter(teamId));
  if (taker) {
  placePlayerWithControlPoint(taker, penaltySpot, facingAngle);
  taker.actionOrigin = null;
  taker.movementProgress = 0;
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "penalty",
  teamId,
  label: setPiecePhaseProfiles.penalty.label,
  };
  targetState.ball.position = cloneVector(penaltySpot);
  targetState.ball.startPosition = cloneVector(penaltySpot);
  targetState.ball.target = cloneVector(penaltySpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function getThrowInSpot(point = state.ball.position, sideY = point?.y ?? 0) {
  const touchlineY = sideY <= pitch.width / 2 ? 0.65 : pitch.width - 0.65;
  return {
  x: clamp(point?.x ?? pitch.length / 2, 1.4, pitch.length - 1.4),
  y: touchlineY,
  };
  }
  function getThrowInTakerId(teamId = "home", point = state.ball.position, players = state.players) {
  const roster = teamRosterOrder[teamId] ?? [];
  const goalkeeperId = roster[0] ?? null;
  const throwSpot = getThrowInSpot(point, point?.y ?? 0);
  const sideSign = throwSpot.y <= pitch.width / 2 ? -1 : 1;
  const teamPlayers = players
  .filter((player) => getPlayerTeamId(player) === teamId && player.id !== goalkeeperId)
  .map((player) => {
  const label = getPlayerMagnetLabel(player);
  const wideRoleBonus = label === "LB" || label === "RB" || label === "WB" || label === "W" ? 2.2 : 0;
  const sideFit = sideSign < 0
  ? clamp((pitch.width / 2 - player.position.y) / (pitch.width / 2), 0, 1)
  : clamp((player.position.y - pitch.width / 2) / (pitch.width / 2), 0, 1);
  return {
  player,
  score:
  distance(player.position, throwSpot) -
  wideRoleBonus -
  sideFit * 2.4,
  };
  })
  .sort((a, b) => a.score - b.score);
  return teamPlayers[0]?.player.id ?? roster.find((id) => id !== goalkeeperId) ?? goalkeeperId ?? null;
  }
  function applyThrowInSetup(targetState = state, { teamId = "home", point = state.ball.position, sideY = point?.y ?? 0, resetFormations = false } = {}) {
  if (resetFormations) {
  setTeamFormationOnPlayers(targetState.players, "home", teams.home.formation);
  setTeamFormationOnPlayers(targetState.players, "away", teams.away.formation);
  }
  const throwSpot = getThrowInSpot(point, sideY);
  const takerId = getThrowInTakerId(teamId, throwSpot, targetState.players);
  const taker = targetState.players.find((player) => player.id === takerId);
  const facingTarget = {
  x: throwSpot.x + getAttackDirectionSign(teamId) * 7,
  y: pitch.width / 2,
  };
  const facingAngle = angleBetween(throwSpot, facingTarget);
  if (taker) {
  placePlayerWithControlPoint(taker, throwSpot, facingAngle);
  taker.actionOrigin = null;
  taker.movementProgress = 0;
  }
  targetState.selectedPlayerId = taker?.id ?? null;
  targetState.selectedPlayerIds = taker ? [taker.id] : [];
  targetState.matchPhase = "setPieces";
  targetState.restartPhase = {
  type: "throwIn",
  teamId,
  label: setPiecePhaseProfiles.throwIn.label,
  point: cloneVector(throwSpot),
  sideY: throwSpot.y,
  };
  targetState.ball.position = cloneVector(throwSpot);
  targetState.ball.startPosition = cloneVector(throwSpot);
  targetState.ball.target = cloneVector(throwSpot);
  targetState.ball.currentSpeed = 0;
  targetState.ball.launchSpeed = 0;
  targetState.ball.finalSpeed = 0;
  targetState.ball.deceleration = 0;
  targetState.ball.profileKey = null;
  targetState.ball.profileLabel = null;
  targetState.ball.profileMode = targetState.ballSpeedMode ?? "auto";
  targetState.ball.targetKind = null;
  targetState.ball.firstTouchMode = targetState.firstTouchMode ?? "auto";
  targetState.ball.flightStyle = "ground";
  targetState.ball.height = 0;
  targetState.ball.inTransit = false;
  targetState.ball.elapsedTravelTime = 0;
  targetState.ball.actionType = null;
  targetState.ball.ownerPlayerId = taker?.id ?? null;
  targetState.ball.initiatorPlayerId = null;
  targetState.ball.carrierPlayerId = null;
  targetState.ball.receiverPlayerId = null;
  targetState.ball.securePossession = null;
  invalidateAutoPilotPossessionPlan(targetState);
  }
  function getFormationPositions(formation, teamId) {
  const layout = formationLayouts[formation] ?? formationLayouts["4-3-3"];
  return layout.map(([x, y]) =>
  teamId === "home" ? vec(x, y) : vec(pitch.length - x, y)
  );
  }
  function setTeamFormationOnPlayers(players, teamId, formation) {
  const roster = teamRosterOrder[teamId];
  const positions = getFormationPositions(formation, teamId);
  roster.forEach((playerId, index) => {
  const player = players.find((candidate) => candidate.id === playerId);
  const target = positions[index];
  if (player && target) {
  player.position = cloneVector(target);
  player.actionOrigin = null;
  player.movementProgress = 0;
  }
  });
  }
  function createPlayer(blueprint, physicalProfileKey = defaultPhysicalProfileKey) {
  const intelligenceProfile = buildPlayerIntelligenceProfile(blueprint);
  const sprintProfile = buildPlayerSprintProfile(blueprint);
  const tendencyProfile = buildPlayerTendencyProfile(blueprint);
  const physicalProfile = buildPlayerPhysicalProfile(blueprint, physicalProfileKey);
  const preferredFoot = resolvePreferredFoot(blueprint);
  const weakFootQuality = resolveWeakFootQuality(blueprint);
  return {
  id: blueprint.id,
  shortLabel: blueprint.shortLabel,
  role: blueprint.role,
  team: blueprint.team,
  color: teams[blueprint.team].color,
  accent: teams[blueprint.team].accent,
  position: vec(blueprint.position[0], blueprint.position[1]),
  bodyAngle: getTeamAttackAngle(blueprint.team),
  baseMaxSpeed: physicalProfile.baseMaxSpeed,
  baseAcceleration: physicalProfile.baseAcceleration,
  baseReactionTime: physicalProfile.baseReactionTime,
  maxSpeed: physicalProfile.maxSpeed,
  acceleration: physicalProfile.acceleration,
  reactionTime: physicalProfile.reactionTime,
  intelligence: intelligenceProfile.intelligence,
  intelligenceProfile,
  sprintProfile,
  physicalProfile,
  tendencyProfile,
  preferredFoot,
  weakFootQuality,
  actionOrigin: null,
  movementProgress: 0,
  };
  }
  function resetPlayerMovementProgress(players = state.players) {
  players.forEach((player) => {
  player.movementProgress = 0;
  player.autoV2Velocity = null;
  player.autoV2LastElapsed = 0;
  });
  }

  return {
    applyCornerSetup,
    applyFreeKickSetup,
    applyGoalKickSetup,
    applyKickoffSetup,
    applyKickoffDefensiveStructure,
    applyKickoffShapeVariation,
    applyPenaltySetup,
    applyPhysicalProfileToPlayer,
    applyPhysicalProfileToPlayers,
    applyThrowInSetup,
    buildPlayerIntelligenceProfile,
    buildPlayerPhysicalProfile,
    buildPlayerSprintProfile,
    buildPlayerTendencyProfile,
    chooseKickoffOpeningProfile,
    chooseKickoffSupportId,
    clampKickoffPlayerToOwnHalf,
    constrainPlayersForKickoff,
    createPlayer,
    findTeamPlayerByMagnetLabel,
    getActivePhysicalProfileKey,
    getBallControlOffsetMeters,
    getCompetitionPhysicalLabel,
    getCompetitionPhysicalProfile,
    getCornerKickSpot,
    getCornerKickTakerId,
    getDefaultPlayerTendencyKey,
    getFormationPositions,
    getGoalKickSpot,
    getGoalKickTakerId,
    getKickoffDefensivePhaseKey,
    getKickoffDefensiveSetupProfile,
    getKickoffSpot,
    getKickoffSupportId,
    getKickoffSupportPoint,
    getKickoffTakerId,
    getPlayerPositionForControlPoint,
    getPlayerTeamId,
    getPlayerTendency,
    getRecentKickoffOpeningPenalty,
    getRestartTakerId,
    getRolePhysicalMultipliers,
    getThrowInSpot,
    getThrowInTakerId,
    intelligenceScoreToMetric,
    kickoffOpeningProfiles,
    placePlayerWithControlPoint,
    rememberKickoffOpening,
    resetPlayerMovementProgress,
    roundTo,
    setTeamFormationOnPlayers,
  };
}
