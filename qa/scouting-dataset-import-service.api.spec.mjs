import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createScoutingDatasetImportService,
  isScoutingDataAdmin,
  normalizeArtifactIntent,
  sanitizeFileName,
} = require("../api/_lib/scouting-dataset-import.js");

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "admin",
};
const artifactId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const batchId = "44444444-4444-4444-8444-444444444444";
const fsdbPlayerId = "55555555-5555-4555-8555-555555555555";

function createService(overrides = {}) {
  return createScoutingDatasetImportService({
    appendAuditLog: async () => {},
    clearCaches: () => {},
    dbRequest: async () => ({ ok: true, payload: [] }),
    fetchArtifactBytes: async () => null,
    isDatabaseEnabled: () => true,
    normalizeImportIntent: (body) => ({
      data_hash: body.dataHash,
      metadata: body.metadata || {},
      season_label: body.seasonLabel || null,
      sheet_name: body.sheetName || null,
      source_file_name: body.sourceFileName,
    }),
    normalizeImportMetric: (metric, index) => ({
      metric_key: String(metric.id || `metric-${index}`),
      label: String(metric.label || metric.id || `Metric ${index}`),
      category: "performance",
      unit: null,
      direction: metric.direction === "lower" ? "lower" : "higher",
      source_column: metric.sourceColumn || metric.label || null,
      display_order: index,
      metadata: {},
    }),
    normalizeImportPlayer: () => ({
      organization_id: null,
      team_id: null,
      source_system: "wyscout",
      source_player_id: "ws-1",
      source_aliases: ["Player One"],
      canonical_name: "Player One",
      sort_name: "player one",
      birth_country: "Sweden",
      passport_country: "Sweden",
      height_cm: 170,
      weight_kg: 64,
      date_of_birth: "2000-01-01",
      external_refs: { wyscoutId: "ws-1" },
      metadata: {},
    }),
    normalizeImportSeasonRecord: (_record, _playerId, importBatchId) => ({
      organization_id: null,
      team_id: null,
      source_system: "wyscout",
      source_player_id: "ws-1",
      source_record_id: "wyscout::ws-1-2026-nwsl-ncc",
      record_key: "wyscout|ws-1|2026|nwsl|ncc",
      player_identity_key: "wyscout::ws-1",
      player_name: "Player One",
      team_name: "NCC",
      team_within_timeframe: "NCC",
      league_name: "NWSL",
      season_label: "2026",
      position_text: "GK",
      position_group: "GK",
      age: 26,
      matches: 15,
      minutes: 1_350,
      birth_country: "Sweden",
      passport_country: "Sweden",
      height_cm: 170,
      weight_kg: 64,
      date_of_birth: "2000-01-01",
      metrics: { save_rate: { value: 78, quality: "trusted" } },
      metadata: { importBatchId },
    }),
    resolveScoutingRecordIdentities: async (records) => records,
    ...overrides,
  });
}

test("Scouting dataset service validates source intent and trusted admin access", async () => {
  expect(isScoutingDataAdmin({ role: "admin" })).toBe(true);
  expect(isScoutingDataAdmin({ role: "coach" })).toBe(false);
  expect(sanitizeFileName("../Wömen's Football (Stats).xlsx")).toBe("Womens-Football-Stats.xlsx");
  expect(normalizeArtifactIntent({
    fileName: "players.xlsx",
    mediaType: "application/pdf",
    byteSize: 10,
    checksumSha256: "a".repeat(64),
  })).toMatchObject({ ok: false, status: 415 });
  expect(normalizeArtifactIntent({
    fileName: "players.xlsx",
    byteSize: 51 * 1024 * 1024,
    checksumSha256: "a".repeat(64),
  })).toMatchObject({ ok: false, status: 413 });

  const denied = await createService().createSourceArtifact({}, { role: "coach" });
  expect(denied).toMatchObject({ ok: false, status: 403 });
});

test("Scouting source artifacts use immutable paths and quarantine checksum mismatches", async () => {
  const bytes = Buffer.from("verified scouting workbook");
  const checksumSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const writes = [];
  let verificationBytes = bytes;
  const service = createService({
    createSignedArtifactUpload: async () => ({ token: "signed-token", expiresIn: 7200 }),
    fetchArtifactBytes: async () => verificationBytes,
    dbRequest: async (path, options = {}) => {
      writes.push({ path, options });
      if (path.startsWith("/scouting_source_artifacts?select=*&checksum_sha256")) return { ok: true, payload: [] };
      if (path === "/scouting_source_artifacts") {
        return { ok: true, payload: [{ id: artifactId, ...options.body[0] }] };
      }
      if (path === `/scouting_source_artifacts?select=*&id=eq.${artifactId}&limit=1`) {
        return {
          ok: true,
          payload: [{
            id: artifactId,
            byte_size: bytes.length,
            checksum_sha256: checksumSha256,
            storage_bucket: "footballscience-scouting-imports",
            storage_path: "admin/source.xlsx",
            status: "pending",
            metadata: {},
          }],
        };
      }
      if (path === `/scouting_source_artifacts?id=eq.${artifactId}`) {
        return { ok: true, payload: [{ id: artifactId, ...options.body }] };
      }
      return { ok: false, status: 500, reason: `Unexpected request: ${path}` };
    },
  });

  const created = await service.createSourceArtifact({
    fileName: "players.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteSize: bytes.length,
    checksumSha256,
  }, actor);
  expect(created).toMatchObject({ ok: true, uploadRequired: true, upload: { token: "signed-token" } });
  expect(created.artifact.storage_path).toMatch(/^11111111-1111-4111-8111-111111111111\/\d{4}-\d{2}-\d{2}\//);

  await expect(service.verifySourceArtifact({ artifactId }, actor)).resolves.toMatchObject({
    ok: true,
    artifact: { status: "verified" },
  });
  verificationBytes = Buffer.from("tampered");
  await expect(service.verifySourceArtifact({ artifactId }, actor)).resolves.toMatchObject({
    ok: false,
    status: 422,
    artifact: { status: "quarantined" },
  });
  expect(writes.filter((entry) => entry.path === `/scouting_source_artifacts?id=eq.${artifactId}`)).toHaveLength(2);
});

test("Scouting dataset staging links identity once, stores bounded rows, and validates before publish", async () => {
  const calls = [];
  const audits = [];
  let cacheClears = 0;
  const service = createService({
    appendAuditLog: async (_actor, event) => audits.push(event),
    clearCaches: () => { cacheClears += 1; },
    dbRequest: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === `/scouting_source_artifacts?select=*&id=eq.${artifactId}&status=eq.verified&limit=1`) {
        return { ok: true, payload: [{ id: artifactId, file_name: "players.xlsx", checksum_sha256: "a".repeat(64) }] };
      }
      if (path === "/rpc/start_scouting_dataset_import") {
        return { ok: true, payload: { datasetVersionId: versionId, reused: false } };
      }
      if (path.startsWith("/scouting_dataset_versions?select=") && path.includes(`id=eq.${versionId}`)) {
        return { ok: true, payload: [{ id: versionId, import_batch_id: batchId, status: "staged" }] };
      }
      if (path.startsWith("/fsdb_player_source_links?")) {
        return {
          ok: true,
          payload: [{
            player_id: fsdbPlayerId,
            source_system: "wyscout",
            source_entity_id: "ws-1",
            verified_status: "verified",
          }],
        };
      }
      if (path.startsWith("/scouting_import_stage_metrics?")) return { ok: true, payload: [] };
      if (path.startsWith("/scouting_import_stage_records?")) return { ok: true, payload: [] };
      if (path === "/rpc/validate_scouting_dataset_version") {
        return { ok: true, payload: { status: "validated", rowCount: 1, blockerCount: 0 } };
      }
      if (path.startsWith("/scouting_import_validations?")) {
        return { ok: true, payload: [{ validation_code: "row_count.exact", status: "passed" }] };
      }
      if (path === "/rpc/publish_scouting_dataset_version") {
        return { ok: true, payload: { status: "active", datasetVersionId: versionId } };
      }
      return { ok: false, status: 500, reason: `Unexpected request: ${path}` };
    },
  });

  await expect(service.startDatasetImport({
    sourceArtifactId: artifactId,
    dataHash: "b".repeat(64),
    rowCount: 1,
    metricCount: 1,
    versionLabel: "August 2026",
  }, actor)).resolves.toMatchObject({ ok: true, datasetVersionId: versionId, importBatchId: batchId });

  await expect(service.stageDatasetChunk({
    datasetVersionId: versionId,
    chunkIndex: 0,
    chunkCount: 1,
    records: [["source-row"]],
    metrics: [{ id: "save_rate", label: "Save rate" }],
  }, actor)).resolves.toMatchObject({ ok: true, recordCount: 1, metricCount: 1 });

  const stagedRows = calls.find((call) => call.path.startsWith("/scouting_import_stage_records?"))?.options.body;
  expect(stagedRows).toHaveLength(1);
  expect(stagedRows[0]).toMatchObject({
    dataset_version_id: versionId,
    fsdb_player_id: fsdbPlayerId,
    source_player_id: "ws-1",
    source_record_id: "wyscout::ws-1-2026-nwsl-ncc",
  });
  expect(calls.filter((call) => call.path.startsWith("/fsdb_player_source_links?"))).toHaveLength(1);

  await expect(service.validateDatasetImport({ datasetVersionId: versionId }, actor)).resolves.toMatchObject({
    ok: true,
    validation: { status: "validated" },
    checks: [{ validation_code: "row_count.exact", status: "passed" }],
  });
  await expect(service.publishDatasetImport({ datasetVersionId: versionId }, actor)).resolves.toMatchObject({ ok: true, status: "active" });
  await expect(service.rollbackDatasetImport({ datasetVersionId: versionId }, actor)).resolves.toMatchObject({ ok: true, status: "active" });
  expect(audits.map((entry) => entry.action)).toEqual([
    "scouting.dataset.staging_started",
    "scouting.dataset.published",
    "scouting.dataset.rolled_back",
  ]);
  expect(cacheClears).toBe(2);
});

test("Scouting dataset staging rejects oversized chunks before database writes", async () => {
  const calls = [];
  const service = createService({
    dbRequest: async (path) => {
      calls.push(path);
      if (path.startsWith("/scouting_dataset_versions?select=")) {
        return { ok: true, payload: [{ id: versionId, import_batch_id: batchId, status: "staged" }] };
      }
      return { ok: true, payload: [] };
    },
  });
  const result = await service.stageDatasetChunk({
    datasetVersionId: versionId,
    records: Array.from({ length: 161 }, () => ["row"]),
  }, actor);
  expect(result).toMatchObject({ ok: false, status: 413 });
  expect(calls.some((path) => path.startsWith("/scouting_import_stage_records"))).toBe(false);
});
