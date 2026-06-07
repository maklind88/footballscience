function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createDashboardTaskListRenderer(dependencies = {}) {
  const {
    escapeHtml = defaultEscapeHtml,
    formatDateTime = () => "",
    resolveUserLabel = () => "Unknown",
    canRemoveTask = () => false,
  } = dependencies;

  function renderTaskRow(task, users, currentUser, options = {}) {
    const assignee = resolveUserLabel(task.assignedTo, users);
    const creator = resolveUserLabel(task.createdBy, users);
    const isDone = task.status === "done";
    const canRemove = canRemoveTask(task, currentUser);
    const meta = options.showCreator
      ? `From ${creator}`
      : options.showAssignee
        ? `To ${assignee}`
        : task.scope === "personal"
          ? "Personal"
          : `From ${creator}`;
    return `
    <div class="dashboard-task-row${isDone ? " is-done" : ""}">
      <button
        type="button"
        class="dashboard-task-toggle"
        data-dashboard-toggle-task="${escapeHtml(task.id)}"
        aria-label="${isDone ? "Reopen task" : "Complete task"}"
      >
        <span></span>
      </button>
      <div class="dashboard-task-copy">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.note ? `<span>${escapeHtml(task.note)}</span>` : ""}
        <small>${escapeHtml(meta)}${task.createdAt ? ` · ${escapeHtml(formatDateTime(task.createdAt))}` : ""}</small>
      </div>
      ${
        canRemove
          ? `<button type="button" class="dashboard-row-action" data-dashboard-remove-task="${escapeHtml(task.id)}">Remove</button>`
          : ""
      }
    </div>
  `;
  }

  function renderTaskList(tasks, users, currentUser, options = {}) {
    const visibleTasks = Number.isFinite(Number(options.limit)) ? tasks.slice(0, Number(options.limit)) : tasks;
    if (!visibleTasks.length) {
      return `<div class="dashboard-empty-space" aria-hidden="true"></div>`;
    }
    return `
    <div class="dashboard-task-list">
      ${visibleTasks.map((task) => renderTaskRow(task, users, currentUser, options)).join("")}
    </div>
  `;
  }

  return {
    renderTaskList,
    renderTaskRow,
  };
}
