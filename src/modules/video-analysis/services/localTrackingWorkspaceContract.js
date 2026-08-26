import {
  normalizeObjectTrack,
  trackingPoints,
} from "../domain/tracking.model.js";
import {
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
} from "./trackingBenchmarkContract.js";

export const LOCAL_TRACKING_WORKSPACE_VERSION = 1;
export const LOCAL_TRACKING_WORKSPACE_PROTOCOL = "football-science-local-tracking-workspace-v1";
export const LOCAL_TRACKING_CHUNK_PROTOCOL = "football-science-local-tracking-chunk-v1";
export const MAX_LOCAL_TRACKING_TRACKS_PER_SCOPE = 200;
export const MAX_LOCAL_TRACKING_POINTS_PER_TRACK = 100_000;
export const MAX_LOCAL_TRACKING_CHUNK_POINTS = 1_000;
export const MAX_LOCAL_TRACKING_TRACK_BYTES = 32 * 1024 * 1024;
export const MAX_LOCAL_TRACKING_SCOPE_BYTES = 256 * 1024 * 1024;

const unsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
const syncStatuses = new Set(["pending", "synced"]);

export class LocalTrackingWorkspaceError extends Error {
  constructor(message, code = "LOCAL_TRACKING_WORKSPACE_INVALID", options = {}) {
    super(message, options);
    this.name = "LocalTrackingWorkspaceError";
    this.code = code;
  }
}

function invalid(message, code, options) {
  throw new LocalTrackingWorkspaceError(message, code, options);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

function boundedText(value, label, maximum = 200, optional = false) {
  const text = String(value || "").trim();
  if ((!text && !optional) || text.length > maximum || /[\r\n]/.test(text)) {
    invalid(`Invalid ${label}.`);
  }
  return text;
}

function identifier(value, label, optional = false) {
  const text = boundedText(value, label, 220, optional);
  if (text && (unsafeObjectKeys.has(text) || /[\\/]/.test(text) || /^(?:file|blob|data|https?):/i.test(text))) {
    invalid(`Invalid ${label}.`);
  }
  return text;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || !Number.isFinite(Date.parse(text))) invalid(`Invalid ${label}.`);
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function transientFreeMetadata(value = {}) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  delete metadata.localWorkspaceStatus;
  delete metadata.localWorkspaceError;
  delete metadata.centralSyncPending;
  return metadata;
}

function safeTrack(value = {}, scope = {}) {
  const track = normalizeObjectTrack(value);
  if (!identifier(track.id, "tracking track id")) invalid("A local tracking track id is required.");
  if (!identifier(track.clipId, "tracking clip id") || track.clipId !== scope.clipId) {
    invalid("The local tracking track does not belong to this clip.", "LOCAL_TRACKING_SCOPE_MISMATCH");
  }
  const normalized = normalizeObjectTrack({
    ...track,
    metadata: transientFreeMetadata(track.metadata),
  });
  assertBenchmarkMetadataOnly(normalized);
  const points = trackingPoints(normalized);
  if (!points.length || points.length > MAX_LOCAL_TRACKING_POINTS_PER_TRACK) {
    invalid(
      `A local tracking track must contain 1-${MAX_LOCAL_TRACKING_POINTS_PER_TRACK} points.`,
      "LOCAL_TRACKING_WORKSPACE_LIMIT",
    );
  }
  return normalized;
}

function scopeIdentity(value = {}) {
  const matchId = identifier(value.matchId || value.match_id, "tracking match id", true);
  const videoId = identifier(value.videoId || value.video_id, "tracking video id", true);
  const localVideoIdentifier = identifier(
    value.localVideoIdentifier || value.local_video_identifier,
    "tracking local video identifier",
    true,
  );
  const sourceType = matchId ? "match" : videoId ? "video" : localVideoIdentifier ? "local-video" : "";
  const sourceId = matchId || videoId || localVideoIdentifier;
  if (!sourceId) invalid("A local tracking source identity is required.", "LOCAL_TRACKING_SCOPE_MISSING");
  return { matchId, videoId, localVideoIdentifier, sourceType, sourceId };
}

export function createLocalTrackingWorkspaceScope(value = {}) {
  const organizationId = identifier(value.organizationId || value.organization_id, "tracking organization id");
  const teamId = identifier(value.teamId || value.team_id, "tracking team id");
  const userId = identifier(value.userId || value.user_id, "tracking user id");
  const clipId = identifier(value.clipId || value.clip_id, "tracking clip id");
  const source = scopeIdentity(value);
  const id = [organizationId, teamId, userId, source.sourceType, source.sourceId, clipId]
    .map((entry) => encodeURIComponent(entry))
    .join("::");
  return deepFreeze({ id, organizationId, teamId, userId, clipId, ...source });
}

export function localTrackingTrackRecordId(scopeValue = {}, trackId = "") {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  return `${scope.id}::${encodeURIComponent(identifier(trackId, "tracking track id"))}`;
}

function segmentDescriptor(segment = {}) {
  return {
    id: identifier(segment.id, "tracking segment id"),
    startMs: Math.max(0, Math.round(Number(segment.startMs) || 0)),
    endMs: Math.max(0, Math.round(Number(segment.endMs) || 0)),
    confidence: Math.max(0, Math.min(1, Number(segment.confidence) || 0)),
    discontinuityBefore: segment.discontinuityBefore === true,
    points: [],
  };
}

function chunksForTrack(recordId, scope, track) {
  const chunks = [];
  track.segments.forEach((segment, segmentIndex) => {
    for (let offset = 0; offset < segment.points.length; offset += MAX_LOCAL_TRACKING_CHUNK_POINTS) {
      const chunkIndex = Math.floor(offset / MAX_LOCAL_TRACKING_CHUNK_POINTS);
      chunks.push({
        version: LOCAL_TRACKING_WORKSPACE_VERSION,
        protocol: LOCAL_TRACKING_CHUNK_PROTOCOL,
        id: `${recordId}::${segmentIndex}::${chunkIndex}`,
        scopeId: scope.id,
        trackRecordId: recordId,
        trackId: track.id,
        segmentIndex,
        chunkIndex,
        points: segment.points.slice(offset, offset + MAX_LOCAL_TRACKING_CHUNK_POINTS),
      });
    }
  });
  return chunks;
}

function serializedBundleSize(record, chunks) {
  let size = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    record.serializedSize = size;
    const next = benchmarkSerializedBytes({ record, chunks }, "Local tracking track");
    if (next === size) return size;
    size = next;
  }
  record.serializedSize = size;
  return benchmarkSerializedBytes({ record, chunks }, "Local tracking track");
}

export function createLocalTrackingTrackBundle(value = {}, options = {}) {
  const scope = createLocalTrackingWorkspaceScope(value.scope);
  const track = safeTrack(value.track || value, scope);
  const syncStatus = syncStatuses.has(value.syncStatus) ? value.syncStatus : "pending";
  const id = localTrackingTrackRecordId(scope, track.id);
  const chunks = chunksForTrack(id, scope, track);
  const record = {
    version: LOCAL_TRACKING_WORKSPACE_VERSION,
    protocol: LOCAL_TRACKING_WORKSPACE_PROTOCOL,
    id,
    scopeId: scope.id,
    scope,
    trackId: track.id,
    syncStatus,
    updatedAt: new Date(options.now?.() ?? value.updatedAt ?? Date.now()).toISOString(),
    pointCount: trackingPoints(track).length,
    chunkCount: chunks.length,
    serializedSize: 0,
    track: { ...track, segments: track.segments.map(segmentDescriptor) },
  };
  const serializedBytes = serializedBundleSize(record, chunks);
  if (serializedBytes > MAX_LOCAL_TRACKING_TRACK_BYTES) {
    invalid("The local tracking track is too large.", "LOCAL_TRACKING_WORKSPACE_LIMIT");
  }
  record.serializedSize = serializedBytes;
  assertBenchmarkMetadataOnly({ record, chunks });
  return deepFreeze({ record, chunks });
}

function validateRecord(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "scopeId", "scope", "trackId", "syncStatus",
    "updatedAt", "pointCount", "chunkCount", "serializedSize", "track",
  ], "Local tracking record");
  exactKeys(value.scope, [
    "id", "organizationId", "teamId", "userId", "clipId", "matchId", "videoId",
    "localVideoIdentifier", "sourceType", "sourceId",
  ], "Local tracking scope");
  if (Number(value.version) !== LOCAL_TRACKING_WORKSPACE_VERSION
    || value.protocol !== LOCAL_TRACKING_WORKSPACE_PROTOCOL) {
    invalid("The local tracking workspace protocol is invalid.");
  }
  const scope = createLocalTrackingWorkspaceScope(value.scope);
  const trackId = identifier(value.trackId, "tracking track id");
  if (value.id !== localTrackingTrackRecordId(scope, trackId) || value.scopeId !== scope.id) {
    invalid("The local tracking record scope is invalid.", "LOCAL_TRACKING_SCOPE_MISMATCH");
  }
  isoTimestamp(value.updatedAt, "tracking workspace update time");
  if (!syncStatuses.has(value.syncStatus)) invalid("The local tracking sync status is invalid.");
  const pointCount = Number(value.pointCount);
  const chunkCount = Number(value.chunkCount);
  const serializedSize = Number(value.serializedSize);
  if (!Number.isSafeInteger(pointCount) || pointCount < 1 || pointCount > MAX_LOCAL_TRACKING_POINTS_PER_TRACK
    || !Number.isSafeInteger(chunkCount) || chunkCount < 1
    || !Number.isSafeInteger(serializedSize) || serializedSize < 1 || serializedSize > MAX_LOCAL_TRACKING_TRACK_BYTES) {
    invalid("The local tracking record exceeds its safety limits.", "LOCAL_TRACKING_WORKSPACE_LIMIT");
  }
  assertBenchmarkMetadataOnly(value);
  return { scope, trackId };
}

export function hydrateLocalTrackingTrack(recordValue = {}, chunkValues = []) {
  const { scope, trackId } = validateRecord(recordValue);
  const chunks = [...chunkValues].sort((first, second) => (
    Number(first.segmentIndex) - Number(second.segmentIndex)
      || Number(first.chunkIndex) - Number(second.chunkIndex)
  ));
  if (chunks.length !== Number(recordValue.chunkCount)) invalid("Local tracking chunks are incomplete.");
  const chunkIds = new Set();
  chunks.forEach((chunk) => {
    exactKeys(chunk, [
      "version", "protocol", "id", "scopeId", "trackRecordId", "trackId",
      "segmentIndex", "chunkIndex", "points",
    ], "Local tracking chunk");
    const segmentIndex = Number(chunk.segmentIndex);
    const chunkIndex = Number(chunk.chunkIndex);
    if (Number(chunk.version) !== LOCAL_TRACKING_WORKSPACE_VERSION
      || chunk.protocol !== LOCAL_TRACKING_CHUNK_PROTOCOL
      || chunk.scopeId !== scope.id
      || chunk.trackRecordId !== recordValue.id
      || chunk.trackId !== trackId
      || !Array.isArray(chunk.points)
      || chunk.points.length > MAX_LOCAL_TRACKING_CHUNK_POINTS
      || !Number.isSafeInteger(segmentIndex) || segmentIndex < 0
      || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0
      || chunk.id !== `${recordValue.id}::${segmentIndex}::${chunkIndex}`
      || chunkIds.has(chunk.id)) {
      invalid("A local tracking chunk sequence is invalid.");
    }
    chunkIds.add(chunk.id);
    assertBenchmarkMetadataOnly(chunk);
  });
  (recordValue.track?.segments || []).forEach((segment, segmentIndex) => {
    const indices = chunks
      .filter((chunk) => Number(chunk.segmentIndex) === segmentIndex)
      .map((chunk) => Number(chunk.chunkIndex));
    if (!indices.length || indices.some((value, index) => value !== index)) {
      invalid("Local tracking chunks are incomplete.");
    }
  });
  if (chunks.some((chunk) => Number(chunk.segmentIndex) >= (recordValue.track?.segments || []).length)) {
    invalid("A local tracking chunk references an unknown segment.");
  }
  if (benchmarkSerializedBytes({ record: recordValue, chunks }, "Local tracking track")
    !== Number(recordValue.serializedSize)) {
    invalid("The local tracking record size does not match its payload.");
  }
  const segments = (recordValue.track?.segments || []).map((segment, segmentIndex) => ({
    ...segment,
    points: chunks
      .filter((chunk) => Number(chunk.segmentIndex) === segmentIndex)
      .flatMap((chunk) => chunk.points),
  }));
  const track = safeTrack({ ...recordValue.track, id: trackId, segments }, scope);
  if (trackingPoints(track).length !== Number(recordValue.pointCount)) {
    invalid("Local tracking point count does not match its record.");
  }
  const entry = {
    track,
    syncStatus: recordValue.syncStatus,
    updatedAt: recordValue.updatedAt,
    serializedSize: Number(recordValue.serializedSize) || 0,
  };
  return deepFreeze(entry);
}

function hasSamples(track = {}) {
  return Array.isArray(track.segments) && track.segments.some((segment) => segment.points?.length);
}

function workspaceTrackKey(track = {}) {
  return String(track.metadata?.localWorkspaceTrackKey || "").trim();
}

function uniqueRemoteKeys(tracks = []) {
  const owners = new Map();
  tracks.forEach((track) => {
    const key = workspaceTrackKey(track);
    if (!key) return;
    if (owners.has(key) && owners.get(key) !== track.id) {
      invalid("Central tracking workspace identity key is ambiguous.", "LOCAL_TRACKING_IDENTITY_AMBIGUOUS");
    }
    owners.set(key, track.id);
  });
  return owners;
}

export function mergeTrackingWorkspaceTracks(remoteValues = [], localEntries = [], liveValues = []) {
  const remoteTracks = remoteValues.map(normalizeObjectTrack).filter((track) => track.id);
  const remote = new Map();
  remoteTracks.forEach((track) => {
    if (remote.has(track.id)) {
      invalid("Central tracking workspace contains a duplicate track.", "LOCAL_TRACKING_IDENTITY_AMBIGUOUS");
    }
    remote.set(track.id, track);
  });
  const remoteByWorkspaceKey = uniqueRemoteKeys(remoteTracks);
  const canonicalId = (track = {}) => remote.has(track.id)
    ? track.id
    : remoteByWorkspaceKey.get(workspaceTrackKey(track)) || track.id;
  const local = new Map();
  const migrations = [];
  localEntries.forEach((entry) => {
    const sourceTrack = normalizeObjectTrack(entry.track);
    const id = canonicalId(sourceTrack);
    const remoteTrack = remote.get(id);
    const normalizedEntry = {
      ...entry,
      syncStatus: remoteTrack ? "synced" : entry.syncStatus,
      track: id === sourceTrack.id ? sourceTrack : normalizeObjectTrack({
        ...sourceTrack,
        ...remoteTrack,
        id,
        segments: sourceTrack.segments,
        corrections: remoteTrack?.corrections?.length ? remoteTrack.corrections : sourceTrack.corrections,
        metadata: { ...(remoteTrack?.metadata || {}), ...(sourceTrack.metadata || {}) },
      }),
    };
    if (local.has(id)) {
      invalid("Local tracking workspace identity key is ambiguous.", "LOCAL_TRACKING_IDENTITY_AMBIGUOUS");
    }
    local.set(id, normalizedEntry);
    if (id !== sourceTrack.id) migrations.push({ previousTrackId: sourceTrack.id, trackId: id });
  });
  const live = new Map();
  liveValues.map(normalizeObjectTrack).filter((track) => track.id).forEach((track) => {
    const id = canonicalId(track);
    if (live.has(id)) {
      invalid("Live tracking workspace identity key is ambiguous.", "LOCAL_TRACKING_IDENTITY_AMBIGUOUS");
    }
    live.set(id, id === track.id ? track : normalizeObjectTrack({ ...track, id }));
  });
  const ids = [...new Set([...remote.keys(), ...local.keys(), ...live.keys()])].filter(Boolean);
  let localOnlyCount = 0;
  let missingSampleCount = 0;
  const tracks = ids.map((id) => {
    const remoteTrack = remote.get(id);
    const localEntry = local.get(id);
    const localTrack = localEntry?.track;
    const liveTrack = live.get(id);
    const liveHasSamples = hasSamples(liveTrack);
    const localHasSamples = hasSamples(localTrack);
    if (localEntry?.syncStatus === "pending") localOnlyCount += 1;
    if (remoteTrack && !liveHasSamples && !localHasSamples) missingSampleCount += 1;
    let merged;
    if (liveHasSamples) merged = liveTrack;
    else if (localTrack && localEntry.syncStatus === "pending") merged = localTrack;
    else if (localTrack) {
      merged = normalizeObjectTrack({
        ...localTrack,
        ...(remoteTrack || {}),
        segments: localTrack.segments,
        corrections: remoteTrack?.corrections?.length ? remoteTrack.corrections : localTrack.corrections,
        metadata: { ...(remoteTrack?.metadata || {}), ...(localTrack.metadata || {}) },
      });
    } else merged = remoteTrack;
    const localWorkspaceStatus = localEntry?.syncStatus === "pending"
      ? "pending-central"
      : hasSamples(merged) ? "ready" : "samples-missing";
    return normalizeObjectTrack({
      ...merged,
      metadata: { ...(merged?.metadata || {}), localWorkspaceStatus },
    });
  }).filter((track) => track.status !== "archived");
  return deepFreeze({ tracks, localOnlyCount, missingSampleCount, migrations });
}
