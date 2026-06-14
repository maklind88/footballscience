import {
  autoPilotFormationIntentionWeights,
  autoPilotPhaseIntentionWeights,
  autoPilotStyleIntentionWeights,
} from "./autopilot-intention-weights.mjs";
import { autoPilotPrincipleLabels } from "./autopilot-principle-labels.mjs";

export function createGameSimulatorAutopilotIntentionModelDecisions(deps = {}) {
  const {
    clamp,
    getAttackingDepth,
    getAutoPilotFlowContext,
    getAutoPilotRegainContext,
    getForwardFacingSpaceTwoContext,
    getForwardProgressionWindow,
    getOffensiveRoleKey,
    getPlayerTendency,
    getPossessionRhythmContext,
    teams,
  } = deps;

  function mergeIntentionWeights(...profiles) {
    const merged = {};
    Object.keys(autoPilotPrincipleLabels).forEach((key) => {
      const values = profiles
        .map((profile) => profile?.[key])
        .filter((value) => Number.isFinite(value));
      if (!values.length) {
        merged[key] = 0;
        return;
      }
      const average = values.reduce((total, value) => total + value, 0) / values.length;
      const peak = Math.max(...values);
      merged[key] = clamp(average * 0.62 + peak * 0.38, 0, 1.15);
    });
    return merged;
  }

  function getAutoPilotIntentionModel(carrier, startPoint, profile) {
    const flow = getAutoPilotFlowContext(carrier, startPoint);
    const rhythm = getPossessionRhythmContext(carrier.team);
    const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
    const phaseWeights =
      autoPilotPhaseIntentionWeights[profile.phaseKey] ?? autoPilotPhaseIntentionWeights.progression;
    const styleWeights =
      autoPilotStyleIntentionWeights[profile.styleKey] ?? autoPilotStyleIntentionWeights.balanced;
    const formationWeights =
      autoPilotFormationIntentionWeights[profile.formation] ?? autoPilotFormationIntentionWeights["4-3-3"];
    const weights = mergeIntentionWeights(phaseWeights, styleWeights, formationWeights);
    const ballDepth = getAttackingDepth(startPoint, carrier.team);
    const carrierRoleKey = getOffensiveRoleKey(carrier, teams[carrier.team]?.formation);
    if (flow.pressure >= 0.58) {
      weights.secure = clamp(weights.secure + 0.24, 0, 1.25);
      weights.thirdPlayer = clamp(weights.thirdPlayer + 0.14, 0, 1.25);
      weights.driveSpace = clamp(
        weights.driveSpace + (getPlayerTendency(carrier, "dribble") >= 0.58 ? 0.16 : 0.04),
        0,
        1.25
      );
    }
    if (rhythm.sidewaysPasses >= 1) {
      weights.switchPlay = clamp(weights.switchPlay + 0.18 + Math.min(rhythm.sidewaysPasses, 3) * 0.08, 0, 1.28);
      weights.breakLine = clamp(weights.breakLine + 0.12, 0, 1.25);
    }
    if (rhythm.backPasses >= 1 && rhythm.forwardPasses === 0 && rhythm.steps >= 2) {
      weights.breakLine = clamp(weights.breakLine + 0.22, 0, 1.28);
      weights.driveSpace = clamp(weights.driveSpace + 0.12, 0, 1.22);
      weights.secure = clamp(weights.secure - 0.12, 0, 1.1);
    }
    if (flow.consecutivePasses >= 2) {
      weights.thirdPlayer = clamp(weights.thirdPlayer + 0.16, 0, 1.25);
      weights.breakLine = clamp(weights.breakLine + 0.12, 0, 1.25);
    }
    if (ballDepth >= 66) {
      weights.shoot = clamp(weights.shoot + 0.22, 0, 1.3);
      weights.cutback = clamp(weights.cutback + 0.14, 0, 1.25);
      weights.boxDelivery = clamp(weights.boxDelivery + 0.12, 0, 1.25);
    }
    if (carrierRoleKey === "wideForward" || carrierRoleKey === "wideBack") {
      weights.wideOverload = clamp(weights.wideOverload + 0.16, 0, 1.25);
      weights.isolate1v1 = clamp(weights.isolate1v1 + 0.12, 0, 1.22);
      weights.cutback = clamp(weights.cutback + (ballDepth >= 62 ? 0.12 : 0), 0, 1.25);
    }
    if (carrierRoleKey === "pivot" || carrierRoleKey === "connector") {
      weights.thirdPlayer = clamp(weights.thirdPlayer + 0.12, 0, 1.25);
      weights.switchPlay = clamp(weights.switchPlay + 0.08, 0, 1.18);
    }
    const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
    const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
    if (forwardFacingSpaceTwo.active) {
      weights.goldenZone = clamp((weights.goldenZone ?? 0) + 0.34, 0, 1.35);
      weights.breakLine = clamp(weights.breakLine + 0.24, 0, 1.3);
      weights.driveSpace = clamp(weights.driveSpace + 0.18, 0, 1.25);
      weights.secure = clamp(weights.secure - 0.22, 0, 1.05);
      weights.restDefence = clamp(weights.restDefence - 0.18, 0, 1.05);
    }
    if (progressionWindow.active) {
      weights.goldenZone = clamp((weights.goldenZone ?? 0) + 0.22 + progressionWindow.goldenAhead * 0.16, 0, 1.42);
      weights.breakLine = clamp(weights.breakLine + 0.2 + progressionWindow.openLane * 0.14, 0, 1.38);
      weights.driveSpace = clamp(weights.driveSpace + 0.2 + progressionWindow.openLane * 0.18, 0, 1.34);
      weights.shoot = clamp(weights.shoot + (progressionWindow.depth >= 62 ? 0.14 : 0), 0, 1.34);
      weights.secure = clamp(weights.secure - 0.14 * progressionWindow.urgency, 0, 1.08);
      weights.restDefence = clamp(weights.restDefence - 0.1 * progressionWindow.urgency, 0, 1.08);
    }
    if (regain.active) {
      const fresh = regain.freshness;
      const secureNeed = regain.secureIntent * fresh;
      const counterNeed = regain.counterIntent * fresh;
      weights.secure = clamp(weights.secure + secureNeed * 0.36 + (regain.pressure >= 0.52 ? 0.2 : 0), 0, 1.35);
      weights.thirdPlayer = clamp(weights.thirdPlayer + secureNeed * 0.18 + fresh * 0.08, 0, 1.3);
      weights.restDefence = clamp(weights.restDefence + secureNeed * 0.16, 0, 1.25);
      weights.counterAttack = clamp(weights.counterAttack + counterNeed * 0.48 + regain.forwardOpenSpace * 0.18, 0, 1.42);
      weights.breakLine = clamp(weights.breakLine + counterNeed * 0.28, 0, 1.35);
      weights.driveSpace = clamp(weights.driveSpace + counterNeed * 0.18 + regain.forwardOpenSpace * 0.12, 0, 1.3);
      weights.goldenZone = clamp((weights.goldenZone ?? 0) + counterNeed * 0.18, 0, 1.4);
      if (regain.pressure <= 0.34 && regain.forwardOpenSpace >= 0.62) {
        weights.secure = clamp(weights.secure - 0.08, 0, 1.25);
        weights.counterAttack = clamp(weights.counterAttack + 0.16, 0, 1.45);
      }
    }
    return {
      weights,
      flow,
      rhythm,
      ballDepth,
      carrierRoleKey,
      forwardFacingSpaceTwo,
      progressionWindow,
      regain,
    };
  }

  return {
    mergeIntentionWeights,
    getAutoPilotIntentionModel,
  };
}
