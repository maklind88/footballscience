export const sessionPlannerTextDraftStorageKey = "football-session-planner-text-drafts-v1";

const draftVersion = 1;
const maxDraftEntries = 48;
const maxDraftValueLength = 16_000;

function normalizeText(value) {
  return String(value ?? "");
}

function getScope(getScope) {
  return normalizeText(typeof getScope === "function" ? getScope() : "").trim();
}

function getRecordKey(context = {}) {
  const scope = normalizeText(context.scope).trim();
  const date = normalizeText(context.date).trim();
  const blockId = normalizeText(context.blockId).trim();
  const field = normalizeText(context.field).trim();
  return scope && date && blockId && field ? `${scope}:${date}:${blockId}:${field}` : "";
}

function normalizeEntry(entry = {}) {
  const scope = normalizeText(entry.scope).trim();
  const date = normalizeText(entry.date).trim();
  const blockId = normalizeText(entry.blockId).trim();
  const field = normalizeText(entry.field).trim();
  const value = normalizeText(entry.value);
  const baseValue = normalizeText(entry.baseValue);
  const updatedAt = Number(entry.updatedAt) || 0;
  const key = getRecordKey({ scope, date, blockId, field });
  if (!key || value.length > maxDraftValueLength) return null;
  return { key, scope, date, blockId, field, value, baseValue, updatedAt };
}

function readEntries(storage, storageKey) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(storageKey) || "{}");
    if (parsed?.version !== draftVersion || !Array.isArray(parsed.entries)) return new Map();
    return new Map(parsed.entries.map(normalizeEntry).filter(Boolean).map((entry) => [entry.key, entry]));
  } catch {
    return new Map();
  }
}

function sortRecent(entries) {
  return [...entries.values()]
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, maxDraftEntries);
}

export function createSessionPlannerTextDraftStore(options = {}) {
  const storage = options.storage;
  const storageKey = options.storageKey || sessionPlannerTextDraftStorageKey;
  const getCurrentScope = typeof options.getScope === "function" ? options.getScope : () => "";
  const now = typeof options.now === "function" ? options.now : Date.now;
  const setTimer = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const debounceMs = Number.isFinite(Number(options.debounceMs)) ? Math.max(100, Number(options.debounceMs)) : 650;
  const entries = readEntries(storage, storageKey);
  const pending = new Map();
  const timers = new Map();

  function getContext(context = {}) {
    const safeContext = context && typeof context === "object" ? context : {};
    const scope = getScope(() => safeContext.scope || getCurrentScope());
    const record = normalizeEntry({ ...safeContext, scope, updatedAt: safeContext.updatedAt || now() });
    return record;
  }

  function persist() {
    if (!storage?.setItem) return false;
    try {
      storage.setItem(storageKey, JSON.stringify({ version: draftVersion, entries: sortRecent(entries) }));
      return true;
    } catch {
      return false;
    }
  }

  function flushRecord(key) {
    const timer = timers.get(key);
    if (timer) clearTimer(timer);
    timers.delete(key);
    const entry = pending.get(key);
    if (!entry) return false;
    pending.delete(key);
    entries.set(key, entry);
    return persist();
  }

  function record(context = {}, value, baseValue) {
    const normalized = getContext({ ...context, value, baseValue });
    if (!normalized) return false;
    const existing = pending.get(normalized.key) || entries.get(normalized.key);
    const entry = {
      ...normalized,
      baseValue: existing?.baseValue ?? normalized.baseValue,
      updatedAt: Number(now()) || Date.now(),
    };
    pending.set(entry.key, entry);
    const existingTimer = timers.get(entry.key);
    if (existingTimer) clearTimer(existingTimer);
    timers.set(entry.key, setTimer(() => flushRecord(entry.key), debounceMs));
    return true;
  }

  function restore(context = {}, currentValue = "") {
    const normalized = getContext(context);
    if (!normalized) return { status: "none", value: normalizeText(currentValue) };
    const entry = pending.get(normalized.key) || entries.get(normalized.key);
    const current = normalizeText(currentValue);
    if (!entry) return { status: "none", value: current };
    if (current === entry.value) {
      clear(context);
      return { status: "saved", value: current };
    }
    if (current === entry.baseValue) {
      return { status: "restore", value: entry.value };
    }
    return { status: "conflict", value: current };
  }

  function clear(context = {}) {
    const normalized = getContext(context);
    if (!normalized) return false;
    const timer = timers.get(normalized.key);
    if (timer) clearTimer(timer);
    timers.delete(normalized.key);
    pending.delete(normalized.key);
    const deleted = entries.delete(normalized.key);
    return deleted ? persist() : false;
  }

  function flush() {
    const keys = [...pending.keys()];
    return keys.every((key) => flushRecord(key));
  }

  return Object.freeze({
    clear,
    flush,
    record,
    restore,
    storageKey,
  });
}
