import {
  getHomeAppearanceConfig,
  getHomeAppearanceSections,
  getHomeSectionAppearance,
} from "../../core/appearance-governance.mjs";

export function createDashboardHomeCardsRenderer(dependencies = {}) {
  const {
    escapeHtml = (value) => String(value ?? ""),
    renderTaskList = () => "",
    resolveUserLabel = () => "Unknown",
  } = dependencies;

  function getDashboardTopPriorityTasks(context, limit = 3) {
    const currentUserId = context.currentUser?.id;
    const taskMap = new Map();

    [...context.myOpenTasks, ...context.delegatedOpenTasks, ...context.personalOpenTasks].forEach((task) => {
      if (task?.id && !taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });

    return [...taskMap.values()]
      .sort((first, second) => {
        const firstOwner = first.assignedTo === currentUserId;
        const secondOwner = second.assignedTo === currentUserId;
        const firstCreatedByMe = first.createdBy === currentUserId;
        const secondCreatedByMe = second.createdBy === currentUserId;
        const firstScore =
          (firstOwner ? 2 : 0) + (firstCreatedByMe && !firstOwner ? 1 : 0) + (first.scope === "team" ? 1 : 0);
        const secondScore =
          (secondOwner ? 2 : 0) + (secondCreatedByMe && !secondOwner ? 1 : 0) + (second.scope === "team" ? 1 : 0);

        if (firstScore !== secondScore) {
          return secondScore - firstScore;
        }

        return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
      })
      .slice(0, limit);
  }

  function getDashboardTopTaskMeta(task, users, currentUser) {
    const assigneeLabel = resolveUserLabel(task.assignedTo, users);
    const creatorLabel = resolveUserLabel(task.createdBy, users);

    if (task.scope === "personal") {
      return "Personal";
    }

    if (task.assignedTo === currentUser?.id && task.createdBy !== currentUser?.id) {
      return "Your task";
    }

    if (task.createdBy === currentUser?.id && task.assignedTo !== currentUser?.id) {
      return `Delegated to ${assigneeLabel}`;
    }

    if (task.assignedTo === task.createdBy) {
      return `Owner: ${assigneeLabel}`;
    }

    return `From ${creatorLabel}`;
  }

  function renderTopTaskRow(task, users, currentUser) {
    return `
    <div class="dashboard-top-task-row">
      <button
        type="button"
        class="dashboard-task-toggle"
        data-dashboard-toggle-task="${escapeHtml(task.id)}"
        aria-label="Mark ${escapeHtml(task.title)} as done"
      >
        <span></span>
      </button>
      <div class="dashboard-top-task-copy">
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(getDashboardTopTaskMeta(task, users, currentUser))}</small>
      </div>
    </div>
  `;
  }

  function getSectionClasses(sectionAppearance, baseClass) {
    return `${baseClass} dashboard-appearance-density-${escapeHtml(sectionAppearance.density)} dashboard-appearance-tone-${escapeHtml(sectionAppearance.tone)}`;
  }

  function renderPanelHeader(sectionAppearance, countMarkup = "") {
    return `
        <header class="dashboard-panel-head">
          <div>
            <p class="dashboard-card-kicker">${escapeHtml(sectionAppearance.eyebrow)}</p>
            <h2>${escapeHtml(sectionAppearance.title)}</h2>
          </div>
          ${countMarkup}
        </header>
    `;
  }

  function renderTopTasksRow(context, appearanceConfig = {}) {
    const topPriorityTasks = getDashboardTopPriorityTasks(context, 3);
    const sectionAppearance = getHomeSectionAppearance(appearanceConfig, "topTasks");

    return `
    <section class="dashboard-top-task-band" aria-label="Top tasks">
      <article class="${getSectionClasses(sectionAppearance, "dashboard-panel dashboard-top-task-panel")}" data-dashboard-appearance-type="${escapeHtml(sectionAppearance.componentType)}">
        ${renderPanelHeader(sectionAppearance, '<span class="dashboard-panel-count">Today</span>')}
        <div class="dashboard-top-task-list">
          ${
            topPriorityTasks.length
              ? topPriorityTasks
                  .map((task) => renderTopTaskRow(task, context.users, context.currentUser))
                  .join("")
              : `<div class="dashboard-top-task-empty" role="note">No top tasks yet.</div>`
          }
        </div>
        <div class="dashboard-panel-actions">
          <button type="button" data-dashboard-open-top-tasks>Open task board</button>
          <button type="button" data-dashboard-focus="task">Add task</button>
        </div>
      </article>
    </section>
  `;
  }

  function renderTodoCommand(context, staffOptions, appearanceConfig = {}) {
    const sectionAppearance = getHomeSectionAppearance(appearanceConfig, "todo");
    return `
    <article class="${getSectionClasses(sectionAppearance, "dashboard-panel dashboard-todo-command")}" data-dashboard-appearance-type="${escapeHtml(sectionAppearance.componentType)}">
      ${renderPanelHeader(
        sectionAppearance,
        `
        <div class="dashboard-summary-strip" aria-label="Task overview">
          <span><strong>${context.myOpenTasks.length}</strong><small>Mine</small></span>
          <span><strong>${context.delegatedOpenTasks.length}</strong><small>Delegated</small></span>
          <span><strong>${context.personalOpenTasks.length}</strong><small>Personal</small></span>
        </div>
        `
      )}
      <div class="dashboard-todo-columns">
        <section>
          <h3>My Work</h3>
          ${renderTaskList(context.myOpenTasks, context.users, context.currentUser, { showCreator: true, limit: 3 })}
        </section>
        <section>
          <h3>Personal</h3>
          <form id="dashboardPersonalTodoForm" class="profile-todo-form dashboard-inline-form">
            <input name="title" type="text" autocomplete="off" placeholder="Add your own To-Do" required />
            <button type="submit">Add</button>
          </form>
          ${renderTaskList(context.personalOpenTasks, context.users, context.currentUser, { limit: 3 })}
        </section>
        <section>
          <h3>Delegate</h3>
          <form id="dashboardTaskForm" class="dashboard-task-form dashboard-task-form-compact">
            <label>
              <span>Task</span>
              <input name="title" type="text" autocomplete="off" placeholder="Add a task" required />
            </label>
            <label>
              <span>Owner</span>
              <select name="assignedTo">${staffOptions}</select>
            </label>
            <button type="submit">Add</button>
          </form>
          ${renderTaskList(context.delegatedOpenTasks, context.users, context.currentUser, { showAssignee: true, limit: 3 })}
        </section>
      </div>
    </article>
  `;
  }

  function renderAlertsCard(context, appearanceConfig = {}) {
    const alerts = context.alerts ?? [];
    const sectionAppearance = getHomeSectionAppearance(appearanceConfig, "alerts");

    return `
    <article class="${getSectionClasses(sectionAppearance, "dashboard-panel dashboard-alerts-card")}" data-dashboard-appearance-type="${escapeHtml(sectionAppearance.componentType)}">
      ${renderPanelHeader(sectionAppearance, `<span class="dashboard-panel-count">${alerts.length}</span>`)}
      <div class="dashboard-alert-list">
        ${
          alerts
            .map(
              (alert) => `
                <button
                  type="button"
                  class="dashboard-alert-item is-${escapeHtml(alert.tone || "neutral")}"
                  ${
                    alert.workspaceId
                      ? `data-open-workspace="${escapeHtml(alert.workspaceId)}"`
                      : alert.action === "session"
                        ? `data-dashboard-open-session-date="${escapeHtml(alert.dateValue || context.todayValue)}"`
                        : alert.focus
                          ? `data-dashboard-focus="${escapeHtml(alert.focus)}"`
                          : ""
                  }
                  ${
                    alert.dateValue && alert.workspaceId === "schedule"
                      ? `data-dashboard-open-schedule-date="${escapeHtml(alert.dateValue)}"`
                      : ""
                  }
                >
                  <strong>${escapeHtml(alert.title)}</strong>
                  <span>${escapeHtml(alert.detail)}</span>
                </button>
              `
            )
            .join("") || `<div class="dashboard-empty-space" aria-hidden="true"></div>`
        }
      </div>
    </article>
  `;
  }

  function renderHomeSection(section, context, staffOptions, appearanceConfig) {
    if (section.id === "topTasks") {
      return renderTopTasksRow(context, appearanceConfig);
    }
    if (section.id === "todo") {
      return renderTodoCommand(context, staffOptions, appearanceConfig);
    }
    if (section.id === "alerts") {
      return renderAlertsCard(context, appearanceConfig);
    }
    return "";
  }

  function render(context, staffOptions, appearanceConfig = {}) {
    const homeAppearance = getHomeAppearanceConfig(appearanceConfig);
    const sections = getHomeAppearanceSections(appearanceConfig);
    const mainSections = sections
      .filter((section) => section.id === "topTasks")
      .map((section) => renderHomeSection(section, context, staffOptions, appearanceConfig))
      .join("");
    const operationSections = sections
      .filter((section) => section.id !== "topTasks")
      .map((section) => renderHomeSection(section, context, staffOptions, appearanceConfig))
      .join("");

    return `
    <section class="dashboard-workspace-layout dashboard-home-ops dashboard-home-density-${escapeHtml(homeAppearance.density)} dashboard-home-theme-${escapeHtml(homeAppearance.theme)}" aria-label="Home dashboard">
      <section class="dashboard-home-grid" aria-label="Coach workspace">
        <section class="dashboard-home-main" aria-label="Work queue and alerts">
          ${mainSections}
          <section class="dashboard-symmetric-row" aria-label="Coach operations">
            ${operationSections}
          </section>
        </section>
      </section>
    </section>
  `;
  }

  return Object.freeze({
    render,
    renderTopTasksRow,
    renderTodoCommand,
    renderAlertsCard,
    getDashboardTopPriorityTasks,
    renderTopTaskRow,
    getDashboardTopTaskMeta,
  });
}
