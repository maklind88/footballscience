#!/usr/bin/env node
import process from "node:process";
import { createRequire } from "node:module";
import {
  APP_STATE_TENANT_MIGRATION_CONFIRMATION,
  APP_STATE_TENANT_ROLLBACK_CONFIRMATION,
  createAppStateTenantMigrationPlan,
  createMigrationSnapshot,
  sha256,
  verifyMigratedAppStateRows,
  verifyMigrationSnapshot,
} from "./lib/app-state-tenant-migration.mjs";
const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const STATE_BUCKET = "footballscience-app-state";
const JOURNAL_TABLE = "platform_app_state_tenant_migrations";
const RECORDS_TABLE = "platform_app_state_records";
const WRITE_RPC = "write_platform_app_state_record";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
function normalize(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}
function readFlag(args, index) {
  const equals = args[index].indexOf("=");
  return equals >= 0
    ? { value: args[index].slice(equals + 1), consumed: 0 }
    : { value: args[index + 1], consumed: 1 };
}
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    rollback: false,
    json: false,
    confirm: "",
    targetOrganizationId: normalize(process.env.APP_STATE_LEGACY_GLOBAL_ORGANIZATION_ID, 120),
    actorId: normalize(process.env.APP_STATE_TENANT_MIGRATION_ACTOR_ID, 120),
    expectedPlanSha256: normalize(process.env.APP_STATE_TENANT_MIGRATION_PLAN_SHA256, 64),
    expectedRecordCount: Number(process.env.APP_STATE_TENANT_MIGRATION_RECORD_COUNT),
    migrationId: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--rollback") { options.rollback = true; continue; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (!arg.startsWith("--")) continue;
    const { value, consumed } = readFlag(argv, index);
    index += consumed;
    const flag = arg.split("=", 1)[0];
    if (flag === "--confirm") options.confirm = normalize(value, 80);
    if (flag === "--target-organization-id") options.targetOrganizationId = normalize(value, 120);
    if (flag === "--actor-id") options.actorId = normalize(value, 120);
    if (flag === "--expected-plan-sha256") options.expectedPlanSha256 = normalize(value, 64);
    if (flag === "--expected-record-count") options.expectedRecordCount = Number(value);
    if (flag === "--migration-id") options.migrationId = normalize(value, 120);
  }
  return options;
}
function help() {
  console.log(`App-state tenant migration

Dry-run is the default and performs no writes.

Apply:
  npm run platform:app-state:tenant-migrate -- --target-organization-id <uuid> --actor-id <uuid> \\
    --apply --confirm=${APP_STATE_TENANT_MIGRATION_CONFIRMATION} \\
    --expected-plan-sha256 <sha256> --expected-record-count <count>

Rollback a completed or interrupted migration whose pre-migration target was empty:
  npm run platform:app-state:tenant-migrate -- --rollback --migration-id <uuid> \\
    --confirm=${APP_STATE_TENANT_ROLLBACK_CONFIRMATION}
`);
}
function headers(secret, extra = {}) {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}
async function parseResponse(response) {
  const text = response?.status === 204 ? "" : await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}
async function request(url, options, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(15000) : undefined,
    });
  } catch {
    return { ok: false, status: 503, reason: "Supabase migration request could not be completed." };
  }
  const payload = await parseResponse(response);
  return response.ok
    ? { ok: true, status: response.status, payload }
    : { ok: false, status: response.status, reason: payload?.message || `Supabase request failed (${response.status}).`, payload };
}
function restUrl(config, table, params = {}) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}
async function readRows(config, table, params = {}, fetchImpl = fetch) {
  const result = await request(restUrl(config, table, { select: "*", ...params }), {
    method: "GET",
    headers: headers(config.serviceRoleKey),
  }, fetchImpl);
  if (!result.ok) return result;
  return Array.isArray(result.payload)
    ? { ok: true, rows: result.payload }
    : { ok: false, status: 502, reason: `${table} returned an invalid payload.` };
}
async function readStateRows(config, organizationId, fetchImpl = fetch) {
  return readRows(config, RECORDS_TABLE, {
    organization_id: `eq.${organizationId}`,
    order: "state_key.asc",
  }, fetchImpl);
}
async function verifyCanonicalOrganization(config, organizationId, fetchImpl = fetch) {
  const result = await readRows(config, "platform_organizations", {
    id: `eq.${organizationId}`,
    status: "eq.active",
    limit: "1",
  }, fetchImpl);
  if (!result.ok) return result;
  return result.rows.length === 1
    ? { ok: true }
    : { ok: false, status: 404, reason: "The target canonical organization does not exist or is inactive." };
}
function objectPath(path) {
  return String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
async function storeVerifiedSnapshot(config, snapshot, fetchImpl = fetch) {
  const bucket = await request(`${config.url}/storage/v1/bucket/${encodeURIComponent(STATE_BUCKET)}`, {
    method: "GET",
    headers: headers(config.serviceRoleKey),
  }, fetchImpl);
  if (!bucket.ok || bucket.payload?.public !== false) {
    return { ok: false, status: 409, reason: "The app-state snapshot bucket must exist and remain private." };
  }
  const timestamp = snapshot.createdAt.replace(/[:.]/g, "-");
  const path = `backups/app-state-migrations/${snapshot.targetOrganizationId}/${timestamp}-${snapshot.snapshotSha256.slice(0, 16)}.json`;
  const upload = await request(
    `${config.url}/storage/v1/object/${encodeURIComponent(STATE_BUCKET)}/${objectPath(path)}`,
    {
      method: "POST",
      headers: headers(config.serviceRoleKey, { "Cache-Control": "private, no-store", "x-upsert": "false" }),
      body: JSON.stringify(snapshot),
    },
    fetchImpl
  );
  if (!upload.ok) return upload;
  const reread = await request(
    `${config.url}/storage/v1/object/${encodeURIComponent(STATE_BUCKET)}/${objectPath(path)}`,
    { method: "GET", headers: headers(config.serviceRoleKey) },
    fetchImpl
  );
  const verified = reread.ok ? verifyMigrationSnapshot(reread.payload) : { ok: false };
  return verified.ok && reread.payload.snapshotSha256 === snapshot.snapshotSha256
    ? { ok: true, path, snapshotSha256: snapshot.snapshotSha256 }
    : { ok: false, status: 409, reason: "Migration snapshot failed read-after-write verification." };
}

async function readVerifiedSnapshot(config, path, expectedSha256, fetchImpl = fetch) {
  const result = await request(
    `${config.url}/storage/v1/object/${encodeURIComponent(STATE_BUCKET)}/${objectPath(path)}`,
    { method: "GET", headers: headers(config.serviceRoleKey) },
    fetchImpl
  );
  const verification = result.ok ? verifyMigrationSnapshot(result.payload) : { ok: false };
  return verification.ok && result.payload.snapshotSha256 === expectedSha256
    ? { ok: true, snapshot: result.payload }
    : { ok: false, status: 409, reason: "Migration rollback snapshot failed integrity verification." };
}

async function insertJournal(config, plan, snapshot, fetchImpl = fetch) {
  const result = await request(restUrl(config, JOURNAL_TABLE, { select: "*" }), {
    method: "POST",
    headers: headers(config.serviceRoleKey, { Prefer: "return=representation" }),
    body: JSON.stringify({
      organization_id: plan.targetOrganizationId,
      source_organization_id: "global",
      target_organization_id: plan.targetOrganizationId,
      plan_sha256: plan.planSha256,
      status: "applying",
      source_record_count: plan.source.recordCount,
      source_content_sha256: plan.source.contentSha256,
      source_revision_sha256: plan.source.revisionSha256,
      target_before_record_count: plan.targetBefore.recordCount,
      target_before_content_sha256: plan.targetBefore.contentSha256,
      target_before_revision_sha256: plan.targetBefore.revisionSha256,
      snapshot_path: snapshot.path,
      snapshot_sha256: snapshot.snapshotSha256,
      started_at: new Date().toISOString(),
    }),
  }, fetchImpl);
  const row = Array.isArray(result.payload) ? result.payload[0] : null;
  return result.ok && row?.id ? { ok: true, row } : { ...result, ok: false, reason: result.reason || "Migration journal could not be created." };
}

async function readTenantJournals(config, targetOrganizationId, fetchImpl = fetch) {
  const result = await readRows(config, JOURNAL_TABLE, {
    source_organization_id: "eq.global",
    target_organization_id: `eq.${targetOrganizationId}`,
    order: "created_at.desc",
    limit: "50",
  }, fetchImpl);
  return result.ok ? { ok: true, rows: result.rows } : result;
}

async function updateJournal(config, id, values, fetchImpl = fetch) {
  return request(restUrl(config, JOURNAL_TABLE, { id: `eq.${id}` }), {
    method: "PATCH",
    headers: headers(config.serviceRoleKey, { Prefer: "return=minimal" }),
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  }, fetchImpl);
}

async function writeTargetRows(config, plan, actorId, existingRows = [], fetchImpl = fetch) {
  const existingByKey = new Map(existingRows.map((row) => [String(row.state_key || row.key || ""), row]));
  for (const row of plan.source.rows) {
    const existing = existingByKey.get(row.stateKey);
    if (existing) {
      if (!verifyMigratedAppStateRows([row], [existing]).ok) {
        throw new Error(`Target row ${row.stateKey} differs from the reviewed legacy generation.`);
      }
      continue;
    }
    const result = await request(`${config.url}/rest/v1/rpc/${WRITE_RPC}`, {
      method: "POST",
      headers: headers(config.serviceRoleKey),
      body: JSON.stringify({
        p_organization_id: plan.targetOrganizationId,
        p_state_key: row.stateKey,
        p_module_id: row.moduleId,
        p_merge_policy: row.mergePolicy,
        p_expected_revision: 0,
        p_next_revision: row.revision,
        p_value: row.value,
        p_removed: row.removed,
        p_updated_by: actorId,
        p_value_hash: SHA256_PATTERN.test(row.valueHash) ? row.valueHash : sha256(row.value),
        p_metadata: row.metadata,
      }),
    }, fetchImpl);
    const persisted = Array.isArray(result.payload) ? result.payload[0] : null;
    if (!result.ok || !persisted?.applied) {
      throw new Error(result.reason || `Legacy row ${row.stateKey} could not be migrated.`);
    }
  }
}

async function deleteTargetRows(config, organizationId, fetchImpl = fetch) {
  return request(restUrl(config, RECORDS_TABLE, { organization_id: `eq.${organizationId}` }), {
    method: "DELETE",
    headers: headers(config.serviceRoleKey, { Prefer: "return=minimal" }),
  }, fetchImpl);
}

async function rollbackMigration(config, options, fetchImpl = fetch) {
  if (!UUID_PATTERN.test(options.migrationId) || options.confirm !== APP_STATE_TENANT_ROLLBACK_CONFIRMATION) {
    throw new Error("Rollback requires a valid --migration-id and the exact rollback confirmation phrase.");
  }
  const journal = await readRows(config, JOURNAL_TABLE, { id: `eq.${options.migrationId}`, limit: "1" }, fetchImpl);
  const row = journal.ok ? journal.rows[0] : null;
  if (!row || Number(row.target_before_record_count) !== 0) {
    throw new Error("Explicit rollback is allowed only when the verified target was empty before migration.");
  }
  const storedSnapshot = await readVerifiedSnapshot(config, row.snapshot_path, row.snapshot_sha256, fetchImpl);
  if (!storedSnapshot.ok) throw new Error(storedSnapshot.reason);
  const currentTarget = await readStateRows(config, row.target_organization_id, fetchImpl);
  if (!currentTarget.ok) throw new Error(currentTarget.reason || "Rollback target could not be read.");
  const expectedTargetRows = storedSnapshot.snapshot?.source?.rows || [];
  const targetVerification = verifyMigratedAppStateRows(expectedTargetRows, currentTarget.rows);
  if (!targetVerification.ok) {
    throw new Error("Rollback refused because target data changed after the migration generation.");
  }
  const removed = await deleteTargetRows(config, row.target_organization_id, fetchImpl);
  if (!removed.ok) throw new Error(removed.reason || "Target rollback delete failed.");
  const after = await readStateRows(config, row.target_organization_id, fetchImpl);
  if (!after.ok || after.rows.length !== 0) throw new Error("Rollback verification found remaining target rows.");
  await updateJournal(config, row.id, { status: "rolled_back", rolled_back_at: new Date().toISOString(), last_error: "" }, fetchImpl);
  return { ok: true, rolledBack: true, migrationId: row.id, targetOrganizationId: row.target_organization_id };
}

export async function runAppStateTenantMigration(options, dependencies = {}) {
  const config = dependencies.config || readConfig();
  const fetchImpl = dependencies.fetchImpl || fetch;
  if (!config.url || !config.serviceRoleKey) throw new Error("Supabase service-role configuration is required.");
  if (options.rollback) return rollbackMigration(config, options, fetchImpl);
  if (!UUID_PATTERN.test(options.targetOrganizationId) || !UUID_PATTERN.test(options.actorId)) {
    throw new Error("A canonical target organization UUID and actor UUID are required.");
  }
  const canonical = await verifyCanonicalOrganization(config, options.targetOrganizationId, fetchImpl);
  if (!canonical.ok) throw new Error(canonical.reason);
  const [source, target] = await Promise.all([
    readStateRows(config, "global", fetchImpl),
    readStateRows(config, options.targetOrganizationId, fetchImpl),
  ]);
  if (!source.ok || !target.ok) throw new Error(source.reason || target.reason || "Migration source could not be read.");
  const currentPlan = createAppStateTenantMigrationPlan({
    targetOrganizationId: options.targetOrganizationId,
    sourceRows: source.rows,
    targetRows: target.rows,
  });
  const existingJournalResult = await readTenantJournals(config, options.targetOrganizationId, fetchImpl);
  if (!existingJournalResult.ok) throw new Error(existingJournalResult.reason || "Migration journal could not be read.");
  const sourceMatches = (journal) => Boolean(
    journal &&
    journal.source_organization_id === "global" &&
    journal.target_organization_id === options.targetOrganizationId &&
    Number(journal.source_record_count) === currentPlan.source.recordCount &&
    journal.source_content_sha256 === currentPlan.source.contentSha256 &&
    journal.source_revision_sha256 === currentPlan.source.revisionSha256
  );
  const matchingJournals = existingJournalResult.rows.filter(sourceMatches);
  const completedPlan = createAppStateTenantMigrationPlan({
    targetOrganizationId: options.targetOrganizationId,
    sourceRows: source.rows,
    targetRows: [],
  });
  const existingJournal = matchingJournals.find((journal) => (
    journal.status === "completed" &&
    journal.plan_sha256 === completedPlan.planSha256 &&
    Number(journal.target_before_record_count) === completedPlan.targetBefore.recordCount &&
    journal.target_before_content_sha256 === completedPlan.targetBefore.contentSha256 &&
    journal.target_before_revision_sha256 === completedPlan.targetBefore.revisionSha256
  )) || null;
  if (existingJournal) {
    const verification = verifyMigratedAppStateRows(source.rows, target.rows);
    if (!verification.ok) {
      throw new Error("Completed migration journal does not match the current target rows.");
    }
    if (
      options.apply &&
      (
        options.confirm !== APP_STATE_TENANT_MIGRATION_CONFIRMATION ||
        options.expectedPlanSha256 !== existingJournal.plan_sha256 ||
        options.expectedRecordCount !== verification.source.recordCount
      )
    ) {
      throw new Error("Idempotent apply stopped because the confirmation, plan hash, or record count differs from the completed migration.");
    }
    return {
      ok: true,
      dryRun: !options.apply,
      writes: false,
      idempotent: true,
      migrationId: existingJournal.id,
      sourceOrganizationId: "global",
      targetOrganizationId: options.targetOrganizationId,
      planSha256: existingJournal.plan_sha256,
      sourceRecordCount: verification.source.recordCount,
      sourceContentSha256: verification.source.contentSha256,
      sourceRevisionSha256: verification.source.revisionSha256,
      targetBeforeRecordCount: Number(existingJournal.target_before_record_count),
      targetBeforeContentSha256: existingJournal.target_before_content_sha256,
      targetBeforeRevisionSha256: existingJournal.target_before_revision_sha256,
      targetAfterRecordCount: verification.target.recordCount,
      targetAfterContentSha256: verification.target.contentSha256,
      targetAfterRevisionSha256: verification.target.revisionSha256,
    };
  }
  let plan = currentPlan;
  let resumableJournal = null;
  let storedSnapshot = null;
  const interruptedJournal = matchingJournals.find((journal) => ["applying", "failed"].includes(journal.status));
  if (interruptedJournal) {
    storedSnapshot = await readVerifiedSnapshot(
      config,
      interruptedJournal.snapshot_path,
      interruptedJournal.snapshot_sha256,
      fetchImpl
    );
    if (!storedSnapshot.ok) throw new Error(storedSnapshot.reason);
    plan = createAppStateTenantMigrationPlan({
      targetOrganizationId: options.targetOrganizationId,
      sourceRows: storedSnapshot.snapshot?.source?.rows || [],
      targetRows: storedSnapshot.snapshot?.targetBefore?.rows || [],
    });
    if (plan.planSha256 !== interruptedJournal.plan_sha256) {
      throw new Error("Stored migration snapshot no longer matches the journaled plan.");
    }
    for (const targetRow of target.rows) {
      const sourceRow = plan.source.rows.find((row) => row.stateKey === String(targetRow.state_key || targetRow.key || ""));
      if (!sourceRow || !verifyMigratedAppStateRows([sourceRow], [targetRow]).ok) {
        throw new Error("Interrupted migration cannot resume because target rows changed outside the reviewed plan.");
      }
    }
    resumableJournal = interruptedJournal;
  }
  const summary = {
    ok: true,
    dryRun: !options.apply,
    writes: false,
    sourceOrganizationId: "global",
    targetOrganizationId: plan.targetOrganizationId,
    planSha256: plan.planSha256,
    sourceRecordCount: plan.source.recordCount,
    sourceContentSha256: plan.source.contentSha256,
    sourceRevisionSha256: plan.source.revisionSha256,
    targetBeforeRecordCount: plan.targetBefore.recordCount,
    targetBeforeContentSha256: plan.targetBefore.contentSha256,
    targetBeforeRevisionSha256: plan.targetBefore.revisionSha256,
  };
  if (!options.apply) return summary;
  if (
    options.confirm !== APP_STATE_TENANT_MIGRATION_CONFIRMATION ||
    options.expectedPlanSha256 !== plan.planSha256 ||
    options.expectedRecordCount !== plan.source.recordCount ||
    plan.source.recordCount === 0 ||
    plan.targetBefore.recordCount !== 0 ||
    (!resumableJournal && target.rows.length !== 0)
  ) {
    throw new Error("Apply stopped: confirmation, reviewed plan, record count, non-empty source, or empty-target guard failed.");
  }
  const snapshot = resumableJournal
    ? {
        ok: true,
        path: resumableJournal.snapshot_path,
        snapshotSha256: resumableJournal.snapshot_sha256,
      }
    : await storeVerifiedSnapshot(config, createMigrationSnapshot(plan), fetchImpl);
  if (!snapshot.ok) throw new Error(snapshot.reason);
  const journal = resumableJournal
    ? { ok: true, row: resumableJournal }
    : await insertJournal(config, plan, snapshot, fetchImpl);
  if (!journal.ok) throw new Error(journal.reason);
  if (resumableJournal) {
    await updateJournal(config, journal.row.id, {
      status: "applying",
      failed_at: null,
      last_error: "",
    }, fetchImpl);
  }
  try {
    await writeTargetRows(config, plan, options.actorId, target.rows, fetchImpl);
    const [sourceAfter, targetAfter] = await Promise.all([
      readStateRows(config, "global", fetchImpl),
      readStateRows(config, plan.targetOrganizationId, fetchImpl),
    ]);
    if (!sourceAfter.ok || !targetAfter.ok) throw new Error("Post-migration verification could not read both scopes.");
    const sourceStillMatches = verifyMigratedAppStateRows(source.rows, sourceAfter.rows);
    const verification = verifyMigratedAppStateRows(source.rows, targetAfter.rows);
    if (!sourceStillMatches.ok || !verification.ok) throw new Error("Post-migration count/hash/revision verification failed.");
    await updateJournal(config, journal.row.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      target_after_record_count: verification.target.recordCount,
      target_after_content_sha256: verification.target.contentSha256,
      target_after_revision_sha256: verification.target.revisionSha256,
      last_error: "",
    }, fetchImpl);
    return {
      ...summary,
      dryRun: false,
      writes: true,
      migrationId: journal.row.id,
      snapshotPath: snapshot.path,
      snapshotSha256: snapshot.snapshotSha256,
      targetAfterRecordCount: verification.target.recordCount,
      targetAfterContentSha256: verification.target.contentSha256,
      targetAfterRevisionSha256: verification.target.revisionSha256,
    };
  } catch (error) {
    await updateJournal(config, journal.row.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: String(error?.message || "Migration failed.").slice(0, 1000),
    }, fetchImpl).catch(() => null);
    throw new Error(`${error.message} No automatic rollback was attempted; use the explicit verified rollback command.`);
  }
}
async function main() {
  const options = parseArgs();
  if (options.help) { help(); return; }
  const result = await runAppStateTenantMigration(options);
  console.log(options.json ? JSON.stringify(result) : [
    `App-state tenant migration: ${result.ok ? "ok" : "failed"}`,
    `- mode: ${result.dryRun ? "dry-run" : result.rolledBack ? "rollback" : "apply"}`,
    `- target organization: ${result.targetOrganizationId}`,
    ...(result.planSha256 ? [`- plan sha256: ${result.planSha256}`, `- source records: ${result.sourceRecordCount}`] : []),
    ...(result.migrationId ? [`- migration id: ${result.migrationId}`] : []),
  ].join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`App-state tenant migration failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
