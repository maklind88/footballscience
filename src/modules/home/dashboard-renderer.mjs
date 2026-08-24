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

  function renderPresentationModeCard(birthdayStripMarkup = "") {
    const cards = [
      {
        type: "team",
        title: "Team Meeting",
        icon: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7.5 9.5h9M9 13h6"/>',
      },
      {
        type: "technical",
        title: "Technical Staff Meeting",
        icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      },
    ];

    return `
      <section class="dashboard-presentation-band" aria-label="Presentation Mode">
        ${cards
          .map(
            (card, index) => `
        <article class="dashboard-panel dashboard-presentation-card is-${escapeHtml(card.type)}" data-dashboard-presentation-card data-dashboard-presentation-type="${escapeHtml(card.type)}">
          <div class="dashboard-presentation-visual" aria-hidden="true">
            <svg viewBox="0 0 24 24">${card.icon}</svg>
          </div>
          <div class="dashboard-presentation-copy">
            <p class="dashboard-card-kicker">Presentation Mode</p>
            <h2>${escapeHtml(card.title)}</h2>
          </div>
          <div class="dashboard-presentation-action">
            <button type="button" data-dashboard-open-presentation>Open</button>
          </div>
        </article>
        ${index === 0 ? birthdayStripMarkup : ""}
            `
          )
          .join("")}
        <aside
          id="dashboardSchedulePreview"
          class="dashboard-schedule-preview"
          aria-label="Current month schedule"
        ></aside>
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
          <form id="dashboardPersonalTodoForm" class="profile-todo-form dashboard-inline-form" novalidate>
            <input name="title" type="text" autocomplete="off" placeholder="Add your own To-Do" required />
            <button type="submit">Add</button>
          </form>
          ${renderTaskList(context.personalOpenTasks, context.users, context.currentUser, { limit: 3 })}
        </section>
        <section>
          <h3>Delegate</h3>
          <form id="dashboardTaskForm" class="dashboard-task-form dashboard-task-form-compact" novalidate>
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

  function renderBirthdayAgeLabel(item = {}) {
    const age = Number(item.turningAge);
    return Number.isFinite(age) && age > 0 ? `Turns ${age}` : "";
  }

  function renderBirthdayNewsItem(item = {}) {
    const detail = [item.number ? `#${item.number}` : "", item.primaryRole].filter(Boolean).join(" - ");
    const meta = [renderBirthdayAgeLabel(item), item.relativeLabel].filter(Boolean).join(" - ");
    return `
      <div class="dashboard-birthday-item">
        <span class="dashboard-birthday-date">${escapeHtml(item.dateLabel || item.nextBirthday || "")}</span>
        <span class="dashboard-birthday-copy">
          <strong>${escapeHtml(item.name || "Player")}</strong>
          <small>${escapeHtml(detail || meta || "Player profile")}</small>
        </span>
        <span class="dashboard-birthday-meta">${escapeHtml(meta)}</span>
      </div>
    `;
  }

  function renderBirthdayNewsCard(context) {
    const calendar = context.birthdayCalendar || {};
    const items = Array.isArray(calendar.items) ? calendar.items : [];
    const thisMonthCount = Math.max(0, Number(calendar.thisMonthCount) || 0);
    const trackedCount = Math.max(0, Number(calendar.trackedCount) || 0);
    const withBirthDateCount = Math.max(0, Number(calendar.withBirthDateCount) || items.length);
    const missingBirthDateCount = Math.max(0, Number(calendar.missingBirthDateCount) || 0);
    const emptyText = trackedCount
      ? "Add birth dates in player profiles to show upcoming birthdays."
      : "Add players with birth dates to show upcoming birthdays.";

    return `
    <article class="dashboard-panel dashboard-birthday-card" aria-label="Upcoming player birthdays">
      <header class="dashboard-panel-head">
        <div>
          <p class="dashboard-card-kicker">Birthday Calendar</p>
          <h2>Upcoming birthdays</h2>
        </div>
        <span class="dashboard-panel-count">${escapeHtml(String(thisMonthCount))} this month</span>
      </header>
      ${
        items.length
          ? `<div class="dashboard-birthday-list">${items.map(renderBirthdayNewsItem).join("")}</div>`
          : `<div class="dashboard-birthday-empty" role="note">
              <strong>No birthdays to show</strong>
              <span>${escapeHtml(emptyText)}</span>
            </div>`
      }
      <footer class="dashboard-birthday-footer">
        <span>${escapeHtml(String(withBirthDateCount))}/${escapeHtml(String(trackedCount))} profiles with dates</span>
        ${
          missingBirthDateCount
            ? `<span>${escapeHtml(String(missingBirthDateCount))} missing dates</span>`
            : ""
        }
        <button type="button" class="secondary dashboard-link-button" data-open-workspace="player-profiles">Squad profiles</button>
      </footer>
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

  function renderTutorialModal({ shouldShowNext = false } = {}) {
    return `
    <div class="dashboard-modal-backdrop" data-dashboard-modal-close></div>
    <section class="dashboard-modal-card" role="dialog" aria-modal="true" aria-labelledby="dashboardTutorialTitle">
      <header class="dashboard-modal-head">
        <div>
          <p class="dashboard-modal-kicker">First login</p>
          <h2 id="dashboardTutorialTitle">Football Science Coaching Platform</h2>
        </div>
        <button type="button" class="dashboard-modal-close" data-dashboard-tutorial-save aria-label="Close tutorial">x</button>
      </header>
      <div class="dashboard-tutorial-steps">
        <div>
          <strong>Home</strong>
          <span>Your staff workspace for tasks, personal To-Do and team chat.</span>
        </div>
        <div>
          <strong>Navigate</strong>
          <span>Use the top icons for Schedule, Periodization, Sessions and the other modules.</span>
        </div>
        <div>
          <strong>Profile</strong>
          <span>Your own To-Do list starts on Home and stays mirrored on Profile.</span>
        </div>
      </div>
      <label class="dashboard-modal-check">
        <input id="dashboardTutorialShowNext" type="checkbox" ${shouldShowNext ? "checked" : ""} />
        <span>Show this tutorial next login</span>
      </label>
      <footer class="dashboard-modal-actions">
        <button type="button" class="secondary dashboard-link-button" data-dashboard-tutorial-never>Do not show again</button>
        <button type="button" data-dashboard-tutorial-save>Done</button>
      </footer>
    </section>
  `;
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
    const operationSectionsMarkup = operationSections
      ? `
          <section class="dashboard-symmetric-row" aria-label="Coach operations">
            ${operationSections}
          </section>
        `
      : "";
    const birthdayStripMarkup = `
          <section class="dashboard-birthday-strip" aria-label="Player birthday news">
            ${renderBirthdayNewsCard(context)}
          </section>
        `;
    const workQueueMarkup = `${mainSections}${operationSectionsMarkup}`;

    return `
    <section class="dashboard-workspace-layout dashboard-home-ops dashboard-home-density-${escapeHtml(homeAppearance.density)} dashboard-home-theme-${escapeHtml(homeAppearance.theme)}" aria-label="Home dashboard">
      <section class="dashboard-home-grid" aria-label="Coach workspace">
        ${renderPresentationModeCard(birthdayStripMarkup)}
        ${
          workQueueMarkup
            ? `
              <section class="dashboard-home-main" aria-label="Work queue and alerts">
                ${workQueueMarkup}
              </section>
            `
            : ""
        }
      </section>
    </section>
  `;
  }

  return Object.freeze({
    render,
    renderPresentationModeCard,
    renderTopTasksRow,
    renderTodoCommand,
    renderAlertsCard,
    renderBirthdayNewsCard,
    renderTutorialModal,
    getDashboardTopPriorityTasks,
    renderTopTaskRow,
    getDashboardTopTaskMeta,
  });
}
