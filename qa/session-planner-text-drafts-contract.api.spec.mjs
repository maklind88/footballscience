import { expect, test } from "@playwright/test";
import { createSessionPlannerTextDraftStore } from "../src/modules/session-planner/index.mjs";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("Session Planner text drafts are tab-local, scoped, debounced, and never overwrite a newer saved value", () => {
  const storage = createStorage();
  const timers = [];
  const store = createSessionPlannerTextDraftStore({
    storage,
    getScope: () => "coach-a",
    now: () => 100,
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => {},
  });
  const context = { date: "2026-09-23", blockId: "block-1", field: "objectives" };

  expect(store.record(context, "Build through the thirds", "Build through")).toBe(true);
  expect(storage.getItem(store.storageKey)).toBeNull();
  expect(store.flush()).toBe(true);

  expect(store.restore(context, "Build through")).toEqual({ status: "restore", value: "Build through the thirds" });
  expect(store.restore(context, "A teammate saved something else")).toEqual({
    status: "conflict",
    value: "A teammate saved something else",
  });
  expect(store.restore(context, "Build through the thirds")).toEqual({ status: "saved", value: "Build through the thirds" });
  expect(store.restore(context, "Build through the thirds")).toEqual({ status: "none", value: "Build through the thirds" });
});

test("Session Planner text drafts fail closed when no signed-in scope is available", () => {
  const storage = createStorage();
  const store = createSessionPlannerTextDraftStore({ storage, getScope: () => "" });
  const context = { date: "2026-09-23", blockId: "block-1", field: "objectives" };

  expect(store.record(context, "Draft", "")).toBe(false);
  expect(store.restore(context, "Saved")).toEqual({ status: "none", value: "Saved" });
  expect(storage.getItem(store.storageKey)).toBeNull();
});
