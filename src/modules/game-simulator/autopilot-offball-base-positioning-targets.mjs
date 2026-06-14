export function createGameSimulatorAutopilotOffballBasePositioningTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    gameRoleProfiles,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthX,
    getFormationPositions,
    getLaneCenterY,
    getOffensiveRoleKey,
    getPlayerTendency,
    getSecondLastOpponentLineX,
    getSideLaneKeys,
    getWideSideSign,
    isFrontLineRole,
    isGoalkeeper,
    lerp,
    pitch,
    state,
    teamRosterOrder,
    teams,
  } = deps;

  function getPlayerRoleModel(player, formation = teams[player.team]?.formation) {
  const roleKey = getOffensiveRoleKey(player, formation);
  return gameRoleProfiles[roleKey] ?? gameRoleProfiles.connector;
  }
  function getOffensiveLaneY(baseY, ballPoint, profile, roleKey) {
  const centerY = pitch.width / 2;
  const side = Math.sign(baseY - centerY) || Math.sign(ballPoint.y - centerY) || 1;
  const laneKeys = getSideLaneKeys(baseY);
  const wideY = getLaneCenterY(laneKeys.wide, profile);
  const halfSpaceY = getLaneCenterY(laneKeys.half, profile);
  const narrowWideY = lerp(wideY, halfSpaceY, profile.wideForwardNarrowing ?? 0);
  const centralHalfSpaceY = lerp(halfSpaceY, centerY, profile.centralOverload ?? 0);
  const compactness = profile.supportCompactness ?? 0.12;
  const widthDiscipline = profile.widthDiscipline ?? 0.62;
  if (roleKey === "wideBack") {
  const supportPull = compactness * (profile.overlapBias >= 0.7 ? 0.14 : 0.08);
  return clamp(lerp(wideY, ballPoint.y, supportPull * (1 - widthDiscipline * 0.42)), 4, pitch.width - 4);
  }
  if (roleKey === "wideForward") {
  const shouldHoldTouchline = profile.crossBias >= 0.72 || profile.switchBias >= 0.7;
  const preferredLaneY = shouldHoldTouchline
  ? lerp(wideY, narrowWideY, 0.24)
  : narrowWideY;
  return clamp(lerp(preferredLaneY, ballPoint.y, compactness * 0.12), 5, pitch.width - 5);
  }
  if (roleKey === "connector") {
  return clamp(lerp(centralHalfSpaceY, ballPoint.y, compactness * 0.38), 8, pitch.width - 8);
  }
  if (roleKey === "pivot") {
  return clamp(lerp(centerY, ballPoint.y, 0.12 + (1 - (profile.centralOverload ?? 0.4)) * 0.08), 12, pitch.width - 12);
  }
  if (roleKey === "secondStriker") {
  return clamp(lerp(centerY + side * 7.5, ballPoint.y, 0.14), 14, pitch.width - 14);
  }
  if (roleKey === "striker") {
  return clamp(lerp(centerY, ballPoint.y, 0.12), 15, pitch.width - 15);
  }
  return clamp(lerp(centerY, ballPoint.y, compactness), 9, pitch.width - 9);
  }
  function shouldSkipOffensiveAutopilotPlayer(player, actionMeta) {
  return (
  player.id === actionMeta?.carrierPlayerId ||
  player.id === actionMeta?.receiverPlayerId ||
  player.id === actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ||
  player.id === state.ball.carrierPlayerId ||
  player.id === state.ball.receiverPlayerId ||
  player.id === state.ball.initiatorPlayerId
  );
  }
  function getOffensiveAutopilotTarget(player, ballPoint, actionMeta, profile, baseY, isPrimaryRunner = false) {
  const roleKey = getOffensiveRoleKey(player, profile.formation);
  const ballDepth = getAttackingDepth(ballPoint, player.team);
  const attackSign = getAttackDirectionSign(player.team);
  const side = Math.sign(baseY - pitch.width / 2) || 1;
  const ballSide = Math.sign(ballPoint.y - pitch.width / 2) || side;
  const isBallSide = side === ballSide || Math.abs(ballPoint.y - pitch.width / 2) < 5;
  let depth = ballDepth;
  let y = getOffensiveLaneY(baseY, ballPoint, profile, roleKey);
  if (roleKey === "gk") {
  depth = clamp(ballDepth - 55, 7, 15);
  y = clamp(lerp(pitch.width / 2, ballPoint.y, 0.08), 28, 40);
  } else if (roleKey === "rest") {
  const restOffset = profile.restBehind + (isBallSide ? -2 : 1.5);
  depth = clamp(ballDepth - restOffset, 16, 56);
  y = clamp(lerp(getOffensiveLaneY(baseY, ballPoint, profile, "connector"), pitch.width / 2, 0.46), 13, 55);
  } else if (roleKey === "wideBack") {
  const supportBoost = isBallSide
  ? profile.wideDepthBoost * 0.5 * (profile.wideBackAdvance ?? 1)
  : -profile.restBehind * 0.22;
  const overlapPush = (profile.overlapBias - 0.5) * 4.2;
  const runnerBoost = isPrimaryRunner ? profile.runnerBoost * 0.72 * (profile.wideBackAdvance ?? 1) : 0;
  depth = clamp(ballDepth - 9 + supportBoost + runnerBoost, 20, 84);
  depth = clamp(depth + overlapPush, 20, 88);
  y = clamp(lerp(y, ballPoint.y, isBallSide ? 0.12 : 0.03), 4, pitch.width - 4);
  } else if (roleKey === "pivot") {
  depth = clamp(ballDepth - profile.pivotBehind - (profile.pivotDrop ?? 0), 20, 72);
  } else if (roleKey === "connector") {
  const ahead =
  (isBallSide ? profile.connectorAhead * 0.6 : profile.connectorAhead * 1.05) +
  (profile.connectorAdvance ?? 0);
  depth = clamp(ballDepth + ahead, 28, 88);
  } else if (roleKey === "wideForward") {
  const diagonalRun = isBallSide
  ? profile.wideDepthBoost + (profile.dribbleBias - 0.5) * 2
  : profile.frontAhead + 2 + (profile.directness - 0.5) * 3;
  depth = clamp(ballDepth + diagonalRun + (isPrimaryRunner ? profile.runnerBoost : 0), 36, 98);
  y = isBallSide
  ? y
  : clamp(lerp(y, pitch.width / 2 + side * 11, 0.54), 8, pitch.width - 8);
  } else if (roleKey === "striker") {
  depth = clamp(ballDepth + profile.frontAhead + profile.finalThirdPin + (isPrimaryRunner ? profile.runnerBoost : 0), 38, 99);
  const pairedLaneOffset = (profile.strikerPairSupport ?? 0) * side * 6;
  y = clamp(
  lerp(y, pitch.width / 2 + pairedLaneOffset - ballSide * 2.5, isPrimaryRunner ? 0.35 : 0.16),
  14,
  pitch.width - 14
  );
  } else if (roleKey === "secondStriker") {
  depth = clamp(
  ballDepth + profile.frontAhead * 0.74 + profile.finalThirdPin + (isPrimaryRunner ? profile.runnerBoost * 0.7 : 0),
  36,
  96
  );
  y = clamp(lerp(y, pitch.width / 2 + side * 4.5, 0.34), 14, pitch.width - 14);
  }
  if (
  actionMeta?.actionType === "shot" &&
  (roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward" || roleKey === "connector")
  ) {
  depth = clamp(Math.max(depth, getAttackingDepth(ballPoint, player.team) + 4), 50, 99);
  y = clamp(lerp(y, pitch.width / 2 + side * 8, 0.4), 10, pitch.width - 10);
  }
  return clampToPitch({
  x: getDepthX(player.team, depth) + attackSign * (roleKey === "wideForward" && isPrimaryRunner ? 1.5 : 0),
  y,
  }, 3);
  }
  function chooseOffensiveAutopilotRunner(teamId, targets, actionMeta, ballPoint, profile) {
  const ballDepth = getAttackingDepth(ballPoint, teamId);
  if (ballDepth < 38 && actionMeta?.actionType !== "pass") {
  return null;
  }
  let bestCandidate = null;
  let bestScore = -Infinity;
  state.players
  .filter((player) => player.team === teamId && !shouldSkipOffensiveAutopilotPlayer(player, actionMeta))
  .forEach((player) => {
  const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
  const roleBonus = profile.runnerPreferences?.[roleKey] ?? 0;
  if (roleBonus <= 0) {
  return;
  }
  const target = targets.get(player.id);
  if (!target) {
  return;
  }
  const targetDepth = getAttackingDepth(target, teamId);
  const speedValue = player.maxSpeed + player.acceleration * 0.38;
  const score =
  targetDepth * 0.12 +
  speedValue * 0.72 +
  player.intelligenceProfile.perception * 1.8 +
  Math.max(getPlayerTendency(player, "boxRun"), getPlayerTendency(player, "overlap")) * 1.2 +
  profile.directness * 0.9 +
  roleBonus -
  distance(player.position, target) * 0.08;
  if (score > bestScore) {
  bestScore = score;
  bestCandidate = player;
  }
  });
  return bestCandidate;
  }
  function enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile, protectedIds = new Set()) {
  const entries = state.players
  .filter((player) => player.team === teamId && targets.has(player.id))
  .map((player) => ({
  player,
  roleKey: getOffensiveRoleKey(player, profile.formation),
  target: cloneVector(targets.get(player.id)),
  protected: protectedIds.has(player.id),
  }))
  .sort((a, b) => a.target.y - b.target.y);
  const minGap = profile.phaseKey === "finalThird" ? 4.6 : 6.1;
  entries.forEach((entry) => {
  if (entry.protected) {
  return;
  }
  if (entry.roleKey === "wideBack" || entry.roleKey === "wideForward") {
  const baseY = getFormationPositions(profile.formation, teamId)[
  (teamRosterOrder[teamId] ?? []).indexOf(entry.player.id)
  ]?.y ?? entry.player.position.y;
  const disciplinedY = getOffensiveLaneY(baseY, ballPoint, profile, entry.roleKey);
  entry.target.y = lerp(entry.target.y, disciplinedY, profile.widthDiscipline ?? 0.62);
  }
  });
  for (let pass = 0; pass < 2; pass += 1) {
  for (let index = 1; index < entries.length; index += 1) {
  const previous = entries[index - 1];
  const current = entries[index];
  const verticalGap = current.target.y - previous.target.y;
  const depthGap = Math.abs(current.target.x - previous.target.x);
  if (verticalGap >= minGap || depthGap > 18) {
  continue;
  }
  const adjustment = (minGap - verticalGap) * 0.52;
  if (previous.protected && current.protected) {
  continue;
  }
  if (previous.protected) {
  current.target.y = clamp(current.target.y + adjustment * 1.9, 4, pitch.width - 4);
  continue;
  }
  if (current.protected) {
  previous.target.y = clamp(previous.target.y - adjustment * 1.9, 4, pitch.width - 4);
  continue;
  }
  previous.target.y = clamp(previous.target.y - adjustment, 4, pitch.width - 4);
  current.target.y = clamp(current.target.y + adjustment, 4, pitch.width - 4);
  }
  }
  entries.forEach((entry) => {
  targets.set(entry.player.id, clampToPitch(entry.target, 3));
  });
  }
  function getOffensiveOnsideLineContext(teamId, ballPoint) {
  const lineX = getSecondLastOpponentLineX(teamId);
  if (lineX === null || !ballPoint) {
  return null;
  }
  const attackSign = getAttackDirectionSign(teamId);
  const ballDepth = getAttackingDepth(ballPoint, teamId);
  const lineDepth = getAttackingDepth({ x: lineX, y: pitch.width / 2 }, teamId);
  const active = Math.max(ballDepth, lineDepth) >= pitch.length / 2 - 0.4;
  const legalBoundaryX = attackSign > 0
  ? Math.max(lineX, ballPoint.x)
  : Math.min(lineX, ballPoint.x);
  if (!active) {
  return null;
  }
  return {
  lineX,
  legalBoundaryX,
  attackSign,
  ballDepth,
  lineDepth,
  };
  }
  function enforceOffensiveOnsideLineAwareness(
  teamId,
  targets,
  ballPoint,
  profile,
  hardFixedIds = new Set()
  ) {
  const context = getOffensiveOnsideLineContext(teamId, ballPoint);
  if (!context) {
  return [];
  }
  const labels = [];
  let adjusted = false;
  const shoulderMargin =
  profile.phaseKey === "finalThird"
  ? 0.38
  : profile.directness >= 0.68
  ? 0.46
  : 0.62;
  state.players
  .filter((player) => player.team === teamId && targets.has(player.id) && !isGoalkeeper(player))
  .forEach((player) => {
  if (hardFixedIds.has(player.id)) {
  return;
  }
  const roleKey = getOffensiveRoleKey(player, profile.formation);
  const target = cloneVector(targets.get(player.id));
  const currentDepth = getAttackingDepth(player.position, teamId);
  const targetDepth = getAttackingDepth(target, teamId);
  const lineRelevant =
  isFrontLineRole(roleKey) ||
  roleKey === "connector" ||
  (roleKey === "wideBack" && targetDepth >= 58);
  if (!lineRelevant || targetDepth <= pitch.length / 2 - 0.2) {
  return;
  }
  const beyondLine = (target.x - context.legalBoundaryX) * context.attackSign;
  if (beyondLine <= -0.05) {
  return;
  }
  const holdLineX = context.legalBoundaryX - context.attackSign * shoulderMargin;
  const laneCurve =
  isFrontLineRole(roleKey)
  ? (Math.sign(target.y - pitch.width / 2) || getWideSideSign(target) || 1) * 0.85
  : 0;
  const urgencyWeight =
  currentDepth > context.lineDepth + 0.4
  ? 0.84
  : isFrontLineRole(roleKey)
  ? 0.68
  : 0.52;
  const nextTarget = clampToPitch({
  x: lerp(target.x, holdLineX, urgencyWeight),
  y: clamp(target.y + laneCurve, 3.2, pitch.width - 3.2),
  }, 2.2);
  if (distance(target, nextTarget) > 0.08) {
  adjusted = true;
  }
  targets.set(player.id, nextTarget);
  });
  if (adjusted) {
  labels.push("Onside line awareness");
  }
  return labels;
  }
  function enforceOffensiveOccupationZones(teamId, targets, ballPoint, profile) {
  const roster = teamRosterOrder[teamId] ?? [];
  const basePositions = getFormationPositions(profile.formation, teamId);
  const ballDepth = getAttackingDepth(ballPoint, teamId);
  const ballSide = getWideSideSign(ballPoint) || 1;
  state.players
  .filter((player) => player.team === teamId && targets.has(player.id))
  .forEach((player) => {
  const roleKey = getOffensiveRoleKey(player, profile.formation);
  const target = cloneVector(targets.get(player.id));
  const baseY = basePositions[roster.indexOf(player.id)]?.y ?? player.position.y;
  const playerSide = getWideSideSign({ y: baseY }) || getWideSideSign(player);
  const isWeakSide = playerSide && playerSide === -ballSide;
  const isStrongSide = playerSide && playerSide === ballSide;
  if (roleKey === "wideForward" || roleKey === "wideBack") {
  const laneY = getOffensiveLaneY(baseY, ballPoint, profile, roleKey);
  const widthPull = isWeakSide
  ? 0.9
  : isStrongSide
  ? roleKey === "wideForward" ? 0.58 : 0.72
  : 0.62;
  target.y = lerp(target.y, laneY, clamp(widthPull * (profile.widthDiscipline ?? 0.64), 0.42, 0.92));
  if (isWeakSide) {
  target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth - 2), 34, 86));
  }
  if (isStrongSide && roleKey === "wideBack" && profile.overlapBias >= 0.62) {
  target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth - 1), 34, 88));
  }
  }
  if (roleKey === "pivot") {
  target.x = getDepthX(teamId, clamp(ballDepth - 9 - profile.shortSupport * 4, 18, 70));
  target.y = clamp(lerp(target.y, pitch.width / 2 - ballSide * 4.5, 0.48), 12, pitch.width - 12);
  }
  if (roleKey === "rest") {
  target.x = getDepthX(teamId, clamp(ballDepth - profile.restBehind, 14, 56));
  target.y = clamp(lerp(target.y, pitch.width / 2, 0.62), 13, pitch.width - 13);
  }
  if (roleKey === "striker" && ballDepth >= 54) {
  target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth + 7), 56, 98));
  target.y = clamp(lerp(target.y, pitch.width / 2, 0.42), 14, pitch.width - 14);
  }
  targets.set(player.id, clampToPitch(target, 3));
  });
  }

  return {
    getPlayerRoleModel,
    getOffensiveLaneY,
    shouldSkipOffensiveAutopilotPlayer,
    getOffensiveAutopilotTarget,
    chooseOffensiveAutopilotRunner,
    enforceOffensiveTargetSpacing,
    getOffensiveOnsideLineContext,
    enforceOffensiveOnsideLineAwareness,
    enforceOffensiveOccupationZones,
  };
}
