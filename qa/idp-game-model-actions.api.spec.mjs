import { expect, test } from "@playwright/test";
import { actionSubPhases, individualActions } from "../src/modules/idp/game-model/action-catalog.mjs";
import { actionPositions, actionsForPosition, actionFocusDraft, changeActionSelection, initialActionSelection } from "../src/modules/idp/game-model/action-selection.mjs";
import { periodizationPhaseLibrary } from "../src/modules/periodization/periodization-state.mjs";
import { normalizeIdpFocus } from "../src/modules/idp/domain/idp.models.mjs";

test("all Game Model sub-phases cover every requested position and midfield role", () => {
  expect(actionSubPhases.map((item) => item.label).sort()).toEqual(Object.values(periodizationPhaseLibrary).flat().sort());
  expect(new Set(individualActions.map((item) => item.id)).size).toBe(individualActions.length);
  for (const phase of actionSubPhases) {
    expect(periodizationPhaseLibrary[phase.phase]).toContain(phase.label);
    for (const position of actionPositions) {
      const actions = actionsForPosition(phase.id, position.id);
      expect(actions.length, `${phase.label} / ${position.label}`).toBeGreaterThan(0);
      for (const action of actions) {
        const draft = actionFocusDraft({ subPhaseId: phase.id, positionId: position.id, actionId: action.id });
        expect(draft.title.length).toBeLessThanOrEqual(180);
        expect(draft.description.length).toBeLessThanOrEqual(800);
        expect(draft.description).toContain(position.label);
        expect(draft.description).toContain(action.when);
        expect(draft.description).toContain(action.detail);
        const saved = normalizeIdpFocus(draft);
        expect(saved.linkedSubPhase).toBe(phase.label);
        expect(saved.linkedPhase).toBe(phase.phase);
        expect(saved.description).toContain(action.detail);
        expect(draft).not.toHaveProperty("id");
        expect(draft).not.toHaveProperty("focusId");
      }
    }
  }
});

test("position changes clear selected actions and unknown positions are not guessed", () => {
  const action = actionsForPosition("build-up", "CB")[0];
  const selection = { subPhaseId: "build-up", positionId: "CB", actionId: action.id, draft: { title: "Draft" } };
  expect(changeActionSelection(selection, "positionId", "CMF-8").actionId).toBe("");
  expect(changeActionSelection(selection, "subPhaseId", "box-defending").draft).toBeNull();
  expect(changeActionSelection(selection, "actionId", "unknown")).toEqual(selection);
  expect(actionFocusDraft({ ...selection, positionId: "9" })).toBeNull();
  expect(initialActionSelection({ position: "Defender" }).positionId).toBe("");
  expect(initialActionSelection({ position: "GK" }).positionId).toBe("");
  expect(initialActionSelection({ position: "CMF", role: "8" }).positionId).toBe("CMF-8");
});
