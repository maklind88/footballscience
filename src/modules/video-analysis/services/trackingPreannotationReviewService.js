import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { normalizeTrackingPreannotationCampaign } from "./trackingPreannotationCampaignService.js";

const PACK_PROTOCOL = "football-science-tracking-annotation-pack-v1";
const WORKSPACE_PROTOCOL = "football-science-tracking-candidate-preannotation-workspace-v1";
const TRACK_MAP_PROTOCOL = "football-science-tracking-candidate-preannotation-track-map-v1";
const entityTypes = new Set(["person", "player", "ball", "referee"]);

export class TrackingPreannotationReviewError extends Error {
  constructor(message, code = "TRACKING_PREANNOTATION_REVIEW_INVALID") {
    super(message);
    this.name = "TrackingPreannotationReviewError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingPreannotationReviewError(message, code);
}

function text(value, label, maximum = 160) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum) invalid(`Invalid ${label}.`);
  return result;
}

function identifier(value, label) {
  const result = text(value, label, 160);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) invalid(`Invalid ${label}.`);
  return result;
}

function sha256(value, label) {
  const result = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) invalid(`${label} must be a SHA-256 hash.`);
  return result;
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function finite(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytes(value, label, maximumBytes) {
  const result = typeof value === "string" ? new TextEncoder().encode(value)
    : value instanceof Uint8Array ? value
      : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!result?.byteLength || result.byteLength > maximumBytes) invalid(`${label} is outside its byte limit.`);
  return result;
}

function decodeJson(value, label, maximumBytes) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes(value, label, maximumBytes)));
  } catch (error) {
    if (error instanceof TrackingPreannotationReviewError) throw error;
    invalid(`${label} is not valid UTF-8 JSON.`);
  }
}

async function digest(value, cryptoApi, label) {
  if (!cryptoApi?.subtle) invalid("Secure preannotation hashing is unavailable.");
  const result = await cryptoApi.subtle.digest("SHA-256", value);
  const hash = [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return sha256(hash, label);
}

function validateWorkspace(pack, workspace, caseId) {
  if (workspace.protocol !== WORKSPACE_PROTOCOL || workspace.schemaVersion !== 1
    || workspace.benchmarkOnly !== true || workspace.suggestionOnly !== true
    || workspace.approvalReady !== false || workspace.groundTruthEvaluated !== false
    || workspace.reviewGate?.originalAnnotationMutationAllowed !== false
    || workspace.reviewGate?.suggestionPromotionAllowed !== false
    || workspace.reviewGate?.exhaustiveHumanReviewRequired !== true) {
    invalid("The preannotation workspace is not a review-only artifact.");
  }
  if (typeof workspace.input?.associationEvaluated !== "boolean") {
    invalid("The preannotation workspace has no sealed association state.");
  }
  if (workspace.summary?.associationEvaluated !== workspace.input.associationEvaluated) {
    invalid("The preannotation workspace association summary is inconsistent.");
  }
  if (workspace.pack?.id !== pack.id || workspace.pack?.sourceSha256 !== pack.source?.sha256
    || workspace.pack?.caseCount !== pack.summary?.caseCount
    || workspace.pack?.reviewStatus !== pack.summary?.reviewStatus) {
    invalid("The preannotation workspace belongs to another annotation pack.");
  }
  const payload = { ...workspace };
  delete payload.workspaceSha256;
  const expectedHash = sha256(workspace.workspaceSha256, "preannotation workspace checksum");
  return {
    descriptor: (workspace.cases || []).find((entry) => entry.id === caseId)
      || invalid("The selected preannotation case is missing."),
    expectedHash,
    payload,
  };
}

function validatePack(pack, caseId, sourceSha256) {
  if (pack.protocol !== PACK_PROTOCOL || pack.version !== 1) invalid("Invalid tracking annotation pack.");
  const id = identifier(pack.id, "annotation pack id");
  sha256(pack.source?.sha256, "annotation pack source checksum");
  const extraction = {
    width: integer(pack.extraction?.width, "annotation width", 1, 16_384),
    height: integer(pack.extraction?.height, "annotation height", 1, 16_384),
    frameRate: finite(pack.extraction?.frameRate, "annotation frame rate", 1, 240),
  };
  const packCase = (pack.cases || []).find((entry) => entry.id === caseId)
    || invalid("The selected annotation-pack case is missing.");
  const normalized = {
    id: identifier(packCase.id, "annotation case id"),
    durationMs: integer(packCase.durationMs, "annotation case duration", 1000, 4 * 60 * 1000),
    expectedFrames: integer(packCase.expectedFrames, "annotation frame count", 1, 1_000_000),
    sourceSha256: sha256(packCase.clip?.sha256, "annotation clip checksum"),
  };
  if (sha256(sourceSha256, "connected source checksum") !== normalized.sourceSha256) {
    invalid("Reconnect the exact normalized benchmark clip before importing suggestions.",
      "TRACKING_PREANNOTATION_REVIEW_SOURCE_MISMATCH");
  }
  return { id, extraction, case: normalized };
}

function descriptor(value = {}, expectedFile, label) {
  if (value.file !== expectedFile) invalid(`Invalid ${label} file.`);
  return {
    bytes: integer(value.bytes, `${label} bytes`, 1, 16 * 1024 * 1024),
    sha256: sha256(value.sha256, `${label} checksum`),
  };
}

function parseMot(value, frame) {
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(value).split(/\r?\n/).filter(Boolean);
  if (!lines.length || lines.length > 100_000) invalid("Preannotation MOT suggestions are empty or too large.");
  const seen = new Set();
  return lines.map((line, index) => {
    const columns = line.split(",");
    if (columns.length !== 10 || columns.slice(7).some((entry) => entry !== "-1")) {
      invalid(`Invalid MOT suggestion row ${index + 1}.`);
    }
    const row = {
      frameNumber: integer(columns[0], "MOT frame number", 1, frame.expectedFrames),
      trackId: integer(columns[1], "MOT track id", 1, 100_000),
      left: finite(columns[2], "MOT box left", 0, frame.width),
      top: finite(columns[3], "MOT box top", 0, frame.height),
      width: finite(columns[4], "MOT box width", Number.EPSILON, frame.width),
      height: finite(columns[5], "MOT box height", Number.EPSILON, frame.height),
      confidence: finite(columns[6], "MOT confidence", Number.EPSILON, 1),
    };
    if (row.left + row.width > frame.width + 1e-6 || row.top + row.height > frame.height + 1e-6) {
      invalid("A preannotation box leaves the video frame.");
    }
    const key = `${row.frameNumber}:${row.trackId}`;
    if (seen.has(key)) invalid("A preannotation track repeats one video frame.");
    seen.add(key);
    return row;
  });
}

function reviewPoint(row, frame) {
  const x = (row.left + (row.width / 2)) / frame.width;
  const y = (row.top + (row.height / 2)) / frame.height;
  return {
    atMs: Math.min(frame.durationMs, Math.round(((row.frameNumber - 1) / frame.frameRate) * 1000)),
    frameIndex: row.frameNumber - 1,
    x,
    y,
    width: row.width / frame.width,
    height: row.height / frame.height,
    groundX: x,
    groundY: (row.top + row.height) / frame.height,
    confidence: row.confidence,
    identityConfidence: 0,
    occluded: false,
    source: "automatic",
  };
}

function metadata(workspace, pack, packCase, track, itemId, angleId) {
  return {
    clientGeneratedTrackId: true,
    preannotationProtocol: WORKSPACE_PROTOCOL,
    preannotationWorkspaceSha256: workspace.workspaceSha256,
    preannotationPackId: pack.id,
    preannotationCaseId: packCase.id,
    preannotationPresentationItemId: itemId,
    preannotationSuggestionId: track.suggestionId,
    preannotationAssociationStatus: track.associationStatus,
    preannotationSourceTrajectoryId: track.sourceTrajectoryId,
    localSourceSha256: packCase.sourceSha256,
    angleId: String(angleId || "primary"),
  };
}

function materializedTrack(track, rows, context) {
  const points = rows.map((row) => reviewPoint(row, context.frame));
  const confidence = points.reduce((sum, point) => sum + point.confidence, 0) / points.length;
  return normalizeObjectTrack({
    id: `preannotation-${context.workspace.workspaceSha256.slice(0, 16)}-${context.packCase.id}-${track.motTrackId}`,
    clipId: context.clipId,
    entityType: track.entityType,
    status: "review",
    startMs: points[0].atMs,
    endMs: points.at(-1).atMs,
    confidence,
    identityConfidence: 0,
    engine: "tracking-preannotation-review",
    engineVersion: context.workspace.workspaceSha256.slice(0, 16),
    segments: [{
      id: `preannotation-segment-${track.motTrackId}`,
      startMs: points[0].atMs,
      endMs: points.at(-1).atMs,
      confidence,
      discontinuityBefore: false,
      points,
    }],
    corrections: [],
    metadata: metadata(
      context.workspace,
      context.pack,
      context.packCase,
      track,
      context.itemId,
      context.angleId,
    ),
  });
}

export function materializeTrackingPreannotationQueueEntry(entry = {}) {
  if (!entry.track) invalid("The preannotation queue entry is incomplete.");
  return normalizeObjectTrack(entry.track);
}

export async function importTrackingPreannotationReviewCase(value = {}, options = {}) {
  const cryptoApi = options.cryptoApi || globalThis.crypto;
  const pack = decodeJson(value.packBytes, "Annotation pack", 4 * 1024 * 1024);
  const workspace = decodeJson(value.workspaceBytes, "Preannotation workspace", 4 * 1024 * 1024);
  const trackMapBytes = bytes(value.trackMapBytes, "Preannotation track map", 16 * 1024 * 1024);
  const trackMap = decodeJson(trackMapBytes, "Preannotation track map", 16 * 1024 * 1024);
  const suggestionBytes = bytes(value.suggestionBytes, "Preannotation suggestions", 16 * 1024 * 1024);
  const caseId = identifier(value.caseId, "preannotation case id");
  const normalizedPack = validatePack(pack, caseId, value.sourceSha256);
  const workspaceValidation = validateWorkspace(pack, workspace, caseId);
  if (await digest(new TextEncoder().encode(canonicalJson(workspaceValidation.payload)), cryptoApi,
    "preannotation workspace checksum") !== workspaceValidation.expectedHash) {
    invalid("Preannotation workspace checksum does not reproduce.", "TRACKING_PREANNOTATION_REVIEW_TAMPERED");
  }
  const campaign = normalizeTrackingPreannotationCampaign({
    workspaceSha256: workspace.workspaceSha256,
    packId: pack.id,
    caseCount: workspace.summary?.caseCount,
    totalSuggestionCount: workspace.summary?.trackCount,
    cases: (workspace.cases || []).map((entry) => ({
      caseId: entry.id,
      totalSuggestionCount: entry.summary?.trackCount,
      associatedTrackCount: entry.summary?.associatedTrackCount,
      unassociatedObservationCount: entry.summary?.unassociatedObservationCount,
      missingSuggestedEntityTypes: entry.summary?.missingSuggestedEntityTypes,
    })),
  });
  const suggestionDescriptor = descriptor(
    workspaceValidation.descriptor.suggestion,
    `cases/${caseId}.suggestions.mot.txt`,
    "suggestion",
  );
  const mapDescriptor = descriptor(
    workspaceValidation.descriptor.trackMap,
    `cases/${caseId}.track-map.json`,
    "track map",
  );
  if (suggestionDescriptor.bytes !== suggestionBytes.byteLength
    || suggestionDescriptor.sha256 !== await digest(suggestionBytes, cryptoApi, "suggestion checksum")
    || mapDescriptor.bytes !== trackMapBytes.byteLength
    || mapDescriptor.sha256 !== await digest(trackMapBytes, cryptoApi, "track map checksum")) {
    invalid("Preannotation case files do not match the sealed workspace.", "TRACKING_PREANNOTATION_REVIEW_TAMPERED");
  }
  if (trackMap.protocol !== TRACK_MAP_PROTOCOL || trackMap.schemaVersion !== 1
    || trackMap.caseId !== caseId || trackMap.benchmarkOnly !== true
    || trackMap.suggestionOnly !== true || trackMap.approvalReady !== false
    || trackMap.sourceSha256 !== normalizedPack.case.sourceSha256
    || typeof trackMap.associationEvaluated !== "boolean"
    || trackMap.associationEvaluated !== workspace.input.associationEvaluated) {
    invalid("Invalid preannotation track map.");
  }
  const frame = { ...normalizedPack.extraction, ...normalizedPack.case };
  const rows = parseMot(suggestionBytes, frame);
  const rowsByTrackId = new Map();
  rows.forEach((row) => {
    if (!rowsByTrackId.has(row.trackId)) rowsByTrackId.set(row.trackId, []);
    rowsByTrackId.get(row.trackId).push(row);
  });
  const mapTracks = Array.isArray(trackMap.tracks) ? trackMap.tracks : invalid("Preannotation tracks are required.");
  if (!mapTracks.length || mapTracks.length > 50_000
    || new Set(mapTracks.map((track) => track.motTrackId)).size !== mapTracks.length
    || new Set(mapTracks.map((track) => track.suggestionId)).size !== mapTracks.length) {
    invalid("Preannotation track-map ids are invalid.");
  }
  const context = {
    workspace,
    pack,
    packCase: normalizedPack.case,
    frame,
    itemId: identifier(value.itemId, "presentation item id"),
    clipId: identifier(value.clipId, "presentation clip id"),
    angleId: value.angleId,
  };
  const associatedTracks = [];
  const queue = [];
  for (const track of mapTracks) {
    const motTrackId = integer(track.motTrackId, "preannotation MOT track id", 1, 100_000);
    const entityType = String(track.entityType || "");
    const associationStatus = String(track.associationStatus || "");
    const trackRows = rowsByTrackId.get(motTrackId) || [];
    const framesIncrease = trackRows.every((row, index) => (
      index === 0 || trackRows[index - 1].frameNumber < row.frameNumber
    ));
    if (!entityTypes.has(entityType) || !["associated", "unassociated"].includes(associationStatus)
      || identifier(track.suggestionId, "preannotation suggestion id") !== track.suggestionId
      || integer(track.observationCount, "preannotation observation count", 1, 100_000) !== trackRows.length
      || track.reviewState !== "unreviewed" || !framesIncrease) {
      invalid("Preannotation track lineage is inconsistent.");
    }
    const normalizedTrack = {
      ...track,
      motTrackId,
      entityType,
      associationStatus,
      sourceTrajectoryId: String(track.sourceTrajectoryId || ""),
    };
    if (associationStatus === "associated"
      && (identifier(normalizedTrack.sourceTrajectoryId, "preannotation source trajectory id")
        !== normalizedTrack.suggestionId)) {
      invalid("Associated review work has invalid trajectory lineage.");
    }
    const candidate = materializedTrack(normalizedTrack, trackRows, context);
    if (associationStatus === "associated") associatedTracks.push(candidate);
    else {
      if (trackRows.length !== 1 || normalizedTrack.sourceTrajectoryId
        || !normalizedTrack.suggestionId.startsWith("unassociated:")) {
        invalid("Unassociated review work must be one raw observation.");
      }
      queue.push(Object.freeze({
        id: candidate.id,
        suggestionId: normalizedTrack.suggestionId,
        entityType,
        atMs: candidate.startMs,
        confidence: candidate.confidence,
        track: candidate,
      }));
    }
  }
  if (rowsByTrackId.size !== mapTracks.length || associatedTracks.length > 1000 || queue.length > 20_000
    || workspaceValidation.descriptor.summary?.trackCount !== mapTracks.length
    || workspaceValidation.descriptor.summary?.associatedTrackCount !== associatedTracks.length
    || workspaceValidation.descriptor.summary?.observationCount !== rows.length
    || workspaceValidation.descriptor.summary?.unassociatedObservationCount !== queue.length) {
    invalid("Preannotation review workload is inconsistent or outside its safety limits.");
  }
  return Object.freeze({
    protocol: "football-science-tracking-preannotation-review-import-v1",
    suggestionOnly: true,
    approvalReady: false,
    workspaceSha256: workspace.workspaceSha256,
    sourceSha256: normalizedPack.case.sourceSha256,
    caseId,
    campaign,
    tracks: Object.freeze(associatedTracks),
    queue: Object.freeze(queue),
    summary: Object.freeze({
      associatedTrackCount: associatedTracks.length,
      unassociatedObservationCount: queue.length,
      observationCount: rows.length,
      missingSuggestedEntityTypes: [...(workspaceValidation.descriptor.summary?.missingSuggestedEntityTypes || [])],
    }),
  });
}
