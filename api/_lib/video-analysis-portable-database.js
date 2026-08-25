const { randomUUID } = require("node:crypto");
const {
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeText,
  normalizeUuid,
  patchRows,
  selectRows,
} = require("./video-analysis-database-core.js");
const {
  PORTABLE_MEDIA_BUCKET,
  canActorAccessPortableAsset,
  normalizePortableReservation,
  portableAssetClient,
  portableAccessForActor,
  portableStoragePath,
} = require("./video-analysis-portable-contracts.js");
const {
  portableOwnerQuota,
  readyDuplicate,
  validateReservationReferences,
} = require("./video-analysis-portable-governance.js");
const {
  createPortablePlaybackUrl,
  createPortableUpload,
  ensurePortableMediaBucket,
  portableObjectInfo,
  removePortableObject,
} = require("./video-analysis-portable-storage.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function rowResult(result = {}) {
  return rowList(result)[0] || null;
}

function assetParams(assetId, scope) {
  const params = buildTeamParams(scope);
  params.set("id", `eq.${assetId}`);
  params.set("select", "*");
  params.set("limit", "1");
  return params;
}

async function findAsset(assetId, actor) {
  const id = normalizeUuid(assetId);
  if (!id) return { ok: false, status: 400, reason: "A valid portable review id is required." };
  const result = await selectRows("video_portable_media_assets", assetParams(id, actorScope(actor)));
  if (!result.ok) return result;
  const asset = rowResult(result);
  return asset ? { ok: true, asset } : { ok: false, status: 404, reason: "Portable review not found." };
}

async function targetsForAssets(assetIds = [], scope = {}) {
  if (!assetIds.length) return { ok: true, targets: [] };
  const params = buildTeamParams(scope);
  params.set("asset_id", `in.(${assetIds.join(",")})`);
  params.set("status", "eq.active");
  params.set("select", "*");
  params.set("limit", "1000");
  const result = await selectRows("video_portable_media_share_targets", params);
  return result.ok ? { ok: true, targets: rowList(result) } : result;
}

async function markAsset(asset, status, metadata = {}) {
  const scope = { organizationId: asset.organization_id, teamId: asset.team_id };
  const params = assetParams(asset.id, scope);
  params.delete("select");
  params.delete("limit");
  return patchRows("video_portable_media_assets", params, {
    status,
    metadata: { ...(asset.metadata || {}), ...metadata },
    ...(status === "ready" ? { published_at: new Date().toISOString() } : {}),
    ...(status === "revoked" ? { revoked_at: new Date().toISOString() } : {}),
  });
}

async function insertTargets(asset, targets = [], actor = {}) {
  const saved = [];
  for (const target of targets) {
    const result = await insertRow("video_portable_media_share_targets", {
      organization_id: asset.organization_id,
      team_id: asset.team_id,
      asset_id: asset.id,
      target_type: target.targetType,
      target_id: target.targetId,
      access_level: target.accessLevel,
      status: "active",
      created_by: actor.id,
    });
    if (!result.ok) return result;
    saved.push(...rowList(result));
  }
  return { ok: true, targets: saved };
}

async function reservePortableMedia(payload = {}, actor = {}) {
  let input;
  try {
    input = normalizePortableReservation(payload, actor);
  } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  const references = await validateReservationReferences(input);
  if (!references.ok) return references;
  const quota = await portableOwnerQuota(input);
  if (!quota.ok) return quota;
  const duplicate = await readyDuplicate(input);
  if (!duplicate.ok) return duplicate;
  if (duplicate.row) {
    return { ok: false, status: 409, reason: "This exact rendered review is already published." };
  }
  const bucket = await ensurePortableMediaBucket();
  if (!bucket.ok) return { ok: false, status: bucket.status || 503, reason: bucket.reason || "Portable media storage is unavailable." };
  const id = randomUUID();
  const storagePath = portableStoragePath(input.scope, id);
  const uploadExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const inserted = await insertRow("video_portable_media_assets", {
    id,
    organization_id: input.scope.organizationId,
    team_id: input.scope.teamId,
    match_id: input.matchId,
    presentation_id: input.presentationId || null,
    clip_id: input.clipId || null,
    export_manifest_id: input.exportManifestId || null,
    owner_id: input.scope.actorId,
    title: input.title,
    file_name: input.fileName,
    mime_type: "video/mp4",
    size_bytes: input.sizeBytes,
    sha256: input.sha256,
    manifest_sha256: input.manifestSha256,
    source_manifest_sha256: input.sourceManifestSha256,
    storage_bucket: PORTABLE_MEDIA_BUCKET,
    storage_path: storagePath,
    visibility: input.visibility,
    status: "uploading",
    upload_expires_at: uploadExpiresAt,
    manifest: input.manifest,
    metadata: { uploadProtocol: "tus-1.0", portableSchema: "football-science-portable-review-v1" },
  });
  if (!inserted.ok) return inserted;
  const asset = rowResult(inserted);
  const targetResult = await insertTargets(asset, input.targets, actor);
  if (!targetResult.ok) {
    await markAsset(asset, "failed", { failureStage: "share-targets" });
    return targetResult;
  }
  const signed = await createPortableUpload(storagePath);
  if (!signed.ok) {
    await markAsset(asset, "failed", { failureStage: "upload-reservation" });
    return signed;
  }
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      asset: portableAssetClient(asset, targetResult.targets, actor),
      upload: {
        assetId: asset.id,
        endpoint: signed.payload.endpoint,
        token: signed.payload.token,
        bucket: PORTABLE_MEDIA_BUCKET,
        objectPath: storagePath,
        expectedBytes: input.sizeBytes,
        sha256: input.sha256,
        expiresAt: uploadExpiresAt,
      },
    },
  };
}

function objectSize(value = {}) {
  return Number(value.size ?? value.metadata?.size ?? value.metadata?.contentLength ?? value.metadata?.content_length) || 0;
}

function objectMime(value = {}) {
  return normalizeText(value.mimetype || value.mimeType || value.metadata?.mimetype || value.metadata?.contentType, 120).toLowerCase();
}

async function completePortableMedia(payload = {}, actor = {}) {
  const found = await findAsset(payload.assetId || payload.id, actor);
  if (!found.ok) return found;
  const { asset } = found;
  if (asset.owner_id !== actorScope(actor).actorId) return { ok: false, status: 403, reason: "Only the publisher can complete this review." };
  if (asset.status !== "uploading") return { ok: false, status: 409, reason: "This review is not waiting for an upload." };
  if (Date.parse(asset.upload_expires_at) <= Date.now()) {
    await markAsset(asset, "failed", { failureStage: "upload-expired" });
    return { ok: false, status: 410, reason: "The portable upload reservation expired." };
  }
  const info = await portableObjectInfo(asset.storage_path);
  const actualBytes = info.ok ? objectSize(info.payload) : 0;
  const mimeType = info.ok ? objectMime(info.payload) : "";
  if (!info.ok || actualBytes !== Number(asset.size_bytes) || (mimeType && mimeType !== "video/mp4")) {
    await removePortableObject(asset.storage_path).catch(() => {});
    await markAsset(asset, "failed", { failureStage: "object-verification" });
    return { ok: false, status: 409, reason: "The uploaded review failed its storage verification." };
  }
  const saved = await markAsset(asset, "ready", { verifiedSizeBytes: actualBytes, verifiedMimeType: mimeType || "video/mp4" });
  if (!saved.ok) {
    await removePortableObject(asset.storage_path).catch(() => {});
    await markAsset(asset, "failed", { failureStage: "duplicate-or-save-conflict" }).catch(() => {});
    return { ok: false, status: saved.status || 409, reason: saved.reason || "The portable review could not be finalized." };
  }
  const ready = rowResult(saved);
  const targets = await targetsForAssets([asset.id], actorScope(actor));
  return targets.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, asset: portableAssetClient(ready, targets.targets, actor) } }
    : targets;
}

async function listPortableMedia(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  const matchId = normalizeUuid(query.matchId || query.match_id);
  params.set("select", "*");
  params.set("status", "eq.ready");
  params.set("order", "published_at.desc,id.desc");
  params.set("limit", "80");
  if (matchId) params.set("match_id", `eq.${matchId}`);
  const result = await selectRows("video_portable_media_assets", params);
  if (!result.ok) return result;
  const assets = rowList(result);
  const targetResult = await targetsForAssets(assets.map((asset) => asset.id), scope);
  if (!targetResult.ok) return targetResult;
  const grouped = Map.groupBy
    ? Map.groupBy(targetResult.targets, (target) => target.asset_id)
    : targetResult.targets.reduce((map, target) => map.set(target.asset_id, [...(map.get(target.asset_id) || []), target]), new Map());
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      assets: assets
        .filter((asset) => canActorAccessPortableAsset(asset, grouped.get(asset.id) || [], actor))
        .map((asset) => portableAssetClient(asset, grouped.get(asset.id) || [], actor)),
    },
  };
}

async function openPortableMedia(payload = {}, actor = {}) {
  const found = await findAsset(payload.assetId || payload.id, actor);
  if (!found.ok) return found;
  const targets = await targetsForAssets([found.asset.id], actorScope(actor));
  if (!targets.ok) return targets;
  const access = portableAccessForActor(found.asset, targets.targets, actor);
  if (!access.canView) {
    return { ok: false, status: 403, reason: "You do not have access to this portable review." };
  }
  if (payload.download === true && !access.canDownload) {
    return { ok: false, status: 403, reason: "This review was shared for playback only." };
  }
  const range = found.asset.manifest?.range || {};
  const reviewSeconds = Math.max(1, Math.ceil((Number(range.endMs) - Number(range.startMs)) / 1000));
  const expiresIn = payload.download === true
    ? 10 * 60
    : Math.min(2 * 60 * 60, Math.max(15 * 60, reviewSeconds + 15 * 60));
  const signed = await createPortablePlaybackUrl(found.asset.storage_path, expiresIn, payload.download === true);
  return signed.ok
    ? {
        ok: true,
        payload: {
          schema: VIDEO_ANALYSIS_SCHEMA,
          asset: portableAssetClient(found.asset, targets.targets, actor),
          playback: signed.payload,
        },
      }
    : signed;
}

async function revokePortableMedia(payload = {}, actor = {}) {
  const found = await findAsset(payload.assetId || payload.id, actor);
  if (!found.ok) return found;
  const scope = actorScope(actor);
  if (found.asset.owner_id !== scope.actorId) return { ok: false, status: 403, reason: "Only the publisher can revoke this review." };
  const removed = await removePortableObject(found.asset.storage_path);
  if (!removed.ok && removed.status !== 404) return removed;
  const saved = await markAsset(found.asset, "revoked", { revokedBy: scope.actorId });
  if (!saved.ok) return saved;
  const targetParams = buildTeamParams(scope);
  targetParams.set("asset_id", `eq.${found.asset.id}`);
  targetParams.set("status", "eq.active");
  await patchRows("video_portable_media_share_targets", targetParams, { status: "archived", archived_at: new Date().toISOString() });
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, asset: portableAssetClient(rowResult(saved), [], actor) } };
}

module.exports = {
  completePortableMedia,
  listPortableMedia,
  openPortableMedia,
  reservePortableMedia,
  revokePortableMedia,
};
