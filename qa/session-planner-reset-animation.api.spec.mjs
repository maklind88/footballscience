import { test, expect } from "@playwright/test";
import { createSessionPlannerTacticalFramesController } from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";

const helpers = createSessionPlannerTacticalHelpers();
function fixture(count = 14) {
  const frames = Array.from({ length: count }, (_, i) => ({ id: `frame-${i}`, label: `Frame ${i + 1}`,
    elements: [{ id: "player", type: "red-player", x: 10 + i, y: 40 }] }));
  let source = { id: "exercise", title: "Keep title", objective: "Keep instructions", visualImage: "keep-image",
    tacticalPitchMode: "attacking-half", tacticalFrames: frames, tacticalActiveFrameId: frames.at(-1).id,
    tacticalElements: structuredClone(frames.at(-1).elements) };
  let editable = true, key = "date:exercise", confirm = async () => true;
  const writes = [], confirmations = [];
  const controller = createSessionPlannerTacticalFramesController({
    getBlock: () => source, getKey: () => key, canEdit: () => editable,
    cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames, markFields() {}, clearInteraction() {}, render() {}, showToast() {},
    writeState: () => writes.push(structuredClone(source)),
    confirmReset: (count) => { confirmations.push(count); return confirm(); },
  });
  return { controller, writes, confirmations, get source() { return source; },
    setConfirm(fn) { confirm = fn; }, setEditable(v) { editable = v; },
    replaceSource() { source = structuredClone(source); source.tacticalFrames[0].elements[0].x = 70; },
    changeContext() { key = "other-date:exercise"; } };
}

test("reset keeps the authoritative first frame and other exercise content in one write", async () => {
  const f = fixture(24), before = structuredClone(f.source);
  expect(await f.controller.resetAnimation()).toBe(true);
  expect(f.confirmations).toEqual([23]);
  expect(f.writes).toHaveLength(1);
  expect(f.source.tacticalFrames).toEqual(helpers.normalizeTacticalFrames([before.tacticalFrames[0]]));
  expect(f.source.tacticalActiveFrameId).toBe("frame-0");
  expect(f.source.tacticalElements).toEqual(f.source.tacticalFrames[0].elements);
  for (const field of ["title", "objective", "visualImage", "tacticalPitchMode"]) expect(f.source[field]).toEqual(before[field]);
});

for (const reason of ["cancel", "permission", "source", "context", "selection", "draft"]) {
  test(`reset aborts if confirmation is invalidated by ${reason}`, async () => {
    const f = fixture();
    f.controller.getEditorBlock();
    f.setConfirm(async () => {
      if (reason === "permission") f.setEditable(false);
      if (reason === "source") f.replaceSource();
      if (reason === "context") f.changeContext();
      if (reason === "selection") f.controller.select("frame-0");
      if (reason === "draft") f.controller.getEditorBlock().tacticalElements[0].x = 80;
      return reason !== "cancel";
    });
    expect(await f.controller.resetAnimation()).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.source.tacticalFrames).toHaveLength(14);
  });
}

for (const reason of ["single", "readonly"]) {
  test(`reset is unavailable for ${reason} boards`, async () => {
    const f = fixture(reason === "single" ? 1 : 14);
    if (reason === "readonly") f.setEditable(false);
    expect(await f.controller.resetAnimation()).toBe(false);
    expect(f.confirmations).toEqual([]);
    expect(f.writes).toEqual([]);
  });
}
