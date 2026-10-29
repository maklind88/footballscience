import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { syntheticPostgres, statementOutcome, id } from './helpers/relations-permissions-postgres.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const patch = read('scripts/release-artifacts/medical-projection-forward-only.sql');
const old = read('supabase/migrations/20260825024500_medical_sync_event_projection.sql');
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const record = { id: 'synthetic-record', playerId: 'synthetic-player', date: '2026-12-24', participation: 50, updatedAt: '2026-10-29T12:00:00Z' };
const plan = { id: 'synthetic-plan', playerId: 'synthetic-player', startDate: '2026-12-24', endDate: '2026-12-25', participation: 50, updatedAt: '2026-10-29T12:00:00Z' };

test('forward alignment preserves history and supports the current Medical event contract', { timeout: 120000 }, async t => {
  const db = await syntheticPostgres();
  const sql = query => db.pg.sql(db.source, query);
  const state = async () => JSON.parse(await sql("select value from public.platform_app_state_records where organization_id='global' and state_key='football-medical-team-v1'"));
  const project = async n => JSON.parse(await sql(`set role service_role; select row_to_json(r) from public.project_medical_state_sync_events(array['${id(n)}'::uuid]) r; reset role;`));
  const insert = (n, type, payload) => sql(`insert into public.medical_state_sync_events(id,event_type,idempotency_key,payload,payload_hash) values ('${id(n)}','${type}','synthetic-${n}',${literal(payload)},'synthetic')`);
  try {
    await sql(old);
    await sql("grant select,insert,update on public.medical_state_sync_events,public.platform_app_state_records to service_role");
    await sql(`insert into public.platform_app_state_records(organization_id,state_key,module_id,merge_policy,revision,value,value_hash) values ('global','football-medical-team-v1','medical-team','medical-records',10,'{"records":[],"players":[],"injuryPlans":[],"preserve":"untouched"}','synthetic')`);
    await insert(901, 'recommendation-saved', { record: { ...record, id: 'historical-unprocessed' } });
    const fingerprint = () => sql("select md5((select jsonb_agg(to_jsonb(s) order by state_key)::text from public.platform_app_state_records s) || (select jsonb_agg(to_jsonb(e) order by id)::text from public.medical_state_sync_events e))");
    await t.test('install changes no existing row, revision or pending event', async () => {
      const before = await fingerprint(); await sql('begin; ' + patch + ' commit;'); assert.equal(await fingerprint(), before);
      assert.equal(await sql("select processing_status from medical_state_sync_events where id='" + id(901) + "'"), 'pending\n');
    });
    await t.test('reapplication refuses unexpected baseline', async () => { await assert.rejects(sql('begin; ' + patch + ' commit;')); });
    await t.test('anon and authenticated cannot execute projection or private helpers', async () => {
      for (const role of ['anon','authenticated']) for (const query of ["select public.project_medical_state_sync_events(array[]::uuid[])", "select app_private.upsert_medical_compat_plan('{}','{}')"])
        assert.equal(await statementOutcome(db, query, { role }), '42501');
    });
    await t.test('recommendation and duplicate preserve unrelated state without replaying history', async () => {
      await insert(902, 'recommendation-saved', { record });
      const first = await project(902), duplicate = await project(902);
      assert.equal(first.canonical_stored, true); assert.equal(duplicate.revision, first.revision);
      const s = await state(); assert.equal(s.preserve, 'untouched'); assert.deepEqual(s.records, [record]);
    });
    for (const [n, event] of ['availability-plan-created','availability-plan-updated','clearance-saved','medical-board-updated','availability-plan-archived','availability-plan-deleted'].entries()) {
      await t.test(event + ' projects the exact plan', async () => {
        const next = { ...plan, updatedAt: `2026-10-29T12:00:0${n}Z`, ...(n >= 4 ? { archivedAt: '2026-10-29T12:01:00Z' } : {}) };
        await insert(910+n, event, { plan: next }); assert.equal((await project(910+n)).canonical_stored, true);
        assert.deepEqual((await state()).injuryPlans, [next]);
      });
    }
    await t.test('archive recommendation preserves its identity and all plans', async () => {
      const before = await state(); await insert(920, 'record-archived', { recordId: record.id, archivedAt: '2026-10-29T13:00:00Z' });
      assert.equal((await project(920)).canonical_stored, true);
      const after = await state(); assert.equal(after.records[0].archivedAt, '2026-10-29T13:00:00Z'); assert.deepEqual(after.injuryPlans, before.injuryPlans);
    });
    await t.test('invalid plan fails without altering canonical state', async () => {
      const before = await state(); await insert(921, 'availability-plan-created', { plan: { ...plan, participation: 51 } });
      assert.equal((await project(921)).canonical_stored, false); assert.deepEqual(await state(), before);
    });
  } finally { await db.close(); }
});
