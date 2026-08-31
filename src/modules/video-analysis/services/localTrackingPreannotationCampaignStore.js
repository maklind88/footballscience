import { createLocalTrackingWorkspaceScope } from "./localTrackingWorkspaceContract.js";

export const LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_PROTOCOL =
  "football-science-local-tracking-preannotation-campaign-case-v1";
export const LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_VERSION = 1;

const databaseName = "football-science-tracking-preannotation-campaigns";
const databaseVersion = 1;
const storeName = "cases";
const maximumCampaignCases = 100;
const maximumSuggestions = 25_000;

export class LocalTrackingPreannotationCampaignError extends Error {
  constructor(message, code = "LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_INVALID") {
    super(message);
    this.name = "LocalTrackingPreannotationCampaignError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new LocalTrackingPreannotationCampaignError(message, code);
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

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximumSuggestions) invalid(`Invalid ${label}.`);
  return number;
}

function timestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid("Invalid campaign update time.");
  return date.toISOString();
}

function scopeIdentity(scopeValue = {}) {
  if (scopeValue.sourceType && scopeValue.sourceId) {
    return {
      organizationId: identifier(scopeValue.organizationId, "campaign organization id"),
      teamId: identifier(scopeValue.teamId, "campaign team id"),
      userId: identifier(scopeValue.userId, "campaign user id"),
      sourceType: identifier(scopeValue.sourceType, "campaign source type"),
      sourceId: identifier(scopeValue.sourceId, "campaign source id"),
    };
  }
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  return {
    organizationId: identifier(scope.organizationId, "campaign organization id"),
    teamId: identifier(scope.teamId, "campaign team id"),
    userId: identifier(scope.userId, "campaign user id"),
    sourceType: identifier(scope.sourceType, "campaign source type"),
    sourceId: identifier(scope.sourceId, "campaign source id"),
  };
}

export function localTrackingPreannotationCampaignId(scopeValue = {}, workspaceSha256 = "") {
  const scope = scopeIdentity(scopeValue);
  const workspace = sha256(workspaceSha256, "campaign workspace checksum");
  return [scope.organizationId, scope.teamId, scope.userId, scope.sourceType, scope.sourceId, workspace]
    .map(encodeURIComponent).join("::");
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

export function createLocalTrackingPreannotationCampaignCase(value = {}, options = {}) {
  const scope = scopeIdentity(value.scope);
  const workspaceSha256 = sha256(value.workspaceSha256, "campaign workspace checksum");
  const campaignId = localTrackingPreannotationCampaignId(value.scope, workspaceSha256);
  const caseId = identifier(value.caseId, "campaign case id");
  const clipId = identifier(value.clipId, "campaign clip id");
  if (value.scope?.clipId
    && identifier(value.scope.clipId, "campaign scope clip id") !== clipId) {
    invalid(
      "Campaign case does not belong to this clip.",
      "LOCAL_TRACKING_CAMPAIGN_SCOPE_MISMATCH",
    );
  }
  const totalSuggestionCount = integer(value.totalSuggestionCount, "campaign suggestion count");
  const pendingCount = integer(value.pendingCount, "campaign pending count");
  const acceptedCount = integer(value.acceptedCount, "campaign accepted count");
  const rejectedCount = integer(value.rejectedCount, "campaign rejected count");
  const savedCount = integer(value.savedCount, "campaign saved count");
  if (!totalSuggestionCount
    || pendingCount + acceptedCount + rejectedCount + savedCount !== totalSuggestionCount) {
    invalid("Campaign progress counts do not reconcile.");
  }
  return Object.freeze({
    version: LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_VERSION,
    protocol: LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_PROTOCOL,
    id: `${campaignId}::${encodeURIComponent(caseId)}`,
    campaignId,
    scope,
    workspaceSha256,
    packId: identifier(value.packId, "campaign pack id"),
    caseId,
    itemId: identifier(value.itemId, "campaign item id"),
    clipId,
    angleId: identifier(value.angleId || "primary", "campaign angle id"),
    sourceSha256: sha256(value.sourceSha256, "campaign source checksum"),
    totalSuggestionCount,
    pendingCount,
    acceptedCount,
    rejectedCount,
    savedCount,
    updatedAt: timestamp(options.now?.() ?? value.updatedAt ?? Date.now()),
  });
}

export function validateLocalTrackingPreannotationCampaignCase(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "campaignId", "scope", "workspaceSha256", "packId", "caseId",
    "itemId", "clipId", "angleId", "sourceSha256", "totalSuggestionCount", "pendingCount",
    "acceptedCount", "rejectedCount", "savedCount", "updatedAt",
  ], "Local preannotation campaign case");
  exactKeys(value.scope, [
    "organizationId", "teamId", "userId", "sourceType", "sourceId",
  ], "Campaign scope");
  if (Number(value.version) !== LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_VERSION
    || value.protocol !== LOCAL_TRACKING_PREANNOTATION_CAMPAIGN_PROTOCOL) {
    invalid("The local preannotation campaign protocol is invalid.");
  }
  const normalized = createLocalTrackingPreannotationCampaignCase({ ...value, scope: value.scope }, {
    now: () => value.updatedAt,
  });
  if (value.id !== normalized.id || value.campaignId !== normalized.campaignId) {
    invalid("The local preannotation campaign identity is invalid.", "LOCAL_TRACKING_CAMPAIGN_SCOPE_MISMATCH");
  }
  return normalized;
}

function openDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open local preannotation campaign progress."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: "id" });
      store.createIndex("campaign", "campaignId", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Local preannotation campaign request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Local preannotation campaign transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local preannotation campaign transaction was aborted."));
  });
}

export async function saveLocalTrackingPreannotationCampaignCase(scope = {}, value = {}, options = {}) {
  const record = createLocalTrackingPreannotationCampaignCase({ ...value, scope }, options);
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

export async function listLocalTrackingPreannotationCampaignCases(
  scope = {},
  workspaceSha256 = "",
  win = globalThis.window,
) {
  const campaignId = localTrackingPreannotationCampaignId(scope, workspaceSha256);
  const db = await openDatabase(win);
  try {
    const values = await requestPromise(
      db.transaction(storeName).objectStore(storeName).index("campaign").getAll(campaignId),
    );
    if (!Array.isArray(values) || values.length > maximumCampaignCases) {
      invalid("Local preannotation campaign contains too many cases.");
    }
    return Object.freeze(values.map(validateLocalTrackingPreannotationCampaignCase)
      .sort((first, second) => first.caseId.localeCompare(second.caseId)));
  } finally {
    db.close?.();
  }
}
