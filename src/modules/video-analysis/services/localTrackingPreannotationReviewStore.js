import { createLocalTrackingWorkspaceScope } from "./localTrackingWorkspaceContract.js";

export const LOCAL_TRACKING_PREANNOTATION_REVIEW_PROTOCOL =
  "football-science-local-tracking-preannotation-review-v1";
export const LOCAL_TRACKING_PREANNOTATION_REVIEW_VERSION = 1;

const databaseName = "football-science-tracking-preannotation-reviews";
const databaseVersion = 1;
const storeName = "drafts";
const maximumDecisions = 25_000;
const maximumSerializedBytes = 4 * 1024 * 1024;
const decisions = new Set(["accepted", "rejected"]);

export class LocalTrackingPreannotationReviewError extends Error {
  constructor(message, code = "LOCAL_TRACKING_PREANNOTATION_REVIEW_INVALID") {
    super(message);
    this.name = "LocalTrackingPreannotationReviewError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new LocalTrackingPreannotationReviewError(message, code);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

function identifier(value, label, maximum = 240) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\x00-\x1f\\/]/.test(text)
    || /^(?:file|blob|data|https?):/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function timestamp(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`Invalid ${label}.`);
  return date.toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedIdentity(value = {}, scope = {}) {
  const clipId = identifier(value.clipId, "preannotation review clip id");
  if (clipId !== scope.clipId) {
    invalid("The preannotation review does not belong to this clip.", "LOCAL_TRACKING_SCOPE_MISMATCH");
  }
  return {
    itemId: identifier(value.itemId, "preannotation review item id"),
    clipId,
    angleId: identifier(value.angleId || "primary", "preannotation review angle id"),
    sourceSha256: sha256(value.sourceSha256, "preannotation review source checksum"),
    workspaceSha256: sha256(value.workspaceSha256, "preannotation review workspace checksum"),
    caseId: identifier(value.caseId, "preannotation review case id"),
  };
}

export function localTrackingPreannotationReviewDraftId(scopeValue = {}, value = {}) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const identity = normalizedIdentity(value, scope);
  return [scope.id, identity.itemId, identity.angleId].map(encodeURIComponent).join("::");
}

function normalizedDecisions(value = []) {
  if (!Array.isArray(value) || !value.length || value.length > maximumDecisions) {
    invalid("A preannotation review draft has an invalid decision count.");
  }
  const seen = new Set();
  return value.map((entry) => {
    exactKeys(entry, ["trackId", "decision"], "Preannotation review decision");
    const trackId = identifier(entry.trackId, "preannotation review track id");
    const decision = String(entry.decision || "");
    if (!decisions.has(decision) || seen.has(trackId)) invalid("A preannotation review decision is invalid or duplicated.");
    seen.add(trackId);
    return { trackId, decision };
  }).sort((first, second) => first.trackId.localeCompare(second.trackId));
}

function normalizedHistory(value = [], decisionValues = []) {
  if (!Array.isArray(value) || value.length !== decisionValues.length) {
    invalid("Preannotation review history is incomplete.");
  }
  const byTrackId = new Map(decisionValues.map((entry) => [entry.trackId, entry.decision]));
  const seen = new Set();
  return value.map((entry) => {
    exactKeys(entry, ["trackId", "decision"], "Preannotation review history entry");
    const trackId = identifier(entry.trackId, "preannotation review history track id");
    const decision = String(entry.decision || "");
    if (seen.has(trackId) || byTrackId.get(trackId) !== decision) {
      invalid("Preannotation review history does not match its decisions.");
    }
    seen.add(trackId);
    return { trackId, decision };
  });
}

function serializedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createLocalTrackingPreannotationReviewDraft(value = {}, options = {}) {
  const scope = createLocalTrackingWorkspaceScope(value.scope);
  const identity = normalizedIdentity(value, scope);
  const totalSuggestionCount = integer(
    value.totalSuggestionCount,
    "preannotation review suggestion count",
    1,
    maximumDecisions,
  );
  const normalized = normalizedDecisions(value.decisions);
  if (normalized.length > totalSuggestionCount) invalid("Preannotation review decisions exceed the suggestion count.");
  const history = normalizedHistory(value.history, normalized);
  const record = {
    version: LOCAL_TRACKING_PREANNOTATION_REVIEW_VERSION,
    protocol: LOCAL_TRACKING_PREANNOTATION_REVIEW_PROTOCOL,
    id: localTrackingPreannotationReviewDraftId(scope, identity),
    scopeId: scope.id,
    scope,
    ...identity,
    totalSuggestionCount,
    decisionCount: normalized.length,
    decisions: normalized,
    history,
    updatedAt: timestamp(options.now?.() ?? value.updatedAt ?? Date.now(), "preannotation review update time"),
  };
  if (serializedBytes(record) > maximumSerializedBytes) {
    invalid("The preannotation review draft is too large.", "LOCAL_TRACKING_PREANNOTATION_REVIEW_LIMIT");
  }
  return deepFreeze(record);
}

export function validateLocalTrackingPreannotationReviewDraft(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "scopeId", "scope", "itemId", "clipId", "angleId",
    "sourceSha256", "workspaceSha256", "caseId", "totalSuggestionCount", "decisionCount",
    "decisions", "history", "updatedAt",
  ], "Local preannotation review draft");
  exactKeys(value.scope, [
    "id", "organizationId", "teamId", "userId", "clipId", "matchId", "videoId",
    "localVideoIdentifier", "sourceType", "sourceId",
  ], "Local preannotation review scope");
  if (Number(value.version) !== LOCAL_TRACKING_PREANNOTATION_REVIEW_VERSION
    || value.protocol !== LOCAL_TRACKING_PREANNOTATION_REVIEW_PROTOCOL) {
    invalid("The local preannotation review protocol is invalid.");
  }
  const normalized = createLocalTrackingPreannotationReviewDraft(value, { now: () => value.updatedAt });
  if (value.id !== normalized.id || value.scopeId !== normalized.scopeId
    || Number(value.decisionCount) !== normalized.decisionCount) {
    invalid("The local preannotation review identity is invalid.", "LOCAL_TRACKING_SCOPE_MISMATCH");
  }
  return normalized;
}

function openDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open local preannotation review progress."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: "id" });
      if (!store.indexNames.contains("scope")) store.createIndex("scope", "scopeId", { unique: false });
      if (!store.indexNames.contains("updated")) store.createIndex("updated", "updatedAt", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Local preannotation review request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Local preannotation review transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local preannotation review transaction was aborted."));
  });
}

export async function saveLocalTrackingPreannotationReviewDraft(scope = {}, value = {}, options = {}) {
  const record = createLocalTrackingPreannotationReviewDraft({ ...value, scope }, options);
  const db = await openDatabase(options.win || globalThis.window);
  try {
    const transaction = db.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(storeName).put(record);
    await completed;
    return record;
  } finally {
    db.close?.();
  }
}

export async function getLocalTrackingPreannotationReviewDraft(scopeValue = {}, identityValue = {}, win = globalThis.window) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const identity = normalizedIdentity(identityValue, scope);
  const id = localTrackingPreannotationReviewDraftId(scope, identity);
  const db = await openDatabase(win);
  try {
    const value = await requestPromise(db.transaction(storeName).objectStore(storeName).get(id));
    if (!value) return null;
    const record = validateLocalTrackingPreannotationReviewDraft(value);
    if (record.scopeId !== scope.id || record.itemId !== identity.itemId || record.clipId !== identity.clipId
      || record.angleId !== identity.angleId || record.sourceSha256 !== identity.sourceSha256
      || record.workspaceSha256 !== identity.workspaceSha256 || record.caseId !== identity.caseId) return null;
    return record;
  } finally {
    db.close?.();
  }
}

export async function removeLocalTrackingPreannotationReviewDraft(
  scopeValue = {},
  identityValue = {},
  win = globalThis.window,
) {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  const id = localTrackingPreannotationReviewDraftId(scope, identityValue);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(storeName).delete(id);
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}
