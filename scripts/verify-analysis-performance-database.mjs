import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { sourceFixture, actorId, organizationId, teamId, otherTeamId } from "../qa/helpers/analysis-performance-fixture.mjs";
const require = createRequire(import.meta.url);
const { normalizeDataset } = require("../api/_lib/analysis-performance-contract.js");
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.platform_organizations(id uuid primary key);
    create table public.platform_teams(id uuid primary key, organization_id uuid, club_id uuid, status text, deleted_at timestamptz);
    create table public.platform_memberships(user_id uuid, organization_id uuid, team_id uuid, club_id uuid, scope text, role text, status text, deleted_at timestamptz);
    create table public.platform_user_profiles(user_id uuid, status text, deleted_at timestamptz);
    create table public.platform_permission_matrix(module_id text, action text, roles text[], scope text, requires_team_scope boolean, description text, primary key(module_id,action));
    insert into public.platform_organizations values ('${organizationId}');
    insert into public.platform_teams values ('${teamId}', '${organizationId}', null, 'active', null), ('${otherTeamId}', '${organizationId}', null, 'active', null);
    insert into public.platform_user_profiles values ('${actorId}', 'active', null);
    insert into public.platform_memberships values ('${actorId}', '${organizationId}', '${teamId}', null, 'team', 'coach', 'active', null);
    grant select on public.platform_organizations, public.platform_teams, public.platform_memberships, public.platform_user_profiles to service_role;
  `);
  await db.exec(await fs.readFile(new URL("../supabase/migrations/20260911005012_analysis_room_team_performance.sql", import.meta.url), "utf8"));
  await db.exec("set role service_role");
  const read = async (filters = {}, team = teamId) => (await db.query("select public.analysis_performance_read($1,$2,$3,$4::jsonb) as result", [actorId, organizationId, team, JSON.stringify(filters)])).rows[0].result;
  const save = async (data, revision) => (await db.query("select public.analysis_performance_import($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as result",
    [actorId, organizationId, teamId, revision, data.hash, data.generatedAt, JSON.stringify(data.manifest), JSON.stringify(data.events)])).rows[0].result;

  assert.equal((await read()).currentRevision, 0);
  const first = normalizeDataset(sourceFixture());
  const receipt = await save(first, 0);
  assert.equal(receipt.revision, 1);
  const snapshot = await read();
  assert.deepEqual(snapshot.summary, { events: 6, completed: 4, matches: 2 });
  assert.equal(snapshot.events.length, 6);
  assert.deepEqual(snapshot.playerOptions, ["Example Player A", "Example Player B"]);
  assert.equal(snapshot.players.length, 2);
  assert.equal((await read({ match: "1" })).summary.events, 3);
  assert.equal((await read({ period: "2nd Half", outcome: "Completed", venue: "Away" })).summary.events, 2);
  assert.equal((await read({ player: "Example Player B" })).summary.events, 6);
  assert.equal((await read({ player: "Missing player" })).summary.events, 0);
  assert.equal((await save(first, 1)).unchanged, true);
  await assert.rejects(save(first, 0), /Preview the import again/);
  await assert.rejects(read({}, otherTeamId), /access denied/);

  const duplicate = { ...first, hash: "b".repeat(64), events: [...first.events, first.events[0]] };
  await assert.rejects(save(duplicate, 1), /duplicate key/);
  assert.equal((await read()).currentRevision, 1);
  const wrongCount = structuredClone(first); wrongCount.hash = "c".repeat(64); wrongCount.manifest.matches[0].cleanEvents = 100;
  await assert.rejects(save(wrongCount, 1), /counts/);
  assert.equal((await read()).history.length, 1);

  const correctedSource = sourceFixture(); correctedSource.dashboardData.events[0].outcome = "Completed";
  const corrected = normalizeDataset(correctedSource);
  await save(corrected, 1);
  assert.equal((await read()).summary.completed, 5);
  assert.equal((await read({ versionId: receipt.versionId })).summary.completed, 4);
  assert.equal((await read()).history.length, 2);

  await assert.rejects(db.exec("update public.analysis_performance_versions set content_hash = repeat('f',64)"), /permission denied/);
  await assert.rejects(db.exec("delete from public.analysis_performance_events"), /permission denied/);
  await db.exec("reset role; update public.platform_memberships set status = 'paused'; set role service_role;");
  await assert.rejects(read(), /access denied/);
  await assert.rejects(save(corrected, 2), /access denied/);
  await db.exec("reset role; update public.platform_memberships set status = 'active'; set role authenticated;");
  await assert.rejects(read(), /permission denied/);
  await assert.rejects(db.exec("select * from public.analysis_performance_versions"), /permission denied/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(read(), /permission denied/);
  await db.exec("reset role; set role service_role;");

  const large = normalizeDataset(sourceFixture(50000));
  const importStart = performance.now();
  await save(large, 2);
  const importMs = performance.now() - importStart;
  const readStart = performance.now();
  const page = await read({ match: "1", offset: 24950 });
  const readMs = performance.now() - readStart;
  assert.equal(page.summary.events, 25000);
  assert.equal(page.events.length, 50);
  assert.equal(page.hasMore, false);
  assert.equal((await read()).hasMore, true);
  assert.equal((await read({ versionId: receipt.versionId })).summary.events, 6);
  assert.ok(Buffer.byteLength(JSON.stringify(page)) < 100000, "Browser response must remain bounded");
  console.log(JSON.stringify({ ok: true, engine: "PGlite", events: 50000, importMs: Math.round(importMs), filteredReadMs: Math.round(readMs), pageBytes: Buffer.byteLength(JSON.stringify(page)), checks: "atomic import, stale revision, immutable history, filters, staff access, revoked grants, 50k pagination" }, null, 2));
} finally { await db.close(); }
