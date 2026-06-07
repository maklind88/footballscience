import { expect, test } from "@playwright/test";
import {
  createDashboardRuntimeController,
  dashboardNewsSeenStorageKey,
  dashboardTaskStorageKey,
  dashboardTutorialPrefsStorageKey,
} from "../src/modules/home/index.mjs";

function createStorageHarness() {
  const storage = new Map();
  return {
    storage,
    readJson: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
    writeJson: (key, value) => storage.set(key, value),
  };
}

function createRuntime(overrides = {}) {
  const harness = createStorageHarness();
  const dashboardGrid = { innerHTML: "" };
  const calls = {
    renderProfileWorkspace: [],
    syncChatNotificationCursor: 0,
  };
  const controller = createDashboardRuntimeController({
    win: { setTimeout: (callback) => callback(), confirm: () => true },
    getUi: () => ({ dashboardGrid }),
    homeContextSelectors: {
      getSessionPlannerState: () => ({ sessions: {} }),
      getSessionTotalMinutes: (session) =>
        (session?.blocks || []).reduce((total, block) => total + Number(block.minutes || 0), 0),
      getTodayValue: () => "2026-06-07",
      getHomeContext: (currentUser, users, tasks) => ({ currentUser, users, tasks }),
    },
    homeCardsRenderer: {
      render: (context, staffOptions, appearance) =>
        `<section data-task-count="${context.tasks.length}" data-theme="${appearance.theme || ""}">${staffOptions}</section>`,
      renderTutorialModal: ({ shouldShowNext }) => `<div data-tutorial="${shouldShowNext ? "next" : "once"}"></div>`,
    },
    readJson: harness.readJson,
    writeJson: harness.writeJson,
    createId: (prefix) => `${prefix}-stable`,
    getCurrentUser: () => ({ id: "coach-1" }),
    getUsers: () => [
      { id: "coach-1", status: "active", name: "Coach One" },
      { id: "coach-2", status: "inactive", name: "Coach Two" },
      { id: "coach-3", status: "active", name: "Coach Three" },
    ],
    getActiveWorkspaceId: () => "my-profile",
    formatUserName: (user) => user.name,
    escapeHtml: (value) => String(value ?? "").replaceAll('"', "&quot;"),
    appearanceStorageKey: "appearance",
    readAppearanceRaw: (key) => harness.storage.get(key) || {},
    writeAppearanceRaw: (key, value) => harness.storage.set(key, value),
    normalizeAppearanceConfig: (value) => (typeof value === "string" ? JSON.parse(value) : value || {}),
    normalizeAppearanceValue: (config, meta) => JSON.stringify({ ...config, meta }),
    renderProfileWorkspace: (message) => calls.renderProfileWorkspace.push(message),
    syncChatNotificationCursor: () => {
      calls.syncChatNotificationCursor += 1;
    },
    ...overrides,
  });
  return { calls, controller, dashboardGrid, storage: harness.storage };
}

test("Home dashboard runtime preserves legacy task create/update/remove behavior", () => {
  const { controller, storage } = createRuntime();

  const created = controller.createTask({ title: "  Prep meeting  ", assignedTo: "coach-3", scope: "team" });
  expect(created).toMatchObject({
    id: "task-stable",
    title: "Prep meeting",
    assignedTo: "coach-3",
    createdBy: "coach-1",
    scope: "team",
    status: "open",
  });
  expect(storage.get(dashboardTaskStorageKey)).toHaveLength(1);

  controller.updateTask("task-stable", { status: "done" });
  expect(controller.readTasks()[0]).toMatchObject({ id: "task-stable", status: "done" });
  expect(controller.readTasks()[0].completedAt).toBeTruthy();

  controller.removeTask("task-stable");
  expect(controller.readTasks()).toEqual([]);
});

test("Home dashboard runtime renders Home from active users, tasks, and appearance state", () => {
  const { calls, controller, dashboardGrid, storage } = createRuntime();
  storage.set("appearance", JSON.stringify({ theme: "dark" }));

  controller.createTask({ title: "Personal note", scope: "personal" });
  controller.renderCards();

  expect(dashboardGrid.innerHTML).toContain('data-task-count="1"');
  expect(dashboardGrid.innerHTML).toContain('data-theme="dark"');
  expect(dashboardGrid.innerHTML).toContain('value="coach-1" selected');
  expect(dashboardGrid.innerHTML).not.toContain("coach-2");
  expect(calls.syncChatNotificationCursor).toBe(1);

  controller.refreshSurfaces("Saved.");
  expect(calls.renderProfileWorkspace).toEqual(["Saved."]);
});

test("Home dashboard runtime keeps tutorial/news and appearance storage scoped to Home keys", () => {
  const { controller, storage } = createRuntime();

  controller.saveTutorialPreference("coach-1", true);
  expect(storage.get(dashboardTutorialPrefsStorageKey)["coach-1"]).toMatchObject({ showOnLogin: true });

  controller.markNewsSeen("coach-1");
  expect(storage.get(dashboardNewsSeenStorageKey)["coach-1"]).toBe("home-dashboard-personal-todo-v2");

  const appearance = controller.writeAppearanceState({ theme: "auto" });
  expect(appearance).toMatchObject({ theme: "auto", meta: { updatedBy: "coach-1" } });
});
