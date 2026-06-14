export function createGameSimulatorAutopilotLiveContextHelpers(deps = {}) {
  const {
    clamp,
    cloneVector,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackStyleRhythmProfile,
    getPlayerById,
    getPlayerMagnetLabel,
    getTeamAttackStyleKey,
    getTeamAttackStyleProfile,
    offensiveAutopilotProfiles,
    offensivePhaseProfiles,
    pitch,
    teams,
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

  function getOffensiveAutopilotFocusPoint(actionMeta, fallbackPoint = state.ball.position) {
    if (!actionMeta?.offensiveAutopilot?.teamId) {
      return null;
    }
    return actionMeta.offensiveAutopilot.ballFocusPoint
      ? cloneVector(actionMeta.offensiveAutopilot.ballFocusPoint)
      : cloneVector(fallbackPoint ?? actionMeta.target ?? state.ball.position);
  }

  function isOffensiveAutopilotPlayer(player, actionMeta) {
    return (
      !!player &&
      !!actionMeta?.offensiveAutopilot?.teamId &&
      player.team === actionMeta.offensiveAutopilot.teamId
    );
  }

  function getOtherTeamId(teamId) {
    if (teamId === "home") return "away";
    if (teamId === "away") return "home";
    return null;
  }

  function getPlannedPossessionTeamId() {
    const candidateIds = [
      state.ball.ownerPlayerId,
      state.ball.carrierPlayerId,
      state.ball.initiatorPlayerId,
      state.draftStep?.carrierPlayerId,
      state.draftStep?.beforeSnapshot?.ball?.ownerPlayerId,
      state.selectedPlayerId,
    ];
    for (const playerId of candidateIds) {
      const player = getPlayerById(playerId);
      if (player?.team) {
        return player.team;
      }
    }
    return null;
  }

  function getDefendingDirectionSign(teamId) {
    return teamId === "home" ? 1 : -1;
  }

  function getDepthX(teamId, depth) {
    return teamId === "home" ? depth : pitch.length - depth;
  }

  function getDistanceFromOwnGoal(teamId, point) {
    const ownGoalX = teamId === "home" ? 0 : pitch.length;
    return clamp((point.x - ownGoalX) * getDefendingDirectionSign(teamId), 0, pitch.length);
  }

  function getOffensivePhaseKey(teamId, ballPoint, actionType = state.ball.actionType ?? state.draftStep?.actionType) {
    if (state.restartPhase?.type) {
      return "setPiece";
    }
    const ballDepth = getAttackingDepth(ballPoint, teamId);
    if (actionType === "shot" || ballDepth >= 72) {
      return "finalThird";
    }
    if (ballDepth <= 34) {
      return "buildUp";
    }
    return "progression";
  }

  function getOffensiveAutopilotProfile(teamId, ballPoint = state.ball.target ?? state.ball.position, phaseKey = null) {
    const formation = teams[teamId]?.formation ?? "4-3-3";
    const formationProfile = offensiveAutopilotProfiles[formation] ?? offensiveAutopilotProfiles["4-3-3"];
    const resolvedPhaseKey = phaseKey ?? getOffensivePhaseKey(teamId, ballPoint);
    const phaseProfile = offensivePhaseProfiles[resolvedPhaseKey] ?? offensivePhaseProfiles.progression;
    const styleKey = getTeamAttackStyleKey(teamId);
    const styleProfile = getTeamAttackStyleProfile(teamId);
    const rhythmProfile = getAttackStyleRhythmProfile(styleKey);
    return {
      ...formationProfile,
      ...phaseProfile,
      formation,
      phaseKey: resolvedPhaseKey,
      phaseLabel: phaseProfile.label,
      styleKey,
      styleLabel: styleProfile.label,
      stylePrincipleLabel: styleProfile.principleLabel,
      principleLabel: `${formationProfile.principleLabel}; ${styleProfile.principleLabel}`,
      width: clamp(formationProfile.width * phaseProfile.widthMultiplier * styleProfile.widthMultiplier, 40, 66),
      restBehind: clamp(
        formationProfile.restBehind + phaseProfile.restBehindOffset + styleProfile.restBehindOffset,
        15,
        33
      ),
      frontAhead: clamp(
        formationProfile.frontAhead + phaseProfile.depthStretch + styleProfile.frontAheadOffset,
        7,
        22
      ),
      supportCompactness: clamp(
        (phaseProfile.supportCompactness ?? 0.12) * styleProfile.supportCompactnessMultiplier,
        0.04,
        0.3
      ),
      directness: styleProfile.directness,
      shortSupport: styleProfile.shortSupport,
      lineBreakBias: styleProfile.lineBreakBias,
      switchBias: styleProfile.switchBias,
      crossBias: styleProfile.crossBias,
      overlapBias: styleProfile.overlapBias,
      dribbleBias: styleProfile.dribbleBias,
      shootBias: styleProfile.shootBias,
      tempo: styleProfile.tempo,
      risk: styleProfile.risk,
      firstTouchForwardBias: styleProfile.firstTouchForwardBias,
      passBias: styleProfile.passBias ?? clamp(0.4 + styleProfile.shortSupport * 0.35 - styleProfile.directness * 0.08, 0.2, 0.92),
      carryBias: styleProfile.carryBias ?? styleProfile.dribbleBias,
      deliveryBias: styleProfile.deliveryBias ?? styleProfile.crossBias,
      routeOneBias: styleProfile.routeOneBias ?? 0,
      rhythm: rhythmProfile,
      targetPossessionSeconds: rhythmProfile.targetSeconds,
      progressionUrgency: rhythmProfile.progressionUrgency,
      sidewaysTolerance: rhythmProfile.sidewaysTolerance,
      recycleWindow: rhythmProfile.recycleWindow,
      widthDiscipline: clamp(
        0.54 + styleProfile.switchBias * 0.16 + styleProfile.crossBias * 0.14 + (styleProfile.directness < 0.42 ? 0.08 : 0),
        0.54,
        0.88
      ),
    };
  }

  function getOffensiveRoleKey(player, formation = teams[player.team]?.formation) {
    const label = getPlayerMagnetLabel(player);
    if (label === "GK") return "gk";
    if (label === "CB") return "rest";
    if (label === "LB" || label === "RB" || label === "WB") return "wideBack";
    if (label === "6") return "pivot";
    if (formation === "4-4-2" && label === "10") return "secondStriker";
    if (label === "8" || label === "10") return "connector";
    if (label === "W") return "wideForward";
    if (label === "9") return "striker";
    return "connector";
  }

  const pitchLaneKeys = ["leftWide", "leftHalf", "central", "rightHalf", "rightWide"];
  function getPitchLaneKey(point) {
    const y = point?.y ?? pitch.width / 2;
    if (y <= 9.5) return "leftWide";
    if (y <= 25.5) return "leftHalf";
    if (y <= 42.5) return "central";
    if (y <= 58.5) return "rightHalf";
    return "rightWide";
  }

  function getPitchLaneIndex(pointOrLane) {
    const laneKey = typeof pointOrLane === "string" ? pointOrLane : getPitchLaneKey(pointOrLane);
    return Math.max(0, pitchLaneKeys.indexOf(laneKey));
  }

  function getAttackingThirdKey(point, teamId) {
    const depth = getAttackingDepth(point, teamId);
    if (depth < 34) return "build";
    if (depth < 68) return "progress";
    return "finish";
  }

  function getLaneCenterY(laneKey, profile = {}) {
    const centerY = pitch.width / 2;
    const width = clamp(profile.width ?? 58, 42, 66);
    const wideOffset = clamp(width * 0.49, 25.5, 31.5);
    const halfOffset = clamp(width * 0.24, 12, 17);
    const centers = {
      leftWide: centerY - wideOffset,
      leftHalf: centerY - halfOffset,
      central: centerY,
      rightHalf: centerY + halfOffset,
      rightWide: centerY + wideOffset,
    };
    return clamp(centers[laneKey] ?? centerY, 4, pitch.width - 4);
  }

  function getSideLaneKeys(baseY) {
    return baseY <= pitch.width / 2
      ? { wide: "leftWide", half: "leftHalf" }
      : { wide: "rightWide", half: "rightHalf" };
  }

  const autoPilotPossessionIntentLabels = {
    secure: "Secure possession",
    progress: "Progress through pressure",
    switch: "Change point of attack",
    wide: "Build wide overload",
    accelerate: "Accelerate into valuable space",
    finish: "Finish the attack",
  };

  return {
    getOffensiveAutopilotFocusPoint,
    isOffensiveAutopilotPlayer,
    getOtherTeamId,
    getPlannedPossessionTeamId,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensivePhaseKey,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchLaneIndex,
    getAttackingThirdKey,
    getLaneCenterY,
    getSideLaneKeys,
    autoPilotPossessionIntentLabels,
  };
}
