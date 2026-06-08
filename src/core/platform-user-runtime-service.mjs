const platformDefaultRoles = ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
const platformManagementRoleSet = new Set(["admin", "club-admin", "team-admin"]);
const platformStaffRoleSet = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const platformRoleAliases = Object.freeze({
  "super-admin": "admin",
  "superadmin": "admin",
  administrator: "admin",
  "platform-admin": "admin",
  "platform owner": "admin",
  owner: "admin",
  "admin-role": "admin",
});

export function createPlatformUserRuntimeService(options = {}) {
  const {
    getPlatformRoleLabel = (role) => role || "",
    formatPlatformUserName = (user = {}) => user?.name || "Profile",
    getPlatformUserInitials = () => "",
    getPlatformUserProfileImageUrl = () => "",
    isLegacyPlatformStructureValue = () => false,
    getUserClubName = () => "",
    getUserTeamName = () => "",
    maxProfileImageUploadDataUrlLength = 900000,
    maxProfileImageUrlLength = 1800,
    normalizePlatformProfileImageUrl = (value = "") => String(value || ""),
    normalizePlatformStructureText = (value = "", fallback = "") => String(value || fallback || "").trim(),
    win = globalThis,
  } = options;

  let platformUser = null;
  let accountMenuDeps = {};

  function configureAccountMenu(nextDeps = {}) {
    accountMenuDeps = { ...accountMenuDeps, ...nextDeps };
  }

  function getPlatformAuthStore() {
    return win.platformAuthStore ?? null;
  }

  async function getPlatformApiAccessToken() {
    if (win.platformAuthReadyPromise instanceof Promise) {
      try {
        await win.platformAuthReadyPromise;
      } catch {
      }
    }
    const authStore = getPlatformAuthStore();
    if (typeof authStore?.getAccessToken !== "function") {
      return "";
    }
    try {
      return String((await authStore.getAccessToken()) || "").trim();
    } catch {
      return "";
    }
  }

  function syncPlatformUserFromAuth() {
    const authStore = getPlatformAuthStore();
    platformUser = authStore?.getCurrentUser?.() ?? win.platformSession ?? null;
    return platformUser;
  }

  function withUiTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => {
        if (timeoutId) {
          win.clearTimeout(timeoutId);
        }
      }),
      new Promise((_, reject) => {
        timeoutId = win.setTimeout(() => {
          reject(new Error(timeoutMessage || "Request timed out."));
        }, timeoutMs);
      }),
    ]);
  }

  function getCurrentPlatformUser() {
    return platformUser ?? syncPlatformUserFromAuth();
  }

  function updatePlatformUserFromPayload(nextUser) {
    const authStore = getPlatformAuthStore();
    if (!nextUser?.id || !authStore?.getUsers || !authStore?.writeUsers || !authStore?.setCurrentUser) {
      return;
    }
    const users = Array.isArray(authStore.getUsers()) ? authStore.getUsers() : [];
    const nextUsers = users.some((entry) => entry.id === nextUser.id)
      ? users.map((entry) => (entry.id === nextUser.id ? { ...entry, ...nextUser } : entry))
      : [nextUser, ...users];
    authStore.writeUsers(nextUsers);
    const currentUser = getCurrentPlatformUser();
    if (currentUser?.id === nextUser.id) {
      authStore.setCurrentUser(nextUser.id);
    }
  }

  function normalizePlatformRole(role, fallback = "coach") {
    if (Array.isArray(role)) {
      return normalizePlatformRole(role.find((entry) => typeof entry === "string" && entry.trim()) || "", fallback);
    }
    if (role && typeof role === "object") {
      return normalizePlatformRole(role?.role || role?.name || role?.value || "", fallback);
    }
    const normalizedRole = String(role || "").trim().toLowerCase();
    const mappedRole = platformRoleAliases[normalizedRole] || normalizedRole;
    return platformDefaultRoles.includes(mappedRole) ? mappedRole : fallback;
  }

  function isPlatformAdminUser(user) {
    return normalizePlatformRole(user?.role, "") === "admin";
  }

  function isPlatformManagementUser(user) {
    return platformManagementRoleSet.has(normalizePlatformRole(user?.role, ""));
  }

  function isPlatformStaffUser(user) {
    return platformStaffRoleSet.has(normalizePlatformRole(user?.role, ""));
  }

  function isCurrentPlatformUserAdmin() {
    const user = getCurrentPlatformUser();
    return isPlatformManagementUser(user);
  }

  function getPlatformUsers() {
    return getPlatformAuthStore()?.getUsers?.() ?? [];
  }

  function getPlatformRoles() {
    const roles = getPlatformAuthStore()?.roles;
    if (Array.isArray(roles)) {
      return Array.from(new Set([...platformDefaultRoles, ...roles]));
    }
    if (typeof roles === "function") {
      try {
        const nextRoles = roles();
        return Array.isArray(nextRoles) ? Array.from(new Set([...platformDefaultRoles, ...nextRoles])) : platformDefaultRoles;
      } catch {
        return platformDefaultRoles;
      }
    }
    return platformDefaultRoles;
  }

  function getAssignableRolesForUser(user = getCurrentPlatformUser()) {
    const role = normalizePlatformRole(user?.role, "");
    if (role === "admin") {
      return platformDefaultRoles;
    }
    if (role === "club-admin") {
      return ["team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
    }
    if (role === "team-admin") {
      return ["coach", "scout", "analyst", "performance", "medical", "guest"];
    }
    return [];
  }

  function formatUserName(user) {
    return formatPlatformUserName(user);
  }

  function getUserInitials(user) {
    return getPlatformUserInitials(user);
  }

  function getUserProfileImageUrl(user) {
    return getPlatformUserProfileImageUrl(user, {
      maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
      maxUrlLength: maxProfileImageUrlLength,
    });
  }

  function normalizePlatformImageUrl(value = "") {
    return normalizePlatformProfileImageUrl(value, {
      maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
      maxUrlLength: maxProfileImageUrlLength,
    });
  }

  function getUserClub(user) {
    const structure = accountMenuDeps.getPlatformStructureState?.();
    return getUserTeamName(user, structure) || getUserClubName(user, structure) || "Football Science";
  }

  function syncAccountMenu(user = getCurrentPlatformUser()) {
    const { applyUserAvatar, ui = {} } = accountMenuDeps;
    const name = user ? formatUserName(user) : "Profile";
    const rawTeamLabel = normalizePlatformStructureText(user?.team || user?.teamName, "");
    const club = rawTeamLabel && !isLegacyPlatformStructureValue(rawTeamLabel) ? rawTeamLabel : getUserClub(user);
    applyUserAvatar?.(ui.profileMenuAvatar, user);
    applyUserAvatar?.(ui.profileMenuPanelAvatar, user);
    const accountFields = [
      [ui.profileMenuName, name],
      [ui.profileMenuPanelName, name],
      [ui.profileMenuClub, club],
      [ui.profileMenuPanelClub, club],
    ];
    accountFields.forEach(([element, value]) => {
      if (element) {
        element.textContent = value;
      }
    });
    if (ui.profileMenuButton) {
      ui.profileMenuButton.setAttribute("aria-label", `Open profile menu for ${name}`);
      ui.profileMenuButton.setAttribute("title", name);
    }
  }

  function setProfileMenuOpen(isOpen) {
    const { ui = {} } = accountMenuDeps;
    if (!ui.profileMenu || !ui.profileMenuButton) {
      return;
    }
    ui.profileMenu.hidden = !isOpen;
    ui.profileMenuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function isProfileMenuOpen() {
    const { ui = {} } = accountMenuDeps;
    return Boolean(ui.profileMenu && !ui.profileMenu.hidden);
  }

  function getRoleLabel(role) {
    return getPlatformRoleLabel(role);
  }

  return {
    configureAccountMenu,
    formatUserName,
    getAssignableRolesForUser,
    getCurrentPlatformUser,
    getPlatformApiAccessToken,
    getPlatformAuthStore,
    getPlatformRoles,
    getPlatformUsers,
    getRoleLabel,
    getUserInitials,
    getUserProfileImageUrl,
    isCurrentPlatformUserAdmin,
    isPlatformAdminUser,
    isPlatformManagementUser,
    isPlatformStaffUser,
    isProfileMenuOpen,
    normalizePlatformImageUrl,
    normalizePlatformRole,
    platformDefaultRoles,
    platformManagementRoleSet,
    platformStaffRoleSet,
    setProfileMenuOpen,
    syncAccountMenu,
    syncPlatformUserFromAuth,
    updatePlatformUserFromPayload,
    withUiTimeout,
  };
}
