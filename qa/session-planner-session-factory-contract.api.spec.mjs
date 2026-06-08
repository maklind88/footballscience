import { expect, test } from "@playwright/test";
import { createSessionPlannerSessionFactory } from "../src/modules/session-planner/index.mjs";

function createFactory(overrides = {}) {
  return createSessionPlannerSessionFactory({
    createBlock: (block) => ({ ...block, normalized: true }),
    defaultExerciseLibrary: [{ id: "seed-exercise", title: "Seed Exercise", minutes: 18 }],
    formatDateValue: () => "2026-05-01",
    getActiveExerciseLibrary: () => [{ id: "active-exercise", title: "Active Exercise", minutes: 20 }],
    getPeriodizationOverride: (dateValue) => (dateValue === "2026-05-04" ? { daySchedule: "OFF" } : {}),
    getScheduleEventsForDate: (dateValue) =>
      dateValue === "2026-05-05" ? [{ type: "training", title: "Training" }] : [],
    getScheduleMainEvent: (events) => events[0] ?? null,
    getScheduledSessionTitle: () => "Scheduled Training",
    isScheduleSessionEvent: (event) => event?.type === "training",
    ...overrides,
  });
}

test("Session Planner session factory creates default and empty sessions without writes", () => {
  const factory = createFactory();
  const defaultSession = factory.createDefaultSession("2026-05-02");
  const emptySession = factory.createEmptySession("2026-05-03");

  expect(defaultSession.id).toBe("session-2026-05-02");
  expect(defaultSession.selectedBlockId).toBe("block-2");
  expect(defaultSession.blocks.map((block) => block.id)).toEqual(["warm-up", "block-1", "block-2", "game"]);
  expect(defaultSession.blocks[2].title).toBe("Active Exercise");
  expect(defaultSession.blocks.every((block) => block.normalized)).toBe(true);

  expect(emptySession).toEqual({
    id: "session-2026-05-03",
    date: "2026-05-03",
    title: "Scheduled Training",
    theme: "",
    selectedBlockId: "",
    blocks: [],
  });
});

test("Session Planner session factory recognizes generated default sessions only", () => {
  const factory = createFactory();
  const defaultSession = factory.createDefaultSession("2026-05-02");
  const editedSession = {
    ...defaultSession,
    blocks: defaultSession.blocks.map((block) =>
      block.id === "block-1" ? { ...block, title: "Custom Technical Rhythm" } : block
    ),
  };

  expect(factory.isGeneratedDefaultSession(defaultSession)).toBe(true);
  expect(factory.isGeneratedDefaultSession(editedSession)).toBe(false);
  expect(factory.isGeneratedDefaultSession({ title: "Training Session", blocks: [] })).toBe(false);
});

test("Session Planner session factory keeps generated sessions off off-days", () => {
  const factory = createFactory();
  const defaultSession = factory.createDefaultSession("2026-05-06");

  expect(factory.isOffDate("2026-05-04")).toBe(true);
  expect(factory.createSessionForNewPlan("2026-05-04").blocks).toEqual([]);
  expect(factory.createSessionForNewPlan("2026-05-05").blocks).toHaveLength(4);
  expect(factory.shouldStripGeneratedDefaultSession("2026-05-04", defaultSession)).toBe(true);
  expect(factory.shouldStripGeneratedDefaultSession("2026-05-05", defaultSession)).toBe(false);
  expect(factory.shouldClearSessionForDate("2026-05-04", defaultSession)).toBe(true);
});
