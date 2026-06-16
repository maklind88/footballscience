const databaseName = "football-science-video-handles";
const storeName = "videoHandles";
const databaseVersion = 1;

function text(value = "") {
  return String(value || "").trim();
}

function identityId(criteria = {}) {
  return [
    text(criteria.organizationId || criteria.organization_id || "local"),
    text(criteria.teamId || criteria.team_id || "team"),
    text(criteria.matchId || criteria.match_id || "match"),
    text(criteria.videoId || criteria.video_id || "video"),
    text(criteria.localVideoIdentifier || criteria.local_video_identifier || "source"),
  ].join("::");
}

function comparableText(value = "") {
  return text(value).toLowerCase();
}

function normalizeIdentity(criteria = {}) {
  return {
    id: identityId(criteria),
    organizationId: text(criteria.organizationId || criteria.organization_id || "local"),
    teamId: text(criteria.teamId || criteria.team_id || "team"),
    matchId: text(criteria.matchId || criteria.match_id),
    videoId: text(criteria.videoId || criteria.video_id),
    localVideoIdentifier: text(criteria.localVideoIdentifier || criteria.local_video_identifier),
    scheduleEventId: text(criteria.scheduleEventId || criteria.schedule_event_id),
    scheduleDayKey: text(criteria.scheduleDayKey || criteria.schedule_day_key),
    matchDate: text(criteria.matchDate || criteria.match_date),
    displayName: text(criteria.displayName || criteria.display_name || criteria.name),
  };
}

function normalizeLookupCriteria(criteria = {}) {
  return {
    id: Object.prototype.hasOwnProperty.call(criteria, "id") ? text(criteria.id) : "",
    organizationId: text(criteria.organizationId || criteria.organization_id),
    teamId: text(criteria.teamId || criteria.team_id),
    matchId: text(criteria.matchId || criteria.match_id),
    videoId: text(criteria.videoId || criteria.video_id),
    localVideoIdentifier: text(criteria.localVideoIdentifier || criteria.local_video_identifier),
    scheduleEventId: text(criteria.scheduleEventId || criteria.schedule_event_id),
    scheduleDayKey: text(criteria.scheduleDayKey || criteria.schedule_day_key),
    matchDate: text(criteria.matchDate || criteria.match_date),
    displayName: text(criteria.displayName || criteria.display_name || criteria.name),
  };
}

function hasLookupTarget(criteria = {}) {
  return Boolean(
    criteria.id
    || criteria.matchId
    || criteria.videoId
    || criteria.localVideoIdentifier
    || criteria.scheduleEventId
    || criteria.scheduleDayKey
    || criteria.matchDate
    || criteria.displayName
  );
}

function hasIndexedDb(win = window) {
  return Boolean(win?.indexedDB?.open);
}

function openDatabase(win = window) {
  if (!hasIndexedDb(win)) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open local video handle store."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: "id" });
      if (!store.indexNames.contains("match")) store.createIndex("match", ["organizationId", "teamId", "matchId"], { unique: false });
      if (!store.indexNames.contains("video")) store.createIndex("video", ["organizationId", "teamId", "videoId"], { unique: false });
      if (!store.indexNames.contains("identifier")) store.createIndex("identifier", ["organizationId", "teamId", "localVideoIdentifier"], { unique: false });
    };
  });
}

function transactionStore(db, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function allRecords(win = window) {
  const db = await openDatabase(win);
  try {
    return await requestPromise(transactionStore(db).getAll());
  } finally {
    db.close?.();
  }
}

function matchesCriteria(record = {}, criteria = {}) {
  const normalized = normalizeLookupCriteria(criteria);
  return (!normalized.organizationId || record.organizationId === normalized.organizationId)
    && (!normalized.teamId || record.teamId === normalized.teamId)
    && (!normalized.matchId || record.matchId === normalized.matchId)
    && (!normalized.videoId || record.videoId === normalized.videoId)
    && (!normalized.localVideoIdentifier || record.localVideoIdentifier === normalized.localVideoIdentifier)
    && (!normalized.scheduleEventId || record.scheduleEventId === normalized.scheduleEventId)
    && (!normalized.scheduleDayKey || record.scheduleDayKey === normalized.scheduleDayKey)
    && (!normalized.matchDate || record.matchDate === normalized.matchDate)
    && (!normalized.displayName || [record.displayName, record.name].some((value) => comparableText(value) === comparableText(normalized.displayName)));
}

function compatibleScope(recordValue = "", lookupValue = "", fallbackValue = "") {
  if (!lookupValue || !recordValue) return true;
  return recordValue === lookupValue || recordValue === fallbackValue || lookupValue === fallbackValue;
}

function scoreRecordMatch(record = {}, criteria = {}) {
  const normalized = normalizeLookupCriteria(criteria);
  if (!hasLookupTarget(normalized)) return 0;
  if (matchesCriteria(record, normalized)) return 1000;

  const videoMatch = Boolean(normalized.videoId && record.videoId === normalized.videoId);
  const matchMatch = Boolean(normalized.matchId && record.matchId === normalized.matchId);
  const identifierMatch = Boolean(normalized.localVideoIdentifier && record.localVideoIdentifier === normalized.localVideoIdentifier);
  const scheduleEventMatch = Boolean(normalized.scheduleEventId && record.scheduleEventId === normalized.scheduleEventId);
  const scheduleDayMatch = Boolean(normalized.scheduleDayKey && record.scheduleDayKey === normalized.scheduleDayKey);
  const dateMatch = Boolean(normalized.matchDate && record.matchDate === normalized.matchDate);
  const displayNameMatch = Boolean(normalized.displayName && [record.displayName, record.name].some((value) => comparableText(value) === comparableText(normalized.displayName)));
  const scopeCompatible = compatibleScope(record.organizationId, normalized.organizationId, "local")
    && compatibleScope(record.teamId, normalized.teamId, "team");

  if (!scopeCompatible && !videoMatch && !matchMatch && !identifierMatch && !scheduleEventMatch && !scheduleDayMatch && !dateMatch && !displayNameMatch) return 0;
  if (!videoMatch && !matchMatch && !identifierMatch && !scheduleEventMatch && !scheduleDayMatch && !dateMatch && !displayNameMatch) return 0;

  let score = 0;
  if (videoMatch) score += 500;
  if (identifierMatch) score += 350;
  if (matchMatch) score += 250;
  if (scheduleEventMatch) score += 220;
  if (scheduleDayMatch) score += 180;
  if (dateMatch) score += 120;
  if (displayNameMatch) score += 80;
  if (record.organizationId && normalized.organizationId && record.organizationId === normalized.organizationId) score += 50;
  if (record.teamId && normalized.teamId && record.teamId === normalized.teamId) score += 50;
  return score;
}

export function isFileSystemAccessSupported(win = window) {
  return typeof win?.showOpenFilePicker === "function";
}

export async function openVideoFileHandle(win = window) {
  if (!isFileSystemAccessSupported(win)) return null;
  const handles = await win.showOpenFilePicker({
    multiple: false,
    types: [{
      description: "Video files",
      accept: {
        "video/*": [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"],
      },
    }],
  });
  return handles?.[0] || null;
}

export async function saveVideoHandle(values = {}, win = window) {
  if (!values.handle) return null;
  const identity = normalizeIdentity(values);
  const record = {
    ...identity,
    handle: values.handle,
    name: text(values.handle?.name || values.displayName || values.display_name || identity.displayName),
    displayName: identity.displayName || text(values.handle?.name || values.displayName || values.display_name),
    updatedAt: new Date().toISOString(),
  };
  const db = await openDatabase(win);
  try {
    await requestPromise(transactionStore(db, "readwrite").put(record));
    return record;
  } finally {
    db.close?.();
  }
}

export async function getVideoHandle(criteria = {}, win = window) {
  const lookup = normalizeLookupCriteria(criteria);
  const identity = normalizeIdentity(criteria);
  if (!hasLookupTarget(lookup)) return null;
  if (lookup.matchId || lookup.videoId || lookup.localVideoIdentifier || lookup.id) {
    const db = await openDatabase(win);
    try {
      const exact = await requestPromise(transactionStore(db).get(lookup.id || identity.id));
      if (exact) return exact;
    } finally {
      db.close?.();
    }
  }
  const records = await allRecords(win);
  return records
    .map((record) => ({ record, score: scoreRecordMatch(record, criteria) }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => (
      second.score - first.score
      || String(second.record.updatedAt || "").localeCompare(String(first.record.updatedAt || ""))
    ))[0]?.record || null;
}

export async function removeVideoHandle(criteria = {}, win = window) {
  const record = await getVideoHandle(criteria, win);
  if (!record?.id) return false;
  const db = await openDatabase(win);
  try {
    await requestPromise(transactionStore(db, "readwrite").delete(record.id));
    return true;
  } finally {
    db.close?.();
  }
}

export async function listVideoHandlesForMatch(criteria = {}, win = window) {
  const records = await allRecords(win);
  const normalized = normalizeLookupCriteria(criteria);
  return records.filter((record) => (
    (!normalized.organizationId || record.organizationId === normalized.organizationId)
    && (!normalized.teamId || record.teamId === normalized.teamId)
    && (!normalized.matchId || record.matchId === normalized.matchId)
  ));
}

export async function verifyPermission(handle) {
  if (!handle?.queryPermission) return "granted";
  return handle.queryPermission({ mode: "read" });
}

export async function requestPermission(handle) {
  if (!handle?.requestPermission) return verifyPermission(handle);
  return handle.requestPermission({ mode: "read" });
}
