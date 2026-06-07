import { expect, test } from "@playwright/test";
import { createSessionPlannerVisualUploadHelpers } from "../src/modules/session-planner/index.mjs";

function createMockFileReader(result = "data:image/png;base64,original") {
  return class MockFileReader {
    constructor() {
      this.result = result;
      this.listeners = new Map();
    }

    addEventListener(eventName, listener) {
      this.listeners.set(eventName, listener);
    }

    readAsDataURL() {
      this.listeners.get("load")?.();
    }
  };
}

function createMockImage({ width = 800, height = 600 } = {}) {
  return class MockImage {
    constructor() {
      this.naturalWidth = width;
      this.naturalHeight = height;
      this.listeners = new Map();
    }

    addEventListener(eventName, listener) {
      this.listeners.set(eventName, listener);
    }

    set src(_value) {
      this.listeners.get("load")?.();
    }
  };
}

function createMockDocument(canvasCalls = []) {
  return {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: (...args) => canvasCalls.push(["fillRect", ...args]),
        drawImage: (...args) => canvasCalls.push(["drawImage", ...args]),
      }),
      toDataURL: (format, quality) => `data:${format};quality=${quality}`,
    }),
  };
}

test("Session Planner visual upload keeps passthrough image types unchanged", async () => {
  const helpers = createSessionPlannerVisualUploadHelpers({
    getFileReader: () => new (createMockFileReader("data:image/gif;base64,original"))(),
    getImage: () => new (createMockImage())(),
    getDocument: () => createMockDocument(),
  });

  await expect(helpers.normalizeVisualUpload({ type: "image/gif", size: 2_000_000 })).resolves.toBe(
    "data:image/gif;base64,original"
  );
});

test("Session Planner visual upload compresses large raster images deterministically", async () => {
  const canvasCalls = [];
  const helpers = createSessionPlannerVisualUploadHelpers({
    getFileReader: () => new (createMockFileReader("data:image/png;base64,original"))(),
    getImage: () => new (createMockImage({ width: 3200, height: 1600 }))(),
    getDocument: () => createMockDocument(canvasCalls),
  });

  const normalized = await helpers.normalizeVisualUpload({ type: "image/png", size: 2_000_000 });

  expect(normalized).toBe("data:image/jpeg;quality=0.84");
  expect(canvasCalls.some(([method]) => method === "drawImage")).toBe(true);
});
