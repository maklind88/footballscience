import { test, expect } from "@playwright/test";
import { createMediaCameraController } from "../src/modules/video-analysis/controllers/mediaCameraController.js";

function setup({ playing = false } = {}) {
  let state = {
    source: { id: "primary" }, videoRef: { objectUrl: "blob:primary" },
    mediaProduction: {
      activeAngleId: "primary", panelOpen: false,
      angles: [{ id: "tactical" }, { id: "missing" }, { id: "bench" }],
      angleRefs: { tactical: { objectUrl: "blob:tactical" }, bench: { objectUrl: "blob:bench" } },
    },
  };
  let video = new EventTarget();
  Object.assign(video, { paused: !playing, readyState: 2, pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } });
  const videos = [video], frames = [], seeks = [], body = { closest: () => null };
  const root = { ownerDocument: { body, querySelector: () => null }, contains: () => true, querySelector: () => null };
  const camera = createMediaCameraController({
    getState: () => state, getRoot: () => root,
    updateState: fn => {
      state = fn(state);
      video = new EventTarget();
      Object.assign(video, { paused: true, readyState: 0, pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } });
      videos.push(video);
    },
    getVideoElement: () => video, getCurrentMatchMs: () => videos.length === 1 ? 42000 : 0,
    getWindow: () => ({ requestAnimationFrame: fn => frames.push(fn) }),
    seekToMatchMs: ms => seeks.push(ms),
  });
  const key = overrides => camera.handleShortcut({ target: body, code: "KeyC", key: "c", altKey: true,
    preventDefault() {}, stopPropagation() {}, ...overrides });
  return { camera, key, state: () => state, video: () => video, videos, frames, seeks, root };
}

for (const playing of [false, true]) {
  test(`camera selection restores match time after metadata with playing=${playing}`, () => {
    const app = setup({ playing });
    expect(app.camera.selectAngle("tactical")).toBe(true);
    expect(app.videos[0].paused).toBe(true);
    app.frames.shift()();
    expect(app.seeks).toEqual([]);
    app.video().readyState = 2;
    app.video().dispatchEvent(new Event("loadedmetadata"));
    expect(app.seeks).toEqual([42000]);
    expect(app.video().paused).toBe(!playing);
    app.camera.dispose();
  });
}

test("camera shortcuts skip unavailable angles, reverse and keep rapid switches on the original match time", () => {
  const app = setup({ playing: true });
  expect(app.key()).toBe(true);
  expect(app.state().mediaProduction.activeAngleId).toBe("tactical");
  app.key();
  expect(app.state().mediaProduction.activeAngleId).toBe("bench");
  app.frames.splice(0).forEach(fn => fn());
  app.video().dispatchEvent(new Event("loadedmetadata"));
  expect(app.seeks).toEqual([42000]);
  expect(app.video().paused).toBe(false);
  app.key({ shiftKey: true });
  expect(app.state().mediaProduction.activeAngleId).toBe("tactical");
  app.camera.dispose();
});

test("camera shortcut ignores editing, modifiers, repeats, other dialogs and portable playback", () => {
  const app = setup();
  for (const override of [{ altKey: false }, { ctrlKey: true }, { metaKey: true }, { isComposing: true },
    { target: { tagName: "INPUT", closest: () => ({}) } }]) expect(app.key(override)).toBe(false);
  expect(app.key({ repeat: true })).toBe(true);
  app.root.ownerDocument.querySelector = () => ({});
  expect(app.key()).toBe(false);
  app.root.ownerDocument.querySelector = () => null;
  app.state().mediaProduction.portable = { playback: { active: true } };
  expect(app.key()).toBe(true);
  expect(app.camera.selectAngle("bench")).toBe(false);
  expect(app.state().mediaProduction.activeAngleId).toBe("primary");
  expect(app.frames).toEqual([]);
});
