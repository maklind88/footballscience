import { expect, test } from "@playwright/test";
import { createProfileWorkspaceRenderer } from "../src/modules/profile/index.mjs";

test("Profile workspace renderer owns profile form and personal To-Do markup", () => {
  const renderer = createProfileWorkspaceRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatUserName: (user) => `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    getRoleLabel: (role) => ({ admin: "Admin", coach: "Coach" })[role] || role,
    renderTaskList: (tasks) => `<div class="task-list">${tasks.map((task) => `<span>${task.title}</span>`).join("")}</div>`,
    renderUserAvatar: (user, className) => `<span class="${className}">${user.firstName?.[0] || "U"}</span>`,
  });

  const markup = renderer.renderWorkspace({
    user: {
      id: "user-1",
      firstName: "Mak",
      lastName: "Lind",
      email: "mak@example.com",
      username: "maklind88",
      role: "coach",
      title: "Coach",
      department: "Football",
      team: "North Carolina Courage",
    },
    users: [],
    openPersonalTasks: [{ id: "task-1", title: "Review session" }],
    completedPersonalTasks: [{ id: "task-2", title: "Done task" }],
    hasProfilePhoto: true,
    message: "Saved.",
  });

  expect(markup).toContain("profile-shell");
  expect(markup).toContain('id="profileForm"');
  expect(markup).toContain('id="profileImageUpload"');
  expect(markup).toContain("Custom photo");
  expect(markup).toContain("data-profile-remove-photo");
  expect(markup).toContain('id="profileTodoForm"');
  expect(markup).toContain("1 open");
  expect(markup).toContain("Review session");
  expect(markup).toContain("Done task");
});
