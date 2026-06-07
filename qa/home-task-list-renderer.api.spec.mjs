import { expect, test } from "@playwright/test";
import { createDashboardTaskListRenderer } from "../src/modules/home/task-list-renderer.mjs";

const users = [
  { id: "u1", label: "Mak" },
  { id: "u2", label: "Coach" },
  { id: "admin", label: "Admin" },
];

function createRenderer() {
  return createDashboardTaskListRenderer({
    escapeHtml: (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    formatDateTime: (value) => `date:${value}`,
    resolveUserLabel: (userId, sourceUsers) => sourceUsers.find((user) => user.id === userId)?.label || "Unknown",
    canRemoveTask: (task, currentUser) =>
      currentUser?.id === task.createdBy ||
      currentUser?.id === task.assignedTo ||
      currentUser?.role === "admin",
  });
}

test("Home task list renderer keeps task metadata and remove controls stable", () => {
  const renderer = createRenderer();
  const markup = renderer.renderTaskRow(
    {
      id: "task-1",
      title: "<Review>",
      note: "Check & confirm",
      createdBy: "u2",
      assignedTo: "u1",
      scope: "team",
      status: "open",
      createdAt: "2026-05-31T11:14:00.000Z",
    },
    users,
    { id: "u1", role: "coach" },
    { showCreator: true }
  );

  expect(markup).toContain("&lt;Review&gt;");
  expect(markup).toContain("Check &amp; confirm");
  expect(markup).toContain("From Coach");
  expect(markup).toContain("date:2026-05-31T11:14:00.000Z");
  expect(markup).toContain('data-dashboard-toggle-task="task-1"');
  expect(markup).toContain('data-dashboard-remove-task="task-1"');
});

test("Home task list renderer limits visible tasks and renders empty state", () => {
  const renderer = createRenderer();
  const tasks = [
    { id: "1", title: "One", createdBy: "u1", assignedTo: "u2", scope: "team", status: "open" },
    { id: "2", title: "Two", createdBy: "u1", assignedTo: "u2", scope: "personal", status: "done" },
  ];

  const limited = renderer.renderTaskList(tasks, users, { id: "u3", role: "coach" }, { showAssignee: true, limit: 1 });
  expect(limited).toContain("To Coach");
  expect(limited).toContain("One");
  expect(limited).not.toContain("Two");
  expect(limited).not.toContain("data-dashboard-remove-task");

  const empty = renderer.renderTaskList([], users, { id: "u1", role: "coach" });
  expect(empty).toContain("dashboard-empty-space");
});
