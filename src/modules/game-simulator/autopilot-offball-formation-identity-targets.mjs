export function createGameSimulatorAutopilotOffballFormationIdentityTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOffensiveRoleKey,
    getPlayerById,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    teams,
  } = deps;

  function getFormationIdentityTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
    const sign = getAttackDirectionSign(teamId);
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    const points = {
      wideOverlap: getDepthPoint(teamId, clamp(ballDepth + 9 + profile.overlapBias * 4, 48, 94), {
        y: clamp(ballPoint.y + sideSign * (5.5 + profile.widthDiscipline * 2.4), 3.2, pitch.width - 3.2),
      }),
      halfSpaceSupport: getDepthPoint(teamId, clamp(ballDepth - 1 + profile.shortSupport * 5, 42, 78), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 12.5, 0.55), 8, pitch.width - 8),
      }),
      underSupport: getDepthPoint(teamId, clamp(ballDepth - 9, 24, 72), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 8, 0.44), 8, pitch.width - 8),
      }),
      pinCentreBacks: getDepthPoint(teamId, clamp(ballDepth + 12, 58, 97), {
        y: clamp(pitch.width / 2 - sideSign * 3.6, 15, pitch.width - 15),
      }),
      farSideAttack: getDepthPoint(teamId, clamp(ballDepth + 11, 56, 95), {
        y: clamp(pitch.width / 2 - sideSign * 18.5, 5, pitch.width - 5),
      }),
      weakSideWidth: getDepthPoint(teamId, clamp(ballDepth + 3, 38, 82), {
        y: clamp(pitch.width / 2 - sideSign * 28.5, 3.6, pitch.width - 3.6),
      }),
      restLock: clampToPitch({
        x: ballPoint.x - sign * (21 + profile.restBehind * 0.16),
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.7), 15, pitch.width - 15),
      }, 3),
      secondStrikerLink: getDepthPoint(teamId, clamp(ballDepth + 5, 44, 84), {
        y: clamp(pitch.width / 2 + sideSign * 7.5, 14, pitch.width - 14),
      }),
      secondBallRing: getDepthPoint(teamId, clamp(ballDepth + 2, 42, 76), {
        y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.52), 12, pitch.width - 12),
      }),
    };
    return points[slot] ?? points.halfSpaceSupport;
  }

  function applyFormationIdentityPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
    const labels = [];
    const formation = profile.formation ?? teams[teamId]?.formation ?? "4-3-3";
    const receiver = getPlayerById(actionMeta?.receiverPlayerId);
    const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, formation) : null;
    const ballSide = getWideSideSign(ballPoint) || getWideSideSign(receiver) || 1;
    const targetDepth = getAttackingDepth(ballPoint, teamId);
    const isWideEntry =
      isWidePrincipleZone(ballPoint) &&
      targetDepth >= 38 &&
      (receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack" || actionMeta?.actionType === "dribble");
    const isCentralProgression =
      Math.abs(ballPoint.y - pitch.width / 2) <= 18 &&
      targetDepth >= 38 &&
      targetDepth <= 76;
    if (formation === "4-3-3" && isWideEntry) {
      const overlap = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideBack"], targets, excludedIds, ballSide, ballPoint);
      if (setAutopilotPrincipleTarget(targets, overlap, getFormationIdentityTarget(teamId, ballPoint, "wideOverlap", ballSide, profile))) {
        excludedIds.add(overlap.id);
        labels.push("4-3-3 overlap");
      }
      const halfSpace = getMovableAutopilotPlayerByRoles(teamId, ["connector"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, halfSpace, getFormationIdentityTarget(teamId, ballPoint, "halfSpaceSupport", ballSide, profile))) {
        excludedIds.add(halfSpace.id);
        labels.push("8/10 half-space support");
      }
      const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, striker, getFormationIdentityTarget(teamId, ballPoint, "pinCentreBacks", ballSide, profile))) {
        excludedIds.add(striker.id);
        labels.push("9 pins the line");
      }
      const farWinger = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward"], targets, excludedIds, -ballSide, ballPoint);
      if (setAutopilotPrincipleTarget(targets, farWinger, getFormationIdentityTarget(teamId, ballPoint, "farSideAttack", ballSide, profile))) {
        excludedIds.add(farWinger.id);
        labels.push("Far-side W attacks");
      }
    }
    if (formation === "3-4-3" && isWideEntry) {
      const insideForward = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward"], targets, excludedIds, ballSide, ballPoint);
      if (setAutopilotPrincipleTarget(targets, insideForward, getFormationIdentityTarget(teamId, ballPoint, "halfSpaceSupport", ballSide, profile))) {
        excludedIds.add(insideForward.id);
        labels.push("3-4-3 inside forward pocket");
      }
      const oppositeWingBack = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideBack"], targets, excludedIds, -ballSide, ballPoint);
      if (setAutopilotPrincipleTarget(targets, oppositeWingBack, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", ballSide, profile))) {
        excludedIds.add(oppositeWingBack.id);
        labels.push("Weak-side WB holds width");
      }
      const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, striker, getFormationIdentityTarget(teamId, ballPoint, "pinCentreBacks", ballSide, profile))) {
        excludedIds.add(striker.id);
        labels.push("Front three pinning");
      }
    }
    if ((formation === "4-4-2" || formation === "3-5-2") && targetDepth >= 42) {
      const secondStriker = getMovableAutopilotPlayerByRoles(teamId, ["secondStriker", "striker"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, secondStriker, getFormationIdentityTarget(teamId, ballPoint, "secondStrikerLink", ballSide, profile))) {
        excludedIds.add(secondStriker.id);
        labels.push("Front-two link");
      }
      const secondBall = getMovableAutopilotPlayerByRoles(teamId, ["connector", "pivot"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, secondBall, getFormationIdentityTarget(teamId, ballPoint, "secondBallRing", ballSide, profile))) {
        excludedIds.add(secondBall.id);
        labels.push("Second-ball ring");
      }
    }
    if (isCentralProgression) {
      const weakSide = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward", "wideBack"], targets, excludedIds, -ballSide, ballPoint);
      if (setAutopilotPrincipleTarget(targets, weakSide, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", ballSide, profile))) {
        excludedIds.add(weakSide.id);
        labels.push("Weak-side outlet");
      }
      const restLock = getMovableAutopilotPlayerByRoles(teamId, ["pivot", "rest"], targets, excludedIds, ballPoint);
      if (setAutopilotPrincipleTarget(targets, restLock, getFormationIdentityTarget(teamId, ballPoint, "restLock", ballSide, profile))) {
        excludedIds.add(restLock.id);
        labels.push("Rest-defence lock");
      }
    }
    return labels;
  }

  return {
    getFormationIdentityTarget,
    applyFormationIdentityPrincipleTargets,
  };
}
