import { expect, test } from "@playwright/test";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { createSessionPlannerBlockHelpers } from "../src/modules/session-planner/session-planner-block-helpers.mjs";
import { createSessionPlannerTacticalFramesController } from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { getReadonlyTacticalView } from "../src/modules/session-planner/session-planner-readonly-playback-renderer.mjs";
import { applySessionDateChange, createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";
import { preserveSessionSaveLocalUi } from "../src/modules/session-planner/session-save-local-ui.mjs";

const date = "2026-10-16";
const helpers = createSessionPlannerTacticalHelpers();
const blocks = createSessionPlannerBlockHelpers({
  normalizeTacticalFrames: helpers.normalizeTacticalFrames,
  cloneTacticalElement: helpers.cloneTacticalElement,
});
const elements = (x) => [helpers.cloneTacticalElement({ id: "player", type: "red-player", x, y: 40 })];
function sequence() {
  const tacticalFrames = Array.from({ length: 12 }, (_, i) => ({
    id: `frame-${i + 1}`, label: `Frame ${i + 1}`, elements: elements(10 + i * 5),
  }));
  return { id: "passing", title: "Passing Principles", tacticalPitchMode: "full",
    tacticalFrames, tacticalActiveFrameId: "frame-12", tacticalElements: elements(65) };
}
const stateWith = (block) => ({ sessions: { [date]: { date, blocks: [block] } } });
function editor(source) {
  const writes = [];
  const controller = createSessionPlannerTacticalFramesController({
    getBlock: () => source, getKey: () => `${date}:${source.id}`, canEdit: () => true,
    cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames, markFields() {},
    writeState: () => writes.push(structuredClone(source)), clearInteraction() {},
    render() {}, showToast() {}, confirmDelete: async () => true,
  });
  return { controller, writes };
}

test("central save and reload cannot project the last frame onto frame one", () => {
  const before = stateWith(sequence()), after = structuredClone(before);
  after.sessions[date].blocks[0].objective = "Updated coaching instruction";
  const [change] = createSessionDateChanges(before, after, () => "coaching-edit");
  const result = applySessionDateChange(before, change);
  expect(result.ok).toBe(true);
  const saved = result.state.sessions[date].blocks[0];
  expect(saved).not.toHaveProperty("tacticalActiveFrameId");
  expect(saved.tacticalElements[0].x).toBe(65);
  const hydrated = blocks.createBlock(saved);
  expect(hydrated.tacticalActiveFrameId).toBe("frame-1");
  const snapshot = structuredClone(hydrated);
  const { controller, writes } = editor(hydrated);
  expect(controller.getFrames().map((frame) => frame.elements[0].x))
    .toEqual(Array.from({ length: 12 }, (_, i) => 10 + i * 5));
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(10);
  const preview = getReadonlyTacticalView(hydrated);
  expect(preview.tacticalElements[0].x).toBe(10);
  expect(preview.tacticalFrames[11].elements[0].x).toBe(65);
  controller.select("frame-2");
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(15);
  controller.select("frame-12");
  controller.select("frame-1");
  expect(controller.persist()).toBe(false);
  expect(hydrated).toEqual(snapshot);
  expect(writes).toEqual([]);
});

test("a receipt restoring another local selection cannot relabel central frame content", () => {
  const saved = stateWith(sequence()), local = structuredClone(saved);
  local.sessions[date].blocks[0].tacticalActiveFrameId = "frame-2";
  local.sessions[date].blocks[0].tacticalElements = elements(15);
  const receipt = JSON.parse(preserveSessionSaveLocalUi(JSON.stringify(saved), JSON.stringify(local)));
  const hydrated = blocks.createBlock(receipt.sessions[date].blocks[0]);
  const { controller, writes } = editor(hydrated);
  expect(controller.getEditorBlock().tacticalActiveFrameId).toBe("frame-2");
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(15);
  expect(getReadonlyTacticalView(hydrated).tacticalFrames[1].elements[0].x).toBe(15);
  expect(controller.persist()).toBe(false);
  expect(writes).toEqual([]);
});

test("editing a later frame after reload preserves all earlier frames across another central round trip", () => {
  const raw = sequence();
  delete raw.tacticalActiveFrameId;
  const source = blocks.createBlock(raw), before = stateWith(structuredClone(source));
  const { controller } = editor(source);
  const earlierFrames = structuredClone(source.tacticalFrames.slice(0, 11));
  controller.select("frame-12");
  controller.getEditorBlock().tacticalElements[0].x = 75;
  expect(controller.persist()).toBe(true);
  expect(source.tacticalFrames.slice(0, 11)).toEqual(earlierFrames);
  const [change] = createSessionDateChanges(before, stateWith(source), () => "frame-edit");
  const saved = applySessionDateChange(before, change);
  expect(saved.ok).toBe(true);
  const reloaded = blocks.createBlock(saved.state.sessions[date].blocks[0]);
  const reopened = editor(reloaded).controller;
  expect(reopened.getFrames().slice(0, 11)).toEqual(earlierFrames);
  expect(reopened.getFrames()[11].elements[0].x).toBe(75);
  expect(getReadonlyTacticalView(reloaded).tacticalElements[0].x).toBe(10);
});

test("a deliberately empty first frame remains empty despite a later compatibility mirror", () => {
  const source = sequence();
  source.tacticalFrames[0].elements = [];
  source.tacticalActiveFrameId = "frame-1";
  expect(editor(source).controller.getFrames()[0].elements).toEqual([]);
  expect(getReadonlyTacticalView(source).tacticalElements).toEqual([]);
});
