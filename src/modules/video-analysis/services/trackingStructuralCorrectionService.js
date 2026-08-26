import {
  normalizeObjectTrack,
  normalizeTrackingPoint,
  trackingPoints,
} from "../domain/tracking.model.js";

const DEFAULT_MAXIMUM_GAP_MS = 1_000;
const DEFAULT_MAXIMUM_JUMP = 0.3;

function localId(prefix = "track") {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 12)}`;
}

function structuralError(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function pointTimeBounds(segments = []) {
  const points = segments.flatMap((segment) => segment.points || []);
  return {
    startMs: points[0]?.atMs ?? 0,
    endMs: points.at(-1)?.atMs ?? points[0]?.atMs ?? 0,
  };
}

function segmentPart(segment = {}, points = [], options = {}) {
  const sorted = [...points].sort((first, second) => first.atMs - second.atMs);
  return {
    ...segment,
    id: options.id || segment.id,
    startMs: sorted[0].atMs,
    endMs: sorted.at(-1).atMs,
    discontinuityBefore: options.discontinuityBefore ?? segment.discontinuityBefore,
    points: sorted,
  };
}

function splitSegments(track = {}, atMs = 0, createId = localId) {
  const before = [];
  const after = [];
  track.segments.forEach((segment) => {
    const beforePoints = segment.points.filter((point) => point.atMs < atMs);
    const afterPoints = segment.points.filter((point) => point.atMs >= atMs);
    if (beforePoints.length) before.push(segmentPart(segment, beforePoints));
    if (afterPoints.length) {
      after.push(segmentPart(segment, afterPoints, {
        id: beforePoints.length ? createId("segment") : segment.id,
        discontinuityBefore: after.length ? segment.discontinuityBefore : false,
      }));
    }
  });
  return { before, after };
}

function ensureSplit(track = {}, atMs = 0, createId = localId) {
  const requestedAtMs = Math.max(0, Math.round(Number(atMs) || 0));
  const parts = splitSegments(track, requestedAtMs, createId);
  if (!parts.before.length || !parts.after.length) {
    structuralError(
      "Move the playhead inside the selected trajectory before splitting it.",
      "TRACKING_REVIEW_SPLIT_RANGE",
    );
  }
  return { ...parts, atMs: requestedAtMs };
}

function correctionRecord(type, atMs, options = {}) {
  return {
    id: String(options.id || localId("correction")),
    startMs: atMs,
    endMs: atMs,
    correctionType: type,
    reason: String(options.reason || "Structural tracking correction"),
    correctedBy: String(options.correctedBy || ""),
    correctedAt: String(options.correctedAt || new Date().toISOString()),
  };
}

function transferableCorrections(values = [], predicate = () => true) {
  return values.filter((entry) => entry.correctionType !== "identity" && predicate(entry));
}

function derivedMetadata(value = {}, patch = {}) {
  const metadata = { ...(value || {}) };
  [
    "centralSyncPending",
    "localArtifactHash",
    "localArtifactId",
    "localWorkspaceError",
    "localWorkspaceStatus",
  ].forEach((key) => delete metadata[key]);
  return { ...metadata, ...patch };
}

function resetSuffixIdentity(segments = [], entityType = "player") {
  if (entityType !== "player") return segments;
  return segments.map((segment) => ({
    ...segment,
    points: segment.points.map((point) => normalizeTrackingPoint({
      ...point,
      groundX: point.groundPoint?.x,
      groundY: point.groundPoint?.y,
      identityConfidence: 0,
    })),
  }));
}

function confirmBoundaryIdentity(segments = []) {
  let confirmed = false;
  return segments.map((segment) => ({
    ...segment,
    points: segment.points.map((point) => {
      if (confirmed) return point;
      confirmed = true;
      return normalizeTrackingPoint({
        ...point,
        groundX: point.groundPoint?.x,
        groundY: point.groundPoint?.y,
        identityConfidence: 1,
        source: "manual",
      });
    }),
  }));
}

function groundDistance(first = {}, second = {}) {
  return Math.hypot(
    Number(first.groundPoint?.x || 0) - Number(second.groundPoint?.x || 0),
    Number(first.groundPoint?.y || 0) - Number(second.groundPoint?.y || 0),
  );
}

function assertPlausibleJoin(before = [], after = [], options = {}) {
  const previous = before.at(-1)?.points?.at(-1);
  const next = after[0]?.points?.[0];
  if (!previous || !next) structuralError("Both tracks need samples on each side of the playhead.", "TRACKING_REVIEW_SWAP_RANGE");
  const maximumGapMs = Math.max(1, Math.round(Number(options.maximumGapMs) || DEFAULT_MAXIMUM_GAP_MS));
  if (next.atMs - previous.atMs > maximumGapMs) {
    structuralError(
      "The identity-swap gap is too long. Add reviewed keyframes around the crossing first.",
      "TRACKING_REVIEW_SWAP_GAP",
    );
  }
  const maximumJump = Math.max(0.01, Math.min(1, Number(options.maximumJump) || DEFAULT_MAXIMUM_JUMP));
  if (groundDistance(previous, next) > maximumJump) {
    structuralError(
      "The swapped trajectories do not meet at this frame. Correct the boxes before swapping identities.",
      "TRACKING_REVIEW_SWAP_JUMP",
    );
  }
}

function joinSegments(before = [], after = []) {
  const prefix = before.map((segment) => ({ ...segment, points: [...segment.points] }));
  const suffix = confirmBoundaryIdentity(after);
  const previous = prefix.at(-1);
  const next = suffix[0];
  const joined = segmentPart(previous, [...previous.points, ...next.points]);
  return [
    ...prefix.slice(0, -1),
    joined,
    ...suffix.slice(1),
  ];
}

function identityKey(track = {}) {
  return String(track.playerId || track.playerLabel || "").trim().toLowerCase();
}

export function trackingSplitReadiness(trackValue = {}, atMs = 0) {
  try {
    const track = normalizeObjectTrack(trackValue);
    const parts = ensureSplit(track, atMs, () => "split-segment");
    return {
      ready: true,
      atMs: parts.atMs,
      beforePointCount: parts.before.flatMap((segment) => segment.points).length,
      afterPointCount: parts.after.flatMap((segment) => segment.points).length,
      error: "",
    };
  } catch (error) {
    return { ready: false, atMs: Math.max(0, Math.round(Number(atMs) || 0)), error: error.message };
  }
}

export function splitTrackingTrack(trackValue = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const createId = options.createId || localId;
  const parts = ensureSplit(track, options.atMs, createId);
  const operationId = String(options.operationId || createId("split-operation"));
  const suffixId = String(options.trackId || createId("track"));
  if (!suffixId || suffixId === track.id) structuralError("A split track needs a new identity.", "TRACKING_REVIEW_SPLIT_ID");
  const beforeBounds = pointTimeBounds(parts.before);
  const suffixSegments = resetSuffixIdentity(parts.after, track.entityType);
  const afterBounds = pointTimeBounds(suffixSegments);
  const prefixCorrection = correctionRecord("split", parts.atMs, {
    ...options,
    id: `${operationId}:prefix`,
    reason: options.reason || "Split trajectory at reviewed frame",
  });
  const suffixCorrection = correctionRecord("split", parts.atMs, {
    ...options,
    id: `${operationId}:suffix`,
    reason: options.reason || "Created unassigned continuation from split",
  });
  const prefix = normalizeObjectTrack({
    ...track,
    startMs: beforeBounds.startMs,
    endMs: beforeBounds.endMs,
    status: "review",
    segments: parts.before,
    corrections: [
      ...track.corrections.filter((entry) => entry.startMs < parts.atMs),
      prefixCorrection,
    ],
    metadata: derivedMetadata(track.metadata, {
      localWorkspaceTrackKey: track.metadata?.localWorkspaceTrackKey || track.id,
      structuralCorrection: "split-prefix",
      structuralCorrectionAtMs: parts.atMs,
      structuralCorrectionOperationId: operationId,
    }),
  });
  const suffix = normalizeObjectTrack({
    ...track,
    id: suffixId,
    playerId: track.entityType === "player" ? "" : track.playerId,
    playerLabel: track.entityType === "player" ? "" : track.playerLabel,
    teamSide: track.entityType === "player" ? "" : track.teamSide,
    shirtNumber: track.entityType === "player" ? "" : track.shirtNumber,
    startMs: afterBounds.startMs,
    endMs: afterBounds.endMs,
    status: "review",
    identityConfidence: track.entityType === "player" ? 0 : track.identityConfidence,
    segments: suffixSegments,
    corrections: [
      ...transferableCorrections(track.corrections, (entry) => entry.startMs >= parts.atMs),
      suffixCorrection,
    ],
    metadata: derivedMetadata(track.metadata, {
      clientGeneratedTrackId: true,
      localWorkspaceTrackKey: suffixId,
      splitFromTrackId: track.id,
      structuralCorrection: "split-suffix",
      structuralCorrectionAtMs: parts.atMs,
      structuralCorrectionOperationId: operationId,
    }),
  });
  return { atMs: parts.atMs, operationId, prefix, suffix };
}

export function trackingIdentitySwapReadiness(firstValue = {}, secondValue = {}, atMs = 0, options = {}) {
  try {
    const first = normalizeObjectTrack(firstValue);
    const second = normalizeObjectTrack(secondValue);
    if (!first.id || !second.id || first.id === second.id) structuralError("Select two different tracks.", "TRACKING_REVIEW_SWAP_SELECTION");
    if (first.entityType !== "player" || second.entityType !== "player") {
      structuralError("Identity swap is available only for two player tracks.", "TRACKING_REVIEW_SWAP_ENTITY");
    }
    if (first.clipId !== second.clipId || first.videoId !== second.videoId) {
      structuralError("Both player tracks must belong to the same clip.", "TRACKING_REVIEW_SWAP_SCOPE");
    }
    if (!identityKey(first) || !identityKey(second) || identityKey(first) === identityKey(second)) {
      structuralError("Both tracks need different confirmed player identities.", "TRACKING_REVIEW_SWAP_IDENTITY");
    }
    const requestedAtMs = Math.max(0, Math.round(Number(atMs) || 0));
    const firstParts = ensureSplit(first, requestedAtMs, () => "swap-first-segment");
    const secondParts = ensureSplit(second, requestedAtMs, () => "swap-second-segment");
    assertPlausibleJoin(firstParts.before, secondParts.after, options);
    assertPlausibleJoin(secondParts.before, firstParts.after, options);
    return { ready: true, atMs: requestedAtMs, error: "" };
  } catch (error) {
    return { ready: false, atMs: Math.max(0, Math.round(Number(atMs) || 0)), error: error.message };
  }
}

export function swapTrackingTrackContinuations(firstValue = {}, secondValue = {}, options = {}) {
  const first = normalizeObjectTrack(firstValue);
  const second = normalizeObjectTrack(secondValue);
  const readiness = trackingIdentitySwapReadiness(first, second, options.atMs, options);
  if (!readiness.ready) structuralError(readiness.error, "TRACKING_REVIEW_SWAP_INVALID");
  const createId = options.createId || localId;
  const firstParts = ensureSplit(first, readiness.atMs, createId);
  const secondParts = ensureSplit(second, readiness.atMs, createId);
  const operationId = String(options.operationId || createId("identity-swap-operation"));
  const firstCorrection = correctionRecord("identity-swap", readiness.atMs, {
    ...options,
    id: `${operationId}:first`,
    reason: options.reason || "Swapped crossed player trajectories",
  });
  const secondCorrection = correctionRecord("identity-swap", readiness.atMs, {
    ...options,
    id: `${operationId}:second`,
    reason: options.reason || "Swapped crossed player trajectories",
  });
  const firstSegments = joinSegments(firstParts.before, secondParts.after);
  const secondSegments = joinSegments(secondParts.before, firstParts.after);
  const firstBounds = pointTimeBounds(firstSegments);
  const secondBounds = pointTimeBounds(secondSegments);
  const firstTrack = normalizeObjectTrack({
    ...first,
    startMs: firstBounds.startMs,
    endMs: firstBounds.endMs,
    status: "review",
    segments: firstSegments,
    corrections: [
      ...first.corrections.filter((entry) => entry.startMs < readiness.atMs),
      ...transferableCorrections(second.corrections, (entry) => entry.startMs >= readiness.atMs),
      firstCorrection,
    ],
    metadata: derivedMetadata(first.metadata, {
      localWorkspaceTrackKey: first.metadata?.localWorkspaceTrackKey || first.id,
      structuralCorrection: "identity-swap",
      structuralCorrectionAtMs: readiness.atMs,
      structuralCorrectionOperationId: operationId,
      structuralCorrectionPartnerTrackId: second.id,
    }),
  });
  const secondTrack = normalizeObjectTrack({
    ...second,
    startMs: secondBounds.startMs,
    endMs: secondBounds.endMs,
    status: "review",
    segments: secondSegments,
    corrections: [
      ...second.corrections.filter((entry) => entry.startMs < readiness.atMs),
      ...transferableCorrections(first.corrections, (entry) => entry.startMs >= readiness.atMs),
      secondCorrection,
    ],
    metadata: derivedMetadata(second.metadata, {
      localWorkspaceTrackKey: second.metadata?.localWorkspaceTrackKey || second.id,
      structuralCorrection: "identity-swap",
      structuralCorrectionAtMs: readiness.atMs,
      structuralCorrectionOperationId: operationId,
      structuralCorrectionPartnerTrackId: first.id,
    }),
  });
  if (trackingPoints(firstTrack).length + trackingPoints(secondTrack).length
    !== trackingPoints(first).length + trackingPoints(second).length) {
    structuralError("Identity swap changed the total sample count.", "TRACKING_REVIEW_SWAP_INTEGRITY");
  }
  return { atMs: readiness.atMs, operationId, tracks: [firstTrack, secondTrack] };
}
