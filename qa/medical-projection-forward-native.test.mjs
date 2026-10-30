import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { syntheticPostgres, statementOutcome, id } from './helpers/relations-permissions-postgres.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const stagingPatch = read('scripts/release-artifacts/medical-projection-forward-only.sql');
const productionPatch = read('scripts/release-artifacts/medical-production-timestamp-only.sql');
// Only definitions: never execute the historical repair section, even in rehearsal.
const september = read('supabase/migrations/20260901103202_medical_plan_canonical_projection.sql').split('-- Repair only false roster-removal archives')[0];
const old = read('supabase/migrations/20260825024500_medical_sync_event_projection.sql');
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const record = { id: 'synthetic-record', playerId: 'synthetic-player', date: '2026-12-24', participation: 50, updatedAt: '2026-10-29T12:00:00Z' };
const plan = { id: 'synthetic-plan', playerId: 'synthetic-player', startDate: '2026-12-24', endDate: '2026-12-25', participation: 50, updatedAt: '2026-10-29T12:00:00Z' };

for (const [name, baseline, patch] of [['staging alignment', old, stagingPatch], ['production timestamp only', old + september, productionPatch]]) {
test(name + ' preserves history and supports the current Medical event contract', { timeout: 120000 }, async t => {
  const db = await syntheticPostgres();
  const sql = query => db.pg.sql(db.source, query);
  const state = async () => JSON.parse(await sql("select value from public.platform_app_state_records where organization_id='global' and state_key='football-medical-team-v1'"));
  const project = async n => JSON.parse(await sql(`set role service_role; select row_to_json(r) from public.project_medical_state_sync_events(array['${id(n)}'::uuid]) r; reset role;`));
  const insert = (n, type, payload) => sql(`insert into public.medical_state_sync_events(id,event_type,idempotency_key,payload,payload_hash) values ('${id(n)}','${type}','synthetic-${n}',${literal(payload)},repeat('a',64))`);
  try {
    await sql(baseline);
    // Match the inspected staging service role; plain PostgreSQL lacks Supabase extension grants.
    await sql("grant usage on schema extensions to service_role; grant execute on function extensions.digest(bytea,text) to service_role");
    await sql("grant select,insert,update on public.medical_state_sync_events,public.platform_app_state_records to service_role");
    await sql(`insert into public.platform_app_state_records(organization_id,state_key,module_id,merge_policy,revision,value,value_hash) values ('global','football-medical-team-v1','medical-team','medical-records',10,'{"records":[],"players":[],"injuryPlans":[],"preserve":"untouched"}',repeat('a',64))`);
    await insert(901, 'recommendation-saved', { record: { ...record, id: 'historical-unprocessed' } });
    const fingerprint = () => sql("select md5((select jsonb_agg(to_jsonb(s) order by state_key)::text from public.platform_app_state_records s) || (select jsonb_agg(to_jsonb(e) order by id)::text from public.medical_state_sync_events e))");
    const definitions = () => sql(`select md5(jsonb_agg(jsonb_build_array(p.oid, p.proacl::text, p.prosecdef,
      case when p.oid='app_private.medical_compat_entity_timestamp(jsonb)'::regprocedure then 'reviewed-replacement' else pg_get_functiondef(p.oid) end) order by p.oid)::text)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ('public','app_private')`);
    const beforeDefinitions = await definitions();
    if (name === 'production timestamp only') {
      await t.test('observed baseline reproduces future-write and archive defect without row writes', async () => {
        const newer = { ...record, participation: 75, updatedAt: '2026-10-29T12:30:00Z' };
        assert.equal(await sql(`select app_private.upsert_medical_compat_record(${literal({records:[newer]})},${literal(record)}) #>> '{records,0,participation}'`), '50\n');
        assert.equal(await sql(`select app_private.archive_medical_compat_record(${literal({records:[record]})},'synthetic-record','2026-10-29T13:00:00Z') #>> '{records,0,archivedAt}'`), '\n');
      });
      for (const [label, mutation] of [
        ['definition drift', 'alter function app_private.medical_compat_entity_timestamp(jsonb) cost 101'],
        ['elevated execution', 'alter function app_private.upsert_medical_compat_plan(jsonb,jsonb) security definer'],
        ['public execution', 'grant execute on function app_private.medical_compat_entity_timestamp(jsonb) to public'],
        ['missing service grant', 'revoke execute on function app_private.upsert_medical_compat_plan(jsonb,jsonb) from service_role'],
        ['missing dependency', 'drop function app_private.validate_medical_compat_plan(jsonb)'],
      ]) {
        await t.test('refuses ' + label + ' atomically', async () => {
          const before = await fingerprint();
          await assert.rejects(sql('begin; ' + mutation + '; ' + patch + ' commit;'), /Medical production baseline/);
          assert.equal(await fingerprint(), before);
        });
      }
    }
    await t.test('install changes no existing row, revision or pending event', async () => {
      const before = await fingerprint(); await sql('begin; ' + patch + ' commit;'); assert.equal(await fingerprint(), before);
      assert.equal(await sql("select processing_status from medical_state_sync_events where id='" + id(901) + "'"), 'pending\n');
    });
    if (name === 'production timestamp only') await t.test('only timestamp definition changes and permissions remain restricted', async () => {
      for (const role of ['anon', 'authenticated']) assert.equal(await sql(`select has_function_privilege('${role}', 'app_private.medical_compat_entity_timestamp(jsonb)', 'EXECUTE')`), 'f\n');
      assert.equal(await definitions(), beforeDefinitions);
      assert.equal(await sql("select has_function_privilege('service_role','app_private.medical_compat_entity_timestamp(jsonb)','EXECUTE')"), 't\n');
      assert.equal(await sql("select md5(pg_get_functiondef('public.project_medical_state_sync_events(uuid[])'::regprocedure))"), '462d583bb2028f79fa3f199e99ad3107\n');
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
    await t.test('future activity date cannot override real edit order', async () => {
      const newer = { ...record, participation: 75, updatedAt: '2026-10-29T12:30:00Z' };
      await insert(903, 'recommendation-saved', { record: newer });
      assert.equal((await project(903)).canonical_stored, true);
      await insert(904, 'recommendation-saved', { record });
      assert.equal((await project(904)).canonical_stored, true);
      assert.deepEqual((await state()).records, [newer]);
      assert.equal(await sql("select app_private.medical_compat_entity_timestamp('{\"date\":\"2099-01-01\"}')"), '\n');
    });
    await t.test('unknown timestamp cannot displace a known edit, and a known edit can replace unknown', async () => {
      const unknown = { ...record, updatedAt: undefined, participation: 10 };
      assert.equal(await sql(`select app_private.upsert_medical_compat_record(${literal({records:[record]})},${literal(unknown)}) #>> '{records,0,participation}'`), '50\n');
      assert.equal(await sql(`select app_private.upsert_medical_compat_record(${literal({records:[unknown]})},${literal(record)}) #>> '{records,0,participation}'`), '50\n');
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
      const after = await state(); assert.equal(after.records[0].archivedAt, '2026-10-29T13:00:00Z'); assert.equal(after.records[0].id, record.id); assert.equal(after.records[0].participation, 75); assert.deepEqual(after.injuryPlans, before.injuryPlans);
    });
    await t.test('invalid plan fails without altering canonical state', async () => {
      const before = await state(); await insert(921, 'availability-plan-created', { plan: { ...plan, participation: 51 } });
      assert.equal((await project(921)).canonical_stored, false); assert.deepEqual(await state(), before);
    });
  } finally { await db.close(); }
});

}
