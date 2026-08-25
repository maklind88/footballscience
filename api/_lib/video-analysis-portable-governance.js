const {
  buildTeamParams,
  selectRows,
} = require("./video-analysis-database-core.js");

const MAX_OWNER_ACTIVE_ASSETS = 120;
const MAX_OWNER_ACTIVE_BYTES = 250 * 1024 * 1024 * 1024;

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function rowResult(result = {}) {
  return rowList(result)[0] || null;
}

async function scopedReference(table, id, scope) {
  if (!id) return null;
  const params = buildTeamParams(scope);
  params.set("id", `eq.${id}`);
  params.set("select", "*");
  params.set("limit", "1");
  const result = await selectRows(table, params);
  return result.ok ? rowResult(result) : null;
}

async function validateReservationReferences(input) {
  const match = await scopedReference("video_matches", input.matchId, input.scope);
  if (!match) return { ok: false, status: 404, reason: "The selected match is outside this team or no longer exists." };
  const source = input.manifest.source || {};
  if (source.videoId) {
    const video = await scopedReference("video_videos", source.videoId, input.scope);
    if (!video || video.match_id !== input.matchId) {
      return { ok: false, status: 400, reason: "The portable review video does not belong to this team and match." };
    }
  }
  if (source.sourceId) {
    const videoSource = await scopedReference("video_sources", source.sourceId, input.scope);
    if (!videoSource || videoSource.match_id !== input.matchId || (source.videoId && videoSource.video_id !== source.videoId)) {
      return { ok: false, status: 400, reason: "The portable review source does not match its team, match and video." };
    }
  }
  if (source.angleId) {
    const angle = await scopedReference("video_media_angles", source.angleId, input.scope);
    if (!angle || angle.match_id !== input.matchId || (source.sourceId && angle.source_id !== source.sourceId)) {
      return { ok: false, status: 400, reason: "The portable review angle does not match its source." };
    }
  }
  if (input.presentationId) {
    const presentation = await scopedReference("video_presentations", input.presentationId, input.scope);
    if (!presentation) return { ok: false, status: 400, reason: "The selected presentation does not belong to this team." };
  }
  if (input.clipId) {
    const clip = await scopedReference("video_clip_instances", input.clipId, input.scope);
    if (!clip || clip.match_id !== input.matchId) {
      return { ok: false, status: 400, reason: "The selected clip does not belong to this team and match." };
    }
  }
  const presentationItemId = input.manifest.analysis?.presentationItemId;
  if (presentationItemId) {
    const item = await scopedReference("video_presentation_items", presentationItemId, input.scope);
    if (!item || (input.presentationId && item.presentation_id !== input.presentationId)
      || (input.clipId && item.clip_instance_id !== input.clipId)) {
      return { ok: false, status: 400, reason: "The presentation item does not match this portable review." };
    }
  }
  if (input.exportManifestId) {
    const exported = await scopedReference("video_export_manifests", input.exportManifestId, input.scope);
    if (!exported || exported.match_id !== input.matchId || exported.output_sha256 !== input.sha256
      || exported.manifest_sha256 !== input.sourceManifestSha256) {
      return { ok: false, status: 400, reason: "The central export manifest does not match this rendered review." };
    }
  }
  return { ok: true };
}

async function portableOwnerQuota(input) {
  const params = buildTeamParams(input.scope);
  params.set("owner_id", `eq.${input.scope.actorId}`);
  params.set("status", "in.(uploading,ready)");
  params.set("select", "status,size_bytes,upload_expires_at");
  params.set("order", "created_at.desc");
  params.set("limit", "501");
  const result = await selectRows("video_portable_media_assets", params);
  if (!result.ok) return result;
  const active = rowList(result).filter((row) => (
    row.status === "ready" || Date.parse(row.upload_expires_at) > Date.now()
  ));
  const usedBytes = active.reduce((total, row) => total + Math.max(0, Number(row.size_bytes) || 0), 0);
  if (active.length >= MAX_OWNER_ACTIVE_ASSETS || usedBytes + input.sizeBytes > MAX_OWNER_ACTIVE_BYTES) {
    return { ok: false, status: 429, reason: "Portable review quota reached. Revoke older reviews before publishing another." };
  }
  return { ok: true };
}

async function readyDuplicate(input) {
  const params = buildTeamParams(input.scope);
  params.set("owner_id", `eq.${input.scope.actorId}`);
  params.set("match_id", `eq.${input.matchId}`);
  params.set("sha256", `eq.${input.sha256}`);
  params.set("source_manifest_sha256", `eq.${input.sourceManifestSha256}`);
  params.set("status", "eq.ready");
  params.set("select", "id");
  params.set("limit", "1");
  const result = await selectRows("video_portable_media_assets", params);
  return result.ok ? { ok: true, row: rowResult(result) } : result;
}

module.exports = {
  portableOwnerQuota,
  readyDuplicate,
  validateReservationReferences,
};
