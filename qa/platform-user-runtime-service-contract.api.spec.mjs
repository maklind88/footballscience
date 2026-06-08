import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPlatformUserRuntimeService } from "../src/core/platform-user-runtime-service.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createField() {
  return {
    attributes: {},
    hidden: false,
    textContent: "",
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

test("platform user runtime service owns auth, role, and account menu helpers outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const serviceSource = readProjectFile("src/core/platform-user-runtime-service.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("createPlatformUserRuntimeService({");
  expect(appSource).not.toContain("function getPlatformApiAccessToken()");
  expect(appSource).not.toContain("function normalizePlatformRole(role, fallback = \"coach\")");
  expect(appSource).not.toContain("function syncAccountMenu(user = getCurrentPlatformUser())");
  expect(appSource).not.toContain("let platformUser = null;");

  expect(serviceSource).toContain("function getPlatformApiAccessToken()");
  expect(serviceSource).toContain("function normalizePlatformRole(role, fallback = \"coach\")");
  expect(serviceSource).toContain("function syncAccountMenu(user = getCurrentPlatformUser())");
  expect(serviceSource).toContain("configureAccountMenu");

  expect(packageJson.scripts.check).toContain("src/core/platform-user-runtime-service.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-user-runtime-service-contract.api.spec.mjs");
});

test("platform user runtime service preserves role, token, profile, and account menu behavior", async () => {
  const user = { id: "user-1", role: "platform-admin", firstName: "Mak", lastName: "Lind", team: "North Carolina Courage" };
  let users = [{ ...user, email: "old@example.com" }];
  let selectedUserId = "";
  const win = {
    clearTimeout,
    platformAuthReadyPromise: Promise.resolve(),
    platformAuthStore: {
      getAccessToken: async () => " token-1 ",
      getCurrentUser: () => users.find((entry) => entry.id === "user-1"),
      getUsers: () => users,
      roles: () => ["owner"],
      setCurrentUser: (userId) => {
        selectedUserId = userId;
      },
      writeUsers: (nextUsers) => {
        users = nextUsers;
      },
    },
    setTimeout,
  };

  const profileMenuAvatar = createField();
  const profileMenuButton = createField();
  const ui = {
    profileMenu: createField(),
    profileMenuAvatar,
    profileMenuButton,
    profileMenuClub: createField(),
    profileMenuName: createField(),
    profileMenuPanelAvatar: createField(),
    profileMenuPanelClub: createField(),
    profileMenuPanelName: createField(),
  };
  const avatarCalls = [];
  const service = createPlatformUserRuntimeService({
    formatPlatformUserName: (entry) => `${entry.firstName} ${entry.lastName}`.trim(),
    getPlatformRoleLabel: (role) => `Role: ${role}`,
    getPlatformUserInitials: (entry) => `${entry.firstName?.[0] || ""}${entry.lastName?.[0] || ""}`,
    getPlatformUserProfileImageUrl: (entry, limits) => `${entry.id}:${limits.maxUrlLength}`,
    getUserClubName: () => "Fallback Club",
    getUserTeamName: () => "",
    isLegacyPlatformStructureValue: () => false,
    normalizePlatformProfileImageUrl: (value, limits) => `${value}:${limits.maxUploadDataUrlLength}`,
    normalizePlatformStructureText: (value = "") => String(value || "").trim(),
    win,
  });
  service.configureAccountMenu({
    applyUserAvatar: (target, nextUser) => {
      avatarCalls.push([target, nextUser.id]);
    },
    getPlatformStructureState: () => ({}),
    ui,
  });

  expect(await service.getPlatformApiAccessToken()).toBe("token-1");
  expect(service.normalizePlatformRole("platform owner")).toBe("admin");
  expect(service.isPlatformManagementUser(user)).toBe(true);
  expect(service.isCurrentPlatformUserAdmin()).toBe(true);
  expect(service.getAssignableRolesForUser({ role: "team-admin" })).toEqual(["coach", "scout", "analyst", "performance", "medical", "guest"]);
  expect(service.getPlatformRoles()).toContain("owner");
  expect(service.getRoleLabel("coach")).toBe("Role: coach");
  expect(service.getUserInitials(user)).toBe("ML");
  expect(service.getUserProfileImageUrl(user)).toBe("user-1:1800");
  expect(service.normalizePlatformImageUrl("avatar")).toBe("avatar:900000");

  service.syncAccountMenu();
  expect(ui.profileMenuName.textContent).toBe("Mak Lind");
  expect(ui.profileMenuClub.textContent).toBe("North Carolina Courage");
  expect(ui.profileMenuButton.attributes["aria-label"]).toBe("Open profile menu for Mak Lind");
  expect(avatarCalls).toEqual([
    [profileMenuAvatar, "user-1"],
    [ui.profileMenuPanelAvatar, "user-1"],
  ]);

  service.setProfileMenuOpen(true);
  expect(service.isProfileMenuOpen()).toBe(true);
  service.updatePlatformUserFromPayload({ id: "user-1", firstName: "Mak", lastName: "Updated", email: "new@example.com" });
  expect(selectedUserId).toBe("user-1");
  expect(users[0].email).toBe("new@example.com");
});
