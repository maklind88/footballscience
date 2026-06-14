export function createGameSimulatorActionSpaceOrientationMetrics(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    blendAngles,
    buildPlayerIntelligenceProfile,
    clamp,
    getFootUsageScore,
    getPlayerFacingAngle,
    getTeamAttackAngle,
    normalizeAngle,
    state,
  } = deps;

  function getOrientationTurnDelay(player, targetPoint = state.ball.target) {
  if (!targetPoint) {
  return 0;
  }
  const desiredAngle = angleBetween(player.position, targetPoint);
  const bodyAngle = getPlayerFacingAngle(player);
  const angleGap = angleDifference(bodyAngle, desiredAngle) / Math.PI;
  const profile = player.intelligenceProfile ?? buildPlayerIntelligenceProfile(player);
  return clamp(
  angleGap * (0.03 + (1 - profile.tacticalDiscipline) * 0.14 + (1 - profile.perception) * 0.06),
  0,
  0.22
  );
  }
  function getOrientationMovementProfile(player, targetPoint = state.ball.target) {
  if (!targetPoint) {
  return {
  angleGap: 0,
  angleGapRatio: 0,
  accelerationMultiplier: 1,
  speedMultiplier: 1,
  coverModifier: 1,
  receiveModifier: 1,
  recoveryModifier: 1,
  };
  }
  const desiredAngle = angleBetween(player.position, targetPoint);
  const angleGap = angleDifference(getPlayerFacingAngle(player), desiredAngle);
  const angleGapDegrees = (angleGap * 180) / Math.PI;
  if (angleGapDegrees <= 30) {
  return {
  angleGap,
  angleGapRatio: angleGap / Math.PI,
  accelerationMultiplier: 1,
  speedMultiplier: 1,
  coverModifier: 1,
  receiveModifier: 1,
  recoveryModifier: 1,
  };
  }
  if (angleGapDegrees <= 75) {
  return {
  angleGap,
  angleGapRatio: angleGap / Math.PI,
  accelerationMultiplier: 0.93,
  speedMultiplier: 0.97,
  coverModifier: 0.92,
  receiveModifier: 0.94,
  recoveryModifier: 0.95,
  };
  }
  if (angleGapDegrees <= 135) {
  return {
  angleGap,
  angleGapRatio: angleGap / Math.PI,
  accelerationMultiplier: 0.82,
  speedMultiplier: 0.9,
  coverModifier: 0.79,
  receiveModifier: 0.82,
  recoveryModifier: 0.84,
  };
  }
  return {
  angleGap,
  angleGapRatio: angleGap / Math.PI,
  accelerationMultiplier: 0.68,
  speedMultiplier: 0.82,
  coverModifier: 0.64,
  receiveModifier: 0.7,
  recoveryModifier: 0.72,
  };
  }
  function getCoverShadowInfluence(player, lanePoint, sourcePoint = state.ball.position) {
  const laneProfile = getOrientationMovementProfile(player, lanePoint);
  const ballAngle = sourcePoint ? angleBetween(player.position, sourcePoint) : getPlayerFacingAngle(player);
  const bodyAngle = getPlayerFacingAngle(player);
  const bodyToBall = 1 - angleDifference(bodyAngle, ballAngle) / Math.PI;
  const forwardCover = laneProfile.coverModifier;
  return clamp(
  0.34 + forwardCover * 0.46 + bodyToBall * 0.2,
  0.3,
  1.02
  );
  }
  function getReceiveOrientationScore(player, incomingPoint = state.ball.startPosition) {
  if (!incomingPoint) {
  return 0.84;
  }
  const idealHalfOpenAngle = getBestReceiveBodyAngle(player, incomingPoint);
  const bodyAngle = getPlayerFacingAngle(player);
  const receiveProfile = getOrientationMovementProfile(player, incomingPoint);
  const halfOpenAlignment = 1 - angleDifference(bodyAngle, idealHalfOpenAngle) / Math.PI;
  return clamp(
  halfOpenAlignment * 0.66 + receiveProfile.receiveModifier * 0.34,
  0.18,
  0.98
  );
  }
  function getBestReceiveBodyAngle(player, incomingPoint = state.ball.startPosition) {
  const nextPlayAngle = getTeamAttackAngle(player.team);
  if (!incomingPoint) {
  return normalizeAngle(nextPlayAngle + Math.PI / 7.5);
  }
  const receiveFromBallAngle = angleBetween(player.position, incomingPoint);
  const relativeBallAngle = normalizeAngle(receiveFromBallAngle - nextPlayAngle);
  const fallbackSide =
  Math.sign(normalizeAngle(getPlayerFacingAngle(player) - nextPlayAngle)) ||
  (incomingPoint.y < player.position.y ? -1 : 1);
  const openSide = Math.sign(relativeBallAngle) || fallbackSide;
  const openOffsetMagnitude = clamp(
  Math.max(Math.abs(relativeBallAngle) * 0.28, Math.PI / 9),
  Math.PI / 9,
  Math.PI / 5.2
  );
  const openBodyAngle = normalizeAngle(nextPlayAngle + openSide * openOffsetMagnitude);
  return blendAngles(receiveFromBallAngle, openBodyAngle, 0.28, 0.72);
  }
  function getReceiveFootUsageScore(player, incomingPoint = state.ball.startPosition) {
  if (!player || !incomingPoint) {
  return 0.82;
  }
  const receiveFromBallAngle = angleBetween(player.position, incomingPoint);
  const idealReceiveAngle = getBestReceiveBodyAngle(player, incomingPoint);
  return getFootUsageScore(player, receiveFromBallAngle, idealReceiveAngle);
  }
  function applyBestReceiveBodyAngle(player, incomingPoint = state.ball.startPosition, blend = 1) {
  if (!player) {
  return;
  }
  const desiredAngle = getBestReceiveBodyAngle(player, incomingPoint);
  const currentAngle = getPlayerFacingAngle(player);
  const delta = normalizeAngle(desiredAngle - currentAngle);
  player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
  }

  return {
    getOrientationTurnDelay,
    getOrientationMovementProfile,
    getCoverShadowInfluence,
    getReceiveOrientationScore,
    getBestReceiveBodyAngle,
    getReceiveFootUsageScore,
    applyBestReceiveBodyAngle,
  };
}
