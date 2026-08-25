const { createHash } = require("node:crypto");
const {
  actorScope,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
} = require("./video-analysis-database-core.js");

const PORTABLE_MEDIA_BUCKET = "football-science-video-reviews";
const MAX_PORTABLE_MEDIA_BYTES = 20 * 1024 * 1024 * 1024;
const SHARE_TARGET_TYPES = new Set(["team", "role", "group", "player", "user"]);
const ACCESS_LEVELS = new Set(["view", "download"]);
const PUBLISH_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "analyst"]);

function boundedInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeFileName(value = "Football Science review") {
  const title = String(value || "Football Science review")
    .replace(/[\\/]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 170) || "Football Science review";
  return `${title.replace(/\.mp4$/i, "")}.mp4`;
}

function sha256(value = "") {
  const digest = normalizeText(value, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : "";
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function portableManifestSha256(manifest = {}) {
  return createHash("sha256").update(JSON.stringify(stableValue(manifest))).digest("hex");
}

function normalizeShareTarget(value = {}, scope = {}) {
  const targetType = normalizeText(value.targetType || value.target_type || value.type, 40).toLowerCase();
  const targetId = normalizeText(value.targetId || value.target_id || value.id, 160);
  const accessLevel = normalizeText(value.accessLevel || value.access_level || "view", 40).toLowerCase();
  if (!SHARE_TARGET_TYPES.has(targetType) || !targetId) return null;
  if (targetType === "team" && targetId !== scope.teamId) return null;
  return {
    targetType,
    targetId,
    accessLevel: ACCESS_LEVELS.has(accessLevel) ? accessLevel : "view",
  };
}

function normalizedManifest(value = {}, identifiers = {}) {
  const source = value.source && typeof value.source === "object" ? value.source : {};
  const range = value.range && typeof value.range === "object" ? value.range : {};
  const analysis = value.analysis && typeof value.analysis === "object" ? value.analysis : {};
  const startMs = boundedInteger(range.startMs ?? value.startMs, 0, 24 * 60 * 60 * 1000);
  const endMs = Math.max(startMs + 1, boundedInteger(range.endMs ?? value.endMs, startMs + 1, 24 * 60 * 60 * 1000));
  if (endMs - startMs > 2 * 60 * 60 * 1000) {
    const error = new Error("Portable reviews are limited to two hours.");
    error.status = 400;
    throw error;
  }
  return {
    schema: "football-science-portable-review-v1",
    title: normalizeText(value.title || identifiers.title || "Football Science review", 180),
    range: { startMs, endMs },
    source: {
      matchId: normalizeUuid(source.matchId || identifiers.matchId),
      videoId: normalizeUuid(source.videoId || identifiers.videoId),
      sourceId: normalizeUuid(source.sourceId || identifiers.sourceId),
      angleId: normalizeUuid(source.angleId || identifiers.angleId),
      angleLabel: normalizeText(source.angleLabel, 180),
      angleRole: normalizeText(source.angleRole, 40),
    },
    analysis: {
      presentationId: normalizeUuid(analysis.presentationId || identifiers.presentationId),
      presentationItemId: normalizeUuid(analysis.presentationItemId || identifiers.presentationItemId),
      clipId: normalizeUuid(analysis.clipId || identifiers.clipId),
      compositeMode: analysis.compositeMode === "burn-in" ? "burn-in" : "source-only",
      compositePrimitiveCount: boundedInteger(analysis.compositePrimitiveCount, 0, 10000),
      drawingLayerCount: boundedInteger(analysis.drawingLayerCount, 0, 10000),
      dynamicGraphicCount: boundedInteger(analysis.dynamicGraphicCount, 0, 10000),
      objectTrackCount: boundedInteger(analysis.objectTrackCount, 0, 10000),
    },
    preset: ["review-720p", "analysis-1080p", "master-2160p"].includes(value.preset)
      ? value.preset
      : "analysis-1080p",
  };
}

function normalizePortableReservation(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  if (!PUBLISH_ROLES.has(normalizeText(actor.role, 40).toLowerCase())) {
    const error = new Error("Only authorized football staff can publish portable reviews.");
    error.status = 403;
    throw error;
  }
  const outputSha256 = sha256(payload.sha256 || payload.outputSha256);
  const sourceManifestSha256 = sha256(payload.sourceManifestSha256 || payload.manifestSha256);
  const sizeBytes = boundedInteger(payload.sizeBytes, 0, MAX_PORTABLE_MEDIA_BYTES);
  const manifest = normalizedManifest(payload.manifest, payload);
  const matchId = normalizeUuid(payload.matchId || manifest.source.matchId);
  const presentationId = normalizeUuid(payload.presentationId || manifest.analysis.presentationId);
  const clipId = normalizeUuid(payload.clipId || manifest.analysis.clipId);
  if (!matchId || !outputSha256 || !sourceManifestSha256 || !sizeBytes || !scope.actorId) {
    const error = new Error("A match, exact checksums and rendered file size are required before publishing.");
    error.status = 400;
    throw error;
  }
  if ((manifest.source.matchId && manifest.source.matchId !== matchId)
    || (manifest.analysis.presentationId && presentationId && manifest.analysis.presentationId !== presentationId)
    || (manifest.analysis.clipId && clipId && manifest.analysis.clipId !== clipId)) {
    const error = new Error("Portable review references must describe the same analysis export.");
    error.status = 400;
    throw error;
  }
  const requestedTargets = Array.isArray(payload.shareTargets) ? payload.shareTargets : [];
  const targets = requestedTargets.map((target) => normalizeShareTarget(target, scope)).filter(Boolean);
  const uniqueTargets = [...new Map(targets.map((target) => [`${target.targetType}:${target.targetId}`, target])).values()].slice(0, 200);
  const visibility = uniqueTargets.some((target) => target.targetType === "team" && target.targetId === scope.teamId)
    ? "team"
    : uniqueTargets.length ? "targets" : "private";
  return {
    scope,
    matchId,
    presentationId,
    clipId,
    exportManifestId: normalizeUuid(payload.exportManifestId),
    title: manifest.title,
    fileName: safeFileName(payload.fileName || payload.title || manifest.title),
    sizeBytes,
    sha256: outputSha256,
    manifestSha256: portableManifestSha256(manifest),
    sourceManifestSha256,
    manifest,
    targets: uniqueTargets,
    visibility,
  };
}

function portableStoragePath(scope = {}, assetId = "") {
  const segment = (value) => createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
  return `${segment(scope.organizationId)}/${segment(scope.teamId)}/${assetId}.mp4`;
}

function targetMatchesActor(target = {}, actor = {}) {
  const type = target.target_type || target.targetType;
  const id = target.target_id || target.targetId;
  if (type === "team") return id === actor.teamId;
  if (type === "role") return id.toLowerCase() === String(actor.role || "").toLowerCase();
  if (type === "group") return [actor.department, ...(actor.groupIds || [])].filter(Boolean).includes(id);
  if (type === "player") return [actor.id, actor.playerId].filter(Boolean).includes(id);
  return type === "user" && id === actor.id;
}

function portableAccessForActor(row = {}, targets = [], actor = {}) {
  const scope = actorScope(actor);
  if (row.organization_id !== scope.organizationId || row.team_id !== scope.teamId || row.status !== "ready") {
    return { canDownload: false, canView: false };
  }
  if (row.owner_id === scope.actorId) return { canDownload: true, canView: true };
  const matchingTargets = targets.filter((target) => target.status !== "archived" && targetMatchesActor(target, actor));
  const teamTarget = targets.find((target) => (
    target.status !== "archived"
    && (target.target_type || target.targetType) === "team"
    && (target.target_id || target.targetId) === scope.teamId
  ));
  const canView = row.visibility === "team" || matchingTargets.length > 0;
  const canDownload = matchingTargets.some((target) => (
    (target.access_level || target.accessLevel) === "download"
  )) || (row.visibility === "team" && (teamTarget?.access_level || teamTarget?.accessLevel) === "download");
  return { canDownload, canView };
}

function canActorAccessPortableAsset(row = {}, targets = [], actor = {}) {
  return portableAccessForActor(row, targets, actor).canView;
}

function portableAssetClient(row = {}, targets = [], actor = {}) {
  const manifest = row.manifest && typeof row.manifest === "object" ? row.manifest : {};
  const owner = row.owner_id === actorScope(actor).actorId;
  const access = portableAccessForActor(row, targets, actor);
  return {
    id: row.id,
    matchId: row.match_id,
    presentationId: row.presentation_id || "",
    clipId: row.clip_id || "",
    title: row.title,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    sha256: row.sha256,
    manifestSha256: row.manifest_sha256,
    sourceManifestSha256: row.source_manifest_sha256,
    visibility: row.visibility,
    status: row.status,
    owner,
    ownerId: owner ? row.owner_id : "",
    canDownload: access.canDownload,
    targetCount: targets.filter((target) => target.status !== "archived").length,
    publishedAt: row.published_at || "",
    manifest,
  };
}

module.exports = {
  MAX_PORTABLE_MEDIA_BYTES,
  PORTABLE_MEDIA_BUCKET,
  canActorAccessPortableAsset,
  normalizePortableReservation,
  normalizeShareTarget,
  portableAssetClient,
  portableAccessForActor,
  portableManifestSha256,
  portableStoragePath,
};
