export function createGameSimulatorAutopilotOffballWideEntryTargets(deps = {}) {
  const {
    clamp,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getOffensiveRoleKey,
    getPlayerById,
    getPlayerMagnetLabel,
    getPlayerTendency,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    getWideSideSign,
    isWidePrincipleZone,
    state,
    teams,
  } = deps;

  function getSameSideWideBacks(teamId, sideSign, excludedPlayerIds = new Set()) {
  const formation = teams[teamId]?.formation;
  return state.players.filter((player) => {
  if (player.team !== teamId || excludedPlayerIds.has(player.id)) {
  return false;
  }
  if (getOffensiveRoleKey(player, formation) !== "wideBack") {
  return false;
  }
  const playerSide = getWideSideSign(player);
  return playerSide === 0 || playerSide === sideSign;
  });
  }
  function chooseWideOverlapRunner(teamId, sideSign, anchorPoint, profile, excludedPlayerIds = new Set()) {
  if (!sideSign || !anchorPoint) {
  return null;
  }
  const principleFit = getWideOverlapPrincipleFit(profile);
  if (principleFit < 0.5) {
  return null;
  }
  const anchorDepth = getAttackingDepth(anchorPoint, teamId);
  const target = getWideOverlapRunTarget(teamId, anchorPoint, sideSign, profile);
  let best = null;
  let bestScore = -Infinity;
  getSameSideWideBacks(teamId, sideSign, excludedPlayerIds).forEach((player) => {
  const playerDepth = getAttackingDepth(player.position, teamId);
  const distanceToTarget = distance(player.position, target);
  const distanceToAnchor = distance(player.position, anchorPoint);
  const timingScore = playerDepth <= anchorDepth + 2.5
  ? 0.55
  : playerDepth <= anchorDepth + 9
  ? 0.18
  : -0.34;
  const overlapTendency = getPlayerTendency(player, "overlap");
  const athleticScore = clamp((player.maxSpeed - 6.6) / 2.1, 0, 1) * 0.42 +
  clamp((player.acceleration - 2.2) / 1.1, 0, 1) * 0.22;
  const roleStrength =
  getAutoPilotRoleStrength(player, "runner") * 0.5 +
  getAutoPilotRoleStrength(player, "crosser") * 0.34;
  const score =
  principleFit * 1.2 +
  overlapTendency * 0.82 +
  athleticScore +
  roleStrength +
  timingScore -
  distanceToTarget * 0.035 -
  Math.max(0, distanceToAnchor - 28) * 0.035;
  if (score > bestScore) {
  bestScore = score;
  best = {
  player,
  target,
  score,
  principleFit,
  };
  }
  });
  return best && best.score >= 0.72 ? best : null;
  }
  function getWideEntryPrincipleContext(carrier, receiver, startPoint, target, profile) {
  if (!carrier || !receiver || carrier.team !== receiver.team) {
  return null;
  }
  const receiverRoleKey = getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
  if (receiverRoleKey !== "wideForward" || !isWidePrincipleZone(target)) {
  return null;
  }
  const teamId = carrier.team;
  const targetDepth = getAttackingDepth(target, teamId);
  const ballDepth = getAttackingDepth(startPoint, teamId);
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  if (targetDepth < 38 || forwardGain < -3 || targetDepth < ballDepth - 2) {
  return null;
  }
  const sideSign = getWideSideSign(target) || getWideSideSign(receiver);
  const overlap = chooseWideOverlapRunner(
  teamId,
  sideSign,
  target,
  profile,
  new Set([carrier.id, receiver.id])
  );
  if (!overlap) {
  return null;
  }
  return {
  key: "wide-overlap-entry",
  label: "Wide entry",
  runner: overlap.player,
  runnerTarget: overlap.target,
  sideSign,
  scoreBonus: 0.34 + overlap.principleFit * 0.58 + getPlayerTendency(overlap.player, "overlap") * 0.22,
  };
  }
  function getOffensiveActionPrinciple(teamId, ballPoint, actionMeta, profile) {
  if (actionMeta?.actionType !== "pass") {
  return null;
  }
  const receiver = getPlayerById(actionMeta.receiverPlayerId);
  const carrier = getPlayerById(
  actionMeta.carrierPlayerId ??
  actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
  state.ball.initiatorPlayerId
  );
  const startPoint = actionMeta.beforeSnapshot?.ball?.position ?? carrier?.position ?? state.ball.position;
  const principle = getWideEntryPrincipleContext(carrier, receiver, startPoint, ballPoint, profile);
  if (!principle) {
  return null;
  }
  return {
  ...principle,
  label: `Wide overload: W receives, ${getPlayerMagnetLabel(principle.runner)} overlaps`,
  };
  }

  return {
    getSameSideWideBacks,
    chooseWideOverlapRunner,
    getWideEntryPrincipleContext,
    getOffensiveActionPrinciple,
  };
}
