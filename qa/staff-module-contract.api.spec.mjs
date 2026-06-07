import { expect, test } from "@playwright/test";
import { createStaffWorkspaceRenderer } from "../src/modules/staff/index.mjs";

test("Staff workspace renderer owns people list, selected profile, and create-user modal markup", () => {
  const renderer = createStaffWorkspaceRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatUserName: (user) => `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    getRoleLabel: (role) => ({ admin: "Admin", coach: "Coach" })[role] || role,
    getUserClubName: () => "North Carolina Courage",
    getUserScopeLabel: () => "First Team",
    getUserTeamName: () => "First Team",
    renderPasswordRevealInput: (name) => `<span class="password-input-shell"><input name="${name}" /></span>`,
    renderUserAvatar: (user, className) => `<span class="${className}">${user.firstName?.[0] || "U"}</span>`,
  });
  const users = [
    { id: "admin-1", firstName: "Platform", lastName: "Admin", email: "admin@example.com", role: "admin", title: "Owner", department: "Platform", status: "active" },
    { id: "coach-1", firstName: "Mak", lastName: "Lind", email: "mak@example.com", role: "coach", title: "Coach", department: "Football", status: "active" },
  ];
  const markup = renderer.renderWorkspace({
    currentUser: users[0],
    users,
    structure: { clubs: [], teams: [] },
    selectedUser: users[1],
    selectedUserId: "coach-1",
    isAdmin: true,
    createUserEditorOpen: true,
    roleOptions: '<option value="coach">Coach</option>',
    teamOptions: '<option value="team-1">First Team</option>',
    message: "Saved.",
  });

  expect(markup).toContain("staff-shell");
  expect(markup).toContain("People");
  expect(markup).toContain("Mak Lind");
  expect(markup).toContain("data-staff-select-user");
  expect(markup).toContain("data-staff-remove-user");
  expect(markup).toContain("staffUserForm");
  expect(markup).toContain("data-staff-create-user-overlay");
  expect(markup).toContain("Creates a central Supabase account");
});
