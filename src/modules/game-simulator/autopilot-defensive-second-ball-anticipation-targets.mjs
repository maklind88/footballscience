export function createGameSimulatorAutopilotDefensiveSecondBallAnticipationTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getDefendingDirectionSign,
    getOffensiveAutopilotProfile,
    getOtherTeamId,
    getOwnGoalCenter,
    getSecondBallAnticipationContext,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getDefensiveSecondBallAnticipationTarget(teamId, context, slot) {
    const sign = getDefendingDirectionSign(teamId);
    const ownGoal = getOwnGoalCenter(teamId);
    const target = context.targetPoint;
    const sideSign = context.sideSign || 1;
    const points = {
      firstContact: {
        x: target.x - sign * (context.finalThirdLanding ? 1.2 : 1.8),
        y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.18 : 0.26),
      },
      dropZoneScreen: {
        x: target.x - sign * (context.aerial ? 6.6 : 4.8),
        y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.58 : 0.64),
      },
      clearanceLane: {
        x: lerp(target.x, ownGoal.x, context.finalThirdLanding ? 0.38 : 0.26),
        y: clamp(pitch.width / 2 + sideSign * (context.finalThirdLanding ? 7.6 : 10.2), 8, pitch.width - 8),
      },
      depthCover: {
        x: lerp(target.x, ownGoal.x, context.lineBreakLanding ? 0.46 : 0.34),
        y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.32 : 0.22),
      },
      weakSideTuck: {
        x: lerp(target.x, ownGoal.x, 0.34),
        y: clamp(pitch.width / 2 - sideSign * (context.finalThirdLanding ? 8.4 : 11.6), 7, pitch.width - 7),
      },
      counterPressOutletBlock: {
        x: target.x + sign * 5.6,
        y: lerp(target.y, pitch.width / 2, 0.42),
      },
    };
    return clampToPitch(points[slot] ?? points.dropZoneScreen, 2.2);
  }

  function applyDefensiveSecondBallAnticipationTargets(
    teamId,
    targets,
    groups,
    basePresser,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    const attackingTeamId = getOtherTeamId(teamId);
    if (!attackingTeamId) {
      return {
        labels: [],
        focusPoint: null,
        protectedIds: new Set(protectedIds),
      };
    }
    const attackProfile = getOffensiveAutopilotProfile(attackingTeamId, ballPoint);
    const context = getSecondBallAnticipationContext(
      attackingTeamId,
      ballPoint,
      state.draftStep ?? {
        actionType: state.ball.actionType,
        target: state.ball.target,
        receiverPlayerId: state.ball.receiverPlayerId,
        carrierPlayerId: state.ball.carrierPlayerId,
        beforeSnapshot: {
          ball: {
            position: state.ball.startPosition,
            ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
          },
        },
      },
      attackProfile
    );
    if (!context) {
      return {
        labels: [],
        focusPoint: null,
        protectedIds: new Set(protectedIds),
      };
    }
    const labels = [];
    const assignedIds = new Set([
      ...protectedIds,
      basePresser?.id,
      ...groups.gk.map((goalkeeper) => goalkeeper.id),
    ].filter(Boolean));
    const assign = (slot, lineKeys, preferLabels, label) => {
      const target = getDefensiveSecondBallAnticipationTarget(teamId, context, slot);
      const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
      if (!player) {
        return null;
      }
      targets.set(player.id, target);
      assignedIds.add(player.id);
      labels.push(label);
      return player;
    };
    assign("firstContact", ["back", "midfield", "forward"], ["CB", "6", "8", "WB", "LB", "RB", "9"], "Second ball: contest first contact");
    assign("dropZoneScreen", ["midfield", "back"], ["6", "8", "CB", "10"], "Second ball: screen drop zone");
    if (context.lineBreakLanding || context.finalThirdLanding) {
      assign("depthCover", ["back"], ["CB", "LB", "RB", "WB"], "Second ball: cover depth behind");
    }
    assign("clearanceLane", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Second ball: clearance lane");
    assign("weakSideTuck", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Second ball: weak-side protection");
    if (profile.pressingIntensity >= 0.54 || profile.styleKey === "counter-press" || profile.styleKey === "gegenpress") {
      assign("counterPressOutletBlock", ["forward", "midfield"], ["9", "10", "W", "8"], "Second ball: block outlet");
    }
    if (labels.length) {
      labels.unshift("Anticipate second ball");
    }
    return {
      labels: uniquePrincipleLabels(labels),
      focusPoint: context.targetPoint,
      protectedIds: assignedIds,
    };
  }

  return {
    getDefensiveSecondBallAnticipationTarget,
    applyDefensiveSecondBallAnticipationTargets,
  };
}
