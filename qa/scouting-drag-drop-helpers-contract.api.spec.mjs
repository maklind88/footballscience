import { expect, test } from "@playwright/test";
import {
  clearScoutingMyTeamDropPreview,
  getScoutingDragPayload,
  updateScoutingMyTeamDropPreview,
} from "../src/modules/scouting/index.mjs";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    has(token) {
      return values.has(token);
    },
  };
}

function createNode(dataset = {}, initialClasses = []) {
  return {
    dataset,
    classList: createClassList(initialClasses),
  };
}

function createTarget(matches = {}) {
  return {
    closest(selector) {
      return Object.prototype.hasOwnProperty.call(matches, selector) ? matches[selector] : null;
    },
  };
}

function createRoot(nodes = []) {
  return {
    contains(node) {
      return nodes.includes(node);
    },
    querySelectorAll() {
      return nodes;
    },
  };
}

test("Scouting drag helpers prefer live drag state and parse dataTransfer fallback", () => {
  const current = { type: "my-team", playerId: "player-1" };
  expect(getScoutingDragPayload({}, current)).toBe(current);

  const event = {
    dataTransfer: {
      getData: () => JSON.stringify({ type: "favorite", recordId: "record-1" }),
    },
  };
  expect(getScoutingDragPayload(event)).toEqual({ type: "favorite", recordId: "record-1" });

  expect(getScoutingDragPayload({ dataTransfer: { getData: () => "not-json" } })).toBeNull();
  expect(getScoutingDragPayload({ dataTransfer: { getData: () => "[]" } })).toBeNull();
});

test("Scouting drag helpers clear My Team drop preview classes", () => {
  const slot = createNode({}, ["is-drag-over"]);
  const entry = createNode({}, ["is-drop-before"]);
  const bench = createNode({}, ["is-drag-over"]);
  const root = createRoot([slot, entry, bench]);

  expect(clearScoutingMyTeamDropPreview(root)).toBe(true);
  expect(slot.classList.has("is-drag-over")).toBe(false);
  expect(entry.classList.has("is-drop-before")).toBe(false);
  expect(bench.classList.has("is-drag-over")).toBe(false);
});

test("Scouting drag helpers update slot and before-entry preview state", () => {
  const slot = createNode({ scoutingMyTeamDropSlot: "cf" });
  const beforeEntry = createNode({ scoutingMyTeamDropBefore: "player-2" });
  const bench = createNode({ scoutingMyTeamBenchDrop: "" }, ["is-drag-over"]);
  const root = createRoot([slot, beforeEntry, bench]);
  const event = {
    target: createTarget({
      "[data-scouting-my-team-drop-before]": beforeEntry,
      ".scouting-my-team-slot[data-scouting-my-team-drop-slot]": slot,
      "[data-scouting-my-team-bench-drop]": bench,
    }),
  };

  const result = updateScoutingMyTeamDropPreview({
    event,
    root,
    dragPayload: { playerId: "player-1" },
    currentPreviewKey: "",
  });

  expect(result).toMatchObject({ changed: true, previewKey: "player-1|cf|player-2|", beforeId: "player-2", slotId: "cf" });
  expect(slot.classList.has("is-drag-over")).toBe(true);
  expect(beforeEntry.classList.has("is-drop-before")).toBe(true);
  expect(bench.classList.has("is-drag-over")).toBe(false);

  const unchanged = updateScoutingMyTeamDropPreview({
    event,
    root,
    dragPayload: { playerId: "player-1" },
    currentPreviewKey: result.previewKey,
  });
  expect(unchanged).toMatchObject({ changed: false, previewKey: result.previewKey });
});

test("Scouting drag helpers mark bench preview only when no slot is targeted", () => {
  const bench = createNode({ scoutingMyTeamBenchDrop: "" });
  const root = createRoot([bench]);
  const event = {
    target: createTarget({ "[data-scouting-my-team-bench-drop]": bench }),
  };

  const result = updateScoutingMyTeamDropPreview({
    event,
    root,
    dragPayload: { playerId: "player-9" },
    currentPreviewKey: "",
  });

  expect(result).toMatchObject({ changed: true, previewKey: "player-9|||bench", benchId: "bench" });
  expect(bench.classList.has("is-drag-over")).toBe(true);
});
