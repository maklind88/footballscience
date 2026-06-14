import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAppRuntimeSequenceAdapter } from "../src/modules/game-simulator/app-runtime-sequence-adapter.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator app runtime sequence adapter delegates sequence engine methods", () => {
  const adapter = createGameSimulatorAppRuntimeSequenceAdapter({
    getSequenceEngine: () => ({
      captureSnapshot: (...args) => ["captureSnapshot", ...args],
      readSavedSequenceLibrary: (...args) => ["readSavedSequenceLibrary", ...args],
    }),
    sequenceLibraryStorageKey: "football-simulator-sequence-library-v2",
  });

  expect(adapter.captureSnapshot("frame-1", { includeBall: true })).toEqual([
    "captureSnapshot",
    "frame-1",
    { includeBall: true },
  ]);
  expect(adapter.readSavedSequenceLibrary("from-engine")).toEqual([
    "readSavedSequenceLibrary",
    "from-engine",
  ]);
});

test("game simulator app runtime sequence adapter reports missing engine methods clearly", () => {
  const adapter = createGameSimulatorAppRuntimeSequenceAdapter({
    getSequenceEngine: () => ({}),
    sequenceLibraryStorageKey: "football-simulator-sequence-library-v2",
  });

  expect(() => adapter.captureSnapshot()).toThrow(
    "Game simulator sequence engine is not ready: captureSnapshot",
  );
});

test("game simulator app runtime sequence adapter keeps saved sequence fallback stable", () => {
  const storedEntries = [
    {
      id: "older",
      name: "Older pattern",
      savedAt: "2026-01-10T12:00:00.000Z",
      sequence: { steps: [{}] },
    },
    { id: "missing-steps", name: "Invalid", sequence: {} },
    {
      id: "newer",
      name: "Newer pattern",
      savedAt: "2026-01-11T12:00:00.000Z",
      sequence: { steps: [{}] },
    },
    null,
  ];
  const win = {
    localStorage: {
      getItem: (key) => (key === "library-key" ? JSON.stringify(storedEntries) : null),
    },
  };
  const adapter = createGameSimulatorAppRuntimeSequenceAdapter({
    getSequenceEngine: () => null,
    sequenceLibraryStorageKey: "library-key",
    win,
  });

  expect(adapter.readSavedSequenceLibrary().map((entry) => entry.id)).toEqual(["newer", "older"]);
});

test("game simulator app runtime sequence adapter is wired out of the controller", () => {
  const controller = readProjectFile("src/modules/game-simulator/app-runtime-controller.mjs");
  const adapter = readProjectFile("src/modules/game-simulator/app-runtime-sequence-adapter.mjs");

  expect(controller).toContain('from "./app-runtime-sequence-adapter.mjs"');
  expect(controller).toContain("createGameSimulatorAppRuntimeSequenceAdapter");
  expect(controller).not.toContain("function invokeGameSimulatorSequenceEngine");
  expect(adapter).toContain("createGameSimulatorAppRuntimeSequenceAdapter");
  expect(adapter).toContain("readSavedSequenceLibraryFallback");
  expect(adapter).toContain("Game simulator sequence engine is not ready");
});
