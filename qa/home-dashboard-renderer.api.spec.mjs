import { expect, test } from "@playwright/test";
import { createDashboardHomeCardsRenderer } from "../src/modules/home/dashboard-renderer.mjs";
import { normalizePlatformAppearanceConfig } from "../src/core/appearance-governance.mjs";

function normalizeUserId(userId) {
  return String(userId ?? "").trim();
}

function renderTestUserLabel(userId) {
  return `User-${normalizeUserId(userId)}`;
}

test("home dashboard renderer emits top-level cards and keeps task ranking semantics", () => {
  const renderer = createDashboardHomeCardsRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderTaskList: (tasks, _users, _currentUser, options = {}) => {
      const visibleTasks = Number.isFinite(Number(options.limit)) ? tasks.slice(0, Number(options.limit)) : tasks;
      return `<div data-task-list-length=\"${visibleTasks.length}\"></div>`;
    },
    resolveUserLabel: renderTestUserLabel,
  });

  const context = {
    currentUser: { id: "u1" },
    users: [{ id: "u1" }, { id: "u2" }, { id: "u3" }],
    myOpenTasks: [
      { id: "1", title: "Owner task", assignedTo: "u1", createdBy: "u1", scope: "team", status: "open", createdAt: "2026-01-01T10:00:00.000Z" },
      { id: "3", title: "Old team task", assignedTo: "u2", createdBy: "u1", scope: "team", status: "open", createdAt: "2026-01-01T09:00:00.000Z" },
    ],
    personalOpenTasks: [{ id: "2", title: "My note", assignedTo: "u1", createdBy: "u1", scope: "personal", status: "open", createdAt: "2026-01-01T11:00:00.000Z" }],
    delegatedOpenTasks: [{ id: "4", title: "Delegated", assignedTo: "u3", createdBy: "u1", scope: "team", status: "open", createdAt: "2026-01-01T12:00:00.000Z" }],
    alerts: [
      { title: "Medical", detail: "Vitals check", tone: "info", focus: "task" },
    ],
    todayValue: "2026-01-01",
  };

  const rendered = renderer.render(context, `<option value=\"u1\">Me</option><option value=\"u2\">Coach</option>`);
  expect(rendered).toContain("Top 3");
  expect(rendered).toContain("Coach To-Do");
  expect(rendered).toContain("Player / Team Alerts");

  const ranked = renderer.getDashboardTopPriorityTasks(context, 3);
  expect(ranked).toHaveLength(3);
  expect(ranked[0].id).toBe("1");
  expect(ranked.map((task) => task.id)).toContain("1");
  expect(ranked.map((task) => task.id)).toContain("4");
  expect(ranked.map((task) => task.id)).toContain("2");
});

test("home dashboard renderer applies safe same-type appearance rules", () => {
  const renderer = createDashboardHomeCardsRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderTaskList: () => "<div></div>",
    resolveUserLabel: renderTestUserLabel,
  });
  const context = {
    currentUser: { id: "u1" },
    users: [{ id: "u1" }],
    myOpenTasks: [],
    personalOpenTasks: [],
    delegatedOpenTasks: [],
    alerts: [],
    todayValue: "2026-01-01",
  };
  const appearance = normalizePlatformAppearanceConfig({
    modules: {
      home: {
        density: "compact",
        componentTypes: {
          "home.task-panel": { density: "airy", tone: "contrast" },
          "home.alert-panel": { density: "compact", tone: "pitch" },
        },
        sections: {
          topTasks: { enabled: false },
          todo: { order: 20, title: "Tasks", eyebrow: "Work" },
          alerts: { order: 10, title: "Signals", eyebrow: "Team" },
        },
      },
    },
  });

  const rendered = renderer.render(context, "", appearance);
  expect(rendered).not.toContain("Priority Tasks");
  expect(rendered.indexOf("Signals")).toBeLessThan(rendered.indexOf("Tasks"));
  expect(rendered).toContain("dashboard-appearance-density-airy");
  expect(rendered).toContain("dashboard-appearance-tone-contrast");
  expect(rendered).toContain('data-dashboard-appearance-type="home.task-panel"');
});
