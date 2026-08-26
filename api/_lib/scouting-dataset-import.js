const crypto = require("crypto");
const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
const { resolveScoutingIdentityCrosswalk } = require("./scouting-identity-crosswalk.js");

const SCOUTING_DATA_ADMIN_ROLES = new Set(["admin"]);
const SCOUTING_IMPORT_BUCKET = "footballscience-scouting-imports";
const SCOUTING_IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024;
const SCOUTING_IMPORT_MAX_CHUNK_RECORDS = 160;
const SCOUTING_IMPORT_MEDIA_TYPES = new Map([
  ["csv", "text/csv"],
  ["json", "application/json"],
  ["pdf", "application/pdf"],
  ["tsv", "text/tab-separated-values"],
  ["txt", "text/plain"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsb", "application/vnd.ms-excel"],
  ["xlsm", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STAGE_PLAYER_ID = "00000000-0000-4000-8000-000000000000";

function normalizeText(value = "", maxLength = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeRole(actor = {}) {
  return normalizeText(actor.role || "unknown", 40).toLowerCase();
}

function isScoutingDataAdmin(actor = {}) {
  return SCOUTING_DATA_ADMIN_ROLES.has(normalizeRole(actor));
}

function normalizeUuid(value = "") {
  const normalized = normalizeText(value, 80);
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeSha256(value = "") {
  const normalized = normalizeText(value, 64).toLowerCase();
  return SHA256_PATTERN.test(normalized) ? normalized : "";
}

function fileExtension(fileName = "") {
  return normalizeText(fileName, 240).split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
}

function sanitizeFileName(fileName = "") {
  const extension = fileExtension(fileName);
  const stem = normalizeText(fileName, 220)
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 160) || "scouting-dataset";
  return extension ? `${stem}.${extension}` : stem;
}

function normalizeArtifactIntent(body = {}) {
  const fileName = sanitizeFileName(body.fileName || body.file_name);
  const extension = fileExtension(fileName);
  const allowedMediaType = SCOUTING_IMPORT_MEDIA_TYPES.get(extension) || "";
  const requestedMediaType = normalizeText(body.mediaType || body.media_type, 160).toLowerCase();
  const byteSize = Math.floor(Number(body.byteSize || body.byte_size) || 0);
  const checksumSha256 = normalizeSha256(body.checksumSha256 || body.checksum_sha256);
  if (!allowedMediaType) {
    return { ok: false, status: 415, reason: "Only supported scouting data files are accepted." };
  }
  const compatibleMediaTypes = new Set([
    allowedMediaType,
    ...(extension.startsWith("xls") ? ["application/vnd.ms-excel", "application/octet-stream"] : []),
    ...(["csv", "tsv", "txt"].includes(extension) ? ["text/csv", "text/plain", "text/tab-separated-values", "application/vnd.ms-excel"] : []),
    ...(extension === "json" ? ["application/json", "text/plain"] : []),
  ]);
  if (requestedMediaType && !compatibleMediaTypes.has(requestedMediaType)) {
    return { ok: false, status: 415, reason: "The scouting data file type does not match its extension." };
  }
  if (byteSize < 1 || byteSize > SCOUTING_IMPORT_MAX_FILE_BYTES) {
    return { ok: false, status: 413, reason: "Scouting data files must be between 1 byte and 50 MB." };
  }
  if (!checksumSha256) {
    return { ok: false, status: 400, reason: "A SHA-256 checksum is required for the scouting source file." };
  }
  return {
    ok: true,
    fileName,
    mediaType: allowedMediaType,
    byteSize,
    checksumSha256,
  };
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function storageObjectPath(bucket, path) {
  return `${encodeURIComponent(String(bucket || ""))}/${String(path || "").split("/").map(encodeURIComponent).join("/")}`;
}

async function createSignedArtifactUpload(bucket, path) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) return null;
  const response = await fetch(`${config.url}/storage/v1/object/upload/sign/${storageObjectPath(bucket, path)}`, {
    method: "POST",
    headers: {
      ...buildSupabaseKeyHeaders(config.serviceRoleKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 * 60 * 2 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const signedUrl = payload.signedURL || payload.signedUrl || payload.url || "";
  let token = payload.token || payload.uploadToken || "";
  if (!token && signedUrl) {
    try {
      const absolute = signedUrl.startsWith("http") ? signedUrl : `${config.url}/storage/v1${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`;
      token = new URL(absolute).searchParams.get("token") || "";
    } catch {}
  }
  return { signedUrl, token, expiresIn: 60 * 60 * 2 };
}

async function fetchArtifactBytes(bucket, path) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${config.url}/storage/v1/object/authenticated/${storageObjectPath(bucket, path)}`, {
      headers: buildSupabaseKeyHeaders(config.serviceRoleKey),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= SCOUTING_IMPORT_MAX_FILE_BYTES ? bytes : null;
  } finally {
    clearTimeout(timer);
  }
}

function getFsdbPlayerId(player = {}, season = {}) {
  const candidates = [
    player.fsdb_player_id,
    player.external_refs?.fsdbPlayerId,
    season.fsdb_player_id,
    season.metadata?.fsdbPlayerId,
    season.metadata?.sourceTrace?.fsdbPlayerId,
  ];
  return candidates.map(normalizeUuid).find(Boolean) || null;
}

function buildStageRecord(record, importBatchId, deps) {
  const player = deps.normalizeImportPlayer(record);
  const season = deps.normalizeImportSeasonRecord(record, STAGE_PLAYER_ID, importBatchId);
  if (!player || !season || !player.source_player_id || !season.source_record_id) return null;
  const payloadHash = hashPayload({ player, season });
  return {
    dataset_version_id: null,
    organization_id: season.organization_id || player.organization_id || null,
    team_id: season.team_id || player.team_id || null,
    source_system: season.source_system,
    source_player_id: season.source_player_id,
    source_aliases: Array.isArray(player.source_aliases) ? player.source_aliases.slice(0, 40) : [],
    source_record_id: season.source_record_id,
    record_key: season.record_key,
    player_identity_key: season.player_identity_key,
    fsdb_player_id: getFsdbPlayerId(player, season),
    canonical_name: player.canonical_name,
    sort_name: player.sort_name,
    player_name: season.player_name,
    team_name: season.team_name,
    team_within_timeframe: season.team_within_timeframe,
    league_name: season.league_name,
    season_label: season.season_label,
    position_text: season.position_text,
    position_group: season.position_group,
    age: season.age,
    matches: season.matches,
    minutes: season.minutes,
    birth_country: season.birth_country || player.birth_country,
    passport_country: season.passport_country || player.passport_country,
    height_cm: season.height_cm || player.height_cm,
    weight_kg: season.weight_kg || player.weight_kg,
    date_of_birth: season.date_of_birth || player.date_of_birth,
    metrics: season.metrics || {},
    external_refs: player.external_refs || {},
    player_metadata: player.metadata || {},
    record_metadata: season.metadata || {},
    payload_hash: payloadHash,
    validation_status: "valid",
    change_type: "new-season-row",
  };
}

function buildStageMetric(metric, index, deps) {
  const normalized = deps.normalizeImportMetric(metric, index);
  return {
    dataset_version_id: null,
    ...normalized,
    payload_hash: hashPayload(normalized),
  };
}

function createScoutingDatasetImportService(deps = {}) {
  const createArtifactUpload = deps.createSignedArtifactUpload || createSignedArtifactUpload;
  const readArtifactBytes = deps.fetchArtifactBytes || fetchArtifactBytes;
  const requireAdmin = (actor) => isScoutingDataAdmin(actor)
    ? null
    : { ok: false, status: 403, reason: "Scouting dataset imports require Platform Admin access." };

  async function getVersion(versionId, select = "*") {
    const id = normalizeUuid(versionId);
    if (!id) return null;
    const result = await deps.dbRequest(`/scouting_dataset_versions?select=${encodeURIComponent(select)}&id=eq.${id}&limit=1`);
    if (!result.ok) return null;
    return Array.isArray(result.payload) ? result.payload[0] || null : null;
  }

  async function getCapability(actor = {}) {
    const base = {
      available: deps.isDatabaseEnabled(),
      ready: false,
      versioningAvailable: false,
      canAdministerData: isScoutingDataAdmin(actor),
      activeDatasetVersion: null,
      readMode: "legacy-file",
    };
    if (!base.available) return base;
    const versionResult = await deps.dbRequest(
      "/scouting_dataset_versions?select=id,version_number,version_label,data_hash,staged_row_count,staged_metric_count,activated_at,status&status=eq.active&order=activated_at.desc&limit=1"
    );
    if (versionResult.ok) {
      base.versioningAvailable = true;
      base.activeDatasetVersion = Array.isArray(versionResult.payload) ? versionResult.payload[0] || null : null;
    }
    const legacyResult = await deps.dbRequest("/scouting_player_seasons?select=id&status=eq.active&deleted_at=is.null&limit=1", {
      includeCount: true,
    });
    const legacyRows = Number.isFinite(Number(legacyResult.count)) ? Number(legacyResult.count) : Array.isArray(legacyResult.payload) ? legacyResult.payload.length : 0;
    base.ready = Boolean(base.activeDatasetVersion) || legacyRows > 0;
    base.readMode = base.activeDatasetVersion ? "versioned" : base.ready ? "legacy-server" : "legacy-file";
    base.rowCount = base.activeDatasetVersion?.staged_row_count || legacyRows;
    base.metricCount = base.activeDatasetVersion?.staged_metric_count || 0;
    return base;
  }

  async function createSourceArtifact(body = {}, actor = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    if (!deps.isDatabaseEnabled()) return { ok: false, status: 409, reason: "Scouting database mode is not enabled." };
    const intent = normalizeArtifactIntent(body);
    if (!intent.ok) return intent;
    const existing = await deps.dbRequest(
      `/scouting_source_artifacts?select=*&checksum_sha256=eq.${intent.checksumSha256}&byte_size=eq.${intent.byteSize}&status=in.(uploaded,verified)&order=created_at.desc&limit=1`
    );
    const reusable = existing.ok && Array.isArray(existing.payload) ? existing.payload[0] || null : null;
    if (reusable) {
      return { ok: true, artifact: reusable, reused: true, uploadRequired: false };
    }
    const actorId = normalizeUuid(actor.id);
    const datePath = new Date().toISOString().slice(0, 10);
    const path = `${actorId || "platform-admin"}/${datePath}/${crypto.randomUUID()}-${intent.fileName}`;
    const row = {
      file_name: intent.fileName,
      media_type: intent.mediaType,
      byte_size: intent.byteSize,
      checksum_sha256: intent.checksumSha256,
      storage_bucket: SCOUTING_IMPORT_BUCKET,
      storage_path: path,
      status: "pending",
      uploaded_by: actorId,
      metadata: { source: "scouting-admin-import" },
    };
    const inserted = await deps.dbRequest("/scouting_source_artifacts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [row],
    });
    if (!inserted.ok) return { ok: false, status: inserted.status || 500, reason: inserted.reason };
    const artifact = Array.isArray(inserted.payload) ? inserted.payload[0] : null;
    const upload = await createArtifactUpload(row.storage_bucket, row.storage_path);
    if (!artifact || !upload?.token) {
      if (artifact?.id) {
        await deps.dbRequest(`/scouting_source_artifacts?id=eq.${artifact.id}`, { method: "PATCH", body: { status: "failed" } });
      }
      return { ok: false, status: 503, reason: "A secure scouting source upload could not be created." };
    }
    return { ok: true, artifact, upload, reused: false, uploadRequired: true };
  }

  async function verifySourceArtifact(body = {}, actor = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const artifactId = normalizeUuid(body.artifactId || body.artifact_id);
    const result = artifactId
      ? await deps.dbRequest(`/scouting_source_artifacts?select=*&id=eq.${artifactId}&limit=1`)
      : null;
    const artifact = result?.ok && Array.isArray(result.payload) ? result.payload[0] || null : null;
    if (!artifact) return { ok: false, status: 404, reason: "Scouting source artifact was not found." };
    if (artifact.status === "verified") return { ok: true, artifact, reused: true };
    const bytes = await readArtifactBytes(artifact.storage_bucket, artifact.storage_path);
    const checksum = bytes ? crypto.createHash("sha256").update(bytes).digest("hex") : "";
    const verified = Boolean(bytes) && bytes.length === Number(artifact.byte_size) && checksum === artifact.checksum_sha256;
    const status = verified ? "verified" : "quarantined";
    const updated = await deps.dbRequest(`/scouting_source_artifacts?id=eq.${artifact.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: {
        status,
        uploaded_at: new Date().toISOString(),
        verified_at: verified ? new Date().toISOString() : null,
        verified_by: verified ? normalizeUuid(actor.id) : null,
        metadata: { ...(artifact.metadata || {}), verifiedByteSize: bytes?.length || 0, verifiedChecksum: checksum || null },
      },
    });
    const nextArtifact = updated.ok && Array.isArray(updated.payload) ? updated.payload[0] || artifact : artifact;
    if (!verified) return { ok: false, status: 422, reason: "The uploaded scouting source file did not match its checksum and was quarantined.", artifact: nextArtifact };
    return { ok: true, artifact: nextArtifact };
  }

  async function startDatasetImport(body = {}, actor = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const artifactId = normalizeUuid(body.sourceArtifactId || body.source_artifact_id);
    const artifactResult = artifactId
      ? await deps.dbRequest(`/scouting_source_artifacts?select=*&id=eq.${artifactId}&status=eq.verified&limit=1`)
      : null;
    const artifact = artifactResult?.ok && Array.isArray(artifactResult.payload) ? artifactResult.payload[0] || null : null;
    if (!artifact) return { ok: false, status: 422, reason: "A verified scouting source artifact is required." };
    const expectedRowCount = Math.floor(Number(body.rowCount || body.row_count) || 0);
    const expectedMetricCount = Math.max(0, Math.floor(Number(body.metricCount || body.metric_count) || 0));
    if (expectedRowCount < 1) return { ok: false, status: 400, reason: "The scouting dataset does not contain player rows." };
    const hash = normalizeSha256(body.dataHash || body.data_hash) || artifact.checksum_sha256;
    const intent = deps.normalizeImportIntent({ ...body, dataHash: hash, sourceFileName: artifact.file_name }, actor);
    intent.data_hash = hash;
    const versionLabel = normalizeText(body.versionLabel || body.version_label || artifact.file_name, 160);
    const startResult = await deps.dbRequest("/rpc/start_scouting_dataset_import", {
      method: "POST",
      body: {
        p_source_artifact_id: artifact.id,
        p_version_label: versionLabel,
        p_data_hash: hash,
        p_expected_row_count: expectedRowCount,
        p_expected_metric_count: expectedMetricCount,
        p_source_file_name: intent.source_file_name,
        p_sheet_name: intent.sheet_name,
        p_season_label: intent.season_label,
        p_actor_id: normalizeUuid(actor.id),
        p_metadata: intent.metadata,
      },
    });
    if (!startResult.ok) return { ok: false, status: startResult.status || 500, reason: startResult.reason };
    const started = startResult.payload && typeof startResult.payload === "object" ? startResult.payload : {};
    const versionId = normalizeUuid(started.datasetVersionId || started.dataset_version_id);
    const version = versionId ? await getVersion(versionId) : null;
    if (!version) return { ok: false, status: 500, reason: "The scouting dataset version could not be confirmed after staging started." };
    if (started.reused !== true) {
      await deps.appendAuditLog(actor, {
        action: "scouting.dataset.staging_started",
        summary: "Started a versioned scouting dataset import",
        details: {
          datasetVersionId: version.id,
          importBatchId: version.import_batch_id,
          sourceArtifactId: artifact.id,
          rowCount: expectedRowCount,
          metricCount: expectedMetricCount,
          sourceFileName: artifact.file_name,
        },
      });
    }
    return {
      ok: true,
      datasetVersion: version,
      datasetVersionId: version.id,
      importBatchId: version.import_batch_id,
      reused: started.reused === true,
    };
  }

  async function stageDatasetChunk(body = {}, actor = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const version = await getVersion(
      body.datasetVersionId || body.dataset_version_id,
      "id,status,import_batch_id,organization_id,team_id"
    );
    if (!version || !["staged", "blocked"].includes(version.status)) {
      return { ok: false, status: 409, reason: "Scouting dataset version is not open for staging." };
    }
    const records = Array.isArray(body.records) ? body.records : [];
    if (records.length > SCOUTING_IMPORT_MAX_CHUNK_RECORDS) {
      return { ok: false, status: 413, reason: `Scouting import chunks may contain at most ${SCOUTING_IMPORT_MAX_CHUNK_RECORDS} rows.` };
    }
    if (!records.length) return { ok: false, status: 400, reason: "Import chunk does not contain player rows." };
    const resolved = await deps.resolveScoutingRecordIdentities(records);
    const rows = resolved.map((record) => buildStageRecord(record, version.import_batch_id, deps));
    if (rows.some((row) => !row)) return { ok: false, status: 422, reason: "One or more scouting rows are missing a stable player or season identity." };
    await resolveScoutingIdentityCrosswalk(rows, deps.dbRequest);
    rows.forEach((row) => {
      row.dataset_version_id = version.id;
      row.organization_id = version.organization_id || null;
      row.team_id = version.team_id || null;
    });
    const inputMetrics = Array.isArray(body.metrics) ? body.metrics : [];
    if (inputMetrics.length > 1000) return { ok: false, status: 413, reason: "Scouting imports may contain at most 1,000 metrics." };
    const metrics = inputMetrics.map((metric, index) => buildStageMetric(metric, index, deps));
    metrics.forEach((metric) => {
      metric.dataset_version_id = version.id;
      metric.organization_id = version.organization_id || null;
      metric.team_id = version.team_id || null;
    });
    if (metrics.length) {
      const metricResult = await deps.dbRequest("/scouting_import_stage_metrics?on_conflict=dataset_version_id,metric_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: metrics,
      });
      if (!metricResult.ok) return { ok: false, status: metricResult.status || 500, reason: metricResult.reason };
    }
    const recordResult = await deps.dbRequest("/scouting_import_stage_records?on_conflict=dataset_version_id,source_system,source_record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: rows,
    });
    if (!recordResult.ok) return { ok: false, status: recordResult.status || 500, reason: recordResult.reason };
    return {
      ok: true,
      datasetVersionId: version.id,
      chunkIndex: Math.max(0, Math.floor(Number(body.chunkIndex) || 0)),
      chunkCount: Math.max(1, Math.floor(Number(body.chunkCount) || 1)),
      recordCount: rows.length,
      metricCount: metrics.length,
      stored: true,
    };
  }

  async function validateDatasetImport(body = {}, actor = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    const versionId = normalizeUuid(body.datasetVersionId || body.dataset_version_id);
    if (!versionId) return { ok: false, status: 400, reason: "Missing scouting dataset version id." };
    const result = await deps.dbRequest("/rpc/validate_scouting_dataset_version", {
      method: "POST",
      body: { p_dataset_version_id: versionId },
    });
    if (!result.ok) return { ok: false, status: result.status || 500, reason: result.reason };
    const validations = await deps.dbRequest(
      `/scouting_import_validations?select=validation_code,severity,status,message,expected_value,actual_value,details,checked_at&dataset_version_id=eq.${versionId}&order=severity.desc,validation_code.asc`
    );
    return { ok: true, datasetVersionId: versionId, validation: result.payload || {}, checks: validations.ok ? validations.payload || [] : [] };
  }

  async function publishDatasetImport(body = {}, actor = {}, options = {}) {
    const denied = requireAdmin(actor);
    if (denied) return denied;
    let versionId = normalizeUuid(body.datasetVersionId || body.dataset_version_id);
    if (!versionId && body.importBatchId) {
      const versionResult = await deps.dbRequest(`/scouting_dataset_versions?select=id&import_batch_id=eq.${normalizeUuid(body.importBatchId)}&limit=1`);
      versionId = versionResult.ok && Array.isArray(versionResult.payload) ? versionResult.payload[0]?.id || null : null;
    }
    if (!versionId) return { ok: false, status: 400, reason: "Missing scouting dataset version id." };
    const result = await deps.dbRequest("/rpc/publish_scouting_dataset_version", {
      method: "POST",
      body: {
        p_dataset_version_id: versionId,
        p_actor_id: normalizeUuid(actor.id),
        p_rollback: options.rollback === true,
      },
    });
    if (!result.ok) return { ok: false, status: result.status || 500, reason: result.reason };
    await deps.appendAuditLog(actor, {
      action: options.rollback ? "scouting.dataset.rolled_back" : "scouting.dataset.published",
      summary: options.rollback ? "Restored a previous scouting dataset version" : "Published a validated scouting dataset version",
      details: result.payload || { datasetVersionId: versionId },
    });
    deps.clearCaches?.();
    return { ok: true, datasetVersionId: versionId, ...(result.payload || {}), stored: true };
  }

  return {
    createSourceArtifact,
    getCapability,
    publishDatasetImport,
    rollbackDatasetImport: (body, actor) => publishDatasetImport(body, actor, { rollback: true }),
    stageDatasetChunk,
    startDatasetImport,
    validateDatasetImport,
    verifySourceArtifact,
  };
}

module.exports = {
  SCOUTING_DATA_ADMIN_ROLES,
  SCOUTING_IMPORT_BUCKET,
  SCOUTING_IMPORT_MAX_FILE_BYTES,
  createScoutingDatasetImportService,
  hashPayload,
  isScoutingDataAdmin,
  normalizeArtifactIntent,
  sanitizeFileName,
};
