import { expect, test } from "@playwright/test";
import {
  adminDepartmentSuggestions,
  adminTitleSuggestions,
  createAdminUserRenderer,
  formatAdminDateTime,
  formatAuditActionLabel,
  formatAuditActor,
  formatAuditTarget,
  getAdminActiveUserCount,
  getAdminUserInitials,
} from "../src/modules/admin/index.mjs";

test("Admin display helpers own stable labels, suggestions, and initials", () => {
  expect(adminTitleSuggestions).toContain("Sporting Director");
  expect(adminDepartmentSuggestions).toContain("Performance");
  expect(formatAdminDateTime("")).toBe("Never");
  expect(formatAdminDateTime("not-a-date")).toBe("Never");
  expect(formatAdminDateTime("2026-05-31T11:14:00Z")).toMatch(/31 May/);
  expect(formatAuditActor({ actor: { name: "Mak Lind" } })).toBe("Mak Lind");
  expect(formatAuditActor({ actor: { email: "coach@example.com" } })).toBe("coach@example.com");
  expect(formatAuditActor({})).toBe("System");
  expect(formatAuditTarget({ target: { name: "Scout" } })).toBe("Scout");
  expect(formatAuditActionLabel("user.created")).toBe("User created");
  expect(formatAuditActionLabel("custom.action")).toBe("custom.action");
  expect(
    getAdminUserInitials(
      { firstName: "Mak", lastName: "Lind" },
      {
        formatUserName: () => "Mak Lind",
        normalizeText: (value, fallback = "") => String(value || fallback).trim(),
      }
    )
  ).toBe("ML");
});

test("Admin user renderer owns account, audit, mini stack, rows, and grouped user markup", () => {
  const users = [
    { id: "platform-1", firstName: "Platform", lastName: "Admin", email: "platform@example.com", role: "admin", status: "active", workspaceScope: "platform" },
    { id: "coach-1", firstName: "Mak", lastName: "Lind", email: "mak@example.com", role: "coach", status: "active", teamId: "team-1", title: "Coach", department: "Football" },
    { id: "coach-2", firstName: "Scout", lastName: "One", email: "scout@example.com", role: "scout", status: "paused", title: "Scout", department: "Scouting" },
  ];
  const structure = {
    clubs: [{ id: "club-1", name: "North Carolina Courage" }],
    teams: [{ id: "team-1", clubId: "club-1", name: "First Team", level: "Senior" }],
  };
  const renderer = createAdminUserRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatUserName: (user) => `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    getRoleLabel: (role) => ({ admin: "Admin", coach: "Coach", scout: "Scout" })[role] || role,
    getUserScopeLabel: (user) => (user.teamId ? "First Team" : "Platform"),
    renderUserAvatar: (user) => `<span class="staff-user-avatar">${user.firstName?.[0] || "U"}</span>`,
    getAdminUserInitials: (user) => `${user.firstName?.[0] || "U"}${user.lastName?.[0] || ""}`.toUpperCase(),
    getAuditState: () => ({
      entries: [
        {
          action: "user.updated",
          summary: "Mak Lind updated",
          createdAt: "2026-05-31T11:14:00Z",
          actor: { name: "Platform Admin" },
          details: { changedFields: ["role", "team"] },
        },
      ],
      loading: false,
      loadError: "",
    }),
    getSelectedUserId: () => "coach-1",
    canManageUser: (_currentUser, user, _structure, options = {}) => user.id !== "platform-1" && !options.remove,
    hasWorkspaceScope: (user) => user.workspaceScope === "platform",
    getScopedTeams: (_currentUser, sourceStructure) => sourceStructure.teams,
    getClubById: (clubId, sourceStructure) => sourceStructure.clubs.find((club) => club.id === clubId),
    getUsersForTeam: (sourceUsers, teamId) => sourceUsers.filter((user) => user.teamId === teamId),
    isLegacyTeam: () => false,
    isLegacyTeamPlaceholderName: () => false,
  });

  expect(getAdminActiveUserCount(users)).toBe(2);
  expect(renderer.renderAccountSummary(users[1])).toContain("admin-account-summary");
  expect(renderer.renderAuditLog()).toContain("Mak Lind updated");
  expect(renderer.renderAuditLog()).toContain("2 fields changed");
  expect(renderer.renderMiniUserStack(users)).toContain("admin-org-user-stack");
  expect(renderer.renderUserRow(users[1], users[0], structure)).toContain("is-selected");
  const groupedMarkup = renderer.renderGroupedUsers(users, users[0], structure);
  expect(groupedMarkup).toContain("Football Science Live");
  expect(groupedMarkup).toContain("First Team");
  expect(groupedMarkup).toContain("Unassigned users");
});
