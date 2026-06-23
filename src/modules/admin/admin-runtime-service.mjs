export function createAdminRuntimeService(deps = {}) {
  const {
    adminWorkspaceRenderer,
    buildPlatformTemporaryLoginMessage = () => "",
    buildPlatformUserCredentialMessage = () => "",
    fetchRef = globalThis.fetch,
    platformDefaultTeamId = "",
    topIconMenuOrder = [],
    ui = {},
    win = globalThis,
  } = deps;

  const state = {
    selectedAdminUserId: null,
    adminUserEditorOpen: false,
    adminCreateUserEditorOpen: false,
    adminCreateUserTeamId: "",
    adminCreateUserDraft: null,
    adminAuditEntries: [],
    adminAuditLoading: false,
    adminAuditLoadedAt: 0,
    adminAuditLoadError: "",
    platformReadinessReport: null,
    platformReadinessLoading: false,
    platformReadinessLoadedAt: 0,
    platformReadinessLoadError: "",
  };

  const call = (name, ...args) => deps[name]?.(...args);
  const getCurrentUser = () => call("getCurrentPlatformUser");
  const getStructure = () => call("getPlatformStructureState");
  const renderAdmin = (message = "") => service.renderAdminWorkspace(message);

  async function openCredentialsMailto(user, temporaryPassword = "") {
    const body = buildPlatformUserCredentialMessage(user, temporaryPassword);
    const recipient = (user.email || "").trim();
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent("Your Football Science login")}&body=${encodeURIComponent(
      body
    )}`;
    const copyText = [
      "Website: https://footballscience.xyz/",
      `Username: ${user.username}`,
      `Email: ${user.email}`,
      temporaryPassword ? `Temporary password: ${temporaryPassword}` : "",
    ].filter(Boolean).join("\n");
    let copied = false;
    if (win.navigator?.clipboard?.writeText) {
      try {
        await win.navigator.clipboard.writeText(copyText);
        copied = true;
      } catch {
      }
    }
    win.location.href = mailto;
    return { copied, copyText };
  }

  function getAdminManagedWorkspaces() {
    return topIconMenuOrder
      .map((workspaceId) => call("getWorkspaceByIdFromPool", workspaceId))
      .filter((workspace) => workspace && !workspace.hiddenFromNav);
  }

  function getAdminUsersForTeam(users = [], teamId = "", structure = getStructure()) {
    const normalizedTeamId = call("normalizePlatformStructureText", teamId, "");
    return users.filter((user) => !call("hasPlatformWorkspaceScope", user) && call("getUserTeamId", user, structure) === normalizedTeamId);
  }

  function getAdminUserInitials(user = {}) {
    return call("getAdminUserInitialsFromModule", user, {
      formatUserName: deps.formatUserName,
      normalizeText: deps.normalizePlatformStructureText,
    });
  }

  function createAdminClubFromForm(form) {
    const currentUser = getCurrentUser();
    if (!form || !call("isPlatformAdminUser", currentUser)) {
      renderAdmin("Platform admin required.");
      return;
    }
    const values = call("getPlatformFormValues", form);
    const clubName = call("normalizePlatformStructureText", values.clubName, "");
    if (!clubName) {
      renderAdmin("Club name is required.");
      return;
    }
    if (call("isLegacyPlatformStructureValue", clubName)) {
      renderAdmin("Football Science Live is a legacy workspace label, not a club.");
      return;
    }
    const structure = call("readPlatformStructureState");
    const existingClub = structure.clubs.find((club) => club.name.toLowerCase() === clubName.toLowerCase());
    if (existingClub) {
      renderAdmin("Club already exists.");
      return;
    }
    const clubIds = new Set(structure.clubs.map((club) => club.id));
    const club = call("normalizePlatformClub", {
      id: call("createPlatformStructureId", "club", clubName, clubIds),
      name: clubName,
      shortName: clubName,
    });
    structure.clubs.push(club);
    structure.activeClubId = club.id;
    call("writePlatformStructureState", structure);
    renderAdmin("Club added.");
  }

  function createAdminTeamFromForm(form) {
    const currentUser = getCurrentUser();
    if (!form || !(call("isPlatformAdminUser", currentUser) || call("normalizePlatformRole", currentUser?.role, "") === "club-admin")) {
      renderAdmin("Club admin access required.");
      return;
    }
    const values = call("getPlatformFormValues", form);
    const structure = call("readPlatformStructureState");
    const allowedClubs = call("getScopedPlatformClubs", currentUser, structure);
    const club = allowedClubs.find((candidate) => candidate.id === values.clubId) || allowedClubs[0];
    const teamName = call("normalizePlatformStructureText", values.teamName, "");
    if (!club || !teamName) {
      renderAdmin("Team name is required.");
      return;
    }
    if (call("isLegacyPlatformStructureValue", teamName)) {
      renderAdmin("Football Science Live is a legacy workspace label, not a team.");
      return;
    }
    const existingTeam = structure.teams.find(
      (team) => team.clubId === club.id && team.name.toLowerCase() === teamName.toLowerCase()
    );
    if (existingTeam) {
      renderAdmin("Team already exists.");
      return;
    }
    const teamIds = new Set(structure.teams.map((team) => team.id));
    const team = call("normalizePlatformTeam", {
      id: call("createPlatformStructureId", "team", `${club.name}-${teamName}`, teamIds),
      clubId: club.id,
      name: teamName,
      shortName: teamName,
    });
    structure.teams.push(team);
    structure.activeClubId = club.id;
    structure.activeTeamId = team.id;
    call("writePlatformStructureState", structure);
    renderAdmin("Team added.");
  }

  async function loadAdminAuditLog(options = {}) {
    if (state.adminAuditLoading) {
      return;
    }
    const force = Boolean(options.force);
    if (!force && state.adminAuditLoadedAt && Date.now() - state.adminAuditLoadedAt < 60000) {
      return;
    }
    const authStore = call("getPlatformAuthStore");
    if (!authStore?.getAuditLog) {
      state.adminAuditLoadError = "Audit log is not ready yet.";
      return;
    }
    state.adminAuditLoading = true;
    state.adminAuditLoadError = "";
    try {
      const result = await authStore.getAuditLog(80);
      if (!result?.ok) {
        state.adminAuditLoadError = result?.reason || "Audit log could not be loaded.";
        return;
      }
      state.adminAuditEntries = Array.isArray(result.entries) ? result.entries : [];
      state.adminAuditLoadedAt = Date.now();
    } catch (error) {
      state.adminAuditLoadError = error?.message || "Audit log could not be loaded.";
    } finally {
      state.adminAuditLoading = false;
      if (call("getHubState")?.activeWorkspaceId === "admin") {
        renderAdmin();
      }
    }
  }

  async function loadPlatformReadinessReport(options = {}) {
    if (state.platformReadinessLoading) {
      return;
    }
    const force = Boolean(options.force);
    if (!force && state.platformReadinessLoadedAt && Date.now() - state.platformReadinessLoadedAt < 60000) {
      return;
    }
    state.platformReadinessLoading = true;
    state.platformReadinessLoadError = "";
    const token = await call("getPlatformApiAccessToken");
    if (!token) {
      state.platformReadinessLoadError = "Admin session required.";
      state.platformReadinessLoading = false;
      if (call("getHubState")?.activeWorkspaceId === "admin") {
        renderAdmin();
      }
      return;
    }
    try {
      const response = await fetchRef("/api/platform-readiness", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        state.platformReadinessLoadError = payload?.reason || `Platform readiness failed (${response.status}).`;
        return;
      }
      state.platformReadinessReport = payload.report || null;
      state.platformReadinessLoadedAt = Date.now();
    } catch (error) {
      state.platformReadinessLoadError = error?.message || "Platform readiness could not be loaded.";
    } finally {
      state.platformReadinessLoading = false;
      if (call("getHubState")?.activeWorkspaceId === "admin") {
        renderAdmin();
      }
    }
  }

  async function publishPlatformAppearanceConfig(config, message = "Published.") {
    if (!call("isPlatformAdminUser", getCurrentUser())) {
      renderAdmin("Platform admin required.");
      return;
    }
    call("writePlatformAppearanceState", config);
    await call("flushCentralStateWrites");
    call("renderDashboardCards");
    renderAdmin(message);
  }

  function getAdminTransferRoomAccessTeamId(transferRoomState = call("ensureTransferRoomState"), structure = getStructure()) {
    const fallbackTeamId = transferRoomState.activeTeamId || transferRoomState.settings?.activeTeamId || platformDefaultTeamId;
    const team =
      (transferRoomState.teams || []).find((item) => item.id === fallbackTeamId) ||
      call("getPlatformTeamById", fallbackTeamId, structure) ||
      (transferRoomState.teams || [])[0] ||
      {};
    return team.id || fallbackTeamId;
  }

  function renderAdminWorkspace(message = "") {
    if (!ui.adminWorkspace) {
      return;
    }
    if (!call("isCurrentPlatformUserAdmin")) {
      ui.adminWorkspace.innerHTML = adminWorkspaceRenderer.renderNotAdmin();
      return;
    }
    const allUsers = call("getPlatformUsers");
    const currentUser = getCurrentUser();
    const structure = call("syncPlatformStructureWithUsers", allUsers);
    const users = call("getScopedPlatformUsers", allUsers, currentUser, structure);
    const currentUserIsPlatformAdmin = call("isPlatformAdminUser", currentUser);
    const roles = call("getPlatformRoles");
    if (currentUserIsPlatformAdmin && !state.adminAuditLoadedAt && !state.adminAuditLoading) {
      loadAdminAuditLog().catch(() => {});
    }
    if (currentUserIsPlatformAdmin && !state.platformReadinessLoadedAt && !state.platformReadinessLoading && !state.platformReadinessLoadError) {
      loadPlatformReadinessReport().catch(() => {});
    }
    const selectedUser =
      users.find((adminUser) => adminUser.id === state.selectedAdminUserId) ??
      users.find((adminUser) => adminUser.id === currentUser?.id) ??
      users[0] ??
      null;
    state.selectedAdminUserId = selectedUser?.id ?? null;
    const selectedUserIsSelf = Boolean(selectedUser?.id && selectedUser.id === currentUser?.id);
    const canManageSelectedUser = Boolean(selectedUser && call("canAdminManageUser", currentUser, selectedUser, structure));
    const canRemoveSelectedUser = Boolean(selectedUser && call("canAdminManageUser", currentUser, selectedUser, structure, { remove: true }));
    const selectedUserFieldDisabled = canManageSelectedUser ? "" : "disabled";
    const assignableRoles = call("getAssignableRolesForUser", currentUser);
    const createRole = assignableRoles.includes("scout")
      ? "scout"
      : assignableRoles.includes("coach")
        ? "coach"
        : assignableRoles[0];
    const createUserTeamId = state.adminCreateUserTeamId || call("getUserTeamId", currentUser, structure);
    const createUserDraft = {
      firstName: "",
      lastName: "",
      email: "",
      username: "",
      role: createRole,
      status: "active",
      title: "Scout",
      password: "",
      passwordConfirm: "",
      department: "Scouting",
      teamId: createUserTeamId,
      ...(state.adminCreateUserDraft && typeof state.adminCreateUserDraft === "object" ? state.adminCreateUserDraft : {}),
    };
    const effectiveCreateUserTeamId = createUserDraft.teamId || createUserTeamId;
    const createUserTeam = call("getPlatformTeamById", effectiveCreateUserTeamId, structure);
    const createUserClub = createUserTeam ? call("getPlatformClubById", createUserTeam.clubId, structure) : null;
    ui.adminWorkspace.innerHTML = adminWorkspaceRenderer.renderWorkspace({
      adminAuditLoadedAt: state.adminAuditLoadedAt,
      adminCreateUserEditorOpen: state.adminCreateUserEditorOpen,
      adminUserEditorOpen: state.adminUserEditorOpen,
      canManageSelectedUser,
      canRemoveSelectedUser,
      createRole,
      createUserClub,
      createUserDraft,
      createUserTeam,
      createUserTeamId: effectiveCreateUserTeamId,
      currentUser,
      currentUserIsPlatformAdmin,
      message,
      roles,
      selectedUser,
      selectedUserFieldDisabled,
      selectedUserIsSelf,
      selectedUserTeamId: selectedUser ? call("getUserTeamId", selectedUser, structure) : "",
      structure,
      users,
    });
  }

  function getBindingStateAccessors() {
    return {
      getSelectedAdminUserId: () => state.selectedAdminUserId,
      setSelectedAdminUserId: (userId) => { state.selectedAdminUserId = userId; },
      setAdminCreateUserDraft: (draft) => { state.adminCreateUserDraft = draft && typeof draft === "object" ? { ...draft } : null; },
      setAdminCreateUserEditorOpen: (isOpen) => { state.adminCreateUserEditorOpen = isOpen; },
      setAdminUserEditorOpen: (isOpen) => { state.adminUserEditorOpen = isOpen; },
      setAdminCreateUserTeamId: (teamId) => { state.adminCreateUserTeamId = teamId; },
      getHubState: deps.getHubState,
      setHubState: deps.setHubState,
    };
  }

  function getAdminAuditState() {
    return {
      entries: state.adminAuditEntries,
      loading: state.adminAuditLoading,
      loadError: state.adminAuditLoadError,
    };
  }

  function getReadinessState() {
    return {
      report: state.platformReadinessReport,
      loading: state.platformReadinessLoading,
      loadedAt: state.platformReadinessLoadedAt,
      loadError: state.platformReadinessLoadError,
    };
  }

  const service = {
    buildTemporaryLoginMessage: (user, temporaryPassword, copied = false) => buildPlatformTemporaryLoginMessage(user, temporaryPassword, copied),
    createAdminClubFromForm,
    createAdminTeamFromForm,
    getAdminAuditState,
    getAdminManagedWorkspaces,
    getAdminTransferRoomAccessTeamId,
    getAdminUserInitials,
    getAdminUsersForTeam,
    getBindingStateAccessors,
    getReadinessState,
    getSelectedAdminUserId: () => state.selectedAdminUserId,
    loadAdminAuditLog,
    loadPlatformReadinessReport,
    openCredentialsMailto,
    publishPlatformAppearanceConfig,
    renderAdminWorkspace,
    setAdminCreateUserDraft: (draft) => { state.adminCreateUserDraft = draft && typeof draft === "object" ? { ...draft } : null; },
    setAdminCreateUserEditorOpen: (isOpen) => { state.adminCreateUserEditorOpen = isOpen; },
    setAdminCreateUserTeamId: (teamId) => { state.adminCreateUserTeamId = teamId; },
    setAdminUserEditorOpen: (isOpen) => { state.adminUserEditorOpen = isOpen; },
    setSelectedAdminUserId: (userId) => { state.selectedAdminUserId = userId; },
  };

  return service;
}
