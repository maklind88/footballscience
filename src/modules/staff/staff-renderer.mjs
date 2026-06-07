const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createStaffWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  formatUserName,
  getRoleLabel,
  getUserClubName,
  getUserScopeLabel,
  getUserTeamName,
  renderPasswordRevealInput,
  renderUserAvatar,
} = {}) {
  const renderUserRow = ({ staffUser, currentUser, structure, selectedUserId, isAdmin }) => {
    const isSelected = staffUser.id === selectedUserId;
    const isSelf = staffUser.id === currentUser?.id;
    return `
        <article class="staff-user-row${isSelected ? " is-selected" : ""}">
          <button type="button" data-staff-select-user="${escapeHtml(staffUser.id)}">
            ${renderUserAvatar(staffUser, "staff-user-avatar")}
            <span>
              <strong>${escapeHtml(formatUserName(staffUser))}</strong>
              <small>${escapeHtml(staffUser.title)} · ${escapeHtml(getRoleLabel(staffUser.role))}</small>
              <small>${escapeHtml(getUserScopeLabel(staffUser, structure))}</small>
            </span>
          </button>
          ${
            isAdmin
              ? isSelf
                ? `<span class="staff-self-pill">You</span>`
                : `<button type="button" class="staff-remove-button" data-staff-remove-user="${escapeHtml(staffUser.id)}">Remove</button>`
              : ""
          }
        </article>
      `;
  };

  const renderCreateUserEditor = ({ currentUser, structure, roleOptions = "", teamOptions = "", isOpen = false }) =>
    isOpen
      ? `
      <div class="admin-user-editor-overlay" data-staff-create-user-overlay role="dialog" aria-modal="true" aria-label="Add user">
        <article class="admin-card admin-user-editor-modal staff-create-user-modal">
          <div class="staff-card-head admin-user-editor-head">
            <div>
              <h2>Add user</h2>
              <span>${escapeHtml(getUserScopeLabel(currentUser, structure))}</span>
            </div>
            <button type="button" class="admin-send-button admin-user-editor-close" data-staff-close-create-user>Close</button>
          </div>
          <form id="staffUserForm" class="platform-form staff-create-form">
            <label>
              <span>First name</span>
              <input name="firstName" required />
            </label>
            <label>
              <span>Last name</span>
              <input name="lastName" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required />
            </label>
            <label>
              <span>Username</span>
              <input name="username" required />
            </label>
            <label>
              <span>Password</span>
              ${renderPasswordRevealInput("password", "Optional; leave empty for temporary")}
            </label>
            <label>
              <span>Confirm password</span>
              ${renderPasswordRevealInput("passwordConfirm", "Repeat password")}
            </label>
            <label>
              <span>Role</span>
              <select name="role">${roleOptions}</select>
            </label>
            <label>
              <span>Title</span>
              <input name="title" value="Coach" />
            </label>
            <label>
              <span>Department</span>
              <input name="department" value="Football" />
            </label>
            <label class="profile-wide">
              <span>Team scope</span>
              <select name="teamId">${teamOptions}</select>
            </label>
            <div class="profile-form-footer">
              <span>Creates a central Supabase account in this team scope.</span>
              <button type="submit">Add user</button>
            </div>
          </form>
        </article>
      </div>
    `
      : "";

  const renderSelectedProfile = ({ selectedUser, structure }) =>
    selectedUser
      ? `
<div class="profile-preview-head">
${renderUserAvatar(selectedUser, "profile-avatar")}
<div>
<h2>${escapeHtml(formatUserName(selectedUser))}</h2>
<span>${escapeHtml(selectedUser.email)}</span>
</div>
</div>
<dl class="profile-detail-list">
<div><dt>Role</dt><dd>${escapeHtml(getRoleLabel(selectedUser.role))}</dd></div>
<div><dt>Title</dt><dd>${escapeHtml(selectedUser.title)}</dd></div>
<div><dt>Department</dt><dd>${escapeHtml(selectedUser.department)}</dd></div>
<div><dt>Club</dt><dd>${escapeHtml(getUserClubName(selectedUser, structure))}</dd></div>
<div><dt>Team</dt><dd>${escapeHtml(getUserTeamName(selectedUser, structure))}</dd></div>
<div><dt>Status</dt><dd>${escapeHtml(selectedUser.status)}</dd></div>
</dl>
`
      : "";

  const renderWorkspace = ({
    currentUser,
    users = [],
    structure,
    selectedUser = null,
    selectedUserId = "",
    isAdmin = false,
    createUserEditorOpen = false,
    roleOptions = "",
    teamOptions = "",
    message = "",
  } = {}) => {
    const userRows = users
      .map((staffUser) =>
        renderUserRow({
          staffUser,
          currentUser,
          structure,
          selectedUserId,
          isAdmin,
        })
      )
      .join("");
    const staffCreateUserEditor = renderCreateUserEditor({
      currentUser,
      structure,
      roleOptions,
      teamOptions,
      isOpen: isAdmin && createUserEditorOpen,
    });

    return `
    <section class="staff-shell">
      <header class="staff-hero-card">
        <div>
          <p class="placeholder-tag">Staff</p>
          <h1 class="profile-title">People</h1>
        </div>
        <span class="profile-role-pill">${isAdmin ? "Admin" : "View"}</span>
      </header>
      ${message ? `<p class="staff-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</p>` : ""}
      <section class="staff-layout">
        <div class="staff-list-card">
          <div class="staff-card-head">
            <h2>Users</h2>
            <span>${users.length}</span>
            ${isAdmin ? `<button type="button" class="admin-send-button staff-open-create-user" data-staff-open-create-user>Add user</button>` : ""}
          </div>
          <div class="staff-user-list">${userRows}</div>
        </div>
        <div class="staff-profile-card">
          ${renderSelectedProfile({ selectedUser, structure })}
        </div>
      </section>
      ${staffCreateUserEditor}
      ${isAdmin ? "" : `<div class="staff-create-card"><h2>Admin only</h2></div>`}
    </section>
  `;
  };

  return {
    renderWorkspace,
  };
}
