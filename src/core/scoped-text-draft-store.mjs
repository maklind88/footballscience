const draftVersion = 1;
const maxDraftEntries = 48;
const maxDraftValueLength = 16_000;

function normalizeText(value) {
  return String(value ?? "");
}

function normalizeContext(context = {}, getScope, now) {
  const safeContext = context && typeof context === "object" ? context : {};
  const scope = normalizeText(safeContext.scope || getScope?.() || "").trim();
  const recordId = normalizeText(safeContext.recordId).trim();
  const field = normalizeText(safeContext.field).trim();
  const value = normalizeText(safeContext.value);
  const baseValue = normalizeText(safeContext.baseValue);
  if (!scope || !recordId || !field || value.length > maxDraftValueLength) return null;
  return {
    baseValue,
    field,
    key: `${scope}:${recordId}:${field}`,
    recordId,
    scope,
    updatedAt: Number(safeContext.updatedAt) || Number(now()) || Date.now(),
    value,
  };
}

function readEntries(storage, storageKey, getScope, now) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(storageKey) || "{}");
    if (parsed?.version !== draftVersion || !Array.isArray(parsed.entries)) return new Map();
    return new Map(
      parsed.entries
        .map((entry) => normalizeContext(entry, getScope, now))
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    );
  } catch {
    return new Map();
  }
}

export function createScopedTextDraftStore(options = {}) {
  const storage = options.storage;
  const storageKey = normalizeText(options.storageKey).trim();
  const getScope = typeof options.getScope === "function" ? options.getScope : () => "";
  const now = typeof options.now === "function" ? options.now : Date.now;
  const setTimer = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const debounceMs = Number.isFinite(Number(options.debounceMs)) ? Math.max(100, Number(options.debounceMs)) : 650;
  const entries = readEntries(storage, storageKey, getScope, now);
  const pending = new Map();
  const timers = new Map();

  function persist() {
    if (!storageKey || !storage?.setItem) return false;
    try {
      const recentEntries = [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxDraftEntries);
      storage.setItem(storageKey, JSON.stringify({ entries: recentEntries, version: draftVersion }));
      return true;
    } catch {
      return false;
    }
  }

  function getEntry(context = {}) {
    return normalizeContext(context, getScope, now);
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
    const entry = getEntry({ ...context, baseValue, value });
    if (!entry) return false;
    const existing = pending.get(entry.key) || entries.get(entry.key);
    const nextEntry = { ...entry, baseValue: existing?.baseValue ?? entry.baseValue, updatedAt: Number(now()) || Date.now() };
    pending.set(entry.key, nextEntry);
    const timer = timers.get(entry.key);
    if (timer) clearTimer(timer);
    timers.set(entry.key, setTimer(() => flushRecord(entry.key), debounceMs));
    return true;
  }

  function restore(context = {}, currentValue = "") {
    const entry = getEntry(context);
    const current = normalizeText(currentValue);
    if (!entry) return { status: "none", value: current };
    const draft = pending.get(entry.key) || entries.get(entry.key);
    if (!draft) return { status: "none", value: current };
    if (current === draft.value) {
      clear(context);
      return { status: "saved", value: current };
    }
    if (current === draft.baseValue) return { status: "restore", value: draft.value };
    return { status: "conflict", value: current };
  }

  function clear(context = {}) {
    const entry = getEntry(context);
    if (!entry) return false;
    const timer = timers.get(entry.key);
    if (timer) clearTimer(timer);
    timers.delete(entry.key);
    pending.delete(entry.key);
    const deleted = entries.delete(entry.key);
    return deleted ? persist() : false;
  }

  function flush() {
    return [...pending.keys()].every(flushRecord);
  }

  return Object.freeze({ clear, flush, record, restore, storageKey });
}
