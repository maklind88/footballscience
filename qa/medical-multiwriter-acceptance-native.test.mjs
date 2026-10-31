import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { statementOutcome, id } from './helpers/relations-permissions-postgres.mjs';
import { medicalConfirmationPostgres as fixture } from './helpers/medical-confirmation-postgres.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const record = { id: 'synthetic-shared-record', playerId: 'synthetic-shared-player', date: '2026-12-24', participation: 50, createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' };

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


test('current-state confirmation retains exact valid retries and rejects changed content without replay', {timeout:120000}, async t => {
  const f = await fixture();
  const body = r => ({eventType:'recommendation-saved',playerId:r.playerId,idempotencyKey:'saved:'+r.updatedAt,payload:{record:r}});
  try {
    const first = await f.handle(body(record));
    assert.equal(first.status,200);assert.equal(first.json.canonicalStored,true);
    const before = await f.sql('select jsonb_agg(to_jsonb(e) order by id) from medical_state_sync_events e');
    const duplicate = await f.handle(body(record));
    assert.equal(duplicate.status,200);assert.equal(duplicate.json.duplicate,true);
    assert.equal(duplicate.json.revision,first.json.revision);
    assert.equal(await f.sql('select jsonb_agg(to_jsonb(e) order by id) from medical_state_sync_events e'),before);
    const newer = {...record,participation:75,updatedAt:'2026-10-31T12:00:00Z'};
    assert.equal((await f.handle(body(newer),2)).status,200);
    const changed = await f.handle(body(record));
    assert.equal(changed.status,409);assert.equal(changed.json.code,'medical_recommendation_changed');
    assert.equal(changed.json.stored,true);assert.equal(changed.json.canonicalStored,false);
    assert.deepEqual((await f.state()).records,[newer]);
    const collision = await f.handle({...body(record),payload:{record:{...record,participation:10}}});
    assert.equal(collision.status,409);assert.equal(collision.json.code,undefined);
    // A first-time delayed event must also not falsely confirm overwritten fields.
    const delayed = await f.handle({...body(record),idempotencyKey:'first-delivery-older'},2);
    assert.equal(delayed.status,409);assert.equal(delayed.json.duplicate,false);
    assert.equal(delayed.json.processingStatus,'processed');
    assert.deepEqual((await f.state()).records,[newer]);
    await f.handle({eventType:'record-archived',idempotencyKey:'archive',payload:{recordId:record.id,archivedAt:'2026-10-31T13:00:00Z'}},2);
    const archivedBefore = await f.sql("select value || revision::text from platform_app_state_records where state_key='football-medical-team-v1'");
    const archived = await f.handle(body(newer));
    assert.equal(archived.status,409);assert.equal(archived.json.canonicalStored,false);
    assert.equal(await f.sql("select value || revision::text from platform_app_state_records where state_key='football-medical-team-v1'"),archivedBefore);
    assert.equal(await f.sql("select count(*) from medical_state_sync_events where actor_id is not null and processing_status <> 'processed'"),'0\n');
  } finally {await f.db.close();}
});

test('bulk confirmation rejects an archived member and preserves the other stored records', {timeout:120000}, async()=>{
  const f=await fixture();
  try {
    const records=[record,{...record,id:'bulk-second',playerId:'second-player'}];
    const body={eventType:'bulk-recommendation-saved',idempotencyKey:'bulk',payload:{records}};
    assert.equal((await f.handle(body)).status,200);
    await f.handle({eventType:'record-archived',idempotencyKey:'archive',payload:{recordId:record.id,archivedAt:'2026-10-31T13:00:00Z'}},2);
    const before=await f.state();const retry=await f.handle(body);
    assert.equal(retry.status,409);assert.equal(retry.json.duplicate,true);assert.equal(retry.json.canonicalStored,false);
    assert.deepEqual(await f.state(),before);
  }finally{await f.db.close();}
});

test('new helper is invoker-only, exact on nested arrays, and duplicate identities fail closed', {timeout:120000}, async()=>{
  const f=await fixture();
  try{
    for(const role of ['anon','authenticated']) assert.equal(await statementOutcome(f.db,"select app_private.medical_compat_recommendation_is_stored('{}','{}')",{role}),'42501');
    assert.equal(await f.sql("select prosecdef from pg_proc where oid='app_private.medical_compat_recommendation_is_stored(jsonb,jsonb)'::regprocedure"),'f\n');
    const check=(records,incoming)=>f.sql(`select app_private.medical_compat_recommendation_is_stored(${literal({records})},${literal(incoming)})`);
    assert.equal(await check([{...record,extra:'retained'}],record),'t\n');
    assert.equal(await check([{...record,tags:['a','b']}],{...record,tags:['a']}),'f\n');
    assert.equal(await check([record,record],record),'f\n');
    assert.equal(await check([],record),'f\n');
    assert.equal(await check([{...record,deletedAt:'2026-10-31T13:00:00Z'}],record),'f\n');
  }finally{await f.db.close();}
});


test('confirmation installation preserves every existing row and refuses baseline drift atomically', {timeout:120000}, async t => {
  const f=await fixture({applyConfirmation:false});
  const patch=read('scripts/release-artifacts/medical-recommendation-confirmation.sql');
  const fingerprint=()=>f.sql("select md5((select jsonb_agg(to_jsonb(s) order by state_key)::text from platform_app_state_records s) || (select jsonb_agg(to_jsonb(e) order by id)::text from medical_state_sync_events e))");
  const definitions=()=>f.sql("select md5(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text,p.prosecdef) order by p.oid)::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ('public','app_private')");
  try {
    await f.insert(970,'recommendation-saved',{record});await f.project(970);
    await f.insert(971,'recommendation-saved',{record:{...record,id:'untouched-pending'}});
    const before=await fingerprint(),functions=await definitions();
    for(const [label,mutation] of [
      ['projector drift','alter function public.project_medical_state_sync_events(uuid[]) cost 101'],
      ['elevated helper','alter function app_private.upsert_medical_compat_record(jsonb,jsonb) security definer'],
      ['public grants','grant execute on function public.project_medical_state_sync_events(uuid[]) to public'],
      ['missing dependency','drop function app_private.validate_medical_compat_record(jsonb)'],
      ['missing service permission','revoke execute on function app_private.medical_compat_entity_timestamp(jsonb) from service_role'],
    ]) await t.test(label,async()=>{
      assert.equal(await statementOutcome(f.db,patch,{role:'synthetic',before:mutation+';'}),'P0001');
      assert.equal(await fingerprint(),before);assert.equal(await definitions(),functions);
    });
    await f.sql('begin; '+patch+' commit;');
    assert.equal(await fingerprint(),before);
    assert.equal(await f.sql("select processing_status from medical_state_sync_events where id='"+id(971)+"'"),'pending\n');
    assert.equal(await statementOutcome(f.db,patch,{role:'synthetic'}),'P0001');
    for(const role of ['anon','authenticated']) assert.equal(await statementOutcome(f.db,'select public.project_medical_state_sync_events(array[]::uuid[])',{role}),'42501');
    console.log(await f.sql("select jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where oid in ('public.project_medical_state_sync_events(uuid[])'::regprocedure,'app_private.medical_compat_recommendation_is_stored(jsonb,jsonb)'::regprocedure)"));
  }finally{await f.db.close();}
});

test('a replay and archive in one batch confirms final state, not the earlier receipt', {timeout:120000},async()=>{
  const f=await fixture();
  try{
    await f.insert(980,'recommendation-saved',{record});await f.project(980);
    await f.insert(981,'record-archived',{recordId:record.id,archivedAt:'2026-10-31T13:00:00Z'},2);
    const result=JSON.parse(await f.sql(`set role service_role; select row_to_json(r) from public.project_medical_state_sync_events(array['${id(980)}','${id(981)}']::uuid[]) r`));
    assert.equal(result.processed_count,2);assert.equal(result.failed_count,0);assert.equal(result.canonical_stored,false);
    assert.equal((await f.state()).records[0].archivedAt,'2026-10-31T13:00:00Z');
  }finally{await f.db.close();}
});

test('the replacement projector retains all six existing plan event contracts', {timeout:120000},async t=>{
  const f=await fixture();
  try{
    for(const [n,type] of ['availability-plan-created','availability-plan-updated','clearance-saved','medical-board-updated','availability-plan-archived','availability-plan-deleted'].entries()){
      await t.test(type,async()=>{
        const plan={id:'synthetic-plan',playerId:record.playerId,startDate:record.date,endDate:record.date,participation:50,updatedAt:`2026-10-31T13:00:0${n}Z`,...(n>=4?{archivedAt:'2026-10-31T13:01:00Z'}:{})};
        const result=await f.handle({eventType:type,idempotencyKey:type,payload:{plan}});
        assert.equal(result.status,200);assert.equal(result.json.canonicalStored,true);
        assert.deepEqual((await f.state()).injuryPlans,[plan]);
      });
    }
  }finally{await f.db.close();}
});
