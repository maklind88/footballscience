import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  APP_STATE_TENANT_MIGRATION_CONFIRMATION,
  APP_STATE_TENANT_ROLLBACK_CONFIRMATION,
  createAppStateTenantMigrationPlan,
  createMigrationSnapshot,
  verifyMigratedAppStateRows,
  verifyMigrationSnapshot,
} from "../scripts/lib/app-state-tenant-migration.mjs";
import { parseArgs, runAppStateTenantMigration } from "../scripts/app-state-tenant-migration.mjs";

const migrationSqlUrl = new URL(
  "../supabase/migrations/20260823190933_platform_app_state_tenant_migration_journal.sql",
  import.meta.url
);
const migrationScriptUrl = new URL("../scripts/app-state-tenant-migration.mjs", import.meta.url);
const targetOrganizationId = "00000000-0000-4000-8000-000000000101";

function row(overrides = {}) {
  return {
    organization_id: "global",
    state_key: "football-schedule-v1",
    module_id: "schedule",
    merge_policy: "replace",
    revision: 7,
    value: JSON.stringify({ events: [{ id: "training-1", title: "Training" }] }),
    removed: false,
    updated_by: "00000000-0000-4000-8000-000000000001",
    updated_at: "2026-08-23T10:00:00.000Z",
    value_hash: "a".repeat(64),
    metadata: { source: "legacy", nested: { z: 2, a: 1 } },
    ...overrides,
  };
}

test("tenant migration plan is deterministic and contains no actor or credential material", () => {
  const sourceA = row();
  const sourceB = row({ metadata: { nested: { a: 1, z: 2 }, source: "legacy" } });
  const first = createAppStateTenantMigrationPlan({
    targetOrganizationId,
    sourceRows: [sourceA],
    targetRows: [],
  });
  const second = createAppStateTenantMigrationPlan({
    targetOrganizationId,
    sourceRows: [sourceB],
    targetRows: [],
  });

  expect(first.planSha256).toBe(second.planSha256);
  expect(first.sourceOrganizationId).toBe("global");
  expect(first.targetOrganizationId).toBe(targetOrganizationId);
  expect(JSON.stringify(first)).not.toContain("service-role");
  expect(first).not.toHaveProperty("actorId");
  expect(first).not.toHaveProperty("email");
});

test("tenant migration verification requires exact content, metadata, count, and revision", () => {
  const source = [row()];
  expect(verifyMigratedAppStateRows(source, [row({ organization_id: targetOrganizationId })]).ok).toBe(true);
  expect(verifyMigratedAppStateRows(source, [row({ value: "different" })]).ok).toBe(false);
  expect(verifyMigratedAppStateRows(source, [row({ revision: 8 })]).ok).toBe(false);
  expect(verifyMigratedAppStateRows(source, [row({ metadata: { source: "changed" } })]).ok).toBe(false);
  expect(verifyMigratedAppStateRows(source, []).ok).toBe(false);
});

test("migration snapshot detects any data or journal-plan tampering", () => {
  const plan = createAppStateTenantMigrationPlan({
    targetOrganizationId,
    sourceRows: [row()],
    targetRows: [],
  });
  const snapshot = createMigrationSnapshot(plan);

  expect(verifyMigrationSnapshot(snapshot).ok).toBe(true);
  expect(verifyMigrationSnapshot({
    ...snapshot,
    source: { ...snapshot.source, recordCount: snapshot.source.recordCount + 1 },
  }).ok).toBe(false);
  expect(verifyMigrationSnapshot({ ...snapshot, planSha256: "b".repeat(64) }).ok).toBe(false);
});

test("completed matching journal stays idempotent even when a newer unrelated attempt exists", async () => {
  const sourceRows = [row()];
  const targetRows = [row({ organization_id: targetOrganizationId })];
  const plan = createAppStateTenantMigrationPlan({ targetOrganizationId, sourceRows, targetRows: [] });
  const writes = [];
  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") writes.push({ method, url: requestUrl.toString() });
    if (requestUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{ id: targetOrganizationId, status: "active" }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_records") {
      const organization = String(requestUrl.searchParams.get("organization_id") || "");
      return new Response(JSON.stringify(organization === "eq.global" ? sourceRows : targetRows), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations") {
      return new Response(JSON.stringify([
        {
          id: "00000000-0000-4000-8000-000000000302",
          status: "failed",
          plan_sha256: "f".repeat(64),
          source_record_count: 99,
          source_content_sha256: "e".repeat(64),
          source_revision_sha256: "d".repeat(64),
        },
        {
          id: "00000000-0000-4000-8000-000000000301",
          status: "completed",
          plan_sha256: plan.planSha256,
          source_record_count: plan.source.recordCount,
          source_content_sha256: plan.source.contentSha256,
          source_revision_sha256: plan.source.revisionSha256,
          target_before_record_count: 0,
          target_before_content_sha256: plan.targetBefore.contentSha256,
          target_before_revision_sha256: plan.targetBefore.revisionSha256,
          source_organization_id: "global",
          target_organization_id: targetOrganizationId,
        },
      ]), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl}` }), { status: 500 });
  };

  const result = await runAppStateTenantMigration({
    apply: false,
    rollback: false,
    targetOrganizationId,
    actorId: "00000000-0000-4000-8000-000000000001",
  }, {
    config: { url: "https://example.supabase.co", serviceRoleKey: "service-role-test-key" },
    fetchImpl,
  });

  expect(result).toMatchObject({ ok: true, idempotent: true, writes: false, migrationId: "00000000-0000-4000-8000-000000000301" });
  expect(writes).toEqual([]);
});

test("migration journal is idempotent, RLS protected, and server-role only", async () => {
  const sql = await readFile(migrationSqlUrl, "utf8");

  expect(sql).toContain("unique (source_organization_id, target_organization_id, plan_sha256)");
  expect(sql).toContain("source_organization_id = 'global'");
  expect(sql).toContain("organization_id = target_organization_id");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("force row level security");
  expect(sql).toContain("revoke all on public.platform_app_state_tenant_migrations from anon, authenticated");
  expect(sql).toContain("revoke all on public.platform_app_state_tenant_migrations from public");
  expect(sql).toContain("grant select, insert, update on public.platform_app_state_tenant_migrations to service_role");
  expect(sql).toContain("target_before_revision_sha256");
  const journalTableSql = sql.slice(
    sql.indexOf("create table if not exists public.platform_app_state_tenant_migrations"),
    sql.indexOf("create index if not exists platform_app_state_tenant_migrations_target_idx")
  );
  expect(journalTableSql).not.toMatch(/^\s*metadata\s+jsonb/m);
  expect(sql).not.toMatch(/^\s*(created_by|email|credential|credentials|personal_data)\s+/m);
});

test("apply and rollback require separate exact confirmations and rollback stays explicit", async () => {
  const apply = parseArgs([
    "--apply",
    `--confirm=${APP_STATE_TENANT_MIGRATION_CONFIRMATION}`,
    `--target-organization-id=${targetOrganizationId}`,
    `--actor-id=00000000-0000-4000-8000-000000000001`,
    `--expected-plan-sha256=${"c".repeat(64)}`,
    "--expected-record-count=3",
  ]);
  const rollback = parseArgs([
    "--rollback",
    `--confirm=${APP_STATE_TENANT_ROLLBACK_CONFIRMATION}`,
    "--migration-id=00000000-0000-4000-8000-000000000301",
  ]);
  const source = await readFile(migrationScriptUrl, "utf8");

  expect(apply).toMatchObject({
    apply: true,
    rollback: false,
    confirm: APP_STATE_TENANT_MIGRATION_CONFIRMATION,
    targetOrganizationId,
    expectedRecordCount: 3,
  });
  expect(rollback).toMatchObject({
    apply: false,
    rollback: true,
    confirm: APP_STATE_TENANT_ROLLBACK_CONFIRMATION,
  });
  expect(APP_STATE_TENANT_MIGRATION_CONFIRMATION).not.toBe(APP_STATE_TENANT_ROLLBACK_CONFIRMATION);
  expect(source).toContain("No automatic rollback was attempted; use the explicit verified rollback command.");
  expect(source).not.toMatch(/catch\s*\([^)]*\)\s*\{[^}]*rollbackMigration\(/s);
  expect(source).toContain("options.expectedPlanSha256 !== plan.planSha256");
  expect(source).toContain("options.expectedRecordCount !== plan.source.recordCount");
  expect(source).toContain("bucket.payload?.public !== false");
});

test("repeated apply is idempotent only for the exact completed plan hash and record count", async () => {
  const sourceRows = [row()];
  const targetRows = [row({ organization_id: targetOrganizationId })];
  const plan = createAppStateTenantMigrationPlan({ targetOrganizationId, sourceRows, targetRows: [] });
  const journal = {
    id: "00000000-0000-4000-8000-000000000301",
    status: "completed",
    plan_sha256: plan.planSha256,
    source_organization_id: "global",
    target_organization_id: targetOrganizationId,
    source_record_count: plan.source.recordCount,
    source_content_sha256: plan.source.contentSha256,
    source_revision_sha256: plan.source.revisionSha256,
    target_before_record_count: plan.targetBefore.recordCount,
    target_before_content_sha256: plan.targetBefore.contentSha256,
    target_before_revision_sha256: plan.targetBefore.revisionSha256,
  };
  const fetchImpl = async (url) => {
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{ id: targetOrganizationId, status: "active" }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_records") {
      return new Response(JSON.stringify(
        requestUrl.searchParams.get("organization_id") === "eq.global" ? sourceRows : targetRows
      ), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations") {
      return new Response(JSON.stringify([journal]), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500 });
  };
  const baseOptions = {
    apply: true,
    rollback: false,
    confirm: APP_STATE_TENANT_MIGRATION_CONFIRMATION,
    targetOrganizationId,
    actorId: "00000000-0000-4000-8000-000000000001",
    expectedPlanSha256: plan.planSha256,
    expectedRecordCount: plan.source.recordCount,
  };
  const dependencies = {
    config: { url: "https://example.supabase.co", serviceRoleKey: "service-role-test-key" },
    fetchImpl,
  };

  await expect(runAppStateTenantMigration(baseOptions, dependencies)).resolves.toMatchObject({
    ok: true,
    idempotent: true,
    writes: false,
    planSha256: plan.planSha256,
  });
  await expect(runAppStateTenantMigration({
    ...baseOptions,
    expectedPlanSha256: "f".repeat(64),
  }, dependencies)).rejects.toThrow("Idempotent apply stopped");
});


test("apply uses the transactional migration RPC and fails closed on completed-journal errors", async () => {
  const sourceRows = [row()];
  let targetRows = [];
  const plan = createAppStateTenantMigrationPlan({ targetOrganizationId, sourceRows, targetRows });
  const snapshot = createMigrationSnapshot(plan);
  const requests = [];
  const migrationId = "00000000-0000-4000-8000-000000000401";
  let completePatchFailed = true;
  let uploadedSnapshot = null;
  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const method = String(options.method || "GET").toUpperCase();
    requests.push({ method, path: requestUrl.pathname, body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.pathname === "/rest/v1/platform_organizations") {
      return new Response(JSON.stringify([{ id: targetOrganizationId, status: "active" }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_records") {
      return new Response(JSON.stringify(
        requestUrl.searchParams.get("organization_id") === "eq.global" ? sourceRows : targetRows
      ), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations" && method === "GET") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (requestUrl.pathname === "/storage/v1/bucket/footballscience-app-state") {
      return new Response(JSON.stringify({ id: "footballscience-app-state", public: false }), { status: 200 });
    }
    if (requestUrl.pathname.startsWith("/storage/v1/object/footballscience-app-state/")) {
      if (method === "POST") {
        uploadedSnapshot = requests.at(-1).body;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(uploadedSnapshot || snapshot), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations" && method === "POST") {
      return new Response(JSON.stringify([{ id: migrationId, ...requests.at(-1).body }]), { status: 201 });
    }
    if (requestUrl.pathname === "/rest/v1/rpc/apply_platform_app_state_tenant_migration") {
      targetRows = sourceRows.map((source) => ({ ...source, organization_id: targetOrganizationId }));
      return new Response(JSON.stringify([{ applied: true, migrated_count: sourceRows.length }]), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations" && method === "PATCH") {
      if (requests.at(-1).body?.status === "completed" && completePatchFailed) {
        completePatchFailed = false;
        return new Response(JSON.stringify({ message: "journal completed write failed" }), { status: 500 });
      }
      return new Response("", { status: 204 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl.pathname}` }), { status: 500 });
  };

  await expect(runAppStateTenantMigration({
    apply: true,
    rollback: false,
    confirm: APP_STATE_TENANT_MIGRATION_CONFIRMATION,
    targetOrganizationId,
    actorId: "00000000-0000-4000-8000-000000000001",
    expectedPlanSha256: plan.planSha256,
    expectedRecordCount: plan.source.recordCount,
  }, {
    config: { url: "https://example.supabase.co", serviceRoleKey: "service-role-test-key" },
    fetchImpl,
  })).rejects.toThrow("Migration journal could not be marked completed");

  expect(requests.some((request) => request.path === "/rest/v1/rpc/apply_platform_app_state_tenant_migration")).toBe(true);
  expect(requests.some((request) => request.path === "/rest/v1/rpc/write_platform_app_state_record")).toBe(false);
  expect(requests.filter((request) => request.method === "PATCH").map((request) => request.body.status)).toEqual(["completed", "failed"]);
});

test("rollback uses the transactional rollback RPC and never performs a tenant-wide REST delete", async () => {
  const sourceRows = [row()];
  let targetRows = [row({ organization_id: targetOrganizationId })];
  const plan = createAppStateTenantMigrationPlan({ targetOrganizationId, sourceRows, targetRows: [] });
  const snapshot = createMigrationSnapshot(plan);
  const migrationId = "00000000-0000-4000-8000-000000000402";
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const method = String(options.method || "GET").toUpperCase();
    requests.push({ method, path: requestUrl.pathname, body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.pathname === "/rest/v1/platform_app_state_tenant_migrations" && method === "GET") {
      return new Response(JSON.stringify([{
        id: migrationId,
        status: "completed",
        snapshot_path: "backups/app-state-migrations/org/snapshot.json",
        snapshot_sha256: snapshot.snapshotSha256,
        target_before_record_count: 0,
        target_organization_id: targetOrganizationId,
        source_record_count: plan.source.recordCount,
      }]), { status: 200 });
    }
    if (requestUrl.pathname.startsWith("/storage/v1/object/footballscience-app-state/")) {
      return new Response(JSON.stringify(snapshot), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/platform_app_state_records") {
      return new Response(JSON.stringify(targetRows), { status: 200 });
    }
    if (requestUrl.pathname === "/rest/v1/rpc/rollback_platform_app_state_tenant_migration") {
      targetRows = [];
      return new Response(JSON.stringify([{ rolled_back: true, deleted_count: sourceRows.length }]), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${requestUrl.pathname}` }), { status: 500 });
  };

  await expect(runAppStateTenantMigration({
    apply: false,
    rollback: true,
    confirm: APP_STATE_TENANT_ROLLBACK_CONFIRMATION,
    migrationId,
  }, {
    config: { url: "https://example.supabase.co", serviceRoleKey: "service-role-test-key" },
    fetchImpl,
  })).resolves.toMatchObject({ ok: true, rolledBack: true, migrationId });

  expect(requests.some((request) => request.path === "/rest/v1/rpc/rollback_platform_app_state_tenant_migration")).toBe(true);
  expect(requests.some((request) => request.method === "DELETE" && request.path === "/rest/v1/platform_app_state_records")).toBe(false);
});
