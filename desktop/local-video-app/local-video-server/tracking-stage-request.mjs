import { createHash } from "node:crypto";
import { normalizeTrackingProviderManifest } from "./tracking-provider-contract.mjs";
import { trackingProviderFingerprint } from "./tracking-provider-evidence.mjs";

export const TRACKING_STAGE_REQUEST_PROTOCOL = "football-science-tracking-stage-request-v1";

const entityTypes = new Set(["person", "player", "ball", "referee"]);
const requestInputFields = Object.freeze({
  detection: "",
  segmentation: "prompts",
  association: "observations",
  reidentification: "trajectories",
  classification: "trajectories",
});

export class TrackingStageRequestError extends Error {
  constructor(message, code = "TRACKING_STAGE_ARTIFACT_INVALID") {
    super(message);
    this.name = "TrackingStageRequestError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingStageRequestError(message, code);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
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

function boundedNumber(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function confidence(value, label) {
  return boundedNumber(value, label, 0, 1);
}

function entityType(value, label) {
  const type = boundedString(value, label, 20).toLowerCase();
  if (!entityTypes.has(type)) invalid(`Invalid ${label}.`);
  return type;
}

function normalizedBox(value = {}) {
  exactKeys(value, ["left", "top", "width", "height"], "Detection box");
  const box = Object.fromEntries(["left", "top", "width", "height"].map((key) => {
    const number = boundedNumber(value[key], `detection box ${key}`, 0, 1);
    return [key, number];
  }));
  if (box.width <= 0 || box.height <= 0 || box.left + box.width > 1 || box.top + box.height > 1) {
    invalid("Detection box is outside the video frame.");
  }
  return box;
}

function normalizedObservation(value = {}, index = 0, provider = {}, range = {}) {
  exactKeys(value, ["id", "atMs", "frameIndex", "entityType", "box", "confidence"], `Observation ${index + 1}`);
  return {
    id: identifier(value.id, `observation ${index + 1} id`),
    atMs: integer(value.atMs, `observation ${index + 1} time`, range.startMs, range.endMs),
    frameIndex: integer(value.frameIndex, `observation ${index + 1} frame`, 0, provider.runtime.maxFrames - 1),
    entityType: entityType(value.entityType, `observation ${index + 1} entity type`),
    box: normalizedBox(value.box),
    confidence: confidence(value.confidence, `observation ${index + 1} confidence`),
  };
}

function normalizedTrajectory(value = {}, index = 0, provider = {}, range = {}) {
  exactKeys(value, ["id", "entityType", "observations", "confidence", "discontinuitiesMs"], `Trajectory input ${index + 1}`);
  const type = entityType(value.entityType, `trajectory ${index + 1} entity type`);
  const observations = Array.isArray(value.observations)
    ? value.observations.map((entry, observationIndex) => normalizedObservation(entry, observationIndex, provider, range))
    : invalid(`Trajectory input ${index + 1} observations are required.`);
  if (!observations.length || new Set(observations.map((entry) => entry.id)).size !== observations.length) {
    invalid(`Trajectory input ${index + 1} needs unique observations.`);
  }
  if (observations.some((entry) => entry.entityType !== type)) {
    invalid(`Trajectory input ${index + 1} observations do not match its entity type.`);
  }
  for (let observationIndex = 1; observationIndex < observations.length; observationIndex += 1) {
    const previous = observations[observationIndex - 1];
    const current = observations[observationIndex];
    if (current.atMs < previous.atMs || (current.atMs === previous.atMs && current.frameIndex <= previous.frameIndex)) {
      invalid(`Trajectory input ${index + 1} observations must be strictly ordered.`);
    }
  }
  const discontinuitiesMs = Array.isArray(value.discontinuitiesMs)
    ? value.discontinuitiesMs.map((entry) => integer(entry, `trajectory ${index + 1} discontinuity`, range.startMs, range.endMs))
    : invalid(`Trajectory input ${index + 1} discontinuities are required.`);
  if (discontinuitiesMs.length > 1000 || new Set(discontinuitiesMs).size !== discontinuitiesMs.length) {
    invalid(`Trajectory input ${index + 1} contains invalid discontinuities.`);
  }
  return {
    id: identifier(value.id, `trajectory ${index + 1} id`),
    entityType: type,
    observations,
    confidence: confidence(value.confidence, `trajectory ${index + 1} confidence`),
    discontinuitiesMs: [...discontinuitiesMs].sort((left, right) => left - right),
  };
}

function normalizedPrompt(value = {}, index = 0, provider = {}, range = {}) {
  exactKeys(value, [
    "id", "entityType", "startMs", "endMs", "promptAtMs", "sourceStartMs",
    "sourceEndMs", "sourcePromptAtMs", "syncOffsetMs", "driftPpm", "box",
  ], `Segmentation prompt ${index + 1}`);
  const startMs = integer(value.startMs, `segmentation prompt ${index + 1} start`);
  const endMs = integer(value.endMs, `segmentation prompt ${index + 1} end`);
  if (startMs !== range.startMs || endMs !== range.endMs) {
    invalid("Segmentation prompt range must match its stage request.", "TRACKING_STAGE_RANGE_MISMATCH");
  }
  const promptAtMs = integer(value.promptAtMs, `segmentation prompt ${index + 1} time`, startMs, endMs);
  const sourceStartMs = integer(value.sourceStartMs, `segmentation prompt ${index + 1} source start`);
  const sourceEndMs = integer(value.sourceEndMs, `segmentation prompt ${index + 1} source end`);
  if (sourceEndMs <= sourceStartMs || sourceEndMs - sourceStartMs > provider.runtime.maxDurationMs) {
    invalid("Segmentation source range is invalid.", "TRACKING_STAGE_RANGE_MISMATCH");
  }
  const sourcePromptAtMs = integer(
    value.sourcePromptAtMs,
    `segmentation prompt ${index + 1} source time`,
    sourceStartMs,
    sourceEndMs,
  );
  const promptEntityType = boundedString(value.entityType, `segmentation prompt ${index + 1} entity type`, 20).toLowerCase();
  if (!["player", "ball", "referee", "area", "unknown"].includes(promptEntityType)) {
    invalid(`Invalid segmentation prompt ${index + 1} entity type.`);
  }
  return {
    id: identifier(value.id, `segmentation prompt ${index + 1} id`),
    entityType: promptEntityType,
    startMs,
    endMs,
    promptAtMs,
    sourceStartMs,
    sourceEndMs,
    sourcePromptAtMs,
    syncOffsetMs: integer(value.syncOffsetMs, `segmentation prompt ${index + 1} sync offset`, -21_600_000, 21_600_000),
    driftPpm: boundedNumber(value.driftPpm, `segmentation prompt ${index + 1} drift`, -10_000, 10_000),
    box: normalizedBox(value.box),
  };
}

function normalizedInputs(provider = {}, values = [], range = {}) {
  if (provider.stage === "association") return values.map((value, index) => normalizedObservation(value, index, provider, range));
  if (["reidentification", "classification"].includes(provider.stage)) {
    return values.map((value, index) => normalizedTrajectory(value, index, provider, range));
  }
  if (provider.stage === "segmentation") return values.map((value, index) => normalizedPrompt(value, index, provider, range));
  return [];
}

function normalizedTeamAnchors(provider = {}, values = [], trajectories = []) {
  if (provider.stage !== "classification" || !provider.capabilities.includes("classify:team")) return [];
  if (!Array.isArray(values) || values.length > 8) {
    invalid("Classification team anchors are outside their safety limit.", "TRACKING_STAGE_REQUEST_LIMIT");
  }
  const roleAware = provider.capabilities.includes("classify:role");
  const players = new Map(trajectories
    .filter((trajectory) => trajectory.entityType === "player"
      || (roleAware && trajectory.entityType === "person"))
    .map((trajectory) => [trajectory.id, trajectory]));
  const assigned = new Set();
  const counts = new Map();
  const anchors = values.map((value, index) => {
    exactKeys(value, ["teamSide", "trajectoryId"], `Team anchor ${index + 1}`);
    const teamSide = boundedString(value.teamSide, `team anchor ${index + 1} side`, 20).toLowerCase();
    const trajectoryId = identifier(value.trajectoryId, `team anchor ${index + 1} trajectory id`);
    if (!["home", "away"].includes(teamSide)) invalid("Team anchors may identify only home or away.");
    if (!players.has(trajectoryId) || assigned.has(trajectoryId)) {
      invalid("Team anchors must reference unique known player trajectories or role-aware person trajectories.", "TRACKING_STAGE_REFERENCE_MISMATCH");
    }
    assigned.add(trajectoryId);
    counts.set(teamSide, (counts.get(teamSide) || 0) + 1);
    if (counts.get(teamSide) > 4) invalid("A team side may have at most four anchors.", "TRACKING_STAGE_REQUEST_LIMIT");
    return { teamSide, trajectoryId };
  });
  return anchors.sort((left, right) => (
    left.teamSide.localeCompare(right.teamSide) || left.trajectoryId.localeCompare(right.trajectoryId)
  ));
}

function assertUniqueInputs(provider = {}, inputs = []) {
  const ids = inputs.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) invalid(`Tracking stage request ${requestInputFields[provider.stage]} ids must be unique.`);
  if (["reidentification", "classification"].includes(provider.stage)) {
    const assigned = inputs.flatMap((entry) => entry.observations.map((observation) => observation.id));
    if (new Set(assigned).size !== assigned.length) {
      invalid("Tracking stage request trajectories cannot reuse observations.", "TRACKING_STAGE_REFERENCE_MISMATCH");
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function normalizeTrackingStageRequest(providerValue = {}, request = {}) {
  const provider = normalizeTrackingProviderManifest(providerValue);
  const inputField = requestInputFields[provider.stage];
  const acceptsTeamAnchors = provider.stage === "classification" && provider.capabilities.includes("classify:team");
  exactKeys(request, [
    "sourceFingerprint", "range", ...(inputField ? [inputField] : []), ...(acceptsTeamAnchors ? ["teamAnchors"] : []),
  ], "Tracking stage request");
  const sourceFingerprint = sha256(request.sourceFingerprint, "tracking request source fingerprint");
  exactKeys(request.range, ["startMs", "endMs"], "Tracking request range");
  const range = {
    startMs: integer(request.range.startMs, "tracking request start"),
    endMs: integer(request.range.endMs, "tracking request end"),
  };
  if (range.endMs <= range.startMs || range.endMs - range.startMs > provider.runtime.maxDurationMs) {
    invalid("Tracking request range is invalid.", "TRACKING_STAGE_RANGE_MISMATCH");
  }
  const rawInputs = inputField
    ? Array.isArray(request[inputField]) ? request[inputField] : invalid(`Tracking stage request ${inputField} must be an array.`)
    : [];
  const maximumInputs = provider.stage === "segmentation" ? 8 : provider.stage === "association" ? 250_000 : 1024;
  if (rawInputs.length > maximumInputs || (provider.stage === "segmentation" && !rawInputs.length)) {
    invalid("Tracking stage request input count is outside its safety limit.", "TRACKING_STAGE_REQUEST_LIMIT");
  }
  const inputs = normalizedInputs(provider, rawInputs, range);
  assertUniqueInputs(provider, inputs);
  const teamAnchors = normalizedTeamAnchors(provider, request.teamAnchors ?? [], inputs);
  const normalized = {
    sourceFingerprint,
    range,
    ...(inputField ? { [inputField]: inputs } : {}),
    ...(acceptsTeamAnchors ? { teamAnchors } : {}),
  };
  const serialized = canonicalJson(normalized);
  if (Buffer.byteLength(serialized) > Math.min(provider.runtime.maxOutputBytes, 64 * 1024 * 1024)) {
    invalid("Tracking stage request exceeds its safety limit.", "TRACKING_STAGE_REQUEST_LIMIT");
  }
  return deepFreeze(normalized);
}

export function trackingStageRequestFingerprint(providerValue = {}, request = {}) {
  const provider = normalizeTrackingProviderManifest(providerValue);
  const normalized = normalizeTrackingStageRequest(provider, request);
  return createHash("sha256").update(canonicalJson({
    schemaVersion: 1,
    protocol: TRACKING_STAGE_REQUEST_PROTOCOL,
    provider: {
      id: provider.providerId,
      version: provider.providerVersion,
      fingerprintSha256: trackingProviderFingerprint(provider),
    },
    stage: provider.stage,
    capabilities: [...provider.capabilities].sort(),
    ...normalized,
  })).digest("hex");
}
