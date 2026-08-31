import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createDesktopBridge } from "../candidates/shared/desktop-bridge-contract.mjs";

const require = createRequire(import.meta.url);
const { createDesktopSessionSyncHandler } = require("../../../api/desktop-session-sync.js");
const packageRoot = new URL("../", import.meta.url);
const projectRoot = new URL("../../../", import.meta.url);

const ids = Object.freeze({
  actor: "00000000-0000-4000-8000-000000000101",
  revokedActor: "00000000-0000-4000-8000-000000000102",
  crossTenantActor: "00000000-0000-4000-8000-000000000103",
  organization: "00000000-0000-4000-8000-000000000201",
  otherOrganization: "00000000-0000-4000-8000-000000000202",
  team: "00000000-0000-4000-8000-000000000401",
  otherTeam: "00000000-0000-4000-8000-000000000402",
  client: "00000000-0000-4000-8000-000000009001",
  session: "00000000-0000-4000-8000-000000001001",
  block: "00000000-0000-4000-8000-000000001101",
});

const partition = "synthetic:tenant-301:actor-101";
const applySql = `select * from app_private.apply_session_planner_desktop_operation_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::uuid, $6::uuid, $7::uuid,
  $8::text, $9::integer, $10::bigint, $11::jsonb, $12::text, $13::text
)`;
const readSql = `select app_private.read_session_planner_desktop_snapshot_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::uuid
) as snapshot`;

function actor(id = ids.actor, organizationId = ids.organization, teamId = ids.team) {
  return { id, organizationId, teamId, role: "coach", status: "active" };
}

function envelope({ operationId, operationType, baseRevision, payload }) {
  return {
    schema: "fs-desktop-session-sync-request-v1",
    syncProtocolVersion: 1,
    clientInstanceId: ids.client,
    authEpoch: 1,
    operation: {
      operationId,
      operationType,
      operationVersion: 1,
      sessionId: ids.session,
      baseRevision,
      payload,
    },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
    end(value = "") { this.body = value ? JSON.parse(value) : null; },
  };
}

async function postgres() {
  const database = await PGlite.create("memory://");
  await database.exec(await readFile(new URL("local-integration/base-catalog.sql", packageRoot), "utf8"));
  await database.exec(await readFile(new URL("supabase/drafts/20260831160000_desktop_session_sync_v1.sql", projectRoot), "utf8"));
  return database;
}

function openLocal(path) {
  const database = new DatabaseSync(path);
  database.exec(`
    pragma foreign_keys = on;
    pragma journal_mode = wal;
    pragma synchronous = full;
    pragma trusted_schema = off;
    create table if not exists local_meta (key text primary key, value text not null) strict;
    create table if not exists session_projection (
      session_id text primary key, partition_key text not null, organization_id text not null,
      team_id text not null, title text not null, revision integer not null, selected integer not null
    ) strict;
    create table if not exists session_blocks (
      block_id text primary key, session_id text not null references session_projection(session_id),
      duration_minutes integer not null check (duration_minutes between 1 and 240)
    ) strict;
    create table if not exists session_outbox (
      operation_id text primary key, operation_type text not null, operation_version integer not null,
      client_instance_id text not null, partition_key text not null, organization_id text not null,
      team_id text not null, actor_id text not null, session_id text not null,
      base_revision integer not null, resulting_revision integer not null,
      envelope_json text not null, state text not null check (state in ('pending', 'sending')),
      created_at_unix_ms integer not null
    ) strict;
    create table if not exists operation_receipts (
      operation_id text primary key, acknowledgement_id text not null unique,
      acknowledgement text not null, resulting_revision integer not null
    ) strict;
    insert or ignore into local_meta values ('local_schema_version', '3');
  `);
  return database;
}

function normalizeSnapshot(database, snapshot) {
  database.exec("begin immediate");
  try {
    database.prepare(`insert into session_projection values (?, ?, ?, ?, ?, ?, 1)
      on conflict(session_id) do update set title = excluded.title, revision = excluded.revision`).run(
      snapshot.session.id,
      partition,
      ids.organization,
      ids.team,
      snapshot.session.title,
      snapshot.session.revision,
    );
    for (const block of snapshot.blocks) {
      database.prepare(`insert into session_blocks values (?, ?, ?)
        on conflict(block_id) do update set duration_minutes = excluded.duration_minutes`).run(
        block.id,
        snapshot.session.id,
        block.payload.durationMinutes,
      );
    }
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

function applyOffline(database, body, createdAt) {
  const operation = body.operation;
  database.exec("begin immediate");
  try {
    const current = database.prepare("select revision from session_projection where session_id = ? and partition_key = ?").get(ids.session, partition);
    assert.equal(current.revision, operation.baseRevision);
    if (operation.operationType === "session.rename") {
      database.prepare("update session_projection set title = ?, revision = revision + 1 where session_id = ?").run(operation.payload.title, ids.session);
    } else {
      database.prepare("update session_blocks set duration_minutes = ? where block_id = ? and session_id = ?").run(
        operation.payload.durationMinutes, operation.payload.blockId, ids.session,
      );
      database.prepare("update session_projection set revision = revision + 1 where session_id = ?").run(ids.session);
    }
    database.prepare(`insert into session_outbox values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
      operation.operationId,
      operation.operationType,
      body.clientInstanceId,
      partition,
      ids.organization,
      ids.team,
      ids.actor,
      ids.session,
      operation.baseRevision,
      operation.baseRevision + 1,
      JSON.stringify(body),
      createdAt,
    );
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

function nextPending(database) {
  return database.prepare("select * from session_outbox order by created_at_unix_ms, operation_id limit 1").get();
}

function receiptBeforeRemoval(database, pending, acknowledgement) {
  database.exec("begin immediate");
  try {
    database.prepare("insert into operation_receipts values (?, ?, ?, ?)").run(
      pending.operation_id,
      acknowledgement.acknowledgementId,
      acknowledgement.acknowledgement,
      acknowledgement.resultingRevision,
    );
    assert.equal(database.prepare("select count(*) count from operation_receipts where operation_id = ?").get(pending.operation_id).count, 1);
    assert.equal(database.prepare("select count(*) count from session_outbox where operation_id = ?").get(pending.operation_id).count, 1);
    database.prepare("delete from session_outbox where operation_id = ?").run(pending.operation_id);
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

test("synthetic online-offline-restart-sync path is durable, idempotent and tenant-safe", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "fs-desktop-full-e2e-"));
  const sqlitePath = join(tempRoot, "native-local-v2.sqlite3");
  const server = await postgres();
  let currentActor = actor();
  let requestCounter = 0;
  const handler = createDesktopSessionSyncHandler({
    getCurrentActor: async () => currentActor,
    parseJsonBody: async (request) => request.body,
    guardApiRequest: (_request, _response, options) => ({
      ok: true,
      context: { requestId: `local-e2e-${++requestCounter}`, actorId: options.actor.id },
    }),
    applyOperation: async (value) => {
      await server.exec("set role fs_desktop_sync_executor");
      try {
        return await server.query(applySql, [
          value.actorId,
          value.organizationId,
          value.teamId,
          value.authEpoch,
          value.clientInstanceId,
          value.operationId,
          value.sessionId,
          value.operationType,
          value.operationVersion,
          value.baseRevision,
          JSON.stringify(value.payload),
          value.payloadSha256,
          value.requestId,
        ]);
      } finally {
        await server.exec("reset role");
      }
    },
    readSnapshot: async (value) => {
      await server.exec("set role fs_desktop_sync_executor");
      try {
        return await server.query(readSql, [
          value.actorId,
          value.organizationId,
          value.teamId,
          value.sessionId,
        ]);
      } finally {
        await server.exec("reset role");
      }
    },
  });
  const call = async (body) => {
    const result = response();
    await handler({ method: "POST", headers: { authorization: "Bearer synthetic-only" }, body }, result);
    return result;
  };
  const readSelected = async () => {
    const result = response();
    await handler({
      method: "GET",
      headers: { authorization: "Bearer synthetic-only" },
      url: `/api/desktop-session-sync?sessionId=${ids.session}&syncProtocolVersion=1`,
    }, result);
    return result;
  };

  try {
    // The authenticated handler reads the selected slice through the private Postgres routine.
    const initialSnapshot = await readSelected();
    assert.equal(initialSnapshot.statusCode, 200);
    assert.equal(initialSnapshot.body.snapshot.session.id, ids.session);

    // Normalize that bounded response into real file-backed SQLite, then cold-start offline.
    let local = openLocal(sqlitePath);
    normalizeSnapshot(local, initialSnapshot.body.snapshot);
    assert.deepEqual({ ...local.prepare("select title, revision from session_projection").get() }, {
      title: "Synthetic MD-1 Session",
      revision: 7,
    });
    local.close();
    local = openLocal(sqlitePath);

    // Two offline edits are applied atomically to the projection and durable outbox.
    const rename = envelope({
      operationId: randomUUID(),
      operationType: "session.rename",
      baseRevision: 7,
      payload: { title: "Offline MD-1 Updated" },
    });
    const duration = envelope({
      operationId: randomUUID(),
      operationType: "block.duration.set",
      baseRevision: 8,
      payload: { blockId: ids.block, durationMinutes: 22 },
    });
    applyOffline(local, rename, 10_000);
    applyOffline(local, duration, 20_000);
    assert.equal(local.prepare("select count(*) count from session_outbox").get().count, 2);
    assert.deepEqual({ ...local.prepare("select title, revision from session_projection").get() }, {
      title: "Offline MD-1 Updated",
      revision: 9,
    });
    local.close();

    // Restart proves projection and both pending operations survived.
    local = openLocal(sqlitePath);
    assert.equal(local.prepare("select count(*) count from session_outbox").get().count, 2);

    // Server accepts the first operation, but its response is deliberately lost.
    let pending = nextPending(local);
    const firstResponse = await call(JSON.parse(pending.envelope_json));
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.body.acknowledgement, "accepted");
    local.close();

    // A second restart resends the same immutable operation and receives the same durable ack.
    local = openLocal(sqlitePath);
    pending = nextPending(local);
    const replayResponse = await call(JSON.parse(pending.envelope_json));
    assert.equal(replayResponse.body.acknowledgement, "already-applied");
    assert.equal(replayResponse.body.acknowledgementId, firstResponse.body.acknowledgementId);
    receiptBeforeRemoval(local, pending, replayResponse.body);

    // The second operation advances the authoritative revision; its receipt is durable first.
    pending = nextPending(local);
    const secondResponse = await call(JSON.parse(pending.envelope_json));
    assert.equal(secondResponse.body.acknowledgement, "accepted");
    assert.equal(secondResponse.body.resultingRevision, 9);
    receiptBeforeRemoval(local, pending, secondResponse.body);
    assert.deepEqual({ ...local.prepare("select count(*) outbox, (select count(*) from operation_receipts) receipts from session_outbox").get() }, {
      outbox: 0,
      receipts: 2,
    });

    // Existing browser delivery stays unprivileged and functional without a native runtime.
    const webBridge = createDesktopBridge({ isDesktop: false });
    assert.equal(webBridge.isDesktop, false);
    assert.equal((await webBridge.getRuntimeInfo()).runtime, "browser");
    assert.equal(await webBridge.applySessionOperation(rename), null);

    // Server-derived cross-tenant and revoked identities cannot mutate the selected session.
    currentActor = actor(ids.crossTenantActor, ids.otherOrganization, ids.otherTeam);
    const crossTenant = await call(envelope({
      operationId: randomUUID(),
      operationType: "session.rename",
      baseRevision: 9,
      payload: { title: "Cross-tenant overwrite" },
    }));
    assert.equal(crossTenant.statusCode, 500);
    assert.equal(crossTenant.body.reason, "Desktop synchronization failed.");

    currentActor = actor(ids.revokedActor, ids.organization, ids.team);
    const revoked = await call(envelope({
      operationId: randomUUID(),
      operationType: "session.rename",
      baseRevision: 9,
      payload: { title: "Revoked overwrite" },
    }));
    assert.equal(revoked.statusCode, 403);
    assert.equal(revoked.body.reason, "Desktop synchronization is not authorized.");

    const authoritative = await server.query("select title, row_version from public.session_planner_sessions where id = $1", [ids.session]);
    assert.deepEqual(authoritative.rows[0], { title: "Offline MD-1 Updated", row_version: 9 });
    const block = await server.query("select payload from public.session_planner_blocks where id = $1", [ids.block]);
    assert.equal(block.rows[0].payload.durationMinutes, 22);
    const canonical = await server.query("select value, revision from public.platform_app_state_entries where storage_key = 'football-session-planner-v3'");
    assert.equal(canonical.rows[0].value.canonical, true);
    assert.equal(Number(canonical.rows[0].revision), 7);

    const schema = local.prepare("select group_concat(sql, '\n') schema from sqlite_schema where sql is not null").get().schema.toLowerCase();
    assert.equal(schema.includes("refresh_token"), false);
    assert.equal(schema.includes("access_token"), false);
    assert.equal(JSON.stringify(local.prepare("select * from operation_receipts").all()).toLowerCase().includes("token"), false);
    local.close();
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("desktop web assets never persist credential material in browser storage", async () => {
  const files = [
    "candidates/bootstrap/app.js",
    "candidates/hosted/app.js",
    "candidates/bundled/app.js",
    "candidates/fallback/app.js",
    "candidates/shared/desktop-bridge-contract.mjs",
    "candidates/shared/session-authority.mjs",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, packageRoot), "utf8")))).join("\n");
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|indexedDB)\s*[.[]/);
});
