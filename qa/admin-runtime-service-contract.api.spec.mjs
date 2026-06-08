import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdminRuntimeService } from "../src/modules/admin/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function normalizeText(value = "", fallback = "") {
  const normalized = String(value || fallback).trim();
  return normalized || fallback;
}

function createHarness(overrides = {}) {
  const calls = [];
  const contextLog = [];
  const clipboardWrites = [];
  const users = overrides.users || [
    { id: "admin-1", role: overrides.role || "admin", username: "admin", email: "admin@example.com" },
    { id: "coach-1", role: "coach", username: "coach", email: "coach@example.com", teamId: "team-1" },
  ];
  const currentUser = overrides.currentUser || users[0];
  const mutable = {
    hubState: { activeWorkspaceId: overrides.activeWorkspaceId || "home" },
    structure: {
      activeClubId: "club-1",
      activeTeamId: "team-1",
      clubs: [{ id: "club-1", name: "Existing Club", shortName: "EC" }],
      teams: [{ id: "team-1", clubId: "club-1", name: "Existing Team", shortName: "ET" }],
    },
  };
  const ui = { adminWorkspace: { innerHTML: "" } };
  const service = createAdminRuntimeService({
    adminWorkspaceRenderer: {
      renderNotAdmin: () => "<not-admin />",
      renderWorkspace: (context) => {
        contextLog.push(context);
        return `<admin>${context.message || ""}</admin>`;
      },
    },
    buildPlatformTemporaryLoginMessage: (user, password, copied) => `temporary:${user.id}:${password}:${copied}`,
    buildPlatformUserCredentialMessage: (user, password) => `credentials:${user.email}:${password}`,
    canAdminManageUser: () => true,
    createPlatformStructureId: (prefix, name, usedIds = new Set()) => {
      let candidate = `${prefix}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      let index = 2;
      while (usedIds.has(candidate)) {
        candidate = `${candidate}-${index}`;
        index += 1;
      }
      return candidate;
    },
    ensureTransferRoomState: () => ({ activeTeamId: "team-1", teams: mutable.structure.teams }),
    fetchRef: async () => ({
      ok: true,
      json: async () => ({ ok: true, report: { overallStatus: "pass", generatedAt: "2026-06-08T10:00:00Z" } }),
    }),
    flushCentralStateWrites: async () => calls.push("flush-central"),
    formatUserName: (user) => user?.username || "",
    getAdminUserInitialsFromModule: () => "AU",
    getAssignableRolesForUser: () => ["coach", "scout"],
    getCurrentPlatformUser: () => currentUser,
    getHubState: () => mutable.hubState,
    getPlatformApiAccessToken: async () => "token",
    getPlatformAuthStore: () => ({
      getAuditLog: async () => ({ ok: true, entries: [{ id: "audit-1", action: "create" }] }),
    }),
    getPlatformClubById: (clubId, structure = mutable.structure) => structure.clubs.find((club) => club.id === clubId) || null,
    getPlatformFormValues: (form) => form.values || {},
    getPlatformRoles: () => ["admin", "club-admin", "coach", "scout"],
    getPlatformStructureState: () => mutable.structure,
    getPlatformTeamById: (teamId, structure = mutable.structure) => structure.teams.find((team) => team.id === teamId) || null,
    getPlatformUsers: () => users,
    getScopedPlatformClubs: () => mutable.structure.clubs,
    getScopedPlatformUsers: () => users,
    getUserTeamId: (user) => user?.teamId || "team-1",
    getWorkspaceByIdFromPool: (workspaceId) => ({ id: workspaceId, hiddenFromNav: workspaceId === "hidden" }),
    hasPlatformWorkspaceScope: (user) => Boolean(user?.workspaceScope),
    isCurrentPlatformUserAdmin: () => ["admin", "club-admin", "team-admin"].includes(currentUser.role),
    isLegacyPlatformStructureValue: (value) => String(value || "").toLowerCase().includes("football science live"),
    isPlatformAdminUser: (user) => user?.role === "admin",
    normalizePlatformClub: (club) => ({ ...club }),
    normalizePlatformRole: (role, fallback = "coach") => String(role || fallback).trim().toLowerCase(),
    normalizePlatformStructureText: normalizeText,
    normalizePlatformTeam: (team) => ({ ...team }),
    platformDefaultTeamId: "team-1",
    readPlatformStructureState: () => mutable.structure,
    renderDashboardCards: () => calls.push("dashboard"),
    syncPlatformStructureWithUsers: () => mutable.structure,
    topIconMenuOrder: ["home", "admin", "hidden"],
    ui,
    win: {
      location: { href: "" },
      navigator: {
        clipboard: {
          writeText: async (text) => {
            clipboardWrites.push(text);
          },
        },
      },
    },
    writePlatformAppearanceState: (config) => calls.push(["appearance", config]),
    writePlatformStructureState: (nextStructure) => {
      mutable.structure = nextStructure;
      calls.push("write-structure");
    },
  });
  return { calls, clipboardWrites, contextLog, currentUser, mutable, service, ui, users };
}

test("Admin runtime service owns admin bodies outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/core/platform-runtime-accessors.mjs");
  const serviceSource = readProjectFile("src/modules/admin/admin-runtime-service.mjs");
  const indexSource = readProjectFile("src/modules/admin/index.mjs");

  expect(appSource).toContain("createAdminRuntimeService({");
  expect(appSource).toContain("platform-runtime-accessors.mjs");
  expect(appSource).toContain("adminRuntimeService,");
  expect(accessorsSource).toContain("renderAdminWorkspace");
  expect(accessorsSource).toContain('callAccessorSource("adminRuntimeService", "renderAdminWorkspace"');
  expect(accessorsSource).toContain('callAccessorSource("adminRuntimeService", "createAdminClubFromForm"');
  expect(appSource).not.toContain("async function loadPlatformReadinessReport(options = {}) {\nif (platformReadinessLoading)");
  expect(appSource).not.toContain("function createAdminTeamFromForm(form) {\nconst currentUser = getCurrentPlatformUser();");
  expect(appSource).not.toContain("function renderAdminWorkspace(...args)");
  expect(appSource).not.toContain("function createAdminClubFromForm(...args)");
  expect(serviceSource).toContain("async function loadPlatformReadinessReport(options = {})");
  expect(serviceSource).toContain("function createAdminTeamFromForm(form)");
  expect(indexSource).toContain('export * from "./admin-runtime-service.mjs";');
});

test("Admin runtime service preserves render context and selected user state", () => {
  const { contextLog, service, ui, users } = createHarness({ role: "club-admin" });

  service.renderAdminWorkspace("Ready.");

  expect(ui.adminWorkspace.innerHTML).toBe("<admin>Ready.</admin>");
  expect(service.getSelectedAdminUserId()).toBe(users[0].id);
  expect(contextLog.at(-1)).toMatchObject({
    adminCreateUserEditorOpen: false,
    adminUserEditorOpen: false,
    createRole: "scout",
    currentUserIsPlatformAdmin: false,
    message: "Ready.",
    selectedUser: users[0],
  });
});

test("Admin runtime service preserves club and team creation behavior", () => {
  const { calls, mutable, service } = createHarness();

  service.createAdminClubFromForm({ values: { clubName: "North Test FC" } });
  expect(calls).toContain("write-structure");
  expect(mutable.structure.clubs.some((club) => club.name === "North Test FC")).toBe(true);
  expect(mutable.structure.activeClubId).toBe("club-north-test-fc");

  service.createAdminTeamFromForm({ values: { clubId: "club-north-test-fc", teamName: "U19" } });
  expect(mutable.structure.teams.some((team) => team.clubId === "club-north-test-fc" && team.name === "U19")).toBe(true);
  expect(mutable.structure.activeTeamId).toBe("team-north-test-fc-u19");
});

test("Admin runtime service preserves audit, readiness, mailto, and appearance behavior", async () => {
  const { calls, clipboardWrites, service } = createHarness({ activeWorkspaceId: "home" });

  await service.loadAdminAuditLog({ force: true });
  expect(service.getAdminAuditState()).toMatchObject({
    entries: [{ id: "audit-1", action: "create" }],
    loading: false,
    loadError: "",
  });

  await service.loadPlatformReadinessReport({ force: true });
  expect(service.getReadinessState()).toMatchObject({
    report: { overallStatus: "pass", generatedAt: "2026-06-08T10:00:00Z" },
    loading: false,
    loadError: "",
  });

  const mailto = await service.openCredentialsMailto(
    { id: "coach-1", username: "coach", email: "coach@example.com" },
    "temporary-123"
  );
  expect(mailto.copied).toBe(true);
  expect(clipboardWrites.at(-1)).toContain("Temporary password: temporary-123");

  await service.publishPlatformAppearanceConfig({ theme: "dark" }, "Appearance saved.");
  expect(calls).toContainEqual(["appearance", { theme: "dark" }]);
  expect(calls).toContain("flush-central");
  expect(calls).toContain("dashboard");
});
