import {
  formatAdminDateTime,
  formatAuditActionLabel,
  formatAuditActor,
  formatAuditTarget,
} from "./admin-display-helpers.mjs";

function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getAdminActiveUserCount(users = []) {
  return users.filter((user) => user.status !== "paused").length;
}

export function createAdminUserRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const formatUserName = typeof options.formatUserName === "function" ? options.formatUserName : (user = {}) => user.name || user.email || "User";
  const getRoleLabel = typeof options.getRoleLabel === "function" ? options.getRoleLabel : (role) => role || "Role";
  const getUserScopeLabel = typeof options.getUserScopeLabel === "function" ? options.getUserScopeLabel : () => "";
  const renderUserAvatar = typeof options.renderUserAvatar === "function" ? options.renderUserAvatar : () => "";
  const getAdminUserInitials = typeof options.getAdminUserInitials === "function" ? options.getAdminUserInitials : () => "U";
  const getAuditState = typeof options.getAuditState === "function" ? options.getAuditState : () => ({ entries: [], loading: false, loadError: "" });
  const getSelectedUserId = typeof options.getSelectedUserId === "function" ? options.getSelectedUserId : () => "";
  const canManageUser = typeof options.canManageUser === "function" ? options.canManageUser : () => false;
  const hasWorkspaceScope = typeof options.hasWorkspaceScope === "function" ? options.hasWorkspaceScope : () => false;
  const getScopedTeams = typeof options.getScopedTeams === "function" ? options.getScopedTeams : () => [];
  const getClubById = typeof options.getClubById === "function" ? options.getClubById : () => null;
  const getUsersForTeam = typeof options.getUsersForTeam === "function" ? options.getUsersForTeam : () => [];
  const isLegacyTeam = typeof options.isLegacyTeam === "function" ? options.isLegacyTeam : () => false;
  const isLegacyTeamPlaceholderName = typeof options.isLegacyTeamPlaceholderName === "function" ? options.isLegacyTeamPlaceholderName : () => false;

  function renderAccountSummary(user) {
    if (!user) {
      return "";
    }
    return `
    <section class="admin-account-summary" aria-label="Account summary">
      <div><span>Account status</span><strong>${escapeHtml(user.status === "paused" ? "Paused" : "Active")}</strong></div>
      <div><span>Last sign in</span><strong>${escapeHtml(formatAdminDateTime(user.lastSignInAt))}</strong></div>
      <div><span>Created</span><strong>${escapeHtml(formatAdminDateTime(user.createdAt))}</strong></div>
      <div><span>Updated</span><strong>${escapeHtml(formatAdminDateTime(user.updatedAt))}</strong></div>
    </section>
  `;
  }

  function renderAuditLog() {
    const { entries = [], loading = false, loadError = "" } = getAuditState();
    if (loading && !entries.length) {
      return `<div class="admin-audit-empty">Loading recent activity...</div>`;
    }
    if (loadError) {
      return `<div class="admin-audit-empty is-error">${escapeHtml(loadError)}</div>`;
    }
    if (!entries.length) {
      return `<div class="admin-audit-empty">No admin activity logged yet.</div>`;
    }
    return entries
      .slice(0, 12)
      .map((entry) => {
        const targetLabel = formatAuditTarget(entry);
        const details = Array.isArray(entry?.details?.changedFields) && entry.details.changedFields.length
          ? `${entry.details.changedFields.length} field${entry.details.changedFields.length === 1 ? "" : "s"} changed`
          : entry?.details?.passwordAction
            ? "Password access changed"
            : entry?.details?.changedAccess?.length
              ? `${entry.details.changedAccess.length} section${entry.details.changedAccess.length === 1 ? "" : "s"} changed`
              : "";
        return `
        <article class="admin-audit-row">
          <span class="admin-audit-dot" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(formatAuditActionLabel(entry.action))}</strong>
            <small>${escapeHtml(entry.summary || targetLabel || "Admin activity")}</small>
            <small>${escapeHtml(formatAuditActor(entry))}${details ? ` · ${escapeHtml(details)}` : ""}</small>
          </div>
          <time>${escapeHtml(formatAdminDateTime(entry.createdAt))}</time>
        </article>
      `;
      })
      .join("");
  }

  function renderMiniUserStack(users = []) {
    const visibleUsers = users.slice(0, 5);
    if (!visibleUsers.length) {
      return `<span class="admin-org-empty">No users assigned</span>`;
    }
    const extraCount = Math.max(0, users.length - visibleUsers.length);
    return `
    <div class="admin-org-user-stack" aria-label="${escapeHtml(`${users.length} users`)}">
      ${visibleUsers
        .map(
          (user) => `
            <button type="button" title="${escapeHtml(formatUserName(user))}" data-admin-select-user="${escapeHtml(user.id)}">
              ${escapeHtml(getAdminUserInitials(user))}
            </button>
          `
        )
        .join("")}
      ${extraCount ? `<span>+${extraCount}</span>` : ""}
    </div>
  `;
  }

  function renderUserRow(adminUser, currentUser, structure) {
    const isSelected = adminUser.id === getSelectedUserId();
    const isSelf = adminUser.id === currentUser?.id;
    const statusLabel = adminUser.status === "paused" ? "Paused" : "Active";
    const canManageAccount = canManageUser(currentUser, adminUser, structure);
    const canRemoveUser = canManageUser(currentUser, adminUser, structure, { remove: true });
    return `
          <article class="admin-user-row${isSelected ? " is-selected" : ""}">
            <button type="button" class="admin-user-main" data-admin-select-user="${escapeHtml(adminUser.id)}">
              ${renderUserAvatar(adminUser, "staff-user-avatar")}
              <span class="admin-user-copy">
                <span class="admin-user-name-line">
                  <strong>${escapeHtml(formatUserName(adminUser))}</strong>
                  <em>${escapeHtml(getRoleLabel(adminUser.role))}</em>
                  <b class="is-${escapeHtml(adminUser.status === "paused" ? "paused" : "active")}">${escapeHtml(statusLabel)}</b>
                </span>
                <small>${escapeHtml(adminUser.title || "Staff")} · ${escapeHtml(adminUser.department || "Football")}</small>
                <small>${escapeHtml(getUserScopeLabel(adminUser, structure))}</small>
                <small>${escapeHtml(adminUser.email)}</small>
              </span>
            </button>
            <div class="admin-user-row-actions">
              <button type="button" class="admin-send-button admin-edit-user-button" data-admin-select-user="${escapeHtml(adminUser.id)}">Edit</button>
              ${
                canManageAccount
                  ? `<button type="button" class="admin-send-button" data-admin-send-credentials="${escapeHtml(adminUser.id)}">Send login</button><button type="button" class="admin-send-button" data-admin-generate-password="${escapeHtml(adminUser.id)}">Reset pass</button>`
                  : ""
              }
              ${canRemoveUser ? `<button type="button" class="staff-remove-button" data-admin-remove-user="${escapeHtml(adminUser.id)}">Remove</button>` : ""}
              ${isSelf ? `<span class="staff-self-pill">You</span>` : ""}
            </div>
          </article>
        `;
  }

  function renderGroupedUsers(users, currentUser, structure) {
    const platformScopedUsers = users.filter((user) => hasWorkspaceScope(user));
    const platformScopedUserIds = new Set(platformScopedUsers.map((user) => user.id));
    const scopedTeams = getScopedTeams(currentUser, structure).filter((team) => !isLegacyTeam(team) && !isLegacyTeamPlaceholderName(team.name));
    const teamGroups = scopedTeams
      .map((team) => ({
        team,
        club: getClubById(team.clubId, structure),
        users: getUsersForTeam(users, team.id, structure),
      }))
      .filter((group) => group.users.length);
    const groupedIds = new Set(teamGroups.flatMap((group) => group.users.map((user) => user.id)));
    const unassignedUsers = users.filter((user) => !groupedIds.has(user.id) && !platformScopedUserIds.has(user.id));
    const platformMarkup = platformScopedUsers.length
      ? `<section class="admin-user-team-group is-platform-scope"><header><div><strong>Football Science Live</strong><span>Platform operators and system admins</span></div><b>${platformScopedUsers.length}</b></header><div class="admin-user-team-list">${platformScopedUsers.map((adminUser) => renderUserRow(adminUser, currentUser, structure)).join("")}</div></section>`
      : "";
    const groupMarkup = teamGroups
      .map((group) => `<section class="admin-user-team-group"><header><div><strong>${escapeHtml(group.team.name)}</strong><span>${escapeHtml(group.club?.name || "Club")} · ${escapeHtml(group.team.level || "Team")}</span></div><div class="admin-user-team-actions"><b>${group.users.length}</b><button type="button" class="admin-send-button admin-add-user-button" data-admin-open-create-user="${escapeHtml(group.team.id)}">Add user</button></div></header><div class="admin-user-team-list">${group.users.map((adminUser) => renderUserRow(adminUser, currentUser, structure)).join("")}</div></section>`)
      .join("");
    const unassignedMarkup = unassignedUsers.length
      ? `<section class="admin-user-team-group is-unassigned"><header><div><strong>Unassigned users</strong><span>Needs team scope review</span></div><b>${unassignedUsers.length}</b></header><div class="admin-user-team-list">${unassignedUsers.map((adminUser) => renderUserRow(adminUser, currentUser, structure)).join("")}</div></section>`
      : "";
    return platformMarkup || groupMarkup || unassignedMarkup
      ? `${platformMarkup}${groupMarkup}${unassignedMarkup}`
      : `<p class="staff-message">No users in this admin scope.</p>`;
  }

  return {
    renderAccountSummary,
    renderAuditLog,
    renderMiniUserStack,
    renderUserRow,
    renderGroupedUsers,
  };
}
