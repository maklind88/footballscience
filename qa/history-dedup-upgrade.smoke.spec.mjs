import {test,expect} from '@playwright/test';

test('60 interleaved exact retries retain two versions and preserve recovery metadata',async({page})=>{
  await page.goto('/medical-merge.js');
  const result=await page.evaluate(async()=>{
    const {writerFixture,candidateRow,writerDump}=await import('/qa/helpers/compact-writer-fixture.mjs');
    const h=writerFixture({legacyRetention:'independent'}),a=candidateRow('A',1),b=candidateRow('B',2);
    await h.writer.save(a);await h.writer.save(b);
    const before=JSON.stringify(await writerDump()),start=performance.now();
    for(let n=0;n<60;n++){
      const row={...(n%2?a:b),id:'retry-'+n,createdAt:new Date(1700000000000+n).toISOString()};
      const stored=await h.writer.save(row);if(stored.written!==false)throw Error('Duplicate inserted');
    }
    const elapsed=performance.now()-start,unchanged=before===JSON.stringify(await writerDump());
    const changed=structuredClone(a);changed.id='new-baseline';changed.saveContext.entries['football-session-planner-v3'].pendingBaseRevision++;
    await h.writer.save(changed);
    return {unchanged,elapsed,count:(await writerDump()).versions.length,
      exact:JSON.stringify((await h.reader.read({source:'compact',id:'A'})).envelope)===JSON.stringify(a)};
  });
  expect(result.unchanged).toBe(true);expect(result.count).toBe(3);expect(result.exact).toBe(true);
  console.log('[dedup-timing]',JSON.stringify(result));
});

test('an intervening A then B commit during encoding cannot create a second A',async({page})=>{
  await page.goto('/medical-merge.js');
  expect(await page.evaluate(async()=>{
    const {writerFixture,candidateRow,writerDump}=await import('/qa/helpers/compact-writer-fixture.mjs');
    const h=writerFixture(),a=candidateRow('A',1),b=candidateRow('B',2);
    const digest=crypto.subtle.digest.bind(crypto.subtle);let inserted=false;
    crypto.subtle.digest=async(...args)=>{
      if(!inserted){inserted=true;crypto.subtle.digest=digest;await h.writer.save(a);await h.writer.save(b);}
      return digest(...args);
    };
    try{const r=await h.writer.save({...a,id:'delayed-A'});return {written:r.written,id:r.id,count:(await writerDump()).versions.length};}
    finally{crypto.subtle.digest=digest;}
  })).toEqual({written:false,id:'A',count:2});
});

test('two tabs retry non-head copies concurrently without growing storage',async({page,context})=>{
  await page.goto('/medical-merge.js');const peer=await context.newPage();await peer.goto('/medical-merge.js');
  for(const tab of [page,peer])await tab.evaluate(async()=>{window.f=await import('/qa/helpers/compact-writer-fixture.mjs');window.h=f.writerFixture();});
  await page.evaluate(async()=>{await h.writer.save(f.candidateRow('A',1));await h.writer.save(f.candidateRow('B',2));});
  for(let n=0;n<12;n++)await Promise.all([page.evaluate(n=>h.writer.save(f.candidateRow('a-retry-'+n,1)),n),peer.evaluate(n=>h.writer.save(f.candidateRow('b-retry-'+n,2)),n)]);
  expect(await page.evaluate(async()=>(await f.writerDump()).versions.length)).toBe(2);
});
