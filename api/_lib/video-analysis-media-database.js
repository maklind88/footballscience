const {
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeUuid,
  patchRows,
  selectRows,
} = require("./video-analysis-database-core.js");
const { recordAnalysisOperation } = require("./video-analysis-collaboration-database.js");
const {
  MEDIA_SCHEMA,
  mapExportManifest,
  mapMediaAngle,
  normalizeExportManifestPayload,
  normalizeMediaAnglePayload,
} = require("./video-analysis-media-contracts.js");

function rows(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

async function scopedRow(table, scope = {}, id = "") {
  const rowId = normalizeUuid(id);
  if (!rowId) return null;
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${rowId}`);
  params.set("limit", "1");
  const result = await selectRows(table, params);
  return result.ok ? rows(result)[0] || null : null;
}

async function listMediaWorkspace(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const matchId = normalizeUuid(query.matchId || query.match_id);
  if (!matchId) return { ok: false, status: 400, reason: "match id is required." };
  const match = await scopedRow("video_matches", scope, matchId);
  if (!match) return { ok: false, status: 404, reason: "Match could not be found." };
  const angleParams = buildTeamParams(scope);
  angleParams.set("select", "*");
  angleParams.set("match_id", `eq.${matchId}`);
  angleParams.set("status", "neq.archived");
  angleParams.set("order", "is_primary.desc,created_at.asc,id.asc");
  angleParams.set("limit", "32");
  const angleResult = await selectRows("video_media_angles", angleParams);
  if (!angleResult.ok) return angleResult;
  const exportParams = buildTeamParams(scope);
  exportParams.set("select", "*");
  exportParams.set("match_id", `eq.${matchId}`);
  exportParams.set("status", "eq.completed");
  exportParams.set("order", "rendered_at.desc,id.desc");
  exportParams.set("limit", "50");
  const exportResult = await selectRows("video_export_manifests", exportParams);
  if (!exportResult.ok) return exportResult;
  return {
    ok: true,
    payload: {
      schema: MEDIA_SCHEMA,
      angles: rows(angleResult).map(mapMediaAngle),
      exports: rows(exportResult).map(mapExportManifest),
      storesVideoFiles: false,
      artifactAccess: "device-local",
    },
  };
}

async function sourceForAngle(angle = {}) {
  const source = await scopedRow("video_sources", angle, angle.sourceId);
  if (!source || source.match_id !== angle.matchId || source.video_id !== angle.videoId) return null;
  return source;
}

async function existingAngle(angle = {}) {
  if (angle.id) return scopedRow("video_media_angles", angle, angle.id);
  const params = buildTeamParams(angle);
  params.set("select", "*");
  params.set("match_id", `eq.${angle.matchId}`);
  params.set("source_id", `eq.${angle.sourceId}`);
  params.set("status", "neq.archived");
  params.set("limit", "1");
  const result = await selectRows("video_media_angles", params);
  return result.ok ? rows(result)[0] || null : null;
}

async function saveMediaAngle(value = {}, actor = {}) {
  let angle;
  try { angle = normalizeMediaAnglePayload(value, actor); } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  if (!angle.matchId || !angle.videoId || !angle.sourceId) {
    return { ok: false, status: 400, reason: "Match, video and source are required." };
  }
  const source = await sourceForAngle(angle);
  if (!source) return { ok: false, status: 400, reason: "Media angle source must belong to the selected match and video." };
  const existing = await existingAngle(angle);
  if (angle.id && !existing) return { ok: false, status: 404, reason: "Media angle could not be found." };
  if (existing && angle.expectedRevision && Number(existing.revision || 1) !== angle.expectedRevision) {
    return { ok: false, status: 409, reason: "Media angle revision conflict. Reload before saving." };
  }
  if (angle.primary) {
    const demote = buildTeamParams(angle);
    demote.set("match_id", `eq.${angle.matchId}`);
    demote.set("is_primary", "eq.true");
    if (existing?.id) demote.set("id", `neq.${existing.id}`);
    const demoted = await patchRows("video_media_angles", demote, { is_primary: false });
    if (!demoted.ok) return demoted;
  }
  const row = {
    organization_id: angle.organizationId,
    team_id: angle.teamId,
    match_id: angle.matchId,
    video_id: angle.videoId,
    source_id: angle.sourceId,
    local_video_identifier: source.local_video_identifier,
    label: angle.label,
    angle_role: angle.role,
    sync_offset_ms: angle.syncOffsetMs,
    drift_ppm: angle.driftPpm,
    duration_ms: angle.durationMs || source.duration_ms || 0,
    is_primary: angle.primary,
    is_muted: angle.muted,
    sync_confidence: angle.syncConfidence,
    status: angle.status === "available" ? "active" : angle.status,
    created_by: existing?.created_by || angle.actorId,
    metadata: angle.metadata,
  };
  let result;
  if (existing) {
    const params = buildTeamParams(angle);
    params.set("id", `eq.${existing.id}`);
    if (angle.expectedRevision) params.set("revision", `eq.${angle.expectedRevision}`);
    result = await patchRows("video_media_angles", params, row);
  } else result = await insertRow("video_media_angles", row);
  const saved = rows(result)[0] || null;
  if (!result.ok || !saved) return { ok: false, status: angle.expectedRevision ? 409 : result.status || 500, reason: result.reason || "Media angle could not be saved." };
  await recordAnalysisOperation({
    matchId: angle.matchId,
    videoId: angle.videoId,
    entityType: "media-angle",
    entityId: saved.id,
    operationType: existing ? "media-angle.update" : "media-angle.create",
    expectedRevision: angle.expectedRevision,
    resultingRevision: saved.revision,
    payload: { role: saved.angle_role, primary: saved.is_primary, syncOffsetMs: saved.sync_offset_ms },
  }, actor);
  return { ok: true, payload: { schema: MEDIA_SCHEMA, angle: mapMediaAngle(saved) } };
}

async function saveExportManifest(value = {}, actor = {}) {
  let manifest;
  try { manifest = normalizeExportManifestPayload(value, actor); } catch (error) {
    return { ok: false, status: error.status || 400, reason: error.message };
  }
  if (!manifest.matchId || !manifest.videoId || !manifest.sourceId || !manifest.outputSha256 || !manifest.manifestSha256) {
    return { ok: false, status: 400, reason: "Export source and checksums are required." };
  }
  const source = await scopedRow("video_sources", manifest, manifest.sourceId);
  if (!source || source.match_id !== manifest.matchId || source.video_id !== manifest.videoId) {
    return { ok: false, status: 400, reason: "Export source must belong to this match and video." };
  }
  if (manifest.angleId) {
    const angle = await scopedRow("video_media_angles", manifest, manifest.angleId);
    if (!angle || angle.source_id !== source.id) return { ok: false, status: 400, reason: "Export angle does not match its source." };
  }
  const result = await insertRow("video_export_manifests", {
    organization_id: manifest.organizationId,
    team_id: manifest.teamId,
    match_id: manifest.matchId,
    video_id: manifest.videoId,
    source_id: manifest.sourceId,
    angle_id: manifest.angleId || null,
    presentation_id: manifest.presentationId || null,
    presentation_item_id: manifest.presentationItemId || null,
    clip_id: manifest.clipId || null,
    title: manifest.title,
    start_ms: manifest.startMs,
    end_ms: manifest.endMs,
    output_preset: manifest.preset,
    manifest_sha256: manifest.manifestSha256,
    output_sha256: manifest.outputSha256,
    output_size_bytes: manifest.outputSizeBytes,
    status: "completed",
    rendered_by: manifest.actorId,
    rendered_at: manifest.renderedAt,
    layer_summary: manifest.layerSummary,
    metadata: manifest.metadata,
  });
  const saved = rows(result)[0] || null;
  if (!result.ok || !saved) return { ok: false, status: result.status || 500, reason: result.reason || "Export manifest could not be saved." };
  await recordAnalysisOperation({
    matchId: manifest.matchId,
    videoId: manifest.videoId,
    entityType: "export-manifest",
    entityId: saved.id,
    operationType: "export.complete",
    payload: { preset: saved.output_preset, sizeBytes: saved.output_size_bytes, sha256: saved.output_sha256 },
  }, actor);
  return { ok: true, payload: { schema: MEDIA_SCHEMA, exportManifest: mapExportManifest(saved) } };
}

module.exports = { listMediaWorkspace, saveExportManifest, saveMediaAngle };
