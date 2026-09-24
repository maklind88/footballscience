// Test-only loopback server. No environment credentials or external database connections.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

if (process.argv[2] !== "--native-sync-test-only") throw new Error("Explicit test-only argument required.");
// Process-liveness guard includes WASM startup; transport retains its separate 30s timeout.
const deadline = setTimeout(() => { process.stderr.write("Native sync fixture timed out.\n"); process.exit(1); }, 60_000);
const require = createRequire(import.meta.url);
const { createDesktopSessionSyncHandler } = require("../../../api/desktop-session-sync.js");
const database = await PGlite.create("memory://");
await database.exec(await readFile(new URL("./base-catalog.sql", import.meta.url), "utf8"));
await database.exec(await readFile(new URL("../../../supabase/drafts/20260831160000_desktop_session_sync_v1.sql", import.meta.url), "utf8"));

const actor = { id: "00000000-0000-4000-8000-000000000101", organizationId: "00000000-0000-4000-8000-000000000201",
  teamId: "00000000-0000-4000-8000-000000000401", status: "active", role: "coach" };
let responses = 0;
const handler = createDesktopSessionSyncHandler({
  getCurrentActor: async (header) => header === "Bearer synthetic-access-only-001" ? actor : null,
  guardApiRequest: () => ({ ok: true, context: { requestId: `native-local-${responses + 1}` } }),
  sendCorsHeaders: () => {},
  readSnapshot: async (value) => {
    await database.exec("set role fs_desktop_sync_executor");
    try {
      return await database.query(`select app_private.read_session_planner_desktop_snapshot_v1(
        $1::uuid, $2::uuid, $3::uuid, $4::uuid) as snapshot`,
      [value.actorId, value.organizationId, value.teamId, value.sessionId]);
    } finally { await database.exec("reset role"); }
  },
  applyOperation: async (value) => {
    await database.exec("set role fs_desktop_sync_executor");
    try {
      return await database.query(`select * from app_private.apply_session_planner_desktop_operation_v1(
        $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::uuid, $6::uuid, $7::uuid,
        $8::text, $9::integer, $10::bigint, $11::jsonb, $12::text, $13::text)`, [
        value.actorId, value.organizationId, value.teamId, value.authEpoch, value.clientInstanceId,
        value.operationId, value.sessionId, value.operationType, value.operationVersion,
        value.baseRevision, JSON.stringify(value.payload), value.payloadSha256, value.requestId,
      ]);
    } finally { await database.exec("reset role"); }
  },
  sendJson: async (res, status, body) => {
    assert.equal(status, 200);
    responses += 1;
    assert.equal(body.acknowledgement, ["accepted", "already-applied", "conflict", undefined, undefined, "accepted"][responses - 1]);
    if (responses === 1) {
      // Real SQL commit succeeded, but the native caller never receives its acknowledgement.
      res.destroy();
      return;
    }
    if (responses === 2) {
      const applied = await database.query("select title, row_version from public.session_planner_sessions");
      assert.equal(applied.rows[0].title, "Offline revision 8");
      assert.equal(applied.rows[0].row_version, 8);
      // A second synthetic writer moves the authoritative revision before the next offline push.
      await database.exec("update public.session_planner_sessions set row_version = 9, title = 'Another writer'");
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    if (responses === 3) {
      const count = await database.query("select count(*)::integer as count from app_private.session_planner_desktop_operations");
      const remote = await database.query("select title, row_version from public.session_planner_sessions");
      assert.equal(count.rows[0].count, 1);
      assert.equal(remote.rows[0].row_version, 9);
      assert.equal(remote.rows[0].title, "Another writer");
    }
    if (responses === 4 || responses === 5) {
      assert.equal(body.snapshot.session.revision, 9);
      assert.equal(body.snapshot.session.title, "Another writer");
    }
    if (responses === 6) {
      const count = await database.query("select count(*)::integer as count from app_private.session_planner_desktop_operations");
      const remote = await database.query("select title, row_version from public.session_planner_sessions");
      assert.equal(count.rows[0].count, 2);
      assert.equal(remote.rows[0].row_version, 10);
      assert.equal(remote.rows[0].title, "Offline revision 9");
      process.stdout.write(`${JSON.stringify({ requests: responses, serverApplications: 2, revision: 10, conflictPreserved: true, explicitRecoveryApplied: true })}\n`);
      server.close();
      await database.close();
      clearTimeout(deadline);
    }
  },
});
const server = createServer((req, res) => {
  assert.equal(new URL(req.url, "http://127.0.0.1").pathname, "/api/desktop-session-sync");
  handler(req, res).catch(() => { process.stderr.write("Native sync fixture assertion failed.\n"); process.exit(1); });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.stdout.write(`${JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}/` })}\n`);
