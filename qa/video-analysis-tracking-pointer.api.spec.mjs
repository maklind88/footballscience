import { expect, test } from "@playwright/test";
import { createTrackingController } from "../src/modules/video-analysis/controllers/trackingController.js";

function harness() {
  const item = { id: "item-1", clipId: "clip-1", startMs: 0, endMs: 5000 };
  let state = {
    presentation: {
      selectedItemId: item.id,
      current: { sections: [{ id: "section-1", items: [item] }] },
      tracking: { captureMode: "prompt", prompt: { startMs: 0, endMs: 5000, box: null } },
    },
  };
  let replacement = null;
  const bounds = { left: 100, top: 50, width: 1000, height: 500 };
  const surface = {
    isConnected: true,
    ownerDocument: { querySelector: selector => selector === "[data-video-analysis-drawing-surface]" ? replacement : null },
    getBoundingClientRect: () => surface.isConnected ? bounds : { left: 0, top: 0, width: 0, height: 0 },
    setPointerCapture() {},
  };
  const controller = createTrackingController({ getState: () => state, updateState: update => { state = update(state); } });
  const event = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, preventDefault() {} });
  return {
    controller, surface, event, state: () => state,
    replace: rect => { surface.isConnected = false; replacement = { getBoundingClientRect: () => rect || bounds }; },
    remove: () => { surface.isConnected = false; },
  };
}

for (const repaint of [false, true]) {
  test(`tracking uses the live canvas bounds after repaint=${repaint}`, () => {
    const h = harness();
    expect(h.controller.startInteraction(h.event(300, 200), h.surface)).toBe(true);
    if (repaint) h.replace();
    expect(h.controller.updateInteraction(h.event(350, 300))).toBe(true);
    expect(h.controller.finishInteraction(h.event(400, 350))).toBe(true);
    const box = h.state().presentation.tracking.prompt.box;
    expect(box.left).toBeCloseTo(0.2);
    expect(box.top).toBeCloseTo(0.3);
    expect(box.width).toBeCloseTo(0.1);
    expect(box.height).toBeCloseTo(0.3);
    expect(h.controller.finishInteraction(h.event(900, 500))).toBe(false);
  });
}

test("tracking reads a replacement canvas at its current scrolled position", () => {
  const h = harness();
  h.controller.startInteraction(h.event(300, 200), h.surface);
  h.replace({ left: 200, top: 100, width: 1000, height: 500 });
  h.controller.finishInteraction(h.event(500, 400));
  expect(h.state().presentation.tracking.prompt.box.width).toBeCloseTo(0.1);
  expect(h.state().presentation.tracking.prompt.box.height).toBeCloseTo(0.3);
});

for (const change of ["removed", "item", "capture mode"]) {
  test(`tracking cancels without adding a box when its ${change} changes`, () => {
    const h = harness();
    h.controller.startInteraction(h.event(300, 200), h.surface);
    if (change === "removed") h.remove();
    if (change === "item") {
      const other = { id: "item-2", clipId: "clip-2" };
      h.state().presentation.current.sections[0].items.push(other);
      h.state().presentation.selectedItemId = other.id;
    }
    if (change === "capture mode") h.state().presentation.tracking.captureMode = "";
    expect(h.controller.updateInteraction(h.event(350, 300))).toBe(false);
    expect(h.controller.finishInteraction(h.event(400, 350))).toBe(true);
    expect(h.state().presentation.tracking.prompt.box).toBeNull();
    expect(h.controller.finishInteraction(h.event(900, 500))).toBe(false);
  });
}
