import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { syntheticPostgres, id } from './helpers/relations-permissions-postgres.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const record = { id: 'synthetic-shared-record', playerId: 'synthetic-shared-player', date: '2026-12-24', participation: 50, createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' };

async function fixture() {
  const db = await syntheticPostgres();
  const sql = query => db.pg.sql(db.source, query);
  try {
    await sql(read('supabase/migrations/20260825024500_medical_sync_event_projection.sql'));
    await sql(read('supabase/migrations/20260901103202_medical_plan_canonical_projection.sql').split('-- Repair only false roster-removal archives')[0]);
    await sql('begin; ' + read('scripts/release-artifacts/medical-production-timestamp-only.sql') + ' commit;');
    await sql("grant usage on schema extensions to service_role; grant execute on function extensions.digest(bytea,text) to service_role; grant select,insert,update on public.medical_state_sync_events,public.platform_app_state_records to service_role");
    await sql(`insert into public.platform_app_state_records(organization_id,state_key,module_id,merge_policy,revision,value,value_hash) values ('global','football-medical-team-v1','medical-team','medical-records',10,'{"records":[],"players":[],"injuryPlans":[]}',repeat('a',64))`);
    return { db, sql,
      insert: (n,type,payload,actor=1) => sql(`insert into public.medical_state_sync_events(id,actor_id,event_type,idempotency_key,payload,payload_hash) values ('${id(n)}','${id(actor)}','${type}','synthetic-${n}',${literal(payload)},repeat('a',64))`),
      project: async (n,actor='single') => JSON.parse(await db.pg.sql({...db.source,PGAPPNAME:'medical-actor-'+actor},`set role service_role; select row_to_json(r) from public.project_medical_state_sync_events(array['${id(n)}'::uuid]) r`)),
      state: async () => JSON.parse(await sql("select value from public.platform_app_state_records where organization_id='global' and state_key='football-medical-team-v1'")),
    };
  } catch(error) { await db.close(); throw error; }
}

// Both connections must demonstrably block on the same aggregate before release.
async function concurrent(f, eventIds) {
  let ready; const readyPromise = new Promise(resolve => { ready=resolve; });
  const gate = f.db.pg.start('psql',['-X','-qAt','-w','-v','ON_ERROR_STOP=1'], {env:f.db.source,
    onChunk: chunk => { if(chunk.toString().includes('gate-ready')) ready(); }});
  gate.child.stdin.write("begin; select revision from public.platform_app_state_records where state_key='football-medical-team-v1' for update; select 'gate-ready';\n");
  let released=false;
  const release=async()=>{if(!released){released=true;gate.child.stdin.end('rollback;\n');await gate.done;}};
  let writers=[];
  try {
    await Promise.race([readyPromise,gate.done.then(()=>{throw new Error('gate closed before ready');})]);
    writers=eventIds.map((event,n)=>f.project(event,String(n)));
    writers.forEach(p=>p.catch(()=>{}));
    let count=0;
    for(let n=0;n<40;n++) {
      count=Number(await f.sql("select count(*) from pg_stat_activity where application_name like 'medical-actor-%' and wait_event_type='Lock'"));
      if(count===eventIds.length)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(count,eventIds.length,'Both independent writers must reach the database lock');
    await release(); return await Promise.all(writers);
  } finally {await release(); await Promise.allSettled(writers);}
}

test('two concurrent recommendations for one player/day preserve both independent changes', {timeout:120000}, async()=>{
  const f=await fixture();
  try {
    await f.insert(930,'recommendation-saved',{record:{...record,id:'writer-a',participation:25}},1);
    await f.insert(931,'recommendation-saved',{record:{...record,id:'writer-b',participation:75}},2);
    const receipts=await concurrent(f,[930,931]);
    const state=await f.state();
    assert.ok(receipts.every(r=>r.canonical_stored));
    assert.deepEqual(state.records.map(r=>[r.id,r.participation]).sort(),[['writer-a',25],['writer-b',75]]);
    assert.deepEqual(receipts.map(r=>r.revision).sort(),[11,12]);
  }finally{await f.db.close();}
});

test('first delivery of an older offline recommendation preserves it alongside newer work', {timeout:120000},async()=>{
  const f=await fixture();
  try {
    const newer={...record,id:'online-newer',participation:75,createdAt:'2026-10-31T11:00:00Z',updatedAt:'2026-10-31T11:00:00Z'};
    await f.insert(940,'recommendation-saved',{record:newer},1);await f.project(940);
    await f.insert(941,'recommendation-saved',{record},2); const receipt=await f.project(941);
    assert.equal(receipt.canonical_stored,true);
    assert.deepEqual((await f.state()).records.map(r=>[r.id,r.participation]).sort(),[['online-newer',75],['synthetic-shared-record',50]]);
  }finally{await f.db.close();}
});

test('reconfirmation of a recommendation archived by a peer must not certify it as current', {timeout:120000},async()=>{
  const f=await fixture();
  try {
    await f.insert(950,'recommendation-saved',{record},1);await f.project(950);
    await f.insert(951,'record-archived',{recordId:record.id,archivedAt:'2026-10-31T11:00:00Z'},2);await f.project(951);
    const receipt=await f.project(950); const state=await f.state();
    assert.equal(state.records[0].archivedAt,'2026-10-31T11:00:00Z');
    console.log(JSON.stringify({acceptance:'archived-reconfirmation',canonicalStored:receipt.canonical_stored,archived:true,revision:receipt.revision}));
    // Current clients treat this flag as confirmation without re-reading current state.
    assert.equal(receipt.canonical_stored,false,'Historical processing receipt must not become a current recommendation confirmation');
  }finally{await f.db.close();}
});
