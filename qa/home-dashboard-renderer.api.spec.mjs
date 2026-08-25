import { expect, test } from "@playwright/test";
import { createDashboardHomeCardsRenderer } from "../src/modules/home/dashboard-renderer.mjs";
import { buildPlatformAppearanceConfigFromForm, normalizePlatformAppearanceConfig } from "../src/core/appearance-governance.mjs";

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
    birthdayCalendar: {
      items: [
        {
          id: "p8",
          name: "Ada Midfielder",
          number: "8",
          primaryRole: "8",
          dateLabel: "Jul 24",
          relativeLabel: "In 2 days",
          turningAge: 25,
          nextBirthday: "2026-07-24",
          photoUrl: "https://example.com/ada.jpg",
        },
        {
          id: "p9",
          name: "Bea Defender",
          dateLabel: "Jul 25",
          relativeLabel: "In 3 days",
          turningAge: 26,
          nextBirthday: "2026-07-25",
        },
        {
          id: "p10",
          name: "Clea Striker",
          dateLabel: "Jul 28",
          relativeLabel: "In 6 days",
          turningAge: 22,
          nextBirthday: "2026-07-28",
        },
        {
          id: "p11",
          name: "Daria Winger",
          dateLabel: "Aug 2",
          relativeLabel: "In 11 days",
          turningAge: 24,
          nextBirthday: "2026-08-02",
        },
      ],
      thisMonthCount: 3,
      trackedCount: 4,
      withBirthDateCount: 4,
      missingBirthDateCount: 1,
    },
    todayValue: "2026-01-01",
  };

  const rendered = renderer.render(context, `<option value=\"u1\">Me</option><option value=\"u2\">Coach</option>`);
  expect(rendered).toContain("Top 3");
  expect(rendered).toContain("Coach To-Do");
  expect(rendered).toContain("Player / Team Alerts");
  expect(rendered).toContain("Upcoming birthdays");
  expect(rendered).toContain("Ada Midfielder");
  expect(rendered).toContain("Bea Defender");
  expect(rendered).toContain("Clea Striker");
  expect(rendered).not.toContain("Daria Winger");
  expect(rendered).toContain("3 this month");
  expect(rendered).toContain("data-dashboard-open-birthday-calendar");
  expect(rendered).toContain("dashboard-birthday-spotlight");
  expect(rendered).toContain("Jul 24 · In 2 days");
  expect(rendered).toContain("<span>years</span>");
  expect(rendered).toContain("26 years");
  expect(rendered).toContain("(In 3 days)");
  expect(rendered).not.toContain("dashboard-birthday-countdown");
  expect(rendered).toMatch(/data-dashboard-presentation-type="team"[\s\S]*dashboard-birthday-strip[\s\S]*data-dashboard-presentation-type="technical"/);
  expect(rendered).toMatch(/data-dashboard-presentation-type="technical"[\s\S]*dashboard-upcoming-lineup-card/);
  expect(rendered).toContain('aria-label="Upcoming match selection"');
  expect(rendered).not.toContain("dashboard-lineup-pitch");
  expect(rendered).toMatch(/dashboard-birthday-strip[\s\S]*dashboardSchedulePreview/);

  const ranked = renderer.getDashboardTopPriorityTasks(context, 3);
  expect(ranked).toHaveLength(3);
  expect(ranked[0].id).toBe("1");
  expect(ranked.map((task) => task.id)).toContain("1");
  expect(ranked.map((task) => task.id)).toContain("4");
  expect(ranked.map((task) => task.id)).toContain("2");
});

test("home dashboard renderer owns the compact birthday news card", () => {
  const renderer = createDashboardHomeCardsRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderTaskList: () => "<div></div>",
    resolveUserLabel: renderTestUserLabel,
  });

  const rendered = renderer.renderBirthdayNewsCard({
    birthdayCalendar: {
      items: [
        {
          id: "p8",
          name: "Ada Midfielder",
          number: "88",
          primaryRole: "Central midfield",
          dateLabel: "Jul 24",
          relativeLabel: "Tomorrow",
          turningAge: 25,
          nextBirthday: "2026-07-24",
          photoUrl: "https://example.com/ada.jpg",
        },
        {
          id: "p9",
          name: "Bea Defender",
          number: "4",
          primaryRole: "Centre back",
          dateLabel: "Jul 25",
          relativeLabel: "In 2 days",
          turningAge: 26,
          nextBirthday: "2026-07-25",
        },
        {
          id: "p10",
          name: "Clea Striker",
          number: "9",
          primaryRole: "Forward",
          dateLabel: "Jul 28",
          relativeLabel: "In 5 days",
          turningAge: 22,
          nextBirthday: "2026-07-28",
        },
        {
          id: "p11",
          name: "Daria Winger",
          number: "11",
          primaryRole: "Winger",
          dateLabel: "Aug 2",
          relativeLabel: "In 10 days",
          turningAge: 24,
          nextBirthday: "2026-08-02",
        },
      ],
      thisMonthCount: 0,
      trackedCount: 4,
      withBirthDateCount: 4,
      missingBirthDateCount: 1,
    },
  });

  expect(rendered).toContain("Birthday Calendar");
  expect(rendered).toContain("Upcoming birthdays");
  expect(rendered).not.toContain("0 this month");
  expect(rendered).not.toContain("dashboard-panel-count");
  expect(rendered).toContain("Ada Midfielder");
  expect(rendered).toContain("Bea Defender");
  expect(rendered).toContain("Clea Striker");
  expect(rendered).not.toContain("Daria Winger");
  expect(rendered.match(/dashboard-birthday-item/g) || []).toHaveLength(2);
  expect(rendered).toContain("dashboard-birthday-spotlight");
  expect(rendered).toContain("dashboard-birthday-cake");
  expect(rendered).toContain('src="https://example.com/ada.jpg"');
  expect(rendered).toContain("Jul 24 · Tomorrow");
  expect(rendered).not.toContain('data-dashboard-birthday-countdown');
  expect(rendered).not.toContain('data-dashboard-birthday-unit="seconds"');
  expect(rendered).not.toContain("#88");
  expect(rendered).not.toContain("Central midfield");
  expect(rendered).toContain(">25</strong>");
  expect(rendered).toContain("<span>years</span>");
  expect(rendered).toContain("26 years");
  expect(rendered).toContain("(In 2 days)");
  expect(rendered).toContain("22 years");
  expect(rendered).toContain("(In 5 days)");
  expect(rendered).not.toContain("1 missing dates");
  expect(rendered).not.toContain("Squad profiles");
  expect(rendered).not.toContain('data-open-workspace="player-profiles"');
  expect(rendered).toContain("data-dashboard-open-birthday-calendar");
});

test("home dashboard renderer owns the birthday calendar modal", () => {
  const renderer = createDashboardHomeCardsRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderTaskList: () => "<div></div>",
    resolveUserLabel: renderTestUserLabel,
  });

  const rendered = renderer.renderBirthdayCalendarModal({
    birthdayCalendar: {
      items: [
        {
          id: "p8",
          name: "Ada Midfielder",
          number: "88",
          primaryRole: "Central midfield",
          dateLabel: "Jul 24",
          relativeLabel: "Tomorrow",
          turningAge: 25,
          nextBirthday: "2026-07-24",
          photoUrl: "https://example.com/ada.jpg",
        },
        {
          id: "p9",
          name: "Bea Defender",
          number: "4",
          primaryRole: "Centre back",
          dateLabel: "Jul 25",
          relativeLabel: "In 2 days",
          turningAge: 26,
          nextBirthday: "2026-07-25",
        },
        {
          id: "p10",
          name: "Clea Striker",
          number: "9",
          primaryRole: "Forward",
          dateLabel: "Jul 28",
          relativeLabel: "In 5 days",
          turningAge: 22,
          nextBirthday: "2026-07-28",
        },
        {
          id: "p11",
          name: "Daria Winger",
          number: "11",
          primaryRole: "Winger",
          dateLabel: "Aug 2",
          relativeLabel: "In 10 days",
          turningAge: 24,
          nextBirthday: "2026-08-02",
        },
      ],
    },
  });

  expect(rendered).toContain('data-dashboard-birthday-modal');
  expect(rendered).toContain('aria-labelledby="dashboardBirthdayCalendarTitle"');
  expect(rendered).toContain("4 upcoming birthdays");
  expect(rendered).toContain("Ada Midfielder");
  expect(rendered).toContain("Bea Defender");
  expect(rendered).toContain("Clea Striker");
  expect(rendered).toContain("Daria Winger");
  expect(rendered).toContain("#11 · Winger");
  expect(rendered).toContain("24 years");
  expect(rendered).toContain("(In 10 days)");
  expect(rendered).toContain("data-dashboard-modal-close");
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

test("home dashboard renderer avoids an empty work queue wrapper for presentation-only home", () => {
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
        sections: {
          topTasks: { enabled: false },
          todo: { enabled: false },
          alerts: { enabled: false },
        },
      },
    },
  });

  const rendered = renderer.render(context, "", appearance);

  expect(rendered).toContain('class="dashboard-presentation-band"');
  expect(rendered).toContain('data-dashboard-presentation-type="team"');
  expect(rendered).toContain('data-dashboard-presentation-type="technical"');
  expect(rendered).toContain('id="dashboardSchedulePreview"');
  expect(rendered).toMatch(/dashboard-presentation-band[\s\S]*dashboardSchedulePreview/);
  expect(rendered).toContain("Team Meeting");
  expect(rendered).toContain("Technical Staff Meeting");
  expect(rendered).toContain("Team Selection");
  expect(rendered).toContain("Starting XI");
  expect(rendered).toContain('class="dashboard-panel dashboard-upcoming-lineup-card"');
  expect(rendered).not.toContain("data-dashboard-presentation-date");
  expect(rendered).not.toContain('aria-label="Work queue and alerts"');
});

test("appearance governance builds Home config from form data outside app-runtime", () => {
  const formData = new FormData();
  formData.set("home.density", "compact");
  formData.set("home.theme", "dark");
  formData.set("componentType.home.task-panel.density", "airy");
  formData.set("componentType.home.task-panel.tone", "contrast");
  formData.set("section.todo.enabled", "on");
  formData.set("section.todo.order", "7");
  formData.set("section.todo.eyebrow", "Work");
  formData.set("section.todo.title", "Tasks");
  formData.set("section.alerts.order", "3");
  formData.set("section.alerts.eyebrow", "Unsafe <script>");
  formData.set("section.alerts.title", "Signals");

  const config = buildPlatformAppearanceConfigFromForm(formData, normalizePlatformAppearanceConfig());

  expect(config.modules.home.density).toBe("compact");
  expect(config.modules.home.theme).toBe("dark");
  expect(config.modules.home.componentTypes["home.task-panel"]).toMatchObject({
    density: "airy",
    tone: "contrast",
  });
  expect(config.modules.home.sections.todo).toMatchObject({
    enabled: true,
    order: 7,
    eyebrow: "Work",
    title: "Tasks",
  });
  expect(config.modules.home.sections.alerts.eyebrow).toBe("Player / Team Alerts");
});

test("home dashboard renderer owns tutorial modal markup without popup storage rules", () => {
  const renderer = createDashboardHomeCardsRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderTaskList: () => "<div></div>",
    resolveUserLabel: renderTestUserLabel,
  });

  const rendered = renderer.renderTutorialModal({ shouldShowNext: true });

  expect(rendered).toContain('aria-labelledby="dashboardTutorialTitle"');
  expect(rendered).toContain("Football Science Coaching Platform");
  expect(rendered).toContain('id="dashboardTutorialShowNext" type="checkbox" checked');
  expect(rendered).toContain("data-dashboard-tutorial-never");
});
