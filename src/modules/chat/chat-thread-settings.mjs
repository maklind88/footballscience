const defaultStorageKey = "football-dashboard-chat-thread-settings-v1";

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeDashboardChatThreadSettings(value = {}) {
  return {
    muted: Boolean(value?.muted),
    pinned: Boolean(value?.pinned),
    customTitle: normalizeText(value?.customTitle).slice(0, 80),
    avatarLabel: normalizeText(value?.avatarLabel).slice(0, 2).toUpperCase(),
    avatarUrl: normalizeText(value?.avatarUrl).slice(0, 800),
    createdAt: normalizeText(value?.createdAt || value?.created_at),
    updatedAt: normalizeText(value?.updatedAt),
  };
}

export function createDashboardChatThreadSettingsStore({
  readJson,
  writeJson,
  normalizeThreadId,
  fallbackThreadId = "team",
  storageKey = defaultStorageKey,
} = {}) {
  const readMap = () => {
    const parsed = typeof readJson === "function" ? readJson(storageKey, {}) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  };

  const getThreadId = (threadId = fallbackThreadId) =>
    typeof normalizeThreadId === "function" ? normalizeThreadId(threadId, fallbackThreadId) : normalizeText(threadId || fallbackThreadId);

  const getStored = (threadId = fallbackThreadId) => {
    const normalizedThreadId = getThreadId(threadId);
    const settingsMap = readMap();
    return Object.prototype.hasOwnProperty.call(settingsMap, normalizedThreadId)
      ? normalizeDashboardChatThreadSettings(settingsMap[normalizedThreadId])
      : null;
  };

  const get = (threadId = fallbackThreadId) => getStored(threadId) || normalizeDashboardChatThreadSettings({});

  const merge = (threadId = fallbackThreadId, apiSettings = {}) => {
    const normalizedApiSettings = normalizeDashboardChatThreadSettings(apiSettings || {});
    const storedSettings = getStored(threadId);
    if (!storedSettings) {
      return normalizedApiSettings;
    }
    const apiUpdatedAt = Date.parse(normalizedApiSettings.updatedAt || "") || 0;
    const storedUpdatedAt = Date.parse(storedSettings.updatedAt || "") || 0;
    if (apiUpdatedAt > storedUpdatedAt) {
      return normalizedApiSettings;
    }
    return normalizeDashboardChatThreadSettings({
      ...normalizedApiSettings,
      ...storedSettings,
    });
  };

  const write = (threadId = fallbackThreadId, settings = {}) => {
    const normalizedThreadId = getThreadId(threadId);
    if (!normalizedThreadId || typeof writeJson !== "function") {
      return;
    }
    const settingsMap = readMap();
    settingsMap[normalizedThreadId] = {
      ...normalizeDashboardChatThreadSettings(settings),
      updatedAt: new Date().toISOString(),
    };
    writeJson(storageKey, settingsMap);
  };

  const remove = (threadId = fallbackThreadId) => {
    const normalizedThreadId = getThreadId(threadId);
    if (!normalizedThreadId || typeof writeJson !== "function") {
      return;
    }
    const settingsMap = readMap();
    if (!Object.prototype.hasOwnProperty.call(settingsMap, normalizedThreadId)) {
      return;
    }
    delete settingsMap[normalizedThreadId];
    writeJson(storageKey, settingsMap);
  };

  const update = (threadId = fallbackThreadId, patch = {}) => {
    const normalizedThreadId = getThreadId(threadId);
    write(normalizedThreadId, {
      ...get(normalizedThreadId),
      ...patch,
    });
  };

  const snapshot = (threads = []) =>
    threads.reduce((settingsSnapshot, thread) => {
      settingsSnapshot[thread.threadId] = normalizeDashboardChatThreadSettings(thread.settings || get(thread.threadId));
      return settingsSnapshot;
    }, {});

  return Object.freeze({
    get,
    getStored,
    merge,
    normalize: normalizeDashboardChatThreadSettings,
    readMap,
    remove,
    snapshot,
    update,
    write,
  });
}
