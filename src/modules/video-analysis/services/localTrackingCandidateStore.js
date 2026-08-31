import { createTrackingBenchmarkWorkspaceScope } from "./trackingBenchmarkWorkspaceService.js";
import {
  trackingCandidatePipelineSummary,
  validateTrackingCandidatePipelineArtifact,
} from "./trackingCandidatePipelineArtifactService.js";

const databaseName = "football-science-tracking-candidate-evidence";
const databaseVersion = 1;
const runStoreName = "pipeline-runs";
const summaryStoreName = "pipeline-summaries";
const maximumRunsPerItem = 12;
const maximumRunsPerScope = 48;
const maximumBytesPerScope = 512 * 1024 * 1024;
const candidateStages = Object.freeze(["detection", "association", "reidentification", "classification"]);
const reviewFields = Object.freeze([
  "trackCount", "playerTrackCount", "ballTrackCount", "refereeTrackCount",
  "unassignedObservationCount", "playerIdentityReviewCount", "lowConfidenceTrackCount",
  "classificationConflictCount", "reidentificationMergeCount",
]);

function invalid(message, code = "TRACKING_CANDIDATE_WORKSPACE_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 200 || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function summaryRange(value = {}, label = "candidate range") {
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) {
    invalid(`Invalid ${label}.`);
  }
  return { startMs, endMs };
}

function summaryProviders(value = {}) {
  return Object.fromEntries(candidateStages.map((stage) => {
    const provider = value?.[stage] || {};
    const profile = provider.executionProfile || {};
    const cpuThreads = Number(profile.cpuThreads);
    const sampleFps = Number(profile.sampleFps);
    if (provider.stage !== stage || provider.protocol !== "football-science-tracking-stage-v1"
      || !Array.isArray(provider.capabilities) || !provider.capabilities.length
      || !Number.isSafeInteger(cpuThreads) || cpuThreads < 1 || cpuThreads > 256
      || !(sampleFps > 0) || sampleFps > 240 || typeof profile.modelResident !== "boolean") {
      invalid(`Invalid ${stage} candidate summary.`);
    }
    return [stage, {
      id: identifier(provider.id, `${stage} provider id`),
      version: identifier(provider.version, `${stage} provider version`),
      protocol: provider.protocol,
      stage,
      capabilities: provider.capabilities.map((entry) => identifier(entry, `${stage} capability`)),
      providerFingerprintSha256: sha256(provider.providerFingerprintSha256, `${stage} provider fingerprint`),
      executionFingerprintSha256: sha256(provider.executionFingerprintSha256, `${stage} execution fingerprint`),
      executionProfile: {
        device: identifier(profile.device, `${stage} candidate device`),
        runtimeMode: identifier(profile.runtimeMode, `${stage} candidate runtime mode`),
        cpuThreads,
        sampleFps,
        modelResident: profile.modelResident,
      },
    }];
  }));
}

function summaryReview(value = {}) {
  return Object.fromEntries(reviewFields.map((field) => {
    const number = Number(value[field]);
    if (!Number.isSafeInteger(number) || number < 0) invalid(`Invalid candidate ${field}.`);
    return [field, number];
  }));
}

function storageKey(scope = {}, itemId = "", runId = "") {
  return [scope.id, encodeURIComponent(identifier(itemId, "candidate item id")), identifier(runId, "candidate run id")].join("::");
}

function openDatabase(win = globalThis.window) {
  if (!win?.indexedDB?.open) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error || new Error("Could not open the local candidate evidence store."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const runs = db.objectStoreNames.contains(runStoreName)
        ? request.transaction.objectStore(runStoreName)
        : db.createObjectStore(runStoreName, { keyPath: "key" });
      const summaries = db.objectStoreNames.contains(summaryStoreName)
        ? request.transaction.objectStore(summaryStoreName)
        : db.createObjectStore(summaryStoreName, { keyPath: "key" });
      if (!runs.indexNames.contains("scope-item")) runs.createIndex("scope-item", ["scopeId", "itemId"], { unique: false });
      if (!summaries.indexNames.contains("scope")) summaries.createIndex("scope", "scopeId", { unique: false });
      if (!summaries.indexNames.contains("scope-item")) summaries.createIndex("scope-item", ["scopeId", "itemId"], { unique: false });
      if (!summaries.indexNames.contains("created")) summaries.createIndex("created", "createdAt", { unique: false });
    };
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("IndexedDB candidate evidence request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB candidate evidence transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB candidate evidence transaction was aborted."));
  });
}

function normalizedSummary(value = {}) {
  const source = value.pipeline ? trackingCandidatePipelineSummary(value) : value;
  const createdAt = String(source.createdAt || "");
  const serializedBytes = Number(source.serializedBytes);
  if (!Number.isFinite(Date.parse(createdAt))
    || !Number.isSafeInteger(serializedBytes)
    || serializedBytes < 1) invalid("Stored candidate summary is invalid.");
  return {
    id: identifier(source.id, "candidate run id"),
    itemId: identifier(source.itemId, "candidate item id"),
    createdAt: new Date(createdAt).toISOString(),
    sourceFingerprint: sha256(source.sourceFingerprint, "candidate source fingerprint"),
    sourceRange: summaryRange(source.sourceRange, "candidate source range"),
    matchRange: summaryRange(source.matchRange, "candidate match range"),
    angleId: identifier(source.angleId, "candidate angle id"),
    pipelineFingerprintSha256: sha256(source.pipelineFingerprintSha256, "candidate pipeline fingerprint"),
    contentSha256: sha256(source.contentSha256, "candidate content fingerprint"),
    serializedBytes,
    providers: summaryProviders(source.providers),
    review: summaryReview(source.review),
  };
}

export async function saveLocalTrackingCandidatePipelineRun(value = {}, win = globalThis.window) {
  const artifact = await validateTrackingCandidatePipelineArtifact(value, { cryptoApi: win?.crypto || globalThis.crypto });
  const scope = createTrackingBenchmarkWorkspaceScope(artifact.scope);
  const key = storageKey(scope, artifact.itemId, artifact.id);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction([runStoreName, summaryStoreName], "readwrite");
    const completed = transactionDone(transaction);
    const summaryStore = transaction.objectStore(summaryStoreName);
    const existing = await requestPromise(summaryStore.index("scope").getAll(scope.id));
    const replacing = existing.find((entry) => entry.key === key);
    const itemCount = existing.filter((entry) => entry.itemId === artifact.itemId && entry.key !== key).length;
    const scopeCount = existing.filter((entry) => entry.key !== key).length;
    const scopeBytes = existing.reduce((total, entry) => (
      entry.key === key ? total : total + Math.max(0, Number(entry.serializedBytes) || 0)
    ), 0) + artifact.serializedBytes;
    if ((!replacing && itemCount >= maximumRunsPerItem)
      || (!replacing && scopeCount >= maximumRunsPerScope)
      || scopeBytes > maximumBytesPerScope) {
      transaction.abort();
      invalid(
        "The local candidate evidence workspace is full. Export or remove an older run first.",
        "TRACKING_CANDIDATE_WORKSPACE_LIMIT",
      );
    }
    const summary = normalizedSummary(artifact);
    transaction.objectStore(runStoreName).put({ key, scopeId: scope.id, itemId: artifact.itemId, artifact });
    summaryStore.put({ key, scopeId: scope.id, ...summary });
    await completed;
    return summary;
  } finally {
    db.close?.();
  }
}

export async function listLocalTrackingCandidatePipelineRuns(scopeValue = {}, itemId = "", win = globalThis.window) {
  const scope = createTrackingBenchmarkWorkspaceScope(scopeValue);
  const item = identifier(itemId, "candidate item id");
  const db = await openDatabase(win);
  try {
    const values = await requestPromise(
      db.transaction(summaryStoreName).objectStore(summaryStoreName).index("scope-item").getAll([scope.id, item]),
    );
    return values.map(normalizedSummary).sort((first, second) => (
      Date.parse(second.createdAt) - Date.parse(first.createdAt)
      || first.id.localeCompare(second.id)
    ));
  } finally {
    db.close?.();
  }
}

export async function getLocalTrackingCandidatePipelineRun(scopeValue = {}, itemId = "", runId = "", win = globalThis.window) {
  const scope = createTrackingBenchmarkWorkspaceScope(scopeValue);
  const item = identifier(itemId, "candidate item id");
  const key = storageKey(scope, item, runId);
  const db = await openDatabase(win);
  try {
    const record = await requestPromise(db.transaction(runStoreName).objectStore(runStoreName).get(key));
    if (!record) return null;
    if (record.scopeId !== scope.id || record.itemId !== item) invalid("Candidate evidence scope isolation failed.");
    const artifact = await validateTrackingCandidatePipelineArtifact(record.artifact, {
      cryptoApi: win?.crypto || globalThis.crypto,
    });
    if (storageKey(scope, artifact.itemId, artifact.id) !== key) invalid("Candidate evidence scope isolation failed.");
    return artifact;
  } finally {
    db.close?.();
  }
}

export async function removeLocalTrackingCandidatePipelineRun(scopeValue = {}, itemId = "", runId = "", win = globalThis.window) {
  const scope = createTrackingBenchmarkWorkspaceScope(scopeValue);
  const key = storageKey(scope, itemId, runId);
  const db = await openDatabase(win);
  try {
    const transaction = db.transaction([runStoreName, summaryStoreName], "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(runStoreName).delete(key);
    transaction.objectStore(summaryStoreName).delete(key);
    await completed;
    return true;
  } finally {
    db.close?.();
  }
}
