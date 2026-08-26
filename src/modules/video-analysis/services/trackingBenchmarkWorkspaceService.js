import {
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
} from "./trackingBenchmarkContract.js";
import { normalizeTrackingBenchmarkScenarios } from "./trackingBenchmarkScenarioService.js";
import {
  trackingGroundTruthSuiteEntry,
} from "./trackingGroundTruthSuiteService.js";
import {
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
  TRACKING_GROUND_TRUTH_MAX_RANGE_MS,
  normalizeTrackingGroundTruthBenchmarkType,
  trackingGroundTruthArtifactBenchmarkType,
  validateGroundTruthArtifact,
} from "./trackingGroundTruthService.js";
import {
  MAX_TRACKING_PROVIDER_RUNS_PER_WORKSPACE,
  MAX_TRACKING_PROVIDER_RUN_WORKSPACE_BYTES,
  trackingProviderRunWorkspaceEntry,
  trackingProviderRunsForItem,
} from "./trackingProviderRunService.js";

export const TRACKING_BENCHMARK_WORKSPACE_PROTOCOL = "football-science-tracking-benchmark-workspace-v1";
export const MAX_TRACKING_BENCHMARK_WORKSPACE_BYTES = 4 * MAX_TRACKING_BENCHMARK_SUITE_BYTES;

const maximumItems = 1000;
const unsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export class TrackingBenchmarkWorkspaceError extends Error {
  constructor(message, code = "TRACKING_BENCHMARK_WORKSPACE_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingBenchmarkWorkspaceError";
    this.code = code;
  }
}

function invalid(message, code, options) {
  throw new TrackingBenchmarkWorkspaceError(message, code, options);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

function boundedText(value, label, maximum = 160, optional = false) {
  const text = String(value || "").trim();
  if ((!text && !optional) || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function identifier(value, label, optional = false) {
  const text = boundedText(value, label, 200, optional);
  if (text && (unsafeObjectKeys.has(text) || /[\\/]/.test(text) || /^(?:file|blob|data|https?):/i.test(text))) {
    invalid(`Invalid ${label}.`);
  }
  return text;
}

function optionalIso(value, label) {
  const text = String(value || "").trim();
  if (text && !Number.isFinite(Date.parse(text))) invalid(`Invalid ${label}.`);
  return text;
}

function positiveInteger(value, label, maximum) {
  const number = Math.round(Number(value));
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function safeFrame(value = {}) {
  const width = Math.round(Number(value.width) || 0);
  const height = Math.round(Number(value.height) || 0);
  if (width < 0 || height < 0 || width > 16_384 || height > 16_384) invalid("Invalid benchmark draft frame.");
  return { width, height };
}

function safeRange(value = {}) {
  const startMs = Math.round(Number(value.startMs) || 0);
  const endMs = Math.round(Number(value.endMs) || 0);
  if (startMs < 0 || endMs <= startMs || endMs - startMs > TRACKING_GROUND_TRUTH_MAX_RANGE_MS) {
    invalid("Invalid benchmark draft range.");
  }
  return { startMs, endMs };
}

function optionalFingerprint(value = "") {
  const fingerprint = String(value || "").trim().toLowerCase();
  if (fingerprint && !/^[a-f0-9]{64}$/.test(fingerprint)) invalid("Invalid benchmark source fingerprint.");
  return fingerprint;
}

function uniqueIds(values = [], label = "id") {
  if (!Array.isArray(values) || values.length > maximumItems) invalid(`Invalid benchmark ${label} collection.`);
  const ids = values.map((value) => identifier(value, label));
  if (new Set(ids).size !== ids.length) invalid(`Benchmark ${label} values must be unique.`);
  return ids;
}

function safeDraft(value = {}, itemId = "") {
  const status = value.status === "locked" ? "locked" : "draft";
  const lockedArtifact = value.lockedArtifact ? validateGroundTruthArtifact(value.lockedArtifact) : null;
  if (status === "locked" && !lockedArtifact) invalid("A locked benchmark draft needs its immutable artifact.");
  return {
    itemId: identifier(itemId || value.itemId, "benchmark item id"),
    status,
    revision: positiveInteger(value.revision || 1, "benchmark draft revision", 1_000_000),
    benchmarkType: lockedArtifact
      ? trackingGroundTruthArtifactBenchmarkType(lockedArtifact)
      : normalizeTrackingGroundTruthBenchmarkType(value.benchmarkType),
    selectedTrackIds: uniqueIds(value.selectedTrackIds || [], "selected track id"),
    benchmarkTargetTrackId: identifier(value.benchmarkTargetTrackId, "benchmark target track id", true),
    scenarioTags: normalizeTrackingBenchmarkScenarios(value.scenarioTags),
    sourceFingerprint: optionalFingerprint(value.sourceFingerprint),
    angleId: identifier(value.angleId, "camera angle id", true),
    frame: safeFrame(value.frame),
    range: safeRange(value.range),
    attested: value.attested === true,
    exhaustiveSceneAttested: value.exhaustiveSceneAttested === true,
    lockedArtifact,
    lockedAt: optionalIso(value.lockedAt, "benchmark lock time"),
    downloadedAt: optionalIso(value.downloadedAt, "benchmark download time"),
  };
}

function safeGroundTruthWorkspace(value = {}) {
  const source = value.byItemId && typeof value.byItemId === "object" && !Array.isArray(value.byItemId)
    ? value.byItemId
    : {};
  const entries = Object.entries(source);
  if (entries.length > maximumItems) invalid("The local benchmark contains too many item drafts.");
  const byItemId = Object.fromEntries(entries.map(([itemId, draft]) => {
    const id = identifier(itemId, "benchmark item id");
    return [id, safeDraft(draft, id)];
  }));
  const suite = trackingGroundTruthSuiteEntry(value);
  const caseIds = new Set();
  const cases = suite.cases.map((artifact) => {
    const safe = validateGroundTruthArtifact(artifact);
    if (caseIds.has(safe.id)) invalid("Ground-truth suite case ids must be unique.");
    if (trackingGroundTruthArtifactBenchmarkType(safe) !== suite.benchmarkType) {
      invalid("Ground-truth suite cannot mix selected-object and full-scene references.");
    }
    caseIds.add(safe.id);
    return safe;
  });
  const groundTruth = {
    byItemId,
    suite: {
      id: identifier(suite.id, "ground-truth suite id"),
      revision: positiveInteger(suite.revision, "ground-truth suite revision", 1_000_000),
      status: suite.status === "exported" ? "exported" : "draft",
      benchmarkType: suite.benchmarkType,
      cases,
      downloadedAt: optionalIso(suite.downloadedAt, "ground-truth suite download time"),
      error: "",
    },
  };
  if (benchmarkSerializedBytes(groundTruth, "Local ground-truth workspace") > 2 * MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    invalid("The local ground-truth workspace is too large.", "TRACKING_BENCHMARK_WORKSPACE_LIMIT");
  }
  return groundTruth;
}

function safeProviderRunWorkspace(value = {}) {
  const workspace = trackingProviderRunWorkspaceEntry(value);
  const entries = Object.entries(workspace.byItemId);
  if (entries.length > maximumItems) invalid("The local benchmark contains too many provider-run items.");
  let runCount = 0;
  const byItemId = Object.fromEntries(entries.map(([itemId]) => {
    const id = identifier(itemId, "provider-run item id");
    const runs = trackingProviderRunsForItem(workspace, id);
    runCount += runs.length;
    return [id, runs];
  }));
  if (runCount > MAX_TRACKING_PROVIDER_RUNS_PER_WORKSPACE
    || benchmarkSerializedBytes(byItemId, "Local provider-run workspace") > MAX_TRACKING_PROVIDER_RUN_WORKSPACE_BYTES) {
    invalid("The local provider-run workspace is too large.", "TRACKING_BENCHMARK_WORKSPACE_LIMIT");
  }
  return {
    byItemId,
    downloadedAt: optionalIso(workspace.downloadedAt, "provider-run download time"),
    error: "",
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createTrackingBenchmarkWorkspaceScope(value = {}) {
  const organizationId = identifier(value.organizationId || value.organization_id, "benchmark organization id");
  const teamId = identifier(value.teamId || value.team_id, "benchmark team id");
  const userId = identifier(value.userId || value.user_id, "benchmark user id");
  const matchId = identifier(value.matchId || value.match_id, "benchmark match id", true);
  const videoId = identifier(value.videoId || value.video_id, "benchmark video id", true);
  const localVideoIdentifier = identifier(
    value.localVideoIdentifier || value.local_video_identifier,
    "benchmark local video identifier",
    true,
  );
  const sourceType = matchId ? "match" : videoId ? "video" : localVideoIdentifier ? "local-video" : "";
  const sourceId = matchId || videoId || localVideoIdentifier;
  if (!sourceId) invalid("A benchmark source identity is required.", "TRACKING_BENCHMARK_SCOPE_MISSING");
  const id = [organizationId, teamId, userId, sourceType, sourceId]
    .map((entry) => encodeURIComponent(entry))
    .join("::");
  return deepFreeze({
    id,
    organizationId,
    teamId,
    userId,
    sourceType,
    sourceId,
    matchId,
    videoId,
    localVideoIdentifier,
  });
}

export function emptyTrackingBenchmarkWorkspaceContent() {
  return {
    groundTruth: {
      byItemId: {},
      suite: {
        id: "real-match-pilot",
        revision: 1,
        status: "draft",
        benchmarkType: TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
        cases: [],
        downloadedAt: "",
        error: "",
      },
    },
    providerRuns: { byItemId: {}, downloadedAt: "", error: "" },
  };
}

export function normalizeTrackingBenchmarkWorkspaceContent(value = {}) {
  const tracking = value.tracking || value;
  const content = {
    groundTruth: safeGroundTruthWorkspace(tracking.groundTruth || {}),
    providerRuns: safeProviderRunWorkspace(tracking.providerRuns || {}),
  };
  assertBenchmarkMetadataOnly(content);
  if (benchmarkSerializedBytes(content, "Local tracking benchmark workspace") > MAX_TRACKING_BENCHMARK_WORKSPACE_BYTES) {
    invalid("The local tracking benchmark workspace is too large.", "TRACKING_BENCHMARK_WORKSPACE_LIMIT");
  }
  return deepFreeze(content);
}

export async function trackingBenchmarkWorkspaceContentFingerprint(value = {}, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) {
    invalid("Secure benchmark workspace checksums are unavailable.", "TRACKING_BENCHMARK_WORKSPACE_CRYPTO_MISSING");
  }
  const serialized = JSON.stringify(normalizeTrackingBenchmarkWorkspaceContent(value));
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createTrackingBenchmarkWorkspaceArtifact(value = {}, options = {}) {
  const scope = createTrackingBenchmarkWorkspaceScope(value.scope);
  const content = normalizeTrackingBenchmarkWorkspaceContent(value);
  const artifact = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    protocol: TRACKING_BENCHMARK_WORKSPACE_PROTOCOL,
    id: scope.id,
    scope,
    updatedAt: new Date(options.now?.() ?? value.updatedAt ?? Date.now()).toISOString(),
    ...content,
  };
  assertBenchmarkMetadataOnly(artifact);
  if (benchmarkSerializedBytes(artifact, "Local tracking benchmark workspace") > MAX_TRACKING_BENCHMARK_WORKSPACE_BYTES) {
    invalid("The local tracking benchmark workspace is too large.", "TRACKING_BENCHMARK_WORKSPACE_LIMIT");
  }
  return deepFreeze(artifact);
}

export function validateTrackingBenchmarkWorkspaceArtifact(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "scope", "updatedAt", "groundTruth", "providerRuns",
  ], "Tracking benchmark workspace");
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION
    || value.protocol !== TRACKING_BENCHMARK_WORKSPACE_PROTOCOL
    || !Number.isFinite(Date.parse(value.updatedAt))) {
    invalid("Tracking benchmark workspace protocol is invalid.");
  }
  const normalized = createTrackingBenchmarkWorkspaceArtifact(value, { now: () => value.updatedAt });
  if (normalized.id !== value.id) invalid("Tracking benchmark workspace scope does not match its id.");
  return normalized;
}
