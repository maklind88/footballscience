import {
  normalizeTrackingProviderManifest,
  trackingProviderReadiness,
} from "./tracking-provider-contract.mjs";
import { trackingProviderFingerprint } from "./tracking-provider-evidence.mjs";
import {
  validateTrackingArtifact,
  validateTrackingArtifacts,
} from "./tracking-artifact-validator.mjs";
import { TextDecoder } from "node:util";

export const TRACKING_STAGE_RESULT_PROTOCOL = "football-science-tracking-stage-result-v1";

const entityCapabilities = Object.freeze({
  player: "detect:player",
  ball: "detect:ball",
  referee: "detect:referee",
});
const teamSides = new Set(["home", "away", "official", "unknown"]);

export class TrackingStageArtifactError extends Error {
  constructor(message, code = "TRACKING_STAGE_ARTIFACT_INVALID") {
    super(message);
    this.name = "TrackingStageArtifactError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingStageArtifactError(message, code);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  record(value, label);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`${label} contains unsupported field ${unknown[0]}.`, "TRACKING_STAGE_FIELD_UNSUPPORTED");
}

function boundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function identifier(value, label) {
  const text = boundedString(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = boundedString(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function confidence(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) invalid(`Invalid ${label}.`);
  return number;
}

function entityType(value, label = "entity type") {
  const type = boundedString(value, label, 20).toLowerCase();
  if (!entityCapabilities[type]) invalid(`Invalid ${label}.`);
  return type;
}

function normalizedBox(value = {}) {
  exactKeys(value, ["left", "top", "width", "height"], "Detection box");
  const box = Object.fromEntries(["left", "top", "width", "height"].map((key) => {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < 0 || number > 1) invalid("Detection box is outside the video frame.");
    return [key, number];
  }));
  if (box.width <= 0 || box.height <= 0 || box.left + box.width > 1 || box.top + box.height > 1) {
    invalid("Detection box is outside the video frame.");
  }
  return box;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function maximumOutputBytes(provider = {}, options = {}) {
  return Math.min(
    provider.runtime.maxOutputBytes,
    Math.max(1024, Number(options.maxBytes) || 64 * 1024 * 1024),
  );
}

function parseSerializedResult(value, provider = {}, options = {}) {
  const bytes = typeof value === "string"
    ? Buffer.from(value, "utf8")
    : Buffer.isBuffer(value)
      ? value
      : value instanceof Uint8Array
        ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        : invalid("Tracking stage result must be serialized UTF-8 JSON.");
  if (bytes.byteLength > maximumOutputBytes(provider, options)) {
    invalid("Tracking stage result exceeds its output limit.", "TRACKING_STAGE_OUTPUT_LIMIT");
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    invalid("Tracking stage result is not valid UTF-8.");
  }
  try {
    return JSON.parse(decoded);
  } catch {
    invalid("Tracking stage result is not valid JSON.");
  }
}

function normalizedHeader(value = {}, provider = {}, request = {}, options = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "provider", "stage", "capabilities",
    "sourceFingerprint", "range", "payload",
  ], "Tracking stage result");
  if (Number(value.schemaVersion) !== 1 || value.protocol !== TRACKING_STAGE_RESULT_PROTOCOL) {
    invalid("Unsupported tracking stage result protocol.");
  }
  exactKeys(value.provider, ["id", "version", "fingerprintSha256"], "Tracking result provider");
  const expectedFingerprint = trackingProviderFingerprint(provider);
  if (value.provider.id !== provider.providerId
    || value.provider.version !== provider.providerVersion
    || sha256(value.provider.fingerprintSha256, "provider fingerprint") !== expectedFingerprint) {
    invalid("Tracking result does not match the approved provider runtime.", "TRACKING_STAGE_PROVIDER_MISMATCH");
  }
  if (value.stage !== provider.stage) invalid("Tracking result stage does not match its provider.");
  const capabilities = Array.isArray(value.capabilities)
    ? [...new Set(value.capabilities.map((entry) => boundedString(entry, "result capability", 80)))].sort()
    : invalid("Tracking result capabilities are required.");
  if (JSON.stringify(capabilities) !== JSON.stringify([...provider.capabilities].sort())) {
    invalid("Tracking result capabilities do not match its provider.", "TRACKING_STAGE_CAPABILITY_MISMATCH");
  }
  const sourceFingerprint = sha256(value.sourceFingerprint, "tracking source fingerprint");
  if (sourceFingerprint !== sha256(request.sourceFingerprint, "requested source fingerprint")) {
    invalid("Tracking result belongs to another video source.", "TRACKING_STAGE_SOURCE_MISMATCH");
  }
  exactKeys(value.range, ["startMs", "endMs"], "Tracking result range");
  const range = {
    startMs: integer(value.range.startMs, "tracking result start"),
    endMs: integer(value.range.endMs, "tracking result end"),
  };
  const requestedRange = request.range || {};
  if (range.endMs <= range.startMs
    || range.startMs !== Number(requestedRange.startMs)
    || range.endMs !== Number(requestedRange.endMs)
    || range.endMs - range.startMs > provider.runtime.maxDurationMs) {
    invalid("Tracking result range does not match the bounded request.", "TRACKING_STAGE_RANGE_MISMATCH");
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid("Tracking stage result is not serializable.");
  }
  if (Buffer.byteLength(serialized) > maximumOutputBytes(provider, options)) {
    invalid("Tracking stage result exceeds its output limit.", "TRACKING_STAGE_OUTPUT_LIMIT");
  }
  return { capabilities, range, sourceFingerprint };
}

function validateDetection(payload = {}, provider = {}, range = {}, options = {}) {
  exactKeys(payload, ["observations"], "Detection result");
  const values = Array.isArray(payload.observations) ? payload.observations : invalid("Detection observations are required.");
  const maximum = Math.max(1, Math.min(1_000_000, Number(options.maxObservations) || 250_000));
  if (values.length > maximum) invalid("Detection result contains too many observations.", "TRACKING_STAGE_RESULT_LIMIT");
  const ids = new Set();
  const perFrame = new Map();
  const observations = values.map((value, index) => {
    exactKeys(value, ["id", "atMs", "frameIndex", "entityType", "box", "confidence"], `Detection ${index + 1}`);
    const id = identifier(value.id, `detection ${index + 1} id`);
    if (ids.has(id)) invalid("Detection ids must be unique.");
    ids.add(id);
    const type = entityType(value.entityType, `detection ${index + 1} entity type`);
    if (!provider.capabilities.includes(entityCapabilities[type])) {
      invalid(`Provider is not approved to detect ${type}.`, "TRACKING_STAGE_CAPABILITY_MISMATCH");
    }
    const atMs = integer(value.atMs, `detection ${index + 1} time`, range.startMs, range.endMs);
    const frameIndex = integer(value.frameIndex, `detection ${index + 1} frame`, 0, provider.runtime.maxFrames - 1);
    perFrame.set(frameIndex, (perFrame.get(frameIndex) || 0) + 1);
    return { id, atMs, frameIndex, entityType: type, box: normalizedBox(value.box), confidence: confidence(value.confidence, "detection confidence") };
  });
  const maximumPerFrame = Math.max(1, Math.min(256, Number(options.maxObservationsPerFrame) || 64));
  if ([...perFrame.values()].some((count) => count > maximumPerFrame)) {
    invalid("Detection result contains too many observations in one frame.", "TRACKING_STAGE_RESULT_LIMIT");
  }
  return { observations };
}

function referenceMap(values = [], label = "reference") {
  const result = new Map();
  for (const value of values) {
    const id = identifier(value?.id, `${label} id`);
    if (result.has(id)) invalid(`Duplicate ${label} id.`);
    result.set(id, { id, entityType: entityType(value?.entityType, `${label} entity type`) });
  }
  return result;
}

function validateAssociation(payload = {}, request = {}, range = {}, options = {}) {
  exactKeys(payload, ["trajectories"], "Association result");
  const observations = referenceMap(request.observations, "observation");
  const values = Array.isArray(payload.trajectories) ? payload.trajectories : invalid("Association trajectories are required.");
  if (values.length > Math.max(1, Math.min(1024, Number(options.maxTrajectories) || 256))) {
    invalid("Association result contains too many trajectories.", "TRACKING_STAGE_RESULT_LIMIT");
  }
  const trajectoryIds = new Set();
  const assigned = new Set();
  const trajectories = values.map((value, index) => {
    exactKeys(value, ["id", "entityType", "observationIds", "confidence", "discontinuitiesMs"], `Trajectory ${index + 1}`);
    const id = identifier(value.id, `trajectory ${index + 1} id`);
    if (trajectoryIds.has(id)) invalid("Trajectory ids must be unique.");
    trajectoryIds.add(id);
    const type = entityType(value.entityType, `trajectory ${index + 1} entity type`);
    if (!Array.isArray(value.observationIds) || !value.observationIds.length) invalid("A trajectory needs observation references.");
    const observationIds = value.observationIds.map((entry) => identifier(entry, "trajectory observation id"));
    if (new Set(observationIds).size !== observationIds.length) invalid("A trajectory cannot repeat an observation.");
    for (const observationId of observationIds) {
      const observation = observations.get(observationId);
      if (!observation || observation.entityType !== type || assigned.has(observationId)) {
        invalid("Trajectory observations are unknown, mismatched, or assigned twice.", "TRACKING_STAGE_REFERENCE_MISMATCH");
      }
      assigned.add(observationId);
    }
    const discontinuitiesMs = Array.isArray(value.discontinuitiesMs)
      ? [...new Set(value.discontinuitiesMs.map((entry) => integer(entry, "trajectory discontinuity", range.startMs, range.endMs)))].sort((a, b) => a - b)
      : invalid("Trajectory discontinuities must be an array.");
    if (discontinuitiesMs.length > 1000) invalid("Trajectory contains too many discontinuities.");
    return { id, entityType: type, observationIds, confidence: confidence(value.confidence, "association confidence"), discontinuitiesMs };
  });
  return { trajectories };
}

function validateReidentification(payload = {}, request = {}, options = {}) {
  exactKeys(payload, ["identities"], "Re-identification result");
  const trajectories = referenceMap(request.trajectories, "trajectory");
  const values = Array.isArray(payload.identities) ? payload.identities : invalid("Re-identification results are required.");
  if (values.length > Math.max(1, Math.min(1024, Number(options.maxIdentities) || 256))) {
    invalid("Re-identification result contains too many identities.", "TRACKING_STAGE_RESULT_LIMIT");
  }
  const assigned = new Set();
  return { identities: values.map((value, index) => {
    exactKeys(value, ["trajectoryId", "identityKey", "confidence"], `Re-identification ${index + 1}`);
    const trajectoryId = identifier(value.trajectoryId, "re-identification trajectory id");
    if (trajectories.get(trajectoryId)?.entityType !== "player" || assigned.has(trajectoryId)) {
      invalid("Re-identification can reference each known player trajectory once.", "TRACKING_STAGE_REFERENCE_MISMATCH");
    }
    assigned.add(trajectoryId);
    return {
      trajectoryId,
      identityKey: identifier(value.identityKey, "opaque re-identification key"),
      confidence: confidence(value.confidence, "re-identification confidence"),
    };
  }) };
}

function validateClassification(payload = {}, provider = {}, request = {}, options = {}) {
  exactKeys(payload, ["classifications"], "Classification result");
  const trajectories = referenceMap(request.trajectories, "trajectory");
  const values = Array.isArray(payload.classifications) ? payload.classifications : invalid("Classification results are required.");
  if (values.length > Math.max(1, Math.min(1024, Number(options.maxClassifications) || 256))) {
    invalid("Classification result contains too many entries.", "TRACKING_STAGE_RESULT_LIMIT");
  }
  const teamEnabled = provider.capabilities.includes("classify:team");
  const shirtEnabled = provider.capabilities.includes("classify:shirt-number");
  const allowed = [
    "trajectoryId",
    ...(teamEnabled ? ["teamSide", "teamConfidence"] : []),
    ...(shirtEnabled ? ["shirtNumber", "shirtNumberConfidence"] : []),
  ];
  const assigned = new Set();
  return { classifications: values.map((value, index) => {
    exactKeys(value, allowed, `Classification ${index + 1}`);
    const trajectoryId = identifier(value.trajectoryId, "classification trajectory id");
    if (trajectories.get(trajectoryId)?.entityType !== "player" || assigned.has(trajectoryId)) {
      invalid("Classification can reference each known player trajectory once.", "TRACKING_STAGE_REFERENCE_MISMATCH");
    }
    assigned.add(trajectoryId);
    const result = { trajectoryId };
    if (teamEnabled) {
      const teamSide = boundedString(value.teamSide, "team side", 20).toLowerCase();
      if (!teamSides.has(teamSide)) invalid("Classification team side is invalid.");
      result.teamSide = teamSide;
      result.teamConfidence = confidence(value.teamConfidence, "team confidence");
    }
    if (shirtEnabled) {
      const shirtNumber = boundedString(value.shirtNumber, "shirt number", 7).toLowerCase();
      if (shirtNumber !== "unknown" && !/^\d{1,3}$/.test(shirtNumber)) invalid("Classification shirt number is invalid.");
      result.shirtNumber = shirtNumber;
      result.shirtNumberConfidence = confidence(value.shirtNumberConfidence, "shirt-number confidence");
    }
    return result;
  }) };
}

function validateSegmentation(payload = {}, request = {}, options = {}) {
  exactKeys(payload, ["tracks"], "Segmentation result");
  const prompts = Array.isArray(request.prompts) ? request.prompts : [];
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : invalid("Segmentation tracks are required.");
  if (prompts.length === 1 && tracks.length === 1) {
    return { tracks: [validateTrackingArtifact(tracks[0], prompts[0], options.validation).artifact] };
  }
  return { tracks: validateTrackingArtifacts({ tracks }, prompts, options.validation).artifacts };
}

export function validateTrackingStageArtifact(value = {}, providerValue = {}, request = {}, options = {}) {
  const provider = normalizeTrackingProviderManifest(providerValue);
  const header = normalizedHeader(record(value, "Tracking stage result"), provider, request, options);
  const payload = record(value.payload, "Tracking stage payload");
  let normalizedPayload;
  if (provider.stage === "detection") normalizedPayload = validateDetection(payload, provider, header.range, options);
  else if (provider.stage === "association") normalizedPayload = validateAssociation(payload, request, header.range, options);
  else if (provider.stage === "reidentification") normalizedPayload = validateReidentification(payload, request, options);
  else if (provider.stage === "classification") normalizedPayload = validateClassification(payload, provider, request, options);
  else normalizedPayload = validateSegmentation(payload, request, options);
  return deepFreeze({
    schemaVersion: 1,
    protocol: TRACKING_STAGE_RESULT_PROTOCOL,
    provider: {
      id: provider.providerId,
      version: provider.providerVersion,
      fingerprintSha256: trackingProviderFingerprint(provider),
    },
    stage: provider.stage,
    capabilities: header.capabilities,
    sourceFingerprint: header.sourceFingerprint,
    range: header.range,
    payload: normalizedPayload,
  });
}

export function parseTrackingStageArtifact(value, providerValue = {}, request = {}, options = {}) {
  const provider = normalizeTrackingProviderManifest(providerValue);
  return validateTrackingStageArtifact(parseSerializedResult(value, provider, options), provider, request, options);
}

export function validateActivatedTrackingStageArtifact(value = {}, providerValue = {}, request = {}, options = {}) {
  const readiness = trackingProviderReadiness(providerValue, options);
  if (!readiness.ready) {
    invalid(
      `Tracking provider is not activated: ${readiness.reasons.join(", ")}.`,
      "TRACKING_STAGE_PROVIDER_NOT_READY",
    );
  }
  return validateTrackingStageArtifact(value, providerValue, request, options);
}

export function parseActivatedTrackingStageArtifact(value, providerValue = {}, request = {}, options = {}) {
  const readiness = trackingProviderReadiness(providerValue, options);
  if (!readiness.ready) {
    invalid(
      `Tracking provider is not activated: ${readiness.reasons.join(", ")}.`,
      "TRACKING_STAGE_PROVIDER_NOT_READY",
    );
  }
  const provider = normalizeTrackingProviderManifest(providerValue);
  return validateTrackingStageArtifact(parseSerializedResult(value, provider, options), provider, request, options);
}
