const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createProfileWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  formatUserName,
  getRoleLabel,
  renderTaskList,
  renderUserAvatar,
} = {}) {
  const renderWorkspace = ({
    user,
    users = [],
    openPersonalTasks = [],
    completedPersonalTasks = [],
    hasProfilePhoto = false,
    message = "",
  } = {}) => `
    <section class="profile-shell">
      <header class="profile-hero-card">
        ${renderUserAvatar(user, "profile-avatar")}
        <div>
          <p class="placeholder-tag">Profile</p>
          <h1 class="profile-title">${escapeHtml(formatUserName(user))}</h1>
        </div>
        <span class="profile-role-pill">${escapeHtml(getRoleLabel(user.role))}</span>
      </header>
      <form id="profileForm" class="platform-form profile-form">
        ${message ? `<p class="staff-message profile-wide platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</p>` : ""}
        <div class="profile-image-field profile-wide">
          <div>
            <span>Profile image</span>
            <strong>${hasProfilePhoto ? "Custom photo" : "Initials avatar"}</strong>
          </div>
          <div class="profile-photo-controls">
            <label class="profile-upload-button" for="profileImageUpload">
              <input id="profileImageUpload" type="file" accept="image/*" />
              <span>Upload photo</span>
            </label>
            ${
              hasProfilePhoto
                ? `<button type="button" class="profile-remove-photo-button" data-profile-remove-photo>Remove</button>`
                : ""
            }
          </div>
        </div>
        <label>
          <span>First name</span>
          <input name="firstName" value="${escapeHtml(user.firstName)}" autocomplete="given-name" required />
        </label>
        <label>
          <span>Last name</span>
          <input name="lastName" value="${escapeHtml(user.lastName)}" autocomplete="family-name" required />
        </label>
        <label>
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(user.email)}" autocomplete="email" required />
        </label>
        <label>
          <span>Username</span>
          <input name="username" value="${escapeHtml(user.username)}" autocomplete="username" required />
        </label>
        <label>
          <span>Title</span>
          <input name="title" value="${escapeHtml(user.title)}" />
        </label>
        <label>
          <span>Department</span>
          <input name="department" value="${escapeHtml(user.department)}" />
        </label>
        <label class="profile-wide">
          <span>Team</span>
          <input name="team" value="${escapeHtml(user.team)}" />
        </label>
        <div class="profile-form-footer">
          <span>${escapeHtml(getRoleLabel(user.role))}</span>
          <button type="submit">Save</button>
        </div>
      </form>
      <section class="profile-todo-card">
        <header class="dashboard-panel-head">
          <div>
            <p class="dashboard-card-kicker">Personal</p>
            <h2>To-Do</h2>
          </div>
          <span class="profile-role-pill">${openPersonalTasks.length} open</span>
        </header>
        <form id="profileTodoForm" class="profile-todo-form" novalidate>
          <input name="title" type="text" autocomplete="off" placeholder="Add your own To-Do" required />
          <button type="submit">Add</button>
        </form>
        ${renderTaskList(openPersonalTasks, users, user)}
        ${
          completedPersonalTasks.length
            ? `<div class="profile-completed-todos">${renderTaskList(completedPersonalTasks, users, user)}</div>`
            : ""
        }
      </section>
    </section>
  `;

  return {
    renderWorkspace,
  };
}
