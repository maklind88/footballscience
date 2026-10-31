import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import { createMedicalReconnectGuard } from './helpers/medical-reconnect-guard.mjs';
const record={id:'medical-record-owned',playerId:'qa-save-reconnect-player',participation:50,updatedAt:'2026-10-31T10:00:00Z'};
const body={eventType:'recommendation-saved',idempotencyKey:'recommendation-saved:'+record.id,payload:{record,stateSummary:{recordCount:1}}};
const receipt={ok:true,stored:true,canonicalStored:true,eventId:'original-event'};
const timestamp='2026-10-31T11:00:00Z';
const archived={records:[{...record,archivedAt:timestamp,updatedAt:timestamp}]};
const conflict={ok:false,stored:true,canonicalStored:false,duplicate:true,processingStatus:'processed',eventId:receipt.eventId,code:'medical_recommendation_changed'};
function ready(){
  const guard=createMedicalReconnectGuard();guard.remember(body,receipt);guard.freeze();guard.expectArchive(archived,timestamp);return guard;
}
test('one exact replay is allowed only after its original receipt and verified peer archive',()=>{
  const guard=ready();assert.equal(guard.blocksReads(),true);
  assert.equal(guard.event(structuredClone(body),structuredClone(archived)),record.id);
  assert.throws(()=>guard.event(body,archived),/Only one/);
  assert.throws(()=>guard.finish(),/incomplete/);
  guard.response(409,conflict);guard.finish();
  assert.equal(guard.blocksReads(),false);assert.equal(guard.isReplaying(),false);
  assert.throws(()=>guard.event(body,archived));
});
test('unaccepted, unarchived and incomplete phases cannot admit a replay',()=>{
  const guard=createMedicalReconnectGuard();
  assert.throws(()=>guard.freeze());assert.throws(()=>guard.event(body,archived));
  assert.throws(()=>guard.remember(body,{...receipt,canonicalStored:false}));
  guard.remember(body,receipt);assert.throws(()=>guard.expectArchive(archived,timestamp));
  guard.freeze();assert.throws(()=>guard.event(body,archived));
  assert.throws(()=>guard.expectArchive({records:[record]},timestamp));
  assert.throws(()=>guard.expectArchive(archived,'not-a-date'));
});
for(const [label,mutate] of Object.entries({
  key:b=>b.idempotencyKey+='changed',id:b=>b.payload.record.id+='changed',
  value:b=>b.payload.record.participation=75,summary:b=>b.payload.stateSummary.recordCount=2,
  extra:b=>b.payload.extra='not-original',type:b=>b.eventType='record-archived',
}))test('changed replay cannot reach the server: '+label,()=>{
  const guard=ready(),changed=structuredClone(body);mutate(changed);
  assert.throws(()=>guard.event(changed,archived),/exact original/);
  assert.equal(guard.event(body,archived),record.id);
});
for(const [label,mutate] of Object.entries({
  value:s=>s.records[0].participation=75,missing:s=>s.records=[],duplicate:s=>s.records.push(s.records[0]),
  unarchive:s=>s.records[0].archivedAt='',newer:s=>s.records[0].updatedAt='2026-10-31T12:00:00Z',
}))test('changed canonical record is preserved: '+label,()=>{
  const guard=ready(),changed=structuredClone(archived);mutate(changed);
  assert.throws(()=>guard.event(body,changed),/changed externally/);
  assert.equal(guard.event(body,archived),record.id);
});
for(const [label,change] of Object.entries({
  accepted:{ok:true},notStored:{stored:false},canonical:{canonicalStored:true},newEvent:{eventId:'other'},
  notDuplicate:{duplicate:false},failed:{processingStatus:'failed'},wrongCode:{code:'idempotency_collision'},
}))test('response must certify the original event and explicit conflict: '+label,()=>{
  const guard=ready();guard.event(body,archived);
  assert.throws(()=>guard.response(409,{...conflict,...change}),/explicit conflict/);
  assert.throws(()=>guard.finish(),/incomplete/);
});
test('200 and 503 cannot be treated as conflict acceptance',()=>{
  for(const status of [200,503]){
    const guard=ready();guard.event(body,archived);assert.throws(()=>guard.response(status,conflict));
  }
});
