import { test, expect } from "@playwright/test";
import { createPlayerPairController, createPlayerPairCache } from "../src/modules/video-analysis/timeline/timeline.player-pair.controller.js";
import { createLocalVideoReference, revokeLocalVideoReference } from "../src/modules/video-analysis/services/localVideoBridgeService.js";

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

class Element extends EventTarget {
  attributes = {};
  textContent = "";
  hidden = false;
  disabled = false;
  classList = { toggle() {} };
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 562.5 }; }
  setPointerCapture() {}
  hasPointerCapture() { return false; }
}

async function harness({ inspect = async () => ({ batchAvailable: true }), track, cache = createPlayerPairCache(), loadCalibration } = {}) {
  const nodes = Object.fromEntries(["video", "root", "canvas", "toggle", "output", "retry", "hide"].map(key => [key, new Element()]));
  const win = {
    URL, AbortController, crypto, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} },
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
    document: { createElement: () => ({ canPlayType: () => "probably" }) },
  };
  const reference = await createLocalVideoReference(new File(["avc1"], "seattle.mp4", { type: "video/mp4" }), win);
  const state = { match: { id: "match" }, video: { id: "video" }, videoRef: { ...reference, durationMs: 15000 } };
  const range = { startMs: 0, endMs: 15000 };
  const selectors = {
    "[data-video-analysis-clip-preview]": nodes.video, "[data-player-pair]": nodes.root,
    "[data-player-pair-toggle]": nodes.toggle, "canvas": nodes.canvas,
    "[data-player-pair-status]": nodes.output, "[data-player-pair-retry]": nodes.retry,
    "[data-player-pair-hide]": nodes.hide,
  };
  const document = { defaultView: win };
  const dialog = { ownerDocument: document, querySelector: selector => selectors[selector] };
  nodes.root.querySelector = dialog.querySelector;
  Object.assign(nodes.canvas, { ownerDocument: document, clientWidth: 1000, clientHeight: 562.5,
    getContext: () => new Proxy({}, { get: (_, name) => name === "measureText" ? () => ({ width: 30 }) : () => {} }),
  });
  Object.assign(nodes.video, { currentTime: 0, paused: true, readyState: 4, videoWidth: 1920, videoHeight: 1080,
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); },
  });
  const controller = createPlayerPairController({ dialog, clipId: "clip", getState: () => state,
    getRange: () => range, inspect, track, cache, loadCalibration });
  const click = node => node.dispatchEvent(new Event("click"));
  const point = (x, y) => {
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
      nodes.canvas.dispatchEvent(event);
    }
  };
  return { ...nodes, state, range, cache, click, point, controller,
    async select() { click(nodes.toggle); await settle(); point(300, 300); point(600, 300); await settle(); },
    close() { controller.dispose(); revokeLocalVideoReference(reference, win); },
  };
}

const results = (angleId = "primary") => [1, 2].map(id => ({ id: String(id), clipId: "clip", videoId: "video", segments: [],
  metadata: { angleId, localSourceSha256: "a".repeat(64) } }));

test("two clicks launch one batch; closing aborts it and ignores a late success", async () => {
  const pending = deferred();
  let request, calls = 0, saved = 0;
  const h = await harness({ track: args => { request = args; calls++; return pending.promise; },
    cache: { get: () => null, set: () => { saved++; } } });
  await h.select();
  expect(calls).toBe(1);
  expect(request.prompts).toHaveLength(2);
  expect(h.video.paused).toBe(true);
  h.close();
  expect(request.signal.aborted).toBe(true);
  pending.resolve(results()); await settle();
  expect(saved).toBe(0);
  expect(h.root.hidden).toBe(true);
});

test("a changed clip range cannot accept or cache an old tracking result", async () => {
  const pending = deferred(); let saved = 0;
  const h = await harness({ track: () => pending.promise, cache: { get: () => null, set: () => { saved++; } } });
  await h.select(); h.range.endMs = 14000;
  pending.resolve(results()); await settle();
  expect(saved).toBe(0);
  expect(h.output.textContent).toBe("Video or clip range changed");
  h.close();
});

test("hiding during provider inspection cannot later turn selection back on", async () => {
  const pending = deferred(); let calls = 0;
  const h = await harness({ inspect: () => pending.promise, track: () => { calls++; } });
  h.click(h.toggle); h.click(h.hide);
  pending.resolve({ batchAvailable: true }); await settle();
  h.point(300, 300); h.point(600, 300);
  expect(calls).toBe(0);
  expect(h.root.hidden).toBe(true);
  expect(h.toggle.attributes["aria-pressed"]).toBe("false");
  h.close();
});

test("retry aborts the previous job; late results cannot replace the new selection", async () => {
  const pending = deferred(); let request, saved = 0;
  const h = await harness({ track: args => { request = args; return pending.promise; },
    cache: { get: () => null, set: () => { saved++; } } });
  await h.select(); h.click(h.retry); await settle();
  expect(request.signal.aborted).toBe(true);
  pending.resolve(results()); await settle();
  expect(h.output.textContent).toBe("Player 1 / 2");
  expect(saved).toBe(0);
  h.close();
});

test("seeking between clicks clears the first selection", async () => {
  let calls = 0;
  const h = await harness({ track: () => { calls++; return Promise.resolve(results()); } });
  h.click(h.toggle); await settle(); h.point(300, 300);
  h.video.currentTime = 2; h.video.dispatchEvent(new Event("seeking"));
  h.point(600, 300); await settle();
  expect(calls).toBe(0);
  expect(h.output.textContent).toBe("Player 2 / 2");
  h.close();
});

test("hiding and reopening completed tracking reuses it without changing source data", async () => {
  let calls = 0;
  const h = await harness({ track: async args => { calls++; return results(args.prompts[0].angleId); } });
  const before = JSON.stringify(h.state);
  await h.select(); h.click(h.hide); h.click(h.toggle); await settle();
  expect(calls).toBe(1);
  expect(h.root.hidden).toBe(false);
  expect(JSON.stringify(h.state)).toBe(before);
  h.close();
});

test("mixed camera or source results never enter the reusable cache", async () => {
  for (const field of ["angleId", "localSourceSha256"]) {
    let saved = 0;
    const h = await harness({ track: async args => {
      const value = results(args.prompts[0].angleId);
      value[1].metadata[field] = "other";
      return value;
    }, cache: { get: () => null, set: () => { saved++; } } });
    await h.select();
    expect(saved).toBe(0);
    expect(h.output.textContent).toBe("Tracking returned a different video or camera");
    h.close();
  }
});

test("real trailing observations cover the last visible frames without editing the saved range", async () => {
  let request;
  const h = await harness({ track: async args => { request = args; return results(args.prompts[0].angleId); } });
  h.video.duration = 60;
  await h.select();
  expect(request.prompts[0].endMs).toBe(15320);
  expect(request.prompts[0].sourceEndMs).toBe(15320);
  expect(h.range).toEqual({ startMs: 0, endMs: 15000 });
  h.close();
});

test("tracking cannot ask for observations beyond the actual source end", async () => {
  let request;
  const h = await harness({ track: async args => { request = args; return results(args.prompts[0].angleId); } });
  h.video.duration = 15;
  await h.select();
  expect(request.prompts[0].sourceEndMs).toBe(15000);
  h.close();
});

test("a late calibration load cannot re-enable hidden tracking", async () => {
  const pending = deferred();
  const h = await harness({ track: async args => results(args.prompts[0].angleId), loadCalibration: () => pending.promise });
  await h.select(); h.click(h.hide);
  pending.resolve({ status: "image-checked-estimate" }); await settle();
  expect(h.root.hidden).toBe(true);
  expect(h.toggle.attributes["aria-pressed"]).toBe("false");
  h.close();
});
