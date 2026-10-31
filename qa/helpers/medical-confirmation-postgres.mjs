import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { syntheticPostgres, id } from './relations-permissions-postgres.mjs';
const require = createRequire(import.meta.url);
const api = require('../../api/_lib/medical-database.js');
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const literal = value => quote(JSON.stringify(value)) + '::jsonb';

export async function medicalConfirmationPostgres({ applyConfirmation = true } = {}) {
  const db = await syntheticPostgres();
  const sql = query => db.pg.sql(db.source, query);
  try {
    await sql(read('supabase/migrations/20260825024500_medical_sync_event_projection.sql'));
    await sql(read('supabase/migrations/20260901103202_medical_plan_canonical_projection.sql').split('-- Repair only false roster-removal archives')[0]);
    await sql('begin; ' + read('scripts/release-artifacts/medical-production-timestamp-only.sql') + ' commit;');
    if (applyConfirmation) await sql('begin; ' + read('scripts/release-artifacts/medical-recommendation-confirmation.sql') + ' commit;');
    await sql("grant usage on schema extensions to service_role; grant execute on function extensions.digest(bytea,text) to service_role; grant select,insert,update on public.medical_state_sync_events,public.platform_app_state_records to service_role");
    await sql(`insert into public.platform_app_state_records(organization_id,state_key,module_id,merge_policy,revision,value,value_hash) values ('global','football-medical-team-v1','medical-team','medical-records',10,'{"records":[],"players":[],"injuryPlans":[]}',repeat('a',64))`);
    const fixture = { db, sql,
      insert: (n,type,payload,actor=1) => sql(`insert into public.medical_state_sync_events(id,actor_id,event_type,idempotency_key,payload,payload_hash) values ('${id(n)}','${id(actor)}','${type}','synthetic-${n}',${literal(payload)},repeat('a',64))`),
      project: async (n,actor='single') => JSON.parse(await db.pg.sql({...db.source,PGAPPNAME:'medical-actor-'+actor},`set role service_role; select row_to_json(r) from public.project_medical_state_sync_events(array['${id(n)}'::uuid]) r`)),
      state: async () => JSON.parse(await sql("select value from public.platform_app_state_records where organization_id='global' and state_key='football-medical-team-v1'")),
    };
    fixture.handle = createApiTransport(fixture);
    return fixture;
  } catch(error) { await db.close(); throw error; }
}

// Real API handler + real SQL projector. Only PostgREST transport/auth/audit
// storage are synthetic. No HTTP can leave this adapter, even on an unknown path.
// Serialise process-global fetch/env substitution; browser clients remain distinct.
function createApiTransport(f) {
  let pending = Promise.resolve();
  return (body, actor = 1) => {
    const call = pending.then(async () => {
      const values = { MEDICAL_STORAGE_MODE: 'database', SUPABASE_URL: 'https://medical.invalid',
        SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
      const previous = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
      const originalFetch = global.fetch;
      Object.assign(process.env, values);
      global.fetch = async (url, options = {}) => {
        const u = new URL(url);
        if (u.origin !== values.SUPABASE_URL) throw new Error('Unexpected synthetic transport origin');
        if (u.pathname.startsWith('/storage/')) return new Response('{}', { status: 503 });
        let result;
        if (u.pathname === '/rest/v1/medical_state_sync_events') {
          if (options.method === 'POST') {
            const [row] = JSON.parse(options.body);
            result = await f.sql(`with inserted as (insert into public.medical_state_sync_events
              (id,source_key,event_type,idempotency_key,payload,payload_hash,actor_id,legacy_player_id)
              values (${quote(randomUUID())},${quote(row.source_key)},${quote(row.event_type)},
                ${quote(row.idempotency_key)},${literal(row.payload)},${quote(row.payload_hash)},
                ${quote(row.actor_id)},${quote(row.legacy_player_id || '')})
              on conflict(source_key,idempotency_key) do nothing returning *)
              select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) from inserted`);
          } else {
            const key = u.searchParams.get('idempotency_key').slice(3);
            const source = u.searchParams.get('source_key').slice(3);
            result = await f.sql(`select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
              from public.medical_state_sync_events e where source_key=${quote(source)} and idempotency_key=${quote(key)}`);
          }
        } else if (u.pathname === '/rest/v1/rpc/project_medical_state_sync_events') {
          const ids = JSON.parse(options.body).p_event_ids;
          result = await f.sql(`set role service_role; select jsonb_agg(to_jsonb(r))
            from public.project_medical_state_sync_events(array[${ids.map(quote).join(',')}]::uuid[]) r`);
        } else throw new Error('Unexpected synthetic transport path');
        return new Response(result.trim(), { status: 200 });
      };
      try {
        const req = { async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
        const res = { statusCode: 200, body: '', setHeader() {}, end(chunk = '') { this.body += chunk; } };
        await api._private.handleMedicalPost(req, res, { id: id(actor), role: 'medical' });
        return { status: res.statusCode, json: JSON.parse(res.body) };
      } finally {
        global.fetch = originalFetch;
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    });
    pending = call.catch(() => {});
    return call;
  };
}
