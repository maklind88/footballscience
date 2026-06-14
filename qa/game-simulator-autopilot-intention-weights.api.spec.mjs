import { expect, test } from "@playwright/test";
import {
  autoPilotFormationIntentionWeights,
  autoPilotPhaseIntentionWeights,
  autoPilotStyleIntentionWeights,
  autoPilotStylePrincipleWeights,
} from "../src/modules/game-simulator/autopilot-intention-weights.mjs";
import { autoPilotPrincipleLabels } from "../src/modules/game-simulator/autopilot-principle-labels.mjs";

test("game simulator autopilot intention weights expose principle labels and tactical profiles", () => {
  expect(autoPilotPrincipleLabels.thirdPlayer).toBe("Find the Third");
  expect(autoPilotPrincipleLabels.counterAttack).toBe("Attack transition space");
  expect(autoPilotStylePrincipleWeights["control-possession"].thirdPlayer).toBeGreaterThan(0.8);
  expect(autoPilotStylePrincipleWeights["direct-transition"].directTransition).toBeGreaterThan(0.9);
  expect(autoPilotPhaseIntentionWeights.finalThird.shoot).toBeGreaterThan(0.9);
  expect(autoPilotStyleIntentionWeights["wing-play"].wideOverload).toBeGreaterThan(0.9);
  expect(autoPilotFormationIntentionWeights["4-3-3"].wideOverload).toBeGreaterThan(0.7);
});

test("game simulator autopilot intention weights label every used principle key", () => {
  const labeledPrincipleKeys = Object.keys(autoPilotPrincipleLabels);
  const usedPrincipleKeys = new Set();

  for (const profile of Object.values(autoPilotPhaseIntentionWeights)) {
    Object.keys(profile).forEach((key) => usedPrincipleKeys.add(key));
  }
  for (const profile of Object.values(autoPilotStyleIntentionWeights)) {
    Object.keys(profile).forEach((key) => usedPrincipleKeys.add(key));
  }
  for (const profile of Object.values(autoPilotFormationIntentionWeights)) {
    Object.keys(profile).forEach((key) => usedPrincipleKeys.add(key));
  }
  expect(labeledPrincipleKeys).toEqual(expect.arrayContaining([...usedPrincipleKeys]));
});
