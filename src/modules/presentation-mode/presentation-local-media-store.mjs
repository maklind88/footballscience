const databaseName = "football-science-presentation-media";
const databaseVersion = 1;
const storeName = "attachments";

function clean(value = "") {
  return String(value || "").trim();
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Local media storage failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function openDatabase(win) {
  if (!win?.indexedDB?.open) {
    return Promise.reject(new Error("Local media storage is unavailable in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open local media storage."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };
  });
}

async function withStore(win, mode, operation) {
  const db = await openDatabase(win);
  try {
    const store = db.transaction(storeName, mode).objectStore(storeName);
    return await operation(store);
  } finally {
    db.close?.();
  }
}

async function readHandlePermission(handle) {
  if (!handle?.queryPermission) return "granted";
  try {
    return await handle.queryPermission({ mode: "read" });
  } catch {
    return "denied";
  }
}

export function canPickPresentationMediaHandle(kind = "image", win = globalThis.window) {
  return kind === "video" && typeof win?.showOpenFilePicker === "function";
}

export async function pickPresentationMediaHandle(kind = "video", win = globalThis.window) {
  if (!canPickPresentationMediaHandle(kind, win)) return null;
  const handles = await win.showOpenFilePicker({
    multiple: false,
    types: [{
      description: "Video files",
      accept: {
        "video/*": [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"],
      },
    }],
  });
  const handle = handles?.[0] || null;
  if (!handle?.getFile) return null;
  return { file: await handle.getFile(), handle };
}

export function createPresentationLocalMediaStore({ win = globalThis.window } = {}) {
  async function save({ id, kind = "image", file = null, handle = null } = {}) {
    const safeId = clean(id);
    if (!safeId || !file) return null;
    const record = {
      id: safeId,
      kind: kind === "video" ? "video" : "image",
      name: clean(file.name),
      mimeType: clean(file.type),
      size: Math.max(0, Number(file.size) || 0),
      handle: handle || null,
      blob: handle ? null : file,
      updatedAt: new Date().toISOString(),
    };
    try {
      await withStore(win, "readwrite", (store) => requestPromise(store.put(record)));
      return record;
    } catch (error) {
      if (!handle) throw error;
      const fallback = { ...record, handle: null, blob: file };
      await withStore(win, "readwrite", (store) => requestPromise(store.put(fallback)));
      return fallback;
    }
  }

  async function resolve(id = "") {
    const safeId = clean(id);
    if (!safeId) return { status: "missing" };
    let record;
    try {
      record = await withStore(win, "readonly", (store) => requestPromise(store.get(safeId)));
    } catch (error) {
      return { status: "unavailable", error };
    }
    if (!record) return { status: "missing" };
    if (record.handle) {
      const permission = await readHandlePermission(record.handle);
      if (permission !== "granted") {
        return { ...record, status: "permission-required" };
      }
      try {
        return { ...record, file: await record.handle.getFile(), status: "ready" };
      } catch (error) {
        return { ...record, status: "missing", error };
      }
    }
    if (record.blob) {
      return { ...record, file: record.blob, status: "ready" };
    }
    return { ...record, status: "missing" };
  }

  async function remove(id = "") {
    const safeId = clean(id);
    if (!safeId) return false;
    await withStore(win, "readwrite", (store) => requestPromise(store.delete(safeId)));
    return true;
  }

  return {
    remove,
    resolve,
    save,
  };
}
