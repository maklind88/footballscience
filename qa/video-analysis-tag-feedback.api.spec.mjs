import { expect, test } from "@playwright/test";
import { renderCodingTemplateBuilder } from "../src/modules/video-analysis/components/CodingTemplateBuilder.js";
import { renderUnitPicker } from "../src/modules/video-analysis/components/UnitOutcomeTags.js";
import { renderMiniGamePrinciplePicker } from "../src/modules/video-analysis/components/MiniGamePrinciplePicker.js";
import { renderTagButtonFeedback, runTagButtonAction } from "../src/modules/video-analysis/services/tagButtonFeedbackService.js";

function createStore() {
  let state = {
    status: "ready", error: "", match: { id: "match" }, video: { id: "video" },
    draft: { subPhase: "Build Up", phase: "In Possession", outcome: "Neutral", playerId: "p1", unit: "Midfield" },
    codingSession: {
      activeButtonId: "build-up", lastPlayerTagId: "p1", lastUnitTag: "Midfield", lastOutcomeTag: "Development",
      miniGamePrincipleDraftIds: ["drive-past-press"],
    },
    players: [{ id: "p1", name: "Alex Morgan" }],
    template: { buttons: [{ id: "build-up", group: "Sub-phase", type: "subPhase", value: "Build Up", label: "Build Up" }] },
  };
  return { getState: () => state, update: fn => { state = fn(state); } };
}

test("tag panel does not select defaults or previously completed tags", () => {
  const html = renderCodingTemplateBuilder(createStore().getState());
  const buttons = html.match(/<button\b[^>]*>/g) || [];
  expect(buttons.filter(button => /is-active/.test(button))).toEqual([
    expect.stringContaining('data-video-analysis-panel-mode="use"'),
  ]);
  expect(html).toContain('video-analysis-code-button__label">MG Principle</span>');
  expect(html).toContain('video-analysis-code-button__label">Unit</span>');
  expect(html).not.toContain("selected</small>");
  expect(html).not.toContain("video-analysis-tag-feedback");
});

test("tag panel keeps only an unfinished duration recording active", () => {
  const state = createStore().getState();
  state.codingSession.openTag = { buttonId: "build-up", startMs: 1000 };
  expect(renderCodingTemplateBuilder(state)).toContain('class="video-analysis-code-button is-active"');
  state.codingSession.openTag = null;
  expect(renderCodingTemplateBuilder(state)).not.toContain('class="video-analysis-code-button is-active"');
});

test("new Unit choice is empty while an open MG selection keeps its checked choices", () => {
  const state = createStore().getState();
  state.codingSession.unitPickerOpen = true;
  expect(renderUnitPicker(state)).not.toContain("is-active");
  state.codingSession.miniGamePrinciplePickerOpen = true;
  expect(renderMiniGamePrinciplePicker(state)).toContain('class="video-analysis-mg-principle-chip is-active"');
});

test("success feedback expires across repaints without modifying coding data", async () => {
  const store = createStore();
  const draft = structuredClone(store.getState().draft);
  expect(await runTagButtonAction(store, "code:build-up", async () => true, () => 100)).toBe(true);
  expect(renderTagButtonFeedback(store.getState(), "code:build-up", 100)).toContain("animation-delay:-0ms");
  expect(renderTagButtonFeedback(store.getState(), "code:build-up", 650)).toContain("animation-delay:-550ms");
  expect(renderTagButtonFeedback(store.getState(), "code:build-up", 800)).toBe("");
  expect(renderTagButtonFeedback(store.getState(), "code:build-up", 90)).toBe("");
  expect(store.getState().draft).toEqual(draft);
});

test("quick tags have independent feedback and repeat tagging restarts only its button", async () => {
  const store = createStore();
  await runTagButtonAction(store, "player:p1", async () => true, () => 100);
  await runTagButtonAction(store, "outcome", async () => true, () => 200);
  await runTagButtonAction(store, "player:p1", async () => true, () => 500);
  expect(renderTagButtonFeedback(store.getState(), "player:p1", 600)).toContain("animation-delay:-100ms");
  expect(renderTagButtonFeedback(store.getState(), "outcome", 600)).toContain("animation-delay:-400ms");
  await runTagButtonAction(store, "unit", async () => true, () => 1300);
  expect(Object.keys(store.getState().codingSession.tagButtonFeedback)).toEqual(["unit"]);
});

test("failed actions and actions completed in another video never show success", async () => {
  for (const mode of ["false", "error", "pending", "recording", "changed-video"]) {
    const store = createStore();
    await runTagButtonAction(store, "code:build-up", async () => {
      if (mode === "error") store.update(state => ({ ...state, error: "Save failed" }));
      if (mode === "pending") store.update(state => ({ ...state, status: "saving-clip" }));
      if (mode === "recording") store.getState().codingSession.openTag = { buttonId: "build-up" };
      if (mode === "changed-video") store.update(state => ({ ...state, video: { id: "other" } }));
      return mode !== "false";
    }, () => 100);
    expect(renderTagButtonFeedback(store.getState(), "code:build-up", 150), mode).toBe("");
  }
});

test("retrying a button clears previous success feedback even when the retry fails", async () => {
  const store = createStore();
  await runTagButtonAction(store, "player:p1", async () => true, () => 100);
  expect(renderTagButtonFeedback(store.getState(), "player:p1", 150)).not.toBe("");
  await runTagButtonAction(store, "player:p1", async () => false, () => 200);
  expect(renderTagButtonFeedback(store.getState(), "player:p1", 250)).toBe("");
});
