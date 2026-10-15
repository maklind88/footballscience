import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { readSessionSaveBackup } = require('../api/_lib/session-save-backup.js');
const { readStoredSessionSaveBackup, validateStoredSessionSaveBackup } = require('../api/_lib/session-save-backup-archive.js');
const { encodeBackupChunk, decodeBackupChunk } = require('../api/_lib/session-save-backup-chunks.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const key = 'football-session-planner-v3';
const entry = { organization_id: 'global', state_key: key, revision: 1000, value: '{}', value_hash: hash('{}') };
function row(index, content = 'synthetic') {
  const identity = { organization_id: 'global', state_key: key, actor_id: 'coach', operation_id: `save-${String(index).padStart(4, '0')}` };
  return { receipt: { ...identity, operation_hash: hash(String(index)), session_date: '2026-10-15', accepted_revision: index+1 },
    effect: { ...identity, payload: { content } } };
}
async function withPages(rows, run) {
  const previousFetch = global.fetch;
  const names = ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  delete process.env.SUPABASE_SECRET_KEY;
  Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' });
  const objects = new Map();
  const io = {
    writeObject: async (path, body) => { if (objects.has(path)) return {ok:false,status:409}; objects.set(path, body); return {ok:true}; },
    readObject: async path => ({ ok: objects.has(path), payload: objects.get(path) }),
  };
  global.fetch = async (url, options) => {
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/snapshot_session_save_page');
    const request = JSON.parse(options.body);
    const start = request.p_after_operation ? rows.findIndex(r=>r.receipt.operation_id === request.p_after_operation)+1 : 0;
    return Response.json({ schema:'session-save-page-v1',organizationId:'global',entry:request.p_revision == null ? entry : null,
      revision:entry.revision,hash:entry.value_hash,receiptCount:rows.length,rows:rows.slice(start,start+10) });
  };
  try { await run(io, objects); }
  finally { global.fetch = previousFetch; for(const name of names) before[name] === undefined ? delete process.env[name] : process.env[name]=before[name]; }
}

test('history larger than 32 MiB survives export and complete verification in bounded immutable packs', async () => {
  test.setTimeout(120000);
  const rows = Array.from({length:70}, (_,index)=>row(index,randomBytes(512*1024).toString('base64')));
  await withPages(rows, async (io, objects) => {
    await expect(readSessionSaveBackup()).rejects.toThrow();
    const result = await readStoredSessionSaveBackup(io);
    expect(result.snapshot.receiptCount).toBe(70);
    expect([...objects.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0)).toBeGreaterThan(32*1024*1024);
    expect(result.snapshot.packs.every(ref=>ref.bytes < 32*1024*1024)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result.snapshot))).toBeLessThan(32*1024*1024);
    expect((await validateStoredSessionSaveBackup(result.snapshot,io.readObject)).value).toBe('{}');
    const restored = [...objects.values()].flatMap(body=>JSON.parse(body).chunks.flatMap(decodeBackupChunk));
    expect(hash(JSON.stringify(restored))).toBe(hash(JSON.stringify(rows)));
    // Repeated exports reuse identical content; existing objects are verified again.
    expect((await readStoredSessionSaveBackup(io)).snapshot).toEqual(result.snapshot);
  });
});

test('archive verification preserves legacy v2 support', async () => {
  await withPages([row(0)], async io => {
    const legacy = await readSessionSaveBackup();
    expect((await validateStoredSessionSaveBackup(legacy,io.readObject)).revision).toBe(1000);
  });
});

for (const failure of ['missing','tampered','wrong scope','missing effect','duplicate identity']) {
  test(`archive rejects ${failure} even if manifest is rehashed`, async () => {
    await withPages([row(0),row(1)], async (io,objects) => {
      const {snapshot} = await readStoredSessionSaveBackup(io);
      const [path,body] = [...objects][0];
      if (failure==='missing') objects.delete(path);
      else if(failure==='tampered') objects.set(path,body+' ');
      else {
        const pack=JSON.parse(body);
        if(failure==='wrong scope') pack.organizationId='other';
        else {
          const rows=decodeBackupChunk(pack.chunks[0]);
          if(failure==='missing effect') rows[0].effect=null;
          else rows[1]=rows[0];
          pack.chunks=[encodeBackupChunk(rows)];
        }
        const text=JSON.stringify(pack),ref=snapshot.packs[0];
        ref.sha256=hash(text);ref.bytes=Buffer.byteLength(text);
        objects.set(`backups/app-state/session-ledger/global/${ref.sha256}.json`,text);
      }
      await expect(validateStoredSessionSaveBackup(snapshot,io.readObject)).rejects.toThrow();
    });
  });
}
for(const failure of ['upload','readback','changed final page']) {
  test(`export fails closed after ${failure}`,async()=>{
    await withPages([row(0)],async(io)=>{
      if(failure==='upload') io.writeObject=async()=>({ok:false,status:503});
      if(failure==='readback') io.readObject=async()=>({ok:false,status:404});
      if(failure==='changed final page') {
        const fetchPage=global.fetch;let calls=0;
        global.fetch=async(...args)=>++calls===2 ? Response.json({}, {status:409}) : fetchPage(...args);
      }
      await expect(readStoredSessionSaveBackup(io)).rejects.toThrow();
    });
  });
}

test('invalid manifest cannot direct Storage reads outside its verified scope',async()=>{
  await withPages([row(0)],async io=>{
    const {snapshot}=await readStoredSessionSaveBackup(io);
    for(const mutate of [s=>s.packs[0].sha256='../latest',s=>s.organizationId='../other',s=>s.receiptCount++,s=>s.packs.push(s.packs[0])]) {
      const invalid=structuredClone(snapshot);mutate(invalid);
      let reads=0;
      await expect(validateStoredSessionSaveBackup(invalid,async()=>{reads++;})).rejects.toThrow();
      expect(reads).toBe(0);
    }
  });
});
