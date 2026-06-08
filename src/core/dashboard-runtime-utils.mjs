export function createDashboardId(prefix = "") {
  return `${String(prefix || "item").trim()}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDashboardJsonStorage({ windowRef, logEvent = () => {} } = {}) {
  const storage = windowRef?.localStorage;
  const safeLog = typeof logEvent === "function" ? logEvent : () => {};

  const readDashboardJson = (key, fallback) => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const writeDashboardJson = (key, value) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
      return;
    } catch {
      safeLog("Dashboard data could not be written to local storage.");
    }
  };

  return { readDashboardJson, writeDashboardJson };
}

export function createDashboardWorkspaceQueryEngine({ ui = {}, getVisibleWorkspacePool = () => [] } = {}) {
  const getWorkspaceQuery = () => ui.workspaceSearch?.value.trim().toLowerCase() ?? "";

  const getVisibleWorkspaces = () => {
    const workspaces = getVisibleWorkspacePool();
    const query = getWorkspaceQuery();
    if (!query) {
      return workspaces;
    }
    return workspaces.filter((workspace) =>
      `${workspace.title} ${workspace.meta} ${workspace.description} ${workspace.status}`
        .toLowerCase()
        .includes(query)
    );
  };

  return { getWorkspaceQuery, getVisibleWorkspaces };
}
