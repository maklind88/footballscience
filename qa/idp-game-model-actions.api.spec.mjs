import { expect, test } from "@playwright/test";
import { actionSubPhases, individualActions } from "../src/modules/idp/game-model/action-catalog.mjs";
import { actionPositions, actionsForPosition, resolveGameModelAction, suggestedGameModelPosition } from "../src/modules/idp/game-model/action-selection.mjs";
import { periodizationPhaseLibrary } from "../src/modules/periodization/periodization-state.mjs";
import { normalizeIdpFocus } from "../src/modules/idp/domain/idp.models.mjs";

test("every Game Model sub-phase has individual actions for each supported position", () => {
  expect(actionSubPhases.map((item) => item.label).sort()).toEqual(Object.values(periodizationPhaseLibrary).flat().sort());
  expect(new Set(individualActions.map((item) => item.id)).size).toBe(individualActions.length);
  for (const subPhase of actionSubPhases) {
    expect(periodizationPhaseLibrary[subPhase.phase]).toContain(subPhase.label);
    for (const position of actionPositions) {
      const actions = actionsForPosition(subPhase.id, position.id);
      expect(actions.length, `${subPhase.label} / ${position.label}`).toBeGreaterThan(0);
      for (const action of actions) {
        const snapshot = resolveGameModelAction(action.id, position.id);
        expect(snapshot).toMatchObject({ subPhase: subPhase.label, phase: subPhase.phase, positionLabel: position.label });
        expect(normalizeIdpFocus({ metadata: { game_model_action: snapshot } }).gameModelAction).toEqual(snapshot);
      }
    }
  }
});

test("invalid position and action combinations cannot resolve", () => {
  const action = actionsForPosition("build-up", "CB")[0];
  expect(resolveGameModelAction(action.id, "CMF-8")).toBeNull();
  expect(resolveGameModelAction("missing-action", "CB")).toBeNull();
  expect(suggestedGameModelPosition({ position: "Defender" })).toBe("");
  expect(suggestedGameModelPosition({ position: "CMF", role: "8" })).toBe("CMF-8");
  expect(normalizeIdpFocus({ description: "Existing" }).gameModelAction).toBeNull();
});
