import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const packageRoot = new URL("../", import.meta.url);
const projectRoot = new URL("../../../", import.meta.url);
const actorId = "00000000-0000-4000-8000-000000000101";
const revokedActorId = "00000000-0000-4000-8000-000000000102";
const crossTenantActorId = "00000000-0000-4000-8000-000000000103";
const organizationId = "00000000-0000-4000-8000-000000000201";
const teamId = "00000000-0000-4000-8000-000000000401";
const sessionId = "00000000-0000-4000-8000-000000001001";

const applySql = `select * from app_private.apply_session_planner_desktop_operation_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::uuid, $6::uuid, $7::uuid,
  $8::text, $9::integer, $10::bigint, $11::jsonb, $12::text, $13::text
)`;

function digest(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function database() {
  const db = await PGlite.create("memory://");
  await db.exec(await readFile(new URL("local-integration/base-catalog.sql", packageRoot), "utf8"));
  await db.exec(await readFile(new URL("supabase/drafts/20260831160000_desktop_session_sync_v1.sql", projectRoot), "utf8"));
  return db;
}

async function apply(db, {
  actor = actorId,
  organization = organizationId,
  team = teamId,
  client = "00000000-0000-4000-8000-000000009001",
  operationId = randomUUID(),
  operationType = "session.rename",
  baseRevision = 7,
  payload = { title: "Synthetic MD-1 Updated" },
  requestId = randomUUID(),
} = {}) {
  await db.exec("set role fs_desktop_sync_executor");
  try {
    return await db.query(applySql, [
      actor,
      organization,
      team,
      1,
      client,
      operationId,
      sessionId,
      operationType,
      1,
      baseRevision,
      JSON.stringify(payload),
      digest(payload),
      requestId,
    ]);
  } finally {
    await db.exec("reset role");
  }
}

test("draft routine is private, security-definer, safe-search-path and minimum-role only", async () => {
  const db = await database();
  const metadata = await db.query(`
    select p.prosecdef, p.proconfig,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
      has_function_privilege('fs_desktop_sync_executor', p.oid, 'EXECUTE') as executor_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'apply_session_planner_desktop_operation_v1'
  `);
  assert.equal(metadata.rows.length, 1);
  assert.equal(metadata.rows[0].prosecdef, true);
  assert.match(metadata.rows[0].proconfig.join(" "), /search_path=pg_catalog, app_private, pg_temp/);
  assert.equal(metadata.rows[0].authenticated_execute, false);
  assert.equal(metadata.rows[0].service_execute, false);
  assert.equal(metadata.rows[0].executor_execute, true);
  await db.close();
});

test("accepted operation is atomic and immutable replay returns already-applied", async () => {
  const db = await database();
  const operationId = randomUUID();
  const payload = { title: "Synthetic MD-1 Updated" };
  const first = await apply(db, { operationId, payload });
  assert.equal(first.rows[0].acknowledgement, "accepted");
  assert.equal(Number(first.rows[0].resulting_revision), 8);
  const replay = await apply(db, { operationId, payload, requestId: randomUUID() });
  assert.equal(replay.rows[0].acknowledgement, "already-applied");
  assert.equal(replay.rows[0].acknowledgement_id, first.rows[0].acknowledgement_id);
  const session = await db.query("select title, row_version from public.session_planner_sessions where id = $1", [sessionId]);
  assert.deepEqual(session.rows[0], { title: payload.title, row_version: 8 });
  const ledger = await db.query("select count(*)::integer as count from app_private.session_planner_desktop_operations");
  assert.equal(ledger.rows[0].count, 1);
  await db.close();
});

test("operation-id reuse, cross-tenant and revoked membership fail without partial mutation", async () => {
  const db = await database();
  const operationId = randomUUID();
  await apply(db, { operationId });
  await assert.rejects(
    apply(db, { operationId, payload: { title: "Different content" } }),
    /operation id was reused/i,
  );
  await assert.rejects(apply(db, { actor: crossTenantActorId, baseRevision: 8 }), /membership rejected/i);
  await assert.rejects(apply(db, { actor: revokedActorId, baseRevision: 8 }), /membership rejected/i);
  const session = await db.query("select title, row_version from public.session_planner_sessions where id = $1", [sessionId]);
  assert.deepEqual(session.rows[0], { title: "Synthetic MD-1 Updated", row_version: 8 });
  await db.close();
});

test("revision conflict and typed block update preserve canonical app-state", async () => {
  const db = await database();
  const conflict = await apply(db, { baseRevision: 6 });
  assert.equal(conflict.rows[0].acknowledgement, "conflict");
  assert.equal(Number(conflict.rows[0].resulting_revision), 7);
  const block = await apply(db, {
    operationType: "block.duration.set",
    payload: {
      blockId: "00000000-0000-4000-8000-000000001101",
      durationMinutes: 22,
    },
  });
  assert.equal(block.rows[0].acknowledgement, "accepted");
  assert.equal(Number(block.rows[0].resulting_revision), 8);
  const stored = await db.query("select payload, row_version from public.session_planner_blocks where id = $1", ["00000000-0000-4000-8000-000000001101"]);
  assert.equal(stored.rows[0].payload.durationMinutes, 22);
  assert.equal(Number(stored.rows[0].row_version), 8);
  const canonical = await db.query("select value, revision from public.platform_app_state_entries where storage_key = 'football-session-planner-v3'");
  assert.equal(canonical.rows[0].value.canonical, true);
  assert.equal(Number(canonical.rows[0].revision), 7);
  await db.close();
});

test("failed block mutation rolls back revision and idempotency ledger atomically", async () => {
  const db = await database();
  await assert.rejects(apply(db, {
    operationType: "block.duration.set",
    payload: {
      blockId: "00000000-0000-4000-8000-000000001199",
      durationMinutes: 22,
    },
  }), /selected block unavailable/i);
  const session = await db.query("select title, row_version from public.session_planner_sessions where id = $1", [sessionId]);
  assert.deepEqual(session.rows[0], { title: "Synthetic MD-1 Session", row_version: 7 });
  const ledger = await db.query("select count(*)::integer as count from app_private.session_planner_desktop_operations");
  assert.equal(ledger.rows[0].count, 0);
  await db.close();
});

test("security review: revoked membership cannot replay a stored acknowledgement", async () => {
  const db = await database();
  try {
    const operationId = randomUUID();
    await apply(db, { operationId });
    await assert.rejects(apply(db, { operationId, actor: null }), /contract rejected/i);
    await db.query("update public.platform_memberships set deleted_at = clock_timestamp() where user_id = $1", [actorId]);
    await assert.rejects(apply(db, { operationId }), /membership rejected/i);
    const ledger = await db.query("select count(*)::integer as count from app_private.session_planner_desktop_operations");
    assert.equal(ledger.rows[0].count, 1);
  } finally {
    await db.close();
  }
});
