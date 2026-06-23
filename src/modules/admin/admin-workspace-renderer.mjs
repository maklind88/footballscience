const defaultEscapeHtml = (value = "") =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createAdminWorkspaceRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const formatAdminDateTime = typeof options.formatAdminDateTime === "function" ? options.formatAdminDateTime : (value) => value || "";
  const formatUserName = typeof options.formatUserName === "function" ? options.formatUserName : (user = {}) => user.name || user.email || "User";
  const getRoleLabel = typeof options.getRoleLabel === "function" ? options.getRoleLabel : (role) => role || "Role";
  const renderAdminAccountSummary = typeof options.renderAdminAccountSummary === "function" ? options.renderAdminAccountSummary : () => "";
  const renderAdminAuditLog = typeof options.renderAdminAuditLog === "function" ? options.renderAdminAuditLog : () => "";
  const renderAdminGroupedUsers = typeof options.renderAdminGroupedUsers === "function" ? options.renderAdminGroupedUsers : () => "";
  const renderAdminRoleAccessForm = typeof options.renderAdminRoleAccessForm === "function" ? options.renderAdminRoleAccessForm : () => "";
  const renderAdminRoleOptions = typeof options.renderAdminRoleOptions === "function" ? options.renderAdminRoleOptions : () => "";
  const renderAdminStructurePanel = typeof options.renderAdminStructurePanel === "function" ? options.renderAdminStructurePanel : () => "";
  const renderAdminTeamOptions = typeof options.renderAdminTeamOptions === "function" ? options.renderAdminTeamOptions : () => "";
  const renderAdminTransferRoomAccessPanel = typeof options.renderAdminTransferRoomAccessPanel === "function" ? options.renderAdminTransferRoomAccessPanel : () => "";
  const renderPasswordRevealInput = typeof options.renderPasswordRevealInput === "function" ? options.renderPasswordRevealInput : () => "";
  const renderPlatformAppearanceGovernancePanel =
    typeof options.renderPlatformAppearanceGovernancePanel === "function" ? options.renderPlatformAppearanceGovernancePanel : () => "";
  const renderPlatformReadinessDashboard = typeof options.renderPlatformReadinessDashboard === "function" ? options.renderPlatformReadinessDashboard : () => "";
  const titleSuggestions = Array.isArray(options.titleSuggestions) ? options.titleSuggestions : [];
  const departmentSuggestions = Array.isArray(options.departmentSuggestions) ? options.departmentSuggestions : [];

  function renderNotAdmin() {
    return `
      <section class="admin-shell">
        <header class="admin-hero-card">
          <div>
            <p class="placeholder-tag">Admin</p>
            <h1 class="profile-title">Admin</h1>
          </div>
          <span class="profile-role-pill">Admin only</span>
        </header>
      </section>
    `;
  }

  function renderSelectedUserEditor(context = {}) {
    const { currentUser, selectedUser, selectedUserFieldDisabled = "", selectedUserIsSelf = false, canManageSelectedUser = false, canRemoveSelectedUser = false, structure } = context;
    if (!selectedUser || !context.adminUserEditorOpen) {
      return "";
    }
    const roleOptions = renderAdminRoleOptions(currentUser, selectedUser?.role || "coach");
    const statusOptions = ["active", "paused"]
      .map(
        (status) =>
          `<option value="${escapeHtml(status)}" ${status === selectedUser?.status ? "selected" : ""}>${escapeHtml(status === "active" ? "Active" : "Paused")}</option>`
      )
      .join("");
    return `
      <div class="admin-user-editor-overlay" data-admin-user-editor-overlay role="dialog" aria-modal="true" aria-label="${escapeHtml(`Edit ${formatUserName(selectedUser)}`)}">
        <article class="admin-card admin-user-editor-modal">
          <div class="staff-card-head admin-user-editor-head">
            <div>
              <h2>Edit User</h2>
              <span>${escapeHtml(formatUserName(selectedUser))} · ${escapeHtml(getRoleLabel(selectedUser.role))}</span>
            </div>
            <button type="button" class="admin-send-button admin-user-editor-close" data-admin-close-user-editor>Close</button>
          </div>
          ${renderAdminAccountSummary(selectedUser)}
          <form id="adminUserForm" class="platform-form admin-user-form">
<label><span>First name</span><input name="firstName" value="${escapeHtml(selectedUser.firstName)}" ${selectedUserFieldDisabled} required /></label>
<label><span>Last name</span><input name="lastName" value="${escapeHtml(selectedUser.lastName)}" ${selectedUserFieldDisabled} required /></label>
<label><span>Email</span><input name="email" type="email" value="${escapeHtml(selectedUser.email)}" ${selectedUserFieldDisabled} required /></label>
<label><span>Username</span><input name="username" value="${escapeHtml(selectedUser.username)}" ${selectedUserFieldDisabled} required /></label>
<label><span>Role</span><select name="role" ${selectedUserIsSelf || !canManageSelectedUser ? "disabled" : ""}>${roleOptions}</select></label>
<label><span>Status</span><select name="status" ${selectedUserIsSelf || !canManageSelectedUser ? "disabled" : ""}>${statusOptions}</select></label>
<label><span>Title</span><input name="title" list="adminTitleSuggestions" value="${escapeHtml(selectedUser.title)}" ${selectedUserFieldDisabled} /></label>
<label><span>Department</span><input name="department" list="adminDepartmentSuggestions" value="${escapeHtml(selectedUser.department)}" ${selectedUserFieldDisabled} /></label>
<label><span>Set password</span>${renderPasswordRevealInput("password", "Optional; leave empty to keep current")}</label>
<label><span>Confirm password</span>${renderPasswordRevealInput("passwordConfirm", "Repeat new password")}</label>
<label class="profile-wide"><span>Team scope</span><select name="teamId" ${selectedUserIsSelf || !canManageSelectedUser ? "disabled" : ""}>${renderAdminTeamOptions(currentUser, structure, context.selectedUserTeamId)}</select></label>
<div class="profile-form-footer">
<span>${selectedUserIsSelf ? "Your own admin role and status are protected." : "Save user sets this password in Supabase. Reset actions replace the old password."}</span>
<span class="admin-selected-user-actions">
${canManageSelectedUser ? `<button type="submit">Save</button>` : ""}
${canManageSelectedUser ? `<button type="button" data-admin-reset-password="${escapeHtml(selectedUser.id)}">Reset email</button>` : ""}
${canManageSelectedUser ? `<button type="button" data-admin-generate-selected-password="${escapeHtml(selectedUser.id)}">Reset pass</button>` : ""}
${canManageSelectedUser ? `<button type="button" data-admin-send-selected="${escapeHtml(selectedUser.id)}">Send login</button>` : ""}
${canRemoveSelectedUser ? `<button type="button" class="staff-remove-button" data-admin-remove-user="${escapeHtml(selectedUser.id)}">Remove</button>` : ""}
</span>
</div>
</form>
        </article>
      </div>
    `;
  }

  function renderCreateUserEditor(context = {}) {
    if (!context.adminCreateUserEditorOpen) {
      return "";
    }
    const { createUserTeam, createUserClub, createUserTeamId, currentUser, structure } = context;
    const draft = context.createUserDraft && typeof context.createUserDraft === "object" ? context.createUserDraft : {};
    const getDraftValue = (name, fallback = "") => draft[name] ?? fallback;
    const createRoleOptions = renderAdminRoleOptions(currentUser, getDraftValue("role", context.createRole));
    const createStatusValue = getDraftValue("status", "active");
    const createStatusOptions = ["active", "paused"]
      .map((status) => `<option value="${escapeHtml(status)}" ${status === createStatusValue ? "selected" : ""}>${escapeHtml(status === "active" ? "Active" : "Paused")}</option>`)
      .join("");
    return `
      <div class="admin-user-editor-overlay" data-admin-create-user-overlay role="dialog" aria-modal="true" aria-label="Create user">
        <article class="admin-card admin-user-editor-modal admin-create-user-modal" tabindex="-1">
          <div class="staff-card-head admin-user-editor-head">
            <div>
              <h2>New User</h2>
              <span>${escapeHtml(createUserTeam ? `${createUserClub?.name || "Club"} · ${createUserTeam.name}` : "Choose team scope")}</span>
            </div>
            <button type="button" class="admin-send-button admin-user-editor-close" data-admin-close-create-user>Close</button>
          </div>
          <form id="adminCreateUserForm" class="platform-form admin-user-form admin-create-form">
            <label><span>First name</span><input name="firstName" value="${escapeHtml(getDraftValue("firstName"))}" required /></label>
            <label><span>Last name</span><input name="lastName" value="${escapeHtml(getDraftValue("lastName"))}" required /></label>
            <label><span>Email</span><input name="email" type="email" value="${escapeHtml(getDraftValue("email"))}" required /></label>
            <label><span>Username</span><input name="username" value="${escapeHtml(getDraftValue("username"))}" required /></label>
            <label><span>Role</span><select name="role">${createRoleOptions}</select></label>
            <label><span>Status</span><select name="status">${createStatusOptions}</select></label>
            <label><span>Title</span><input name="title" list="adminTitleSuggestions" value="${escapeHtml(getDraftValue("title", "Scout"))}" /></label>
            <label><span>Password</span>${renderPasswordRevealInput("password", "Optional; leave empty for temporary", "new-password", getDraftValue("password"))}</label>
            <label><span>Confirm password</span>${renderPasswordRevealInput("passwordConfirm", "Repeat password", "new-password", getDraftValue("passwordConfirm"))}</label>
            <label><span>Department</span><input name="department" list="adminDepartmentSuggestions" value="${escapeHtml(getDraftValue("department", "Scouting"))}" /></label>
            <label class="profile-wide"><span>Team scope</span><select name="teamId">${renderAdminTeamOptions(currentUser, structure, getDraftValue("teamId", createUserTeamId))}</select></label>
            <div class="profile-form-footer"><span>Creates the account directly in this team's admin scope.</span><button type="button" data-admin-create-user-submit>Create user</button></div>
          </form>
        </article>
      </div>
    `;
  }

  function renderSuggestionDatalists() {
    return `
      <datalist id="adminTitleSuggestions">${titleSuggestions.map((title) => `<option value="${escapeHtml(title)}"></option>`).join("")}</datalist>
      <datalist id="adminDepartmentSuggestions">${departmentSuggestions.map((department) => `<option value="${escapeHtml(department)}"></option>`).join("")}</datalist>
    `;
  }

  function renderWorkspace(context = {}) {
    const { currentUser, currentUserIsPlatformAdmin = false, message = "", roles = [], structure, users = [] } = context;
    const userRows = renderAdminGroupedUsers(users, currentUser, structure);
    return `
    <section class="admin-shell">
      <header class="admin-hero-card">
        <div><p class="placeholder-tag">Admin</p><h1 class="profile-title">Access & Users</h1></div>
        <span class="profile-role-pill">Admin</span>
      </header>
      ${message ? `<p class="staff-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</p>` : ""}
      ${renderAdminStructurePanel(currentUser, structure, users)}
      ${currentUserIsPlatformAdmin ? renderPlatformReadinessDashboard() : ""}
      ${currentUserIsPlatformAdmin ? renderPlatformAppearanceGovernancePanel() : ""}
      <section class="admin-layout is-users-only">
        <article class="admin-card">
          <div class="staff-card-head"><h2>Users</h2><span>${users.length}</span></div>
          <div class="admin-user-list">${userRows}</div>
        </article>
      </section>
      ${renderSelectedUserEditor(context)}
      ${renderCreateUserEditor(context)}
      ${renderSuggestionDatalists()}
      ${currentUserIsPlatformAdmin ? renderAdminTransferRoomAccessPanel(users, structure) : ""}
      ${
        currentUserIsPlatformAdmin
          ? `
${renderAdminRoleAccessForm(roles)}
<article class="admin-card admin-audit-card">
<div class="staff-card-head">
<div><h2>Recent Admin Activity</h2><span>${context.adminAuditLoadedAt ? `Updated ${escapeHtml(formatAdminDateTime(context.adminAuditLoadedAt))}` : "Central audit log"}</span></div>
<button type="button" class="admin-send-button" data-admin-refresh-audit>Refresh</button>
</div>
<div class="admin-audit-list">${renderAdminAuditLog()}</div>
</article>
`
          : ""
      }
    </section>
  `;
  }

  return {
    renderNotAdmin,
    renderWorkspace,
  };
}
