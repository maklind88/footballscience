import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  createGroundTruthArtifact,
  groundTruthSceneTemporalCoverage,
} from "./trackingGroundTruthService.js";
import {
  TRACKING_GROUND_TRUTH_REFERENCE_PROTOCOL,
  normalizeGroundTruthReferenceEvidence,
} from "./trackingGroundTruthReferenceEvidenceService.js";

export const TRACKING_MOT_IMPORT_PROTOCOL = "football-science-mot-ground-truth-import-v1";
export const TRACKING_MOT_ANNOTATION_PROTOCOL = "motchallenge-10";
export const TRACKING_MOT_ANNOTATION_AUDIT_PROTOCOL =
  "football-science-mot-annotation-audit-v1";

const MAX_ANNOTATION_BYTES = 64 * 1024 * 1024;
const MAX_ANNOTATION_ROWS = 500_000;
const MAX_TRACKS = 1000;
const entityTypes = new Set(["player", "ball", "referee"]);

export class TrackingMotImportError extends Error {
  constructor(message, code = "TRACKING_MOT_IMPORT_INVALID") {
    super(message);
    this.name = "TrackingMotImportError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingMotImportError(message, code);
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    invalid(`Invalid ${label}.`);
  }
  return number;
}

function finite(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    invalid(`Invalid ${label}.`);
  }
  return number;
}

function bounded(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function normalizeTrackMap(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Track metadata is required.");
  const entries = Object.entries(value);
  if (!entries.length || entries.length > MAX_TRACKS) invalid("Track metadata count is outside the supported limit.");
  return new Map(entries.map(([rawId, rawMetadata]) => {
    const id = String(integer(rawId, "track id", 1, 1_000_000));
    const metadata = rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
      ? rawMetadata
      : invalid(`Track ${id} metadata must be an object.`);
    const allowed = ["entityType", "playerId", "playerLabel", "teamId", "teamSide", "shirtNumber"];
    const unsupported = Object.keys(metadata).filter((key) => !allowed.includes(key));
    if (unsupported.length) invalid(`Track ${id} contains unsupported metadata field ${unsupported[0]}.`);
    const entityType = String(metadata.entityType || "").trim().toLowerCase();
    if (!entityTypes.has(entityType)) invalid(`Track ${id} requires an explicit player, ball or referee type.`);
    const normalized = {
      entityType,
      playerId: String(metadata.playerId || "").trim().slice(0, 160),
      playerLabel: String(metadata.playerLabel || "").trim().slice(0, 160),
      teamId: String(metadata.teamId || "").trim().slice(0, 160),
      teamSide: String(metadata.teamSide || "").trim().slice(0, 40),
      shirtNumber: String(metadata.shirtNumber || "").trim().slice(0, 20),
    };
    if (entityType === "player"
      && (!normalized.playerId && !normalized.playerLabel
        || !normalized.teamId && !normalized.teamSide)) {
      invalid(`Player track ${id} requires an identity and team assignment.`);
    }
    return [id, normalized];
  }));
}

function normalizeSequenceDescriptor(value = {}) {
  const frame = {
    width: integer(value.frame?.width, "frame width", 1, 16_384),
    height: integer(value.frame?.height, "frame height", 1, 16_384),
  };
  const frameRate = finite(value.frameRate, "frame rate", 1, 240);
  const sequenceLengthFrames = integer(
    value.sequenceLengthFrames,
    "sequence frame count",
    2,
    1_000_000,
  );
  const firstFrameNumber = integer(value.firstFrameNumber ?? 1, "first frame number", 0, 1_000_000);
  const sourceStartMs = integer(value.sourceStartMs ?? 0, "source start time", 0, 24 * 60 * 60 * 1000);
  const coordinateOrigin = String(value.coordinateOrigin || "one-based");
  if (!new Set(["zero-based", "one-based"]).has(coordinateOrigin)) invalid("Unsupported box coordinate origin.");
  const maximumContinuousGapFrames = integer(
    value.maximumContinuousGapFrames ?? Math.max(1, Math.floor(frameRate / 2)),
    "maximum continuous frame gap",
    1,
    Math.max(1, Math.floor(frameRate / 2)),
  );
  return {
    frame,
    frameRate,
    sequenceLengthFrames,
    firstFrameNumber,
    lastFrameNumber: firstFrameNumber + sequenceLengthFrames - 1,
    sourceStartMs,
    coordinateOrigin,
    maximumContinuousGapFrames,
  };
}

function normalizeDescriptor(value = {}) {
  if (value.protocol !== TRACKING_MOT_IMPORT_PROTOCOL || Number(value.version) !== 1) {
    invalid("Unsupported MOT import descriptor.");
  }
  const sequence = normalizeSequenceDescriptor(value);
  if (value.attested !== true || value.exhaustiveSceneAttested !== true) {
    invalid("MOT import requires explicit frame-by-frame and exhaustive-scene attestation.");
  }
  const reviewedAt = new Date(value.reviewedAt);
  if (!Number.isFinite(reviewedAt.getTime())) invalid("A valid review time is required.");
  return {
    ...sequence,
    sourceFingerprint: bounded(value.sourceFingerprint, "source fingerprint", 64).toLowerCase(),
    angleId: bounded(value.angleId || "main", "camera angle", 160),
    reviewedBy: bounded(value.reviewedBy, "reviewer", 160),
    reviewedAt: reviewedAt.toISOString(),
    scenarioTags: Array.isArray(value.scenarioTags) ? value.scenarioTags : [],
    benchmarkTargetTrackId: String(value.benchmarkTargetTrackId || "").trim(),
    trackMap: normalizeTrackMap(value.trackMap),
    referenceEvidence: normalizeGroundTruthReferenceEvidence({
      ...value.referenceEvidence,
      protocol: TRACKING_GROUND_TRUTH_REFERENCE_PROTOCOL,
      sequenceId: bounded(value.sequenceId, "sequence id", 120),
      annotationProtocol: TRACKING_MOT_ANNOTATION_PROTOCOL,
      frameRate: sequence.frameRate,
      sequenceLengthFrames: sequence.sequenceLengthFrames,
      firstFrameNumber: sequence.firstFrameNumber,
      coordinateOrigin: sequence.coordinateOrigin,
      maximumContinuousGapFrames: sequence.maximumContinuousGapFrames,
      reviewedAt: reviewedAt.toISOString(),
    }),
  };
}

function parseRows(text, descriptor, options = {}) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_ANNOTATION_BYTES) {
    invalid("MOT annotations are empty or outside the size limit.", "TRACKING_MOT_IMPORT_LIMIT");
  }
  if (!text.trim()) {
    if (options.allowEmpty === true) return [];
    invalid("MOT annotations are empty or outside the size limit.", "TRACKING_MOT_IMPORT_LIMIT");
  }
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_ANNOTATION_ROWS + 1) invalid("MOT annotations exceed the row limit.", "TRACKING_MOT_IMPORT_LIMIT");
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    if (line.length > 512) invalid(`MOT annotation row ${index + 1} is too long.`);
    const columns = line.split(",").map((entry) => entry.trim());
    if (columns.length !== 10) invalid(`MOT annotation row ${index + 1} must contain exactly 10 columns.`);
    const frameNumber = integer(columns[0], `frame number on row ${index + 1}`, descriptor.firstFrameNumber, descriptor.lastFrameNumber);
    const trackId = String(integer(columns[1], `track id on row ${index + 1}`, 1, 1_000_000));
    const left = finite(columns[2], `box left on row ${index + 1}`, 0, descriptor.frame.width + 1);
    const top = finite(columns[3], `box top on row ${index + 1}`, 0, descriptor.frame.height + 1);
    const width = finite(columns[4], `box width on row ${index + 1}`, Number.EPSILON, descriptor.frame.width);
    const height = finite(columns[5], `box height on row ${index + 1}`, Number.EPSILON, descriptor.frame.height);
    const confidence = finite(columns[6], `confidence on row ${index + 1}`, Number.EPSILON, 1);
    columns.slice(7).forEach((entry, offset) => finite(entry, `MOT field ${offset + 8} on row ${index + 1}`, -1_000_000, 1_000_000));
    const originOffset = descriptor.coordinateOrigin === "one-based" ? 1 : 0;
    const normalizedLeft = left - originOffset;
    const normalizedTop = top - originOffset;
    if (normalizedLeft < 0 || normalizedTop < 0
      || normalizedLeft + width > descriptor.frame.width
      || normalizedTop + height > descriptor.frame.height) {
      invalid(`MOT annotation box on row ${index + 1} leaves the video frame.`);
    }
    rows.push({ frameNumber, trackId, left: normalizedLeft, top: normalizedTop, width, height, confidence });
  }
  if (!rows.length && options.allowEmpty !== true) invalid("MOT annotations contain no usable ground truth.");
  return rows.sort((first, second) => first.trackId.localeCompare(second.trackId, undefined, { numeric: true })
    || first.frameNumber - second.frameNumber);
}

function pointFromRow(row, descriptor) {
  const frameIndex = row.frameNumber - descriptor.firstFrameNumber;
  const x = (row.left + (row.width / 2)) / descriptor.frame.width;
  const y = (row.top + (row.height / 2)) / descriptor.frame.height;
  return {
    atMs: descriptor.sourceStartMs + Math.round((frameIndex * 1000) / descriptor.frameRate),
    frameIndex,
    x,
    y,
    width: row.width / descriptor.frame.width,
    height: row.height / descriptor.frame.height,
    groundX: x,
    groundY: (row.top + row.height) / descriptor.frame.height,
    confidence: row.confidence,
    identityConfidence: 1,
    source: "manual",
  };
}

function segmentsFromRows(rows, descriptor, trackId) {
  const groups = [];
  let current = [];
  for (const row of rows) {
    const previous = current.at(-1);
    if (previous && row.frameNumber - previous.frameNumber > descriptor.maximumContinuousGapFrames) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) groups.push(current);
  return groups.map((group, index) => {
    const points = group.map((row) => pointFromRow(row, descriptor));
    return {
      id: `mot-${trackId}-segment-${index + 1}`,
      startMs: points[0].atMs,
      endMs: points.at(-1).atMs,
      discontinuityBefore: index > 0,
      confidence: 1,
      points,
    };
  });
}

function tracksFromRows(rows, descriptor) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!descriptor.trackMap.has(row.trackId)) invalid(`Missing explicit metadata for MOT track ${row.trackId}.`);
    if (!grouped.has(row.trackId)) grouped.set(row.trackId, []);
    const values = grouped.get(row.trackId);
    if (values.at(-1)?.frameNumber === row.frameNumber) invalid(`MOT track ${row.trackId} has duplicate frame ${row.frameNumber}.`);
    values.push(row);
  });
  const unused = [...descriptor.trackMap.keys()].filter((trackId) => !grouped.has(trackId));
  if (unused.length) invalid(`Track metadata has no annotations for MOT track ${unused[0]}.`);
  return [...grouped.entries()].map(([trackId, trackRows]) => {
    const metadata = descriptor.trackMap.get(trackId);
    const segments = segmentsFromRows(trackRows, descriptor, trackId);
    return {
      id: `mot-${trackId}`,
      ...metadata,
      status: "verified",
      startMs: segments[0].startMs,
      endMs: segments.at(-1).endMs,
      confidence: 1,
      identityConfidence: 1,
      engine: "reviewed-mot-ground-truth",
      segments,
      corrections: [],
      metadata: {
        localSourceSha256: descriptor.sourceFingerprint,
        angleId: descriptor.angleId,
      },
    };
  });
}

function entityCounts(tracks = []) {
  return Object.fromEntries(["player", "ball", "referee"].map((entityType) => [
    entityType,
    tracks.filter((track) => track.entityType === entityType).length,
  ]));
}

export function inspectMotAnnotationProgress(annotationText, descriptorValue = {}) {
  const descriptor = normalizeSequenceDescriptor(descriptorValue);
  const rows = parseRows(annotationText, descriptor, { allowEmpty: true });
  const annotatedFrames = new Set(rows.map((row) => row.frameNumber));
  const rawTrackIds = new Set(rows.map((row) => row.trackId));
  const issues = [];
  let tracks = [];
  if (!rows.length) issues.push({ code: "annotations-empty", message: "No reviewed MOT observations exist." });
  if (rows.length) {
    try {
      tracks = tracksFromRows(rows, {
        ...descriptor,
        trackMap: normalizeTrackMap(descriptorValue.trackMap),
      });
    } catch (error) {
      issues.push({ code: "track-metadata-incomplete", message: error.message });
    }
  }
  const counts = entityCounts(tracks);
  for (const entityType of ["player", "ball", "referee"]) {
    if (!counts[entityType]) {
      issues.push({
        code: `${entityType}-missing`,
        message: `Reviewed annotations are missing an explicit ${entityType} track.`,
      });
    }
  }
  const durationMs = Math.round((descriptor.sequenceLengthFrames * 1000) / descriptor.frameRate);
  const sceneCoverageRatio = tracks.length
    ? groundTruthSceneTemporalCoverage(tracks, {
      startMs: descriptor.sourceStartMs,
      endMs: descriptor.sourceStartMs + durationMs,
    })
    : 0;
  if (tracks.length && sceneCoverageRatio < 0.95) {
    issues.push({
      code: "scene-coverage-incomplete",
      message: "Reviewed player trajectories cover less than 95% of the sequence.",
    });
  }
  return {
    protocol: TRACKING_MOT_ANNOTATION_AUDIT_PROTOCOL,
    rowCount: rows.length,
    trackCount: rawTrackIds.size,
    annotatedFrameCount: annotatedFrames.size,
    sequenceLengthFrames: descriptor.sequenceLengthFrames,
    annotatedFrameRatio: annotatedFrames.size / descriptor.sequenceLengthFrames,
    sceneCoverageRatio,
    entityCounts: counts,
    structurallyReady: issues.length === 0,
    issues,
  };
}

export function createGroundTruthArtifactFromMotAnnotations(annotationText, descriptorValue = {}) {
  const descriptor = normalizeDescriptor(descriptorValue);
  const tracks = tracksFromRows(parseRows(annotationText, descriptor), descriptor);
  const playerTrackIds = tracks.filter((track) => track.entityType === "player").map((track) => track.id);
  const requestedTarget = descriptor.benchmarkTargetTrackId
    ? `mot-${descriptor.benchmarkTargetTrackId.replace(/^mot-/, "")}`
    : playerTrackIds[0];
  if (!playerTrackIds.includes(requestedTarget)) invalid("Benchmark target must identify an imported player track.");
  const durationMs = Math.round((descriptor.sequenceLengthFrames * 1000) / descriptor.frameRate);
  return createGroundTruthArtifact({
    benchmarkType: TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
    sourceFingerprint: descriptor.sourceFingerprint,
    angleId: descriptor.angleId,
    frame: descriptor.frame,
    range: { startMs: descriptor.sourceStartMs, endMs: descriptor.sourceStartMs + durationMs },
    tracks,
    selectedTrackIds: tracks.map((track) => track.id),
    benchmarkTargetTrackId: requestedTarget,
    reviewedBy: descriptor.reviewedBy,
    reviewedAt: descriptor.reviewedAt,
    attested: true,
    exhaustiveSceneAttested: true,
    scenarioTags: descriptor.scenarioTags,
    referenceEvidence: descriptor.referenceEvidence,
  }, { now: () => Date.parse(descriptor.reviewedAt) });
}
