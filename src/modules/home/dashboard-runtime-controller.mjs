export const dashboardTaskStorageKey = "football-dashboard-tasks-v1";
export const dashboardTutorialPrefsStorageKey = "football-dashboard-tutorial-prefs-v1";
export const dashboardNewsSeenStorageKey = "football-dashboard-news-seen-v1";
export const dashboardNewsVersion = "home-dashboard-personal-todo-v2";

function noop() {}

function defaultReadJson() { return null; }

function defaultWriteJson() {}

function defaultIdFactory(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDashboardDateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function createDashboardRuntimeController(dependencies = {}) {
  const {
    documentRef = globalThis.document,
    win = globalThis.window,
    getElement = (id) => documentRef?.getElementById(id),
    getUi = () => ({}),
    homeContextSelectors,
    homeCardsRenderer,
    scheduleMonthRenderer,
    taskStorageKey = dashboardTaskStorageKey,
    tutorialPrefsStorageKey = dashboardTutorialPrefsStorageKey,
    newsSeenStorageKey = dashboardNewsSeenStorageKey,
    newsVersion = dashboardNewsVersion,
    appearanceStorageKey = "",
    readJson = defaultReadJson,
    writeJson = defaultWriteJson,
    createId = defaultIdFactory,
    getCurrentUser = () => null,
    getUsers = () => [],
    getPlatformStructureState = () => ({ clubs: [], teams: [] }),
    getPlatformTeamDisplayTeam = () => null,
    getPlatformTeamLogoUrl = () => "",
    getUserClubName = () => "",
    getActiveWorkspaceId = () => "",
    formatUserName = (user) => user?.name || "",
    escapeHtml = (value) => String(value ?? ""),
    readAppearanceRaw = () => ({}),
    writeAppearanceRaw = noop,
    normalizeAppearanceConfig = (config) => config || {},
    normalizeAppearanceValue = (config) => JSON.stringify(config || {}),
    renderProfileWorkspace = noop,
    syncChatNotificationCursor = noop,
    setActiveWorkspace = noop,
    getFormValues = () => ({}),
    confirm = (message) => win?.confirm?.(message) ?? true,
    openScheduleDate = noop,
    openPeriodizationDate = noop,
    openSessionDate = noop,
    openPresentationMode = noop,
    createSessionDate = noop,
    openTacticalBoardDate = noop,
  } = dependencies;

  let modalAfterClose = null;
  let birthdayCountdownTimer = 0;
  let popupsScheduledForUserId = null;
  let schedulePreviewMonthValue = "";
  let schedulePreviewSelectedDate = "";

  function getHomeClubIdentity(currentUser) {
    const structure = getPlatformStructureState();
    const displayTeam = getPlatformTeamDisplayTeam(currentUser, structure) || {};
    const resolvedClubName = String(
      getUserClubName(currentUser, structure)
        || currentUser?.clubName
        || currentUser?.club
        || displayTeam.name
        || "Football Science"
    ).trim();
    const clubName = resolvedClubName && !["club", "team"].includes(resolvedClubName.toLowerCase())
      ? resolvedClubName
      : "Football Science";
    const initials = clubName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "FS";
    return { clubName, initials, logoUrl: getPlatformTeamLogoUrl(displayTeam) };
  }

  function syncHomeClubIdentity(currentUser) {
    const clubNameElement = getElement("dashboardClubName");
    const clubMarkElement = getElement("dashboardClubMark");
    const logoImage = getElement("dashboardClubLogoImage");
    const logoInitials = getElement("dashboardClubLogoInitials");
    const identity = getHomeClubIdentity(currentUser);

    if (clubNameElement) clubNameElement.textContent = identity.clubName;
    clubMarkElement?.setAttribute?.("aria-label", `${identity.clubName} logo`);
    if (logoInitials) {
      logoInitials.textContent = identity.initials;
      logoInitials.hidden = Boolean(identity.logoUrl);
    }
    if (logoImage) {
      logoImage.hidden = !identity.logoUrl;
      logoImage.alt = identity.logoUrl ? `${identity.clubName} logo` : "";
      if (identity.logoUrl) {
        logoImage.src = identity.logoUrl;
        logoImage.onerror = () => {
          logoImage.hidden = true;
          if (logoInitials) logoInitials.hidden = false;
        };
      } else {
        logoImage.removeAttribute?.("src");
      }
    }
  }

  function normalizeTask(task) {
    const currentUser = getCurrentUser();
    const title = String(task?.title ?? "").trim();
    const assignedTo = task?.assignedTo || currentUser?.id || "";
    const createdBy = task?.createdBy || currentUser?.id || assignedTo;
    return {
      id: task?.id || createId("task"),
      title,
      note: String(task?.note ?? "").trim(),
      assignedTo,
      createdBy,
      scope: task?.scope === "personal" ? "personal" : "team",
      status: task?.status === "done" ? "done" : "open",
      createdAt: task?.createdAt || new Date().toISOString(),
      completedAt: task?.completedAt || "",
    };
  }

  function readTasks() {
    const parsed = readJson(taskStorageKey, []);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeTask)
          .filter((task) => task.title && task.assignedTo)
          .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
      : [];
  }

  function writeTasks(tasks) {
    writeJson(taskStorageKey, tasks.map(normalizeTask));
  }

  function createTask(values) {
    const currentUser = getCurrentUser();
    const title = String(values?.title ?? "").trim();
    if (!currentUser || !title) {
      return null;
    }
    const task = normalizeTask({
      title,
      note: values?.note ?? "",
      assignedTo: values?.assignedTo || currentUser.id,
      createdBy: currentUser.id,
      scope: values?.scope ?? "team",
    });
    writeTasks([task, ...readTasks()]);
    return task;
  }

  function updateTask(taskId, patch) {
    const nextTasks = readTasks().map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      const nextStatus = patch?.status ?? task.status;
      return normalizeTask({
        ...task,
        ...patch,
        completedAt: nextStatus === "done" ? patch?.completedAt || task.completedAt || new Date().toISOString() : "",
      });
    });
    writeTasks(nextTasks);
  }

  function removeTask(taskId) {
    writeTasks(readTasks().filter((task) => task.id !== taskId));
  }

  function getSessionPlannerState() { return homeContextSelectors.getSessionPlannerState(); }
  function getTodayValue() { return homeContextSelectors.getTodayValue(); }
  function getSessionTotalMinutes(session) { return homeContextSelectors.getSessionTotalMinutes(session); }
  function getHomeContext(currentUser, users, tasks) { return homeContextSelectors.getHomeContext(currentUser, users, tasks); }

  function stopBirthdayCountdownTimer() {
    if (!birthdayCountdownTimer) return;
    if (typeof win.clearInterval === "function") {
      win.clearInterval(birthdayCountdownTimer);
    }
    birthdayCountdownTimer = 0;
  }

  function getBirthdayCountdownTarget(value = "") {
    const cleanValue = String(value || "").trim();
    const match = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime();
    }
    const parsed = Date.parse(cleanValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function writeBirthdayCountdownUnit(root, unit, value) {
    const node = root?.querySelector?.(`[data-dashboard-birthday-unit="${unit}"]`);
    if (node) {
      node.textContent = unit === "days" ? String(value) : String(value).padStart(2, "0");
    }
  }

  function getBirthdayCountdownNodes() {
    const grid = getUi().dashboardGrid;
    if (typeof grid?.querySelectorAll !== "function") {
      return [];
    }
    return [...grid.querySelectorAll("[data-dashboard-birthday-countdown]")];
  }

  function updateBirthdayCountdowns() {
    const countdowns = getBirthdayCountdownNodes();
    if (!countdowns.length) {
      stopBirthdayCountdownTimer();
      return;
    }
    const now = Date.now();
    countdowns.forEach((countdown) => {
      const target = getBirthdayCountdownTarget(countdown.dataset.dashboardBirthdayTarget);
      const remainingMs = Math.max(0, target - now);
      const totalSeconds = Math.floor(remainingMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      writeBirthdayCountdownUnit(countdown, "days", days);
      writeBirthdayCountdownUnit(countdown, "hours", hours);
      writeBirthdayCountdownUnit(countdown, "minutes", minutes);
      writeBirthdayCountdownUnit(countdown, "seconds", seconds);
    });
  }

  function startBirthdayCountdownTimer() {
    stopBirthdayCountdownTimer();
    updateBirthdayCountdowns();
    if (!getBirthdayCountdownNodes().length || typeof win.setInterval !== "function") {
      return;
    }
    birthdayCountdownTimer = win.setInterval(updateBirthdayCountdowns, 1000);
  }

  function readAppearanceState() {
    return normalizeAppearanceConfig(readAppearanceRaw(appearanceStorageKey) || {});
  }

  function writeAppearanceState(config) {
    const currentUser = getCurrentUser();
    const normalizedValue = normalizeAppearanceValue(config, {
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.id || "",
    });
    writeAppearanceRaw(appearanceStorageKey, normalizedValue);
    return JSON.parse(normalizedValue);
  }

  function getTutorialPrefs() {
    const parsed = readJson(tutorialPrefsStorageKey, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function writeTutorialPrefs(prefs) { writeJson(tutorialPrefsStorageKey, prefs); }
  function getTutorialPreference(userId) { return getTutorialPrefs()[userId] ?? null; }

  function saveTutorialPreference(userId, showOnLogin) {
    if (!userId) {
      return;
    }
    writeTutorialPrefs({
      ...getTutorialPrefs(),
      [userId]: {
        showOnLogin: Boolean(showOnLogin),
        seenAt: new Date().toISOString(),
      },
    });
  }

  function shouldShowTutorialOnLogin(user) {
    return Boolean(user?.id && getTutorialPreference(user.id)?.showOnLogin);
  }

  function getNewsSeenMap() {
    const parsed = readJson(newsSeenStorageKey, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function hasSeenNews(userId) { return getNewsSeenMap()[userId] === newsVersion; }

  function markNewsSeen(userId) {
    if (!userId) {
      return;
    }
    writeJson(newsSeenStorageKey, {
      ...getNewsSeenMap(),
      [userId]: newsVersion,
    });
  }

  function getModalRoot() {
    let root = getElement("dashboardModalRoot");
    if (!root) {
      root = documentRef.createElement("div");
      root.id = "dashboardModalRoot";
      root.className = "dashboard-modal-root";
      root.hidden = true;
      documentRef.body.appendChild(root);
    }
    return root;
  }

  function closeModal(runAfterClose = true) {
    const root = getModalRoot();
    root.hidden = true;
    root.innerHTML = "";
    const afterClose = modalAfterClose;
    modalAfterClose = null;
    if (runAfterClose && typeof afterClose === "function") {
      afterClose();
    }
  }

  function showTutorialModal(options = {}) {
    if (documentRef.body?.dataset.activeWorkspace && documentRef.body.dataset.activeWorkspace !== "home") {
      return;
    }
    const user = getCurrentUser();
    if (!user) {
      return;
    }
    const shouldShowNext = Boolean(getTutorialPreference(user.id)?.showOnLogin);
    const root = getModalRoot();
    modalAfterClose = options.afterClose ?? null;
    root.innerHTML = homeCardsRenderer.renderTutorialModal({ shouldShowNext });
    root.hidden = false;
    root.querySelector(".dashboard-modal-actions [data-dashboard-tutorial-save]")?.focus();
  }

  function showNewsModal() {
    modalAfterClose = null;
    closeModal(false);
    if (documentRef.body?.dataset.activeWorkspace && documentRef.body.dataset.activeWorkspace !== "home") {
      return;
    }
    const newsSeenMap = getNewsSeenMap();
    const user = getCurrentUser();
    if (user?.id && newsSeenMap[user.id] !== newsVersion) {
      markNewsSeen(user.id);
    }
  }

  function maybeShowNewsModal() {
    const user = getCurrentUser();
    if (!user || hasSeenNews(user.id)) {
      return;
    }
    showNewsModal();
  }

  function scheduleLoginPopups() {
    const user = getCurrentUser();
    if (!user) {
      popupsScheduledForUserId = null;
      closeModal(false);
      return;
    }
    if (popupsScheduledForUserId === user.id) {
      return;
    }
    popupsScheduledForUserId = user.id;
    win.setTimeout(() => {
      const activeUser = getCurrentUser();
      if (!activeUser || activeUser.id !== user.id) {
        return;
      }
      if (shouldShowTutorialOnLogin(activeUser)) {
        showTutorialModal({ afterClose: maybeShowNewsModal });
        return;
      }
      maybeShowNewsModal();
    }, 350);
  }

  function renderSchedulePreview(options = {}) {
    const preview = options.preview || getElement("dashboardSchedulePreview") || getUi().dashboardSchedulePreview;
    if (!preview) {
      return;
    }
    preview.innerHTML = scheduleMonthRenderer?.render?.({
      state: homeContextSelectors?.getScheduleState?.(),
      todayValue: options.todayValue || homeContextSelectors?.getTodayValue?.(),
      monthValue: schedulePreviewMonthValue,
      selectedDate: schedulePreviewSelectedDate,
    }) || "";
    if (options.focusSelector) {
      preview.querySelector?.(options.focusSelector)?.focus?.();
    }
  }

  function renderCards() {
    const ui = getUi();
    const schedulePreview = getElement("dashboardSchedulePreview") || ui.dashboardSchedulePreview;
    if (!ui.dashboardGrid) {
      stopBirthdayCountdownTimer();
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
      stopBirthdayCountdownTimer();
      ui.dashboardGrid.innerHTML = "";
      if (schedulePreview) {
        schedulePreview.innerHTML = "";
      }
      return;
    }
    syncHomeClubIdentity(currentUser);
    const users = getUsers().filter((user) => user.status === "active");
    const context = getHomeContext(currentUser, users, readTasks());
    const appearance = readAppearanceState();
    const staffOptions = users
      .map(
        (user) =>
          `<option value="${escapeHtml(user.id)}" ${user.id === currentUser.id ? "selected" : ""}>${escapeHtml(formatUserName(user))}</option>`
      )
      .join("");
    stopBirthdayCountdownTimer();
    ui.dashboardGrid.innerHTML = `${homeCardsRenderer.render(context, staffOptions, appearance)}`;
    const renderedSchedulePreview = getElement("dashboardSchedulePreview") || schedulePreview;
    if (renderedSchedulePreview) {
      renderSchedulePreview({
        preview: renderedSchedulePreview,
        todayValue: context.todayValue || homeContextSelectors?.getTodayValue?.(),
      });
    }
    startBirthdayCountdownTimer();
    syncChatNotificationCursor();
  }

  function refreshSurfaces(profileMessage = "") {
    renderCards();
    if (getActiveWorkspaceId() === "my-profile") {
      renderProfileWorkspace(profileMessage);
    }
  }

  function handleDashboardGridClick(event) {
    const ui = getUi();
    const readReceipt = event.target.closest("[data-dashboard-read-receipt]");
    if (readReceipt) {
      ui.dashboardGrid?.querySelectorAll("[data-dashboard-read-receipt][open]").forEach((receipt) => {
        if (receipt !== readReceipt) {
          receipt.removeAttribute("open");
        }
      });
      return true;
    }
    if (event.target.closest("[data-dashboard-action='open-tutorial']")) {
      showTutorialModal();
      return true;
    }
    const schedulePreviousButton = event.target.closest("[data-dashboard-schedule-prev]");
    if (schedulePreviousButton) {
      schedulePreviewMonthValue = scheduleMonthRenderer?.shiftMonthValue?.(
        schedulePreviousButton.dataset.dashboardScheduleMonth,
        -1
      ) || "";
      schedulePreviewSelectedDate = "";
      renderSchedulePreview({ focusSelector: "[data-dashboard-schedule-prev]" });
      return true;
    }
    const scheduleNextButton = event.target.closest("[data-dashboard-schedule-next]");
    if (scheduleNextButton) {
      schedulePreviewMonthValue = scheduleMonthRenderer?.shiftMonthValue?.(
        scheduleNextButton.dataset.dashboardScheduleMonth,
        1
      ) || "";
      schedulePreviewSelectedDate = "";
      renderSchedulePreview({ focusSelector: "[data-dashboard-schedule-next]" });
      return true;
    }
    if (event.target.closest("[data-dashboard-schedule-today]")) {
      schedulePreviewMonthValue = "";
      schedulePreviewSelectedDate = getTodayValue();
      renderSchedulePreview({ focusSelector: "[data-dashboard-schedule-today]" });
      return true;
    }
    const selectedScheduleDateButton = event.target.closest("[data-dashboard-select-schedule-date]");
    if (selectedScheduleDateButton) {
      schedulePreviewSelectedDate = selectedScheduleDateButton.dataset.dashboardSelectScheduleDate;
      renderSchedulePreview({
        focusSelector: `[data-dashboard-select-schedule-date="${schedulePreviewSelectedDate}"]`,
      });
      return true;
    }
    if (event.target.closest("[data-dashboard-close-schedule-day]")) {
      const selectedDate = schedulePreviewSelectedDate;
      schedulePreviewSelectedDate = "";
      renderSchedulePreview({
        focusSelector: `[data-dashboard-select-schedule-date="${selectedDate}"]`,
      });
      return true;
    }
    const toggleTaskButton = event.target.closest("[data-dashboard-toggle-task]");
    if (toggleTaskButton) {
      const task = readTasks().find((candidate) => candidate.id === toggleTaskButton.dataset.dashboardToggleTask);
      if (!task) {
        return true;
      }
      updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
      refreshSurfaces();
      return true;
    }
    const removeTaskButton = event.target.closest("[data-dashboard-remove-task]");
    if (removeTaskButton) {
      Promise.resolve(confirm({
        eyebrow: "Home",
        title: "Remove task?",
        message: "Remove this task?",
        confirmLabel: "Remove",
        tone: "danger",
      })).then((confirmed) => {
        if (!confirmed) return;
        removeTask(removeTaskButton.dataset.dashboardRemoveTask);
        refreshSurfaces();
      });
      return true;
    }
    const scheduleDateButton = event.target.closest("[data-dashboard-open-schedule-date]");
    if (scheduleDateButton) {
      setActiveWorkspace("schedule");
      openScheduleDate(scheduleDateButton.dataset.dashboardOpenScheduleDate);
      return true;
    }
    const periodizationDateButton = event.target.closest("[data-dashboard-open-periodization-date]");
    if (periodizationDateButton) {
      openPeriodizationDate(periodizationDateButton.dataset.dashboardOpenPeriodizationDate);
      setActiveWorkspace("periodization");
      return true;
    }
    const openSessionDateButton = event.target.closest("[data-dashboard-open-session-date]");
    if (openSessionDateButton) {
      openSessionDate(openSessionDateButton.dataset.dashboardOpenSessionDate);
      setActiveWorkspace("session-planner");
      return true;
    }
    const presentationButton = event.target.closest("[data-dashboard-open-presentation]");
    if (presentationButton) {
      const card = presentationButton.closest("[data-dashboard-presentation-card]");
      const dateValue = schedulePreviewSelectedDate || getTodayValue();
      const meetingType = card?.dataset.dashboardPresentationType || "team";
      openPresentationMode(dateValue, meetingType);
      return true;
    }
    const createSessionDateButton = event.target.closest("[data-dashboard-create-session-date]");
    if (createSessionDateButton) {
      createSessionDate(createSessionDateButton.dataset.dashboardCreateSessionDate || getTodayValue());
      setActiveWorkspace("session-planner");
      return true;
    }
    const tacticalboardButton = event.target.closest("[data-dashboard-open-tacticalboard]");
    if (tacticalboardButton) {
      openTacticalBoardDate(tacticalboardButton.dataset.dashboardOpenTacticalboard || getTodayValue());
      return true;
    }
    const focusButton = event.target.closest("[data-dashboard-focus]");
    if (focusButton) {
      const target =
        focusButton.dataset.dashboardFocus === "task"
          ? ui.dashboardGrid?.querySelector("#dashboardTaskForm input[name='title']")
          : null;
      target?.focus();
      return true;
    }
    if (event.target.closest("[data-dashboard-open-top-tasks]")) {
      const taskTitleInput = ui.dashboardGrid?.querySelector("#dashboardTaskForm input[name='title']");
      if (!taskTitleInput) {
        return true;
      }
      taskTitleInput.scrollIntoView({ behavior: "smooth", block: "center" });
      taskTitleInput.focus();
      return true;
    }
    const trigger = event.target.closest("[data-open-workspace]");
    if (!trigger) {
      return false;
    }
    setActiveWorkspace(trigger.dataset.openWorkspace);
    return true;
  }

  function handleDashboardGridSubmit(event) {
    const personalTodoForm = event.target.closest("#dashboardPersonalTodoForm");
    if (personalTodoForm) {
      event.preventDefault();
      const user = getCurrentUser();
      const values = getFormValues(personalTodoForm);
      if (!user || !values.title) {
        return true;
      }
      createTask({ title: values.title, assignedTo: user.id, scope: "personal" });
      refreshSurfaces();
      return true;
    }
    const taskForm = event.target.closest("#dashboardTaskForm");
    if (taskForm) {
      event.preventDefault();
      const values = getFormValues(taskForm);
      createTask({ title: values.title, note: values.note, assignedTo: values.assignedTo, scope: "team" });
      renderCards();
      return true;
    }
    return false;
  }

  function handleModalClick(event) {
    const modalRoot = getElement("dashboardModalRoot");
    if (!modalRoot || modalRoot.hidden) {
      return false;
    }
    const user = getCurrentUser();
    if (event.target.closest("[data-dashboard-tutorial-never]")) {
      saveTutorialPreference(user?.id, false);
      closeModal();
      return true;
    }
    if (event.target.closest("[data-dashboard-tutorial-save]") || event.target.matches("[data-dashboard-modal-close]")) {
      saveTutorialPreference(user?.id, Boolean(modalRoot.querySelector("#dashboardTutorialShowNext")?.checked));
      closeModal();
      return true;
    }
    if (event.target.closest("[data-dashboard-news-dismiss]")) {
      markNewsSeen(user?.id);
      closeModal();
      return true;
    }
    return false;
  }

  function handleModalKeydown(event) {
    if (event.key !== "Escape") {
      return false;
    }
    const schedulePreview = getElement("dashboardSchedulePreview") || getUi().dashboardSchedulePreview;
    if (schedulePreviewSelectedDate && schedulePreview) {
      const selectedDate = schedulePreviewSelectedDate;
      schedulePreviewSelectedDate = "";
      renderSchedulePreview({
        preview: schedulePreview,
        focusSelector: `[data-dashboard-select-schedule-date="${selectedDate}"]`,
      });
      return true;
    }
    const modalRoot = getElement("dashboardModalRoot");
    if (!modalRoot || modalRoot.hidden) {
      return false;
    }
    const user = getCurrentUser();
    if (modalRoot.querySelector("#dashboardTutorialShowNext")) {
      saveTutorialPreference(user?.id, Boolean(modalRoot.querySelector("#dashboardTutorialShowNext")?.checked));
    } else {
      markNewsSeen(user?.id);
    }
    closeModal();
    return true;
  }

  function bindInteractions() {
    const ui = getUi();
    ui.dashboardGrid?.addEventListener("click", handleDashboardGridClick);
    ui.dashboardGrid?.addEventListener("submit", handleDashboardGridSubmit);
    documentRef.addEventListener("click", handleModalClick);
    documentRef.addEventListener("keydown", handleModalKeydown);
  }

  return Object.freeze({
    bindInteractions,
    closeModal,
    createTask,
    getDashboardDateLabel,
    getHomeContext,
    getSessionPlannerState,
    getSessionTotalMinutes,
    getTodayValue,
    markNewsSeen,
    readAppearanceState,
    readTasks,
    refreshSurfaces,
    removeTask,
    renderCards,
    saveTutorialPreference,
    scheduleLoginPopups,
    showTutorialModal,
    updateTask,
    writeAppearanceState,
  });
}
