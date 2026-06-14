export function createGameSimulatorDefensiveRestartTransitionTargets(deps = {}) {
  const {
    applyAutopilotTargetVariation,
    applyDefensiveCornerSetPieceTargets,
    applyDefensiveFreeKickSetPieceTargets,
    applyDefensivePenaltySetPieceTargets,
    applyDefensiveThrowInSetPieceTargets,
    applyNegativeTransitionDefensiveTargets,
  } = deps;

function resolveDefensiveRestartTransitionTargets({ teamId, targets, groups, ballPoint, profile }) {
const cornerSetPiece = applyDefensiveCornerSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (cornerSetPiece.active) {
return {
targets,
presser: cornerSetPiece.presser,
profile,
protectionLabels: cornerSetPiece.labels,
focusPoint: cornerSetPiece.focusPoint,
};
}
const freeKickSetPiece = applyDefensiveFreeKickSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (freeKickSetPiece.active) {
return {
targets,
presser: freeKickSetPiece.presser,
profile,
protectionLabels: freeKickSetPiece.labels,
focusPoint: freeKickSetPiece.focusPoint,
};
}
const penaltySetPiece = applyDefensivePenaltySetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (penaltySetPiece.active) {
return {
targets,
presser: penaltySetPiece.presser,
profile,
protectionLabels: penaltySetPiece.labels,
focusPoint: penaltySetPiece.focusPoint,
};
}
const throwInSetPiece = applyDefensiveThrowInSetPieceTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (throwInSetPiece.active) {
return {
targets,
presser: throwInSetPiece.presser,
profile,
protectionLabels: throwInSetPiece.labels,
focusPoint: throwInSetPiece.focusPoint,
};
}
const negativeTransition = applyNegativeTransitionDefensiveTargets(
teamId,
targets,
groups,
ballPoint,
profile
);
if (negativeTransition.active) {
const transitionProfile = {
...profile,
phaseKey: "transitionToDefend",
phaseLabel: negativeTransition.mode === "counterPress"
? "Negative Transition"
: "Recovery Transition",
};
applyAutopilotTargetVariation(
teamId,
targets,
transitionProfile,
"defence",
new Set([
negativeTransition.presser?.id,
...(negativeTransition.protectedIds ?? []),
].filter(Boolean))
);
return {
targets,
presser: negativeTransition.presser,
profile: transitionProfile,
protectionLabels: negativeTransition.labels,
focusPoint: negativeTransition.focusPoint,
};
}
return null;
}

  return {
    resolveDefensiveRestartTransitionTargets,
  };
}
