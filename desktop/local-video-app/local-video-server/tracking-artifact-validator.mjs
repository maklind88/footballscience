const entityTypes = new Set(["player", "ball", "referee", "area", "unknown"]);

function contractError(message, code = "TRACKING_ARTIFACT_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw contractError(`The tracking provider returned an invalid ${label}.`);
  return number;
}

function unit(value, label) {
  const number = finite(value, label);
  if (number < 0 || number > 1) throw contractError(`The tracking provider returned ${label} outside the video frame.`);
  return number;
}

function boundedString(value = "", maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizedPoint(value = {}, prompt = {}) {
  const atMs = Math.round(finite(value.atMs ?? value.at_ms, "sample time"));
  if (atMs < prompt.startMs || atMs > prompt.endMs) {
    throw contractError("The tracking provider returned a sample outside the requested range.");
  }
  const x = unit(value.x ?? value.centerX ?? value.center_x, "horizontal position");
  const y = unit(value.y ?? value.centerY ?? value.center_y, "vertical position");
  const width = unit(value.width ?? value.w, "box width");
  const height = unit(value.height ?? value.h, "box height");
  if (width <= 0 || height <= 0
    || x - (width / 2) < -0.0001 || x + (width / 2) > 1.0001
    || y - (height / 2) < -0.0001 || y + (height / 2) > 1.0001) {
    throw contractError("The tracking provider returned an invalid object box.");
  }
  return {
    atMs,
    frameIndex: Math.max(0, Math.round(finite(value.frameIndex ?? value.frame_index ?? 0, "frame index"))),
    x,
    y,
    width,
    height,
    groundX: unit(value.groundX ?? value.ground_x ?? value.groundPoint?.x ?? x, "ground position"),
    groundY: unit(value.groundY ?? value.ground_y ?? value.groundPoint?.y ?? y + (height / 2), "ground position"),
    confidence: unit(value.confidence, "detection confidence"),
    identityConfidence: unit(
      value.identityConfidence ?? value.identity_confidence ?? value.confidence,
      "identity confidence",
    ),
    occluded: Boolean(value.occluded),
    source: "automatic",
  };
}

function normalizedSegment(value = {}, index = 0, prompt = {}) {
  const rawPoints = Array.isArray(value.points) ? value.points : [];
  if (!rawPoints.length) throw contractError("The tracking provider returned an empty segment.", "TRACKING_EMPTY");
  const points = rawPoints.map((point) => normalizedPoint(point, prompt));
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    if (points[pointIndex].atMs <= points[pointIndex - 1].atMs) {
      throw contractError("Tracking samples must be strictly ordered by match time.");
    }
  }
  const startMs = points[0].atMs;
  const endMs = points.at(-1).atMs;
  return {
    id: boundedString(value.id || `segment-${index + 1}`),
    startMs,
    endMs,
    confidence: unit(value.confidence ?? (
      points.reduce((total, point) => total + point.confidence, 0) / points.length
    ), "segment confidence"),
    discontinuityBefore: index > 0 || Boolean(value.discontinuityBefore ?? value.discontinuity_before),
    points,
  };
}

function normalizedMetadata(value = {}, prompt = {}) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sampleFps = Number(metadata.sampleFps ?? metadata.sample_fps);
  const promptFrameIndex = Number(metadata.promptFrameIndex ?? metadata.prompt_frame_index);
  return {
    model: boundedString(metadata.model, 120),
    device: boundedString(metadata.device, 40),
    providerProtocol: boundedString(metadata.providerProtocol ?? metadata.provider_protocol, 80),
    angleId: boundedString(prompt.angleId, 160),
    sourceStartMs: Math.max(0, Math.round(Number(prompt.sourceStartMs) || 0)),
    sourceEndMs: Math.max(0, Math.round(Number(prompt.sourceEndMs) || 0)),
    sourcePromptAtMs: Math.max(0, Math.round(Number(prompt.sourcePromptAtMs) || 0)),
    syncOffsetMs: Math.round(Number(prompt.syncOffsetMs) || 0),
    driftPpm: Number(prompt.driftPpm) || 0,
    ...(Number.isFinite(sampleFps) ? { sampleFps: Math.max(0, Math.min(120, sampleFps)) } : {}),
    ...(Number.isFinite(promptFrameIndex) ? { promptFrameIndex: Math.max(0, Math.round(promptFrameIndex)) } : {}),
  };
}

export function validateTrackingArtifact(value = {}, prompt = {}, options = {}) {
  const rawSegments = Array.isArray(value.segments) ? value.segments : [];
  if (!rawSegments.length) throw contractError("The tracking engine returned no object samples.", "TRACKING_EMPTY");
  if (rawSegments.length > (Number(options.maxSegments) || 10_000)) {
    throw contractError("The tracking engine returned too many continuity segments.", "TRACKING_SEGMENT_LIMIT");
  }
  const segments = rawSegments.map((segment, index) => normalizedSegment(segment, index, prompt));
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].startMs <= segments[index - 1].endMs) {
      throw contractError("Tracking continuity segments must not overlap.");
    }
  }
  const pointCount = segments.reduce((total, segment) => total + segment.points.length, 0);
  if (pointCount > (Number(options.maxPoints) || 500_000)) {
    throw contractError("The tracking engine returned too many samples for one job.", "TRACKING_SAMPLE_LIMIT");
  }
  const points = segments.flatMap((segment) => segment.points);
  const providerEntityType = boundedString(value.entityType ?? value.entity_type).toLowerCase();
  const requestedEntityType = boundedString(prompt.entityType ?? prompt.entity_type).toLowerCase();
  const entityType = entityTypes.has(requestedEntityType)
    ? requestedEntityType
    : entityTypes.has(providerEntityType) ? providerEntityType : "player";
  const average = (field) => points.reduce((total, point) => total + point[field], 0) / points.length;
  return {
    artifact: {
      id: boundedString(value.id || `local-track-${Date.now().toString(36)}`),
      clipId: boundedString(prompt.clipId),
      videoId: boundedString(prompt.videoId),
      entityType,
      playerId: boundedString(prompt.playerId),
      playerLabel: boundedString(prompt.playerLabel),
      teamSide: boundedString(prompt.teamSide, 40),
      shirtNumber: boundedString(prompt.shirtNumber ?? prompt.shirt_number, 24),
      status: "review",
      startMs: prompt.startMs,
      endMs: prompt.endMs,
      confidence: average("confidence"),
      identityConfidence: average("identityConfidence"),
      segments,
      metadata: normalizedMetadata(value.metadata, prompt),
    },
    pointCount,
    segmentCount: segments.length,
  };
}
