import { expect, test } from "@playwright/test";
import {
  adminDepartmentSuggestions,
  adminTitleSuggestions,
  createAdminReadinessRenderer,
  createAdminStructureRenderer,
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

test("Admin structure renderer owns role options, team options, and club structure markup", () => {
  const structure = {
    clubs: [{ id: "club-1", name: "North Carolina Courage", shortName: "NCC", status: "active" }],
    teams: [{ id: "team-1", clubId: "club-1", name: "First Team", level: "Senior", season: "2026", status: "active" }],
  };
  const users = [
    { id: "admin-1", role: "admin", workspaceScope: "platform", status: "active" },
    { id: "coach-1", role: "coach", teamId: "team-1", clubId: "club-1", status: "active" },
    { id: "coach-2", role: "coach", teamId: "team-1", clubId: "club-1", status: "paused" },
  ];
  const renderer = createAdminStructureRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getAssignableRolesForUser: () => ["coach", "scout"],
    getRoleLabel: (role) => ({ admin: "Admin", coach: "Coach", scout: "Scout" })[role] || role,
    getScopedClubs: () => structure.clubs,
    getScopedTeams: () => structure.teams,
    getClubById: (clubId) => structure.clubs.find((club) => club.id === clubId),
    getUsersForTeam: (sourceUsers, teamId) => sourceUsers.filter((user) => user.teamId === teamId),
    getUserClubId: (user) => user.clubId,
    getUserScopeLabel: () => "Platform",
    isPlatformAdminUser: (user) => user?.role === "admin",
    normalizePlatformRole: (role) => role || "",
    hasWorkspaceScope: (user) => user.workspaceScope === "platform",
    isLegacyTeam: () => false,
    isLegacyTeamPlaceholderName: () => false,
    renderTeamLogoMark: () => '<span class="team-logo"></span>',
    renderMiniUserStack: (sourceUsers) => `<span class="stack">${sourceUsers.length}</span>`,
    defaultTeamId: "team-1",
  });

  expect(renderer.renderRoleOptions(users[0], "admin")).toContain('value="admin" selected');
  expect(renderer.renderTeamOptions(users[0], structure, "team-1")).toContain("North Carolina Courage / First Team");
  const markup = renderer.renderStructurePanel(users[0], structure, users);
  expect(markup).toContain("Club & Team Structure");
  expect(markup).toContain("Football Science Live");
  expect(markup).toContain("North Carolina Courage");
  expect(markup).toContain("First Team");
  expect(markup).toContain("Create club");
  expect(markup).toContain("Create team");
});

test("Admin readiness renderer owns readiness status and appearance markup", () => {
  const appearance = {
    modules: {
      home: {
        density: "normal",
        theme: "system",
        componentTypes: {
          hero: { label: "Hero", density: "normal", tone: "default" },
        },
        sections: {
          overview: { id: "overview", label: "Overview", enabled: true, order: "1", eyebrow: "Today", title: "Dashboard" },
        },
      },
    },
  };
  const renderer = createAdminReadinessRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getReadinessState: () => ({
      report: {
        overallStatus: "pass",
        summary: { readySections: 2, totalSections: 3 },
        sections: [{ label: "Deploy", details: "Ready", status: "pass" }],
        modules: [{ id: "home", label: "Home", implementation: "module", scope: "ui", status: "pass" }],
        environment: [{ label: "Vercel", location: "secret", missing: [], status: "pass" }],
        observabilitySignals: [{ label: "API", source: "logs" }],
        liveSignals: [{ label: "Production", details: "OK", status: "pass" }],
        operatingPriorities: [{ priority: 1, label: "Keep stable", nextStep: "Monitor" }],
        databasePrimaryMigrationPlan: [{ priority: 1, moduleId: "admin", nextStep: "Move pure UI" }],
        scoutingPerformance: { datasetRules: { firstPageMaxRecords: 50, requiresWorkerSource: true }, requiredSignals: ["load"] },
      },
      loading: false,
      loadError: "",
      loadedAt: "2026-05-31T11:14:00Z",
    }),
    readAppearanceState: () => appearance,
    getHomeAppearanceImpactSummary: () => [{ componentType: "hero", enabledCount: 1, count: 2 }],
    platformAppearanceDensityOptions: ["compact", "normal", "airy"],
    platformAppearanceHomeComponentTypeIds: ["hero"],
    platformAppearanceHomeSectionDefaults: [{ id: "overview", label: "Overview", enabled: true, order: "1", eyebrow: "Today", title: "Dashboard" }],
    platformAppearanceThemeOptions: ["system", "light", "dark"],
    platformAppearanceToneOptions: ["default", "calm"],
  });

  expect(renderer.normalizeReadinessStatus("pass")).toBe("pass");
  expect(renderer.normalizeReadinessStatus("unknown")).toBe("warning");
  expect(renderer.renderReadinessStatus("missing")).toContain("Missing");
  const readinessMarkup = renderer.renderReadinessDashboard();
  expect(readinessMarkup).toContain("Platform Health");
  expect(readinessMarkup).toContain("Live Health");
  expect(readinessMarkup).toContain("Scouting Speed");
  expect(readinessMarkup).toContain("Refresh");
  const appearanceMarkup = renderer.renderAppearanceGovernancePanel();
  expect(appearanceMarkup).toContain("Appearance");
  expect(appearanceMarkup).toContain("Home density");
  expect(appearanceMarkup).toContain("Type rules");
  expect(appearanceMarkup).toContain("Home sections");
  expect(appearanceMarkup).toContain("Publish");
});
