const { normalizeText } = require("./video-analysis-database-core.js");

const CLIP_VISIBILITIES = new Set(["private", "team", "idp"]);

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function actorId(actor = {}) {
  return normalizeText(actor.actorId || actor.id, 160);
}

function normalizeClipVisibility(value = "", fallback = "private") {
  const visibility = normalizeText(value, 80).toLowerCase().replace(/_/g, "-");
  if (visibility === "shared" || visibility === "public") return "team";
  if (visibility === "player" || visibility === "player-safe" || visibility === "idp-shared") return "idp";
  return CLIP_VISIBILITIES.has(visibility) ? visibility : fallback;
}

function requestedClipVisibility(payload = {}) {
  const metadata = normalizeMetadata(payload.metadata);
  const raw = payload.visibility || payload.clipVisibility || payload.clip_visibility || metadata.visibility;
  if (raw) return normalizeClipVisibility(raw, "");
  if (payload.isShared === true || payload.is_shared === true) return "team";
  if (payload.isShared === false || payload.is_shared === false) return "private";
  return "";
}

function existingClipVisibility(row = {}) {
  const metadata = normalizeMetadata(row.metadata);
  if (metadata.visibility) return normalizeClipVisibility(metadata.visibility, "private");
  return row.id ? "team" : "private";
}

function hasClipPlayers(clip = {}) {
  return Array.isArray(clip.players) && clip.players.some((player) => (
    normalizeText(player.playerId || player.player_id || player.id, 160)
  ));
}

function isIdpClip(row = {}, clip = {}) {
  const metadata = normalizeMetadata(row.metadata);
  return metadata.idpShared === true || metadata.idp_shared === true || existingClipVisibility(row) === "idp" || hasClipPlayers(clip);
}

function clipOwnerId(row = {}, clip = {}, actor = {}) {
  const metadata = normalizeMetadata(row.metadata);
  return normalizeText(
    metadata.ownerId || metadata.owner_id || row.created_by || clip.ownerId || clip.owner_id || clip.actorId || actorId(actor),
    160
  );
}

function buildClipSharingMetadata({ payload = {}, clip = {}, existing = null, actor = {} } = {}) {
  const existingMetadata = normalizeMetadata(existing?.metadata);
  const payloadMetadata = normalizeMetadata(payload.metadata);
  const requestedVisibility = requestedClipVisibility(payload);
  const actorIdentifier = actorId(actor) || normalizeText(clip.actorId, 160);
  const ownerId = clipOwnerId(existing || {}, clip, actor);
  const previousVisibility = existing ? existingClipVisibility(existing) : "private";
  const forcedIdp = isIdpClip(existing || {}, clip);
  const visibility = forcedIdp
    ? "idp"
    : normalizeClipVisibility(requestedVisibility || previousVisibility || "private", existing ? previousVisibility : "private");
  const shared = visibility !== "private";
  const now = new Date().toISOString();
  return {
    ...existingMetadata,
    ...payloadMetadata,
    visibility,
    ownerId,
    isShared: shared,
    sharedBy: shared ? (actorIdentifier || existingMetadata.sharedBy || null) : null,
    sharedAt: shared ? (existingMetadata.sharedAt || now) : null,
    idpShared: visibility === "idp",
    sharingModel: "clip-metadata-v1",
  };
}

function attachClipSharingState(clip = {}) {
  const metadata = normalizeMetadata(clip.metadata);
  const visibility = normalizeClipVisibility(metadata.visibility, existingClipVisibility(clip));
  return {
    ...clip,
    metadata,
    visibility,
    is_shared: visibility !== "private",
    owner_id: normalizeText(metadata.ownerId || metadata.owner_id || clip.created_by, 160),
    idp_shared: visibility === "idp" || metadata.idpShared === true || metadata.idp_shared === true,
  };
}

function canActorViewClip(clip = {}, actor = {}) {
  const enriched = attachClipSharingState(clip);
  if (enriched.visibility !== "private") return true;
  const identifier = actorId(actor);
  if (!identifier) return false;
  return [enriched.owner_id, clip.created_by].some((value) => normalizeText(value, 160) === identifier);
}

function canActorMutateClip(clip = {}, actor = {}) {
  const enriched = attachClipSharingState(clip);
  if (enriched.visibility !== "private") return true;
  const identifier = actorId(actor);
  if (!identifier) return false;
  return [enriched.owner_id, clip.created_by].some((value) => normalizeText(value, 160) === identifier);
}

module.exports = {
  attachClipSharingState,
  buildClipSharingMetadata,
  canActorMutateClip,
  canActorViewClip,
  normalizeClipVisibility,
  requestedClipVisibility,
};
