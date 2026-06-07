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
  };
}
