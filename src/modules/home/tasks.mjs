export const homeTasksStorageKey = "football-dashboard-tasks-v1";
export const homeTaskScopes = Object.freeze(["team", "personal"]);
export const homeTaskStatuses = Object.freeze(["open", "done"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function defaultNow() {
  return new Date().toISOString();
}

function defaultIdFactory() {
  return `home-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTaskTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function parseHomeTasksPayload(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (!rawValue || typeof rawValue !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeHomeTask(task = {}, options = {}) {
  const currentUserId = normalizeText(options.currentUserId);
  const title = normalizeText(task?.title);
  const assignedTo = normalizeText(task?.assignedTo || currentUserId);
  const createdBy = normalizeText(task?.createdBy || currentUserId || assignedTo);
  const status = task?.status === "done" ? "done" : "open";
  const scope = task?.scope === "personal" ? "personal" : "team";
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : defaultIdFactory;

  return Object.freeze({
    id: normalizeText(task?.id) || normalizeText(idFactory(task)),
    title,
    note: normalizeText(task?.note),
    assignedTo,
    createdBy,
    scope,
    status,
    createdAt: normalizeText(task?.createdAt) || normalizeText(options.now) || defaultNow(),
    completedAt: normalizeText(task?.completedAt),
  });
}

export function normalizeHomeTasks(rawValue, options = {}) {
  return parseHomeTasksPayload(rawValue)
    .map((task, index) =>
      normalizeHomeTask(task, {
        ...options,
        idFactory: task?.id
          ? options.idFactory
          : () =>
              typeof options.idFactory === "function"
                ? options.idFactory(task, index)
                : defaultIdFactory(task, index),
      })
    )
    .filter((task) => task.title && task.assignedTo)
    .sort((first, second) => parseTaskTime(second.createdAt) - parseTaskTime(first.createdAt));
}

export function selectHomeTaskQueues(tasks = [], currentUserId = "") {
  const userId = normalizeText(currentUserId);
  const openTasks = tasks.filter((task) => task.status !== "done");

  return Object.freeze({
    myOpenTasks: Object.freeze(openTasks.filter((task) => task.assignedTo === userId && task.scope !== "personal")),
    personalOpenTasks: Object.freeze(
      openTasks.filter((task) => task.assignedTo === userId && task.createdBy === userId && task.scope === "personal")
    ),
    delegatedOpenTasks: Object.freeze(openTasks.filter((task) => task.createdBy === userId && task.assignedTo !== userId)),
  });
}

export function createHomeTaskCounts(queues) {
  return Object.freeze({
    mine: queues?.myOpenTasks?.length || 0,
    personal: queues?.personalOpenTasks?.length || 0,
    delegated: queues?.delegatedOpenTasks?.length || 0,
  });
}

