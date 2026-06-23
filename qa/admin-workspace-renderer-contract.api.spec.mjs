import { expect, test } from "@playwright/test";
import { createAdminWorkspaceRenderer } from "../src/modules/admin/index.mjs";

const renderer = createAdminWorkspaceRenderer({
  escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  formatAdminDateTime: (value) => `date:${value}`,
  formatUserName: (user) => `${user.firstName} ${user.lastName}`.trim(),
  getRoleLabel: (role) => ({ admin: "Admin", coach: "Coach", scout: "Scout" })[role] || role,
  renderAdminAccountSummary: () => '<section data-account-summary></section>',
  renderAdminAuditLog: () => '<article data-audit-row></article>',
  renderAdminGroupedUsers: () => '<article data-user-row></article>',
  renderAdminRoleAccessForm: () => '<section data-role-access></section>',
  renderAdminRoleOptions: (_currentUser, selectedRole) => `<option value="${selectedRole}" selected>${selectedRole}</option>`,
  renderAdminStructurePanel: () => '<section data-structure></section>',
  renderAdminTeamOptions: () => '<option value="team-1" selected>Team 1</option>',
  renderAdminTransferRoomAccessPanel: () => '<section data-transfer-access></section>',
  renderPasswordRevealInput: (name, _placeholder, _autocomplete, value = "") => `<input name="${name}" value="${value}" />`,
  renderPlatformAppearanceGovernancePanel: () => '<section data-appearance></section>',
  renderPlatformReadinessDashboard: () => '<section data-readiness></section>',
  titleSuggestions: ["Sporting Director"],
  departmentSuggestions: ["Performance"],
});

test("Admin workspace renderer owns non-admin shell", () => {
  const markup = renderer.renderNotAdmin();
  expect(markup).toContain("Admin only");
  expect(markup).toContain("admin-shell");
});

test("Admin workspace renderer owns admin layout, modals, and platform admin panels", () => {
  const currentUser = { id: "admin-1", firstName: "Mak", lastName: "Lind", role: "admin" };
  const selectedUser = { id: "coach-1", firstName: "Scout", lastName: "One", email: "scout@example.com", username: "scout", role: "scout", status: "active" };
  const markup = renderer.renderWorkspace({
    adminAuditLoadedAt: "2026-06-06T12:00:00Z",
    adminCreateUserEditorOpen: true,
    adminUserEditorOpen: true,
    canManageSelectedUser: true,
    canRemoveSelectedUser: true,
    createRole: "scout",
    createUserDraft: {
      firstName: "Jess",
      lastName: "Silva",
      email: "jess@example.com",
      username: "jess.silva",
      role: "scout",
      status: "active",
      title: "Assistant Coach",
      department: "Football",
      password: "secret123",
      passwordConfirm: "secret123",
      teamId: "team-1",
    },
    createUserClub: { name: "NCC" },
    createUserTeam: { name: "First Team" },
    createUserTeamId: "team-1",
    currentUser,
    currentUserIsPlatformAdmin: true,
    message: "Saved",
    roles: [{ key: "admin" }],
    selectedUser,
    selectedUserFieldDisabled: "",
    selectedUserIsSelf: false,
    selectedUserTeamId: "team-1",
    structure: { teams: [{ id: "team-1" }] },
    users: [currentUser, selectedUser],
  });

  expect(markup).toContain("Access & Users");
  expect(markup).toContain("Saved");
  expect(markup).toContain("data-structure");
  expect(markup).toContain("data-readiness");
  expect(markup).toContain("data-appearance");
  expect(markup).toContain("adminUserForm");
  expect(markup).toContain("adminCreateUserForm");
  expect(markup).toContain('value="Jess"');
  expect(markup).toContain('value="jess@example.com"');
  expect(markup).toContain('value="secret123"');
  expect(markup).toContain("data-transfer-access");
  expect(markup).toContain("data-role-access");
  expect(markup).toContain("Recent Admin Activity");
  expect(markup).toContain("Sporting Director");
});
