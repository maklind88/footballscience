const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createAdminAccessRenderer({
  escapeHtml = defaultEscapeHtml,
  getTransferRoomState,
  getTransferRoomAccessTeamId,
  getManagedWorkspaces,
  getRoleLabel,
  getWorkspaceAccessConfig,
  normalizeWorkspaceAccessEntry,
  normalizePlatformRole,
} = {}) {
  const renderTransferRoomAccessPanel = (users = [], structure = {}) => {
    const state = getTransferRoomState();
    const teamId = getTransferRoomAccessTeamId(state, structure);
    const selectedIds = new Set(state.accessByTeam?.[teamId]?.userIds || []);
    const activeUsers = users.filter((user) => user && user.status !== "paused");
    const userRows = activeUsers.length
      ? activeUsers
          .map((user) => {
            const role = normalizePlatformRole(user.role, "coach");
            const isAutomatic = role === "admin" || role === "team-admin";
            const checked = isAutomatic || selectedIds.has(user.id);
            const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || "User";
            return `
              <label class="admin-access-toggle admin-access-level${isAutomatic ? " is-locked" : ""}">
                <input
                  type="checkbox"
                  ${isAutomatic ? "" : `data-admin-transfer-room-access-user="${escapeHtml(user.id)}"`}
                  ${checked ? "checked" : ""}
                  ${isAutomatic ? "disabled" : ""}
                />
                <span>${escapeHtml(name)}</span>
              </label>
            `;
          })
          .join("")
      : `<p class="pr-empty">No active users.</p>`;

    return `
<form id="adminTransferRoomAccessForm" class="admin-card admin-access-card">
<h2>Transfer Room</h2>
<div class="admin-access-roles">${userRows}</div>
<div class="profile-form-footer admin-access-footer">
<button type="submit">Save</button>
</div>
</form>
`;
  };

  return {
    renderTransferRoomAccessPanel,
    renderRoleAccessForm: (roles = []) => {
      const accessConfig = getWorkspaceAccessConfig();
      const accessRows = getManagedWorkspaces()
        .map((workspace) => {
          const permission = normalizeWorkspaceAccessEntry(workspace.id, accessConfig[workspace.id]);
          const viewRoles = new Set(workspace.requiresAdmin ? ["admin"] : permission.view);
          const editRoles = new Set(workspace.requiresAdmin ? ["admin"] : permission.edit);
          const roleControls = roles
            .map((role) => {
              const isLocked = workspace.requiresAdmin && role !== "admin";
              const value = isLocked ? "none" : editRoles.has(role) ? "edit" : viewRoles.has(role) ? "view" : "none";
              return `
                <label class="admin-access-toggle admin-access-level${isLocked ? " is-locked" : ""}">
                  <span>${escapeHtml(getRoleLabel(role))}</span>
                  <select
                    name="${escapeHtml(`${workspace.id}::${role}`)}"
                    data-admin-access-workspace="${escapeHtml(workspace.id)}"
                    data-admin-access-role="${escapeHtml(role)}"
                    ${isLocked ? "disabled" : ""}
                  >
                    <option value="none"${value === "none" ? " selected" : ""}>Hidden</option>
                    <option value="view"${value === "view" ? " selected" : ""}>View</option>
                    <option value="edit"${value === "edit" ? " selected" : ""}>Edit</option>
                  </select>
                </label>
              `;
            })
            .join("");
          return `
            <article class="admin-access-row">
              <div class="admin-access-title">
                <strong>${escapeHtml(workspace.title)}</strong>
                <small>${workspace.requiresAdmin ? "Admin only" : escapeHtml(workspace.meta ?? "Module")}</small>
              </div>
              <div class="admin-access-roles">${roleControls}</div>
            </article>
          `;
        })
        .join("");

      return `
<form id="adminAccessForm" class="admin-card admin-access-card">
<div class="staff-card-head">
<h2>Role Access</h2>
<span>Sections</span>
</div>
<div class="admin-access-list">${accessRows}</div>
<div class="profile-form-footer admin-access-footer">
<span>Platform admin always keeps full access.</span>
<button type="submit">Save access</button>
</div>
</form>
`;
    },
  };
}
