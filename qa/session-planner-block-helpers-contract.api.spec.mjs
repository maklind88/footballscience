import { expect, test } from "@playwright/test";
import { createSessionPlannerBlockHelpers } from "../src/modules/session-planner/index.mjs";

const blockMergeFields = Object.freeze([
  "title",
  "focus",
  "phase",
  "subPhase",
  "minutes",
  "time",
  "intensity",
  "pitchSize",
  "material",
  "objective",
  "why",
  "organization",
  "principles",
  "postSessionNotes",
]);

function createHelpers(overrides = {}) {
  return createSessionPlannerBlockHelpers({
    blockFieldUpdatedAtKey: "fieldUpdatedAt",
    blockMergeFields,
    blockMergeFieldSet: new Set(blockMergeFields),
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    cloneTacticalElement: (element) => ({ ...element, cloned: true }),
    createStableId: (prefix) => `${prefix}-stable`,
    formatMultiValue: (value) => (Array.isArray(value) ? value.join(", ") : String(value || "")),
    getCurrentUserId: () => "user-1",
    normalizePlayerBoardColors: (source = {}) => ({ ...source }),
    normalizePlayerBoardCustomPeople: (source = []) => [...source],
    normalizePlayerBoardPositions: (source = {}) => ({ ...source }),
    normalizeTacticalActiveFrameId: (activeFrameId = "", frames = []) =>
      frames.some((frame) => frame.id === activeFrameId) ? activeFrameId : frames[0]?.id || "",
    normalizeTacticalFrames: (frames = []) => frames.map((frame) => ({ ...frame })),
    normalizeTacticalPitchMode: (mode) => (mode === "attacking-half" ? mode : "full"),
    ...overrides,
  });
}

test("Session Planner block helpers normalize timestamps and review notes", () => {
  const helpers = createHelpers();
  const notes = helpers.normalizeReviewNotes(
    [
      {
        id: "note-1",
        notes: "Later",
        updatedAt: "2099-05-02T10:00:00.000Z",
        sessionDate: "2099-05-02",
        blockId: "b-1",
        createdBy: "coach-1",
      },
      {
        id: "note-1",
        text: "Earlier",
        updatedAt: "2099-05-01T10:00:00.000Z",
      },
      { notes: "" },
    ],
    "Legacy"
  );

  expect(helpers.normalizeTimestamp("bad-date")).toBe("");
  expect(helpers.parseTimestampMs("2099-05-02T10:00:00.000Z")).toBeGreaterThan(0);
  expect(helpers.getLibraryUserId()).toBe("user-1");
  expect(notes.map((note) => note.notes)).toEqual(["Later", "Earlier", "Legacy"]);
  expect(notes[1].id).toBe("note-1-2");
  expect(helpers.createReviewNoteId("2026-05-02", "block-7")).toBe("review-2026-05-02-block-7");
});

test("Session Planner block helpers create stable field metadata", () => {
  const helpers = createHelpers();
  const meta = helpers.normalizeBlockFieldMeta({
    title: "2026-05-01T08:00:00.000Z",
    ignored: "2026-05-01T08:00:00.000Z",
    focus: "bad-date",
  });

  expect(meta).toEqual({ title: "2026-05-01T08:00:00.000Z" });
  expect(helpers.createInitialBlockFieldMeta({ id: "existing" })).toEqual({});

  const initial = helpers.createInitialBlockFieldMeta({}, "2026-05-02T09:00:00.000Z");
  expect(Object.keys(initial)).toEqual(blockMergeFields);
  expect(initial.title).toBe("2026-05-02T09:00:00.000Z");
});

test("Session Planner block helpers create normalized session blocks without writes", () => {
  const helpers = createHelpers();
  const block = helpers.createBlock({
    title: "New Exercise",
    phase: ["In Possession", "Transition"],
    subPhase: "Build Up",
    minutes: "18",
    intensity: 99,
    tacticalPitchMode: "attacking-half",
    tacticalFrames: [{ id: "frame-1", label: "Frame 1" }],
    tacticalActiveFrameId: "missing",
    tacticalElements: [{ id: "el-1", x: 10, y: 20 }],
    playerBoardPositions: { p1: { x: 22, y: 33 } },
    playerBoardColors: { p1: "#1d8bff" },
    playerBoardCustomPeople: [{ id: "guest-1" }],
  });

  expect(block.id).toBe("session-block-stable");
  expect(block.phase).toBe("In Possession, Transition");
  expect(block.minutes).toBe(18);
  expect(block.intensity).toBe(5);
  expect(block.diagram).toBe("empty");
  expect(block.tacticalPitchMode).toBe("attacking-half");
  expect(block.tacticalActiveFrameId).toBe("frame-1");
  expect(block.tacticalElements).toEqual([{ id: "el-1", x: 10, y: 20, cloned: true }]);
  expect(block.playerBoardPositions).toEqual({ p1: { x: 22, y: 33 } });
  expect(block.playerBoardColors).toEqual({ p1: "#1d8bff" });
  expect(block.playerBoardCustomPeople).toEqual([{ id: "guest-1" }]);
});
