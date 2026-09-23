import { expect, test } from "@playwright/test";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { createSessionPlannerTacticalFramesController } from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { getTacticalPlaybackPosition } from "../src/modules/session-planner/session-planner-tactical-playback-controller.mjs";

function harness({ legacy = false, editable = true, maxFrames = 12, confirmDelete = async () => true } = {}) {
  const helpers = createSessionPlannerTacticalHelpers({ tacticalMaxFrames: maxFrames });
  const elements = [
    { id: "player", type: "blue-player", x: 20, y: 30 },
    { id: "ball", type: "ball", x: 25, y: 30 },
  ].map(helpers.cloneTacticalElement);
  const frames = helpers.normalizeTacticalFrames([
    { id: "one", label: "Frame 1", elements },
    { id: "two", label: "Frame 2", elements: elements.map((element) => ({ ...element, x: 60 })) },
  ]);
  const state = { source: {
    id: "block-1", tacticalPitchMode: "full", tacticalElements: elements,
    ...(legacy ? {} : { tacticalFrames: frames, tacticalActiveFrameId: "one" }),
  }, key: "2026-09-07::block-1", writes: [], fields: [], warnings: [], editable };
  const controller = createSessionPlannerTacticalFramesController({
    getBlock: () => state.source,
    getKey: () => state.key,
    canEdit: () => state.editable,
    cloneElement: helpers.cloneTacticalElement,
    cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames,
    markFields: (_block, fields) => state.fields.push(fields),
    writeState: () => state.writes.push(structuredClone(state.source)),
    clearInteraction: () => {}, render: () => {},
    showToast: (message) => state.warnings.push(message),
    confirmDelete,
    maxFrames,
  });
  return { state, controller };
}

test("frame browsing and no-op edits never mutate or save the source", () => {
  const { state, controller } = harness();
  const before = structuredClone(state.source);
  controller.select("two");
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(60);
  expect(controller.persist()).toBe(false);
  controller.select("one");
  expect(state.source).toEqual(before);
  expect(state.writes).toEqual([]);
  expect(state.fields).toEqual([]);
});

test("next frame preserves identities and editing it cannot change earlier frames", () => {
  const { state, controller } = harness();
  const first = structuredClone(state.source.tacticalFrames[0]);
  expect(controller.next()).toBe(true);
  const view = controller.getEditorBlock();
  expect(view.tacticalFrames).toHaveLength(3);
  expect(view.tacticalFrames[1].id).not.toBe("one");
  expect(view.tacticalElements.map((item) => item.id)).toEqual(["player", "ball"]);
  view.tacticalElements[0].x = 45;
  expect(controller.persist(view)).toBe(true);
  expect(state.source.tacticalFrames[0]).toEqual(first);
  expect(state.source.tacticalFrames[1].elements[0].x).toBe(45);
  expect(state.source.tacticalFrames[2].elements[0].x).toBe(60);
  expect(state.writes).toHaveLength(2);
  controller.reset();
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(45);
  expect(controller.persist()).toBe(false);
});

test("legacy single-image boards stay unchanged until a real edit", () => {
  const { state, controller } = harness({ legacy: true });
  const before = structuredClone(state.source);
  expect(controller.getFrames()).toHaveLength(1);
  expect(controller.persist()).toBe(false);
  expect(state.source).toEqual(before);
  controller.next();
  expect(state.source.tacticalFrames).toHaveLength(2);
  expect(state.source.tacticalFrames[0].elements).toEqual(before.tacticalElements);
});

test("frame edits fail closed if another editor changed the saved board", () => {
  const { state, controller } = harness();
  const stale = controller.getEditorBlock();
  stale.tacticalElements[0].x = 90;
  state.source.tacticalElements[0].x = 35;
  const remote = structuredClone(state.source);
  expect(controller.persist(stale)).toBe(false);
  expect(state.source).toEqual(remote);
  expect(state.writes).toEqual([]);
  expect(state.warnings).toHaveLength(1);
  expect(controller.getEditorBlock().tacticalElements[0].x).toBe(35);
});

test("stale board drafts cannot be applied to another date or block", () => {
  const { state, controller } = harness();
  const stale = controller.getEditorBlock();
  stale.tacticalElements[0].x = 90;
  state.key = "2026-09-08::block-2";
  state.source = { ...structuredClone(state.source), id: "block-2" };
  expect(controller.persist(stale)).toBe(false);
  expect(state.source.tacticalElements[0].x).toBe(20);
  expect(state.writes).toEqual([]);
});

test("deleting keeps at least one frame and edit permissions are enforced", async () => {
  const { state, controller } = harness();
  expect(await controller.remove()).toBe(true);
  expect(await controller.remove()).toBe(false);
  expect(state.source.tacticalFrames).toHaveLength(1);
  state.editable = false;
  expect(controller.next()).toBe(false);
  const view = controller.getEditorBlock();
  view.tacticalElements[0].x = 5;
  expect(controller.persist(view)).toBe(false);
  expect(state.writes).toHaveLength(1);
});

test("frame limit is enforced without truncating existing steps", () => {
  const { state, controller } = harness({ maxFrames: 2 });
  const before = structuredClone(state.source);
  expect(controller.next()).toBe(false);
  expect(state.source).toEqual(before);
  expect(state.writes).toEqual([]);
});

test("an asynchronous delete cannot remove a different frame or a remotely changed board", async () => {
  let confirm;
  const { state, controller } = harness({ confirmDelete: () => new Promise((resolve) => { confirm = resolve; }) });
  const before = structuredClone(state.source);
  const pending = controller.remove();
  controller.select("two");
  confirm(true);
  expect(await pending).toBe(false);
  expect(state.source).toEqual(before);
  const nextPending = controller.remove();
  state.source.tacticalPitchMode = "attacking-half";
  confirm(true);
  expect(await nextPending).toBe(false);
  expect(state.source.tacticalFrames).toHaveLength(2);
  expect(state.writes).toEqual([]);
});

test("repeated object normalization preserves optional endpoints and frame identity", () => {
  const { controller } = harness();
  const first = structuredClone(controller.getEditorBlock());
  controller.reset();
  expect(controller.getEditorBlock()).toEqual(first);
  expect(first.tacticalElements[0].controlX).toBeNull();
  expect(first.tacticalElements[0].x2).toBeNull();
});

test("equivalent hydration keeps the editor identity while real board changes invalidate it", () => {
  const { state, controller } = harness();
  const view = controller.getEditorBlock();
  state.source = structuredClone(state.source);
  expect(controller.getEditorBlock()).toBe(view);
  state.source.visualImage = "https://example.invalid/board.png";
  expect(controller.getEditorBlock()).not.toBe(view);
});

test("pitch selection persists as content while frame selection alone does not", () => {
  const { state, controller } = harness();
  controller.select("two");
  const view = controller.getEditorBlock();
  view.tacticalPitchMode = "full-wide";
  expect(controller.persist(view)).toBe(true);
  expect(state.source.tacticalPitchMode).toBe("full-wide");
  expect(state.source.tacticalActiveFrameId).toBe("two");
  expect(state.fields[0]).toContain("tacticalPitchMode");
  expect(controller.persist(view)).toBe(false);
});

test("animation positions clamp at endpoints and interpolate only adjacent frames", () => {
  const frames = [{}, {}, {}];
  expect(getTacticalPlaybackPosition(frames, -10)).toMatchObject({ index: 0, progress: 0, time: 0 });
  expect(getTacticalPlaybackPosition(frames, 750)).toMatchObject({ index: 0, nextIndex: 1, progress: 0.5 });
  expect(getTacticalPlaybackPosition(frames, 2250)).toMatchObject({ index: 1, nextIndex: 2, progress: 0.5 });
  expect(getTacticalPlaybackPosition(frames, 9000)).toMatchObject({ index: 2, nextIndex: 2, progress: 0, duration: 3000 });
  expect(getTacticalPlaybackPosition([{}], 100)).toMatchObject({ index: 0, nextIndex: 0, duration: 0 });
});
