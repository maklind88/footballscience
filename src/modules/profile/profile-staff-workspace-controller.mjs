export function createProfileStaffWorkspaceController(deps = {}) {
  const {
    getActiveWorkspaceId = () => "",
    getAssignableRolesForUser = () => [],
    getCurrentUser = () => null,
    getScopedUsers = (users) => users,
    getSelectedStaffUserId = () => null,
    getTeamId = () => "",
    getUi = () => ({}),
    getUserProfileImageUrl = () => "",
    getUsers = () => [],
    isAdmin = () => false,
    profileWorkspaceRenderer = { renderWorkspace: () => "" },
    readDashboardTasks = () => [],
    renderAdminRoleOptions = () => "",
    renderAdminTeamOptions = () => "",
    setSelectedStaffUserId = () => {},
    staffWorkspaceRenderer = { renderWorkspace: () => "" },
    syncStructure = () => ({ clubs: [], teams: [] }),
    win = globalThis,
  } = deps;
  let profileWorkspaceFlashMessage = "";
  let profileWorkspaceFlashTimer = null;

  function getProfileWorkspaceMessage(message = "") {
    const nextMessage = String(message || "");
    if (!nextMessage) return profileWorkspaceFlashMessage;
    profileWorkspaceFlashMessage = nextMessage;
    if (profileWorkspaceFlashTimer) {
      win.clearTimeout(profileWorkspaceFlashTimer);
    }
    profileWorkspaceFlashTimer = win.setTimeout(() => {
      profileWorkspaceFlashTimer = null;
      profileWorkspaceFlashMessage = "";
      if (getActiveWorkspaceId() === "my-profile") {
        renderProfileWorkspace();
      }
    }, 5000);
    return profileWorkspaceFlashMessage;
  }

  function renderProfileWorkspace(message = "") {
    const ui = getUi();
    if (!ui.profileWorkspace) return;
    const user = getCurrentUser();
    if (!user) {
      ui.profileWorkspace.innerHTML = "";
      return;
    }
    const users = getUsers();
    const personalTasks = readDashboardTasks().filter(
      (task) => task.assignedTo === user.id && task.createdBy === user.id && task.scope === "personal"
    );
    ui.profileWorkspace.innerHTML = profileWorkspaceRenderer.renderWorkspace({
      user,
      users,
      openPersonalTasks: personalTasks.filter((task) => task.status !== "done"),
      completedPersonalTasks: personalTasks.filter((task) => task.status === "done").slice(0, 3),
      hasProfilePhoto: Boolean(getUserProfileImageUrl(user)),
      message: getProfileWorkspaceMessage(message),
    });
  }

  function renderStaffWorkspace(message = "") {
    const ui = getUi();
    if (!ui.staffWorkspace) return;
    const user = getCurrentUser();
    const users = getUsers();
    const structure = syncStructure(users);
    const scopedUsers = getScopedUsers(users, user, structure);
    const selectedUser =
      scopedUsers.find((staffUser) => staffUser.id === getSelectedStaffUserId()) ??
      scopedUsers.find((staffUser) => staffUser.id === user?.id) ??
      scopedUsers[0] ??
      null;
    setSelectedStaffUserId(selectedUser?.id ?? null);
    const assignableRoles = getAssignableRolesForUser(user);
    const roleOptions = renderAdminRoleOptions(user, assignableRoles.includes("coach") ? "coach" : assignableRoles[0]);
    const teamOptions = renderAdminTeamOptions(user, structure, getTeamId(user, structure));
    ui.staffWorkspace.innerHTML = staffWorkspaceRenderer.renderWorkspace({
      currentUser: user,
      users: scopedUsers,
      structure,
      selectedUser,
      selectedUserId: selectedUser?.id ?? null,
      isAdmin: isAdmin(),
      createUserEditorOpen: Boolean(deps.getStaffCreateUserEditorOpen?.()),
      roleOptions,
      teamOptions,
      message,
    });
  }

  return {
    getProfileWorkspaceMessage,
    renderProfileWorkspace,
    renderStaffWorkspace,
  };
}
