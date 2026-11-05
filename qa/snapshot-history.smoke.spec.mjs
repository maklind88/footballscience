import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { setPiecesKey } from './helpers/set-pieces-central-fixture.mjs';
import { installStorageHealthAppFixture, waitForStorageHealthApp } from './helpers/storage-health-app-fixture.mjs';

async function isolated(page) {
  await page.goto('/medical-merge.js');
  await page.evaluate(async()=>{
    window.historyModule=await import('/src/core/snapshot-history-dialog.mjs');
    window.reader=await import('/src/core/snapshot-history-reader.mjs');
    window.scope='owner-A';window.dbName='qa-snapshot-history-'+crypto.randomUUID();
    window.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    window.row={id:'copy-1',schema:'football-science-backup-v1',app:'Football Science',createdAt:'2026-11-04T10:00:00.000Z',
      storage:{'football-session-planner-v3':'<img src=x onerror=alert(1)> exact synthetic content'},recoveryCopies:{},recoveryState:{},recoverySeparations:[],
      saveContext:{scope,entries:{'football-session-planner-v3':{principalScope:scope,pendingCentralSync:false,serverRevision:7}}}};
    window.put=record=>new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(record);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    await put(row);
    window.viewOptions={win:window,databaseName:dbName,getScope:()=>scope,protectedStorageKeys:['football-session-planner-v3'],storageLabels:{'football-session-planner-v3':'Sessions'}};
    window.readOptions={indexedDB,databaseName:dbName,scope,allowedKeys:new Set(viewOptions.protectedStorageKeys)};
  });
}

for(const role of ['admin','coach','medical','club-admin','guest'])test(`real app exposes whole-copy review only to admin: ${role}`,async({page},info)=>{
  const {server}=await installStorageHealthAppFixture(page);server.actor.app_metadata.role=role;
  await page.goto('/?workspace=medical-team');
  await waitForStorageHealthApp(page);
  if(role==='admin')await page.evaluate(async key=>{
    if(!await window.footballScienceDataSafety.saveSnapshot('qa-history-fixture'))throw new Error('Fixture snapshot was not committed');
    const scope=window.footballScienceCentralState.getReadScope();
    const db=await new Promise(resolve=>{const r=indexedDB.open('football-science-data-safety-v1');r.onsuccess=()=>resolve(r.result);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({
      id:'zz-qa-history',schema:'football-science-backup-v1',app:'Football Science',createdAt:'2026-11-04T12:00:00.000Z',
      storage:{[key]:'synthetic saved work'},recoveryCopies:{},recoveryState:{},recoverySeparations:[],
      saveContext:{scope,entries:{[key]:{principalScope:scope,pendingCentralSync:false,serverRevision:10}}}});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
  },setPiecesKey);
  // This full-app fixture schedules a Transfer Room initialization write at
  // startup. Establish the no-new-writes baseline after that known write.
  if(role==='admin')await expect.poll(()=>server.writes.some(write=>write.key==='football-transfer-room-v1')).toBe(true);
  const writes=server.writes.length;
  await page.locator('#profileMenuButton').click();await page.getByRole('menuitem',{name:'Storage health',exact:true}).click();
  const health=page.getByRole('dialog',{name:'Storage health',exact:true});
  await expect(health.getByRole('status')).not.toContainText('Checking storage');
  const button=health.getByRole('button',{name:'Review saved browser copies'});
  if(role!=='admin'){await expect(button).toHaveCount(0);return;}
  await button.click();
  const dialog=page.getByRole('dialog',{name:'Saved browser copies',exact:true});
  await expect(dialog).toContainText('verified browser copies available');
  await dialog.locator('summary').filter({hasText:'Set Pieces'}).first().click();
  await expect(dialog).toContainText('synthetic saved work');
  await dialog.screenshot({path:`/private/tmp/snapshot-history-app-${info.project.name}.png`});
  const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download review file'}).first().click();
  const download=await downloadPromise,content=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(content.schema).toBe('football-science-snapshot-review-v1');expect(content.versions[0].storage[setPiecesKey]).toBe('synthetic saved work');
  expect(content).not.toHaveProperty('storage');expect(content).not.toHaveProperty('keys');
  expect(server.writes.length).toBe(writes);
  await page.evaluate(()=>window.platformAuthStore.clearCurrentUser());
  await expect(dialog).toContainText('Account or access changed');await expect(dialog).not.toContainText('synthetic saved work');
});

test('preview is text, download round-trips and the old importer rejects without a write',async({page})=>{
  await isolated(page);await page.evaluate(()=>historyModule.openSnapshotHistory(viewOptions));
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});
  await dialog.locator('summary').click();await expect(dialog.locator('pre')).toContainText('<img src=x');
  await expect(dialog.locator('img')).toHaveCount(0);
  const promise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download review file'}).click();
  const download=await promise,text=await readFile(await download.path(),'utf8');
  expect(JSON.parse(text).versions[0]).toEqual(await page.evaluate(()=>row));
  const result=await page.evaluate(async text=>{
    const {createDataSafetyRuntimeService}=await import('/src/core/data-safety-runtime-service.mjs');
    const alerts=[];let writes=0,confirmed=0;
    const service=createDataSafetyRuntimeService({win:{localStorage,indexedDB,alert:x=>alerts.push(x),confirm:()=>{confirmed++;return true;}},
      protectedStorageKeys:['football-session-planner-v3'],queueCentralStateWrite:()=>writes++});
    await service.importBackupFile(new File([text],'review.json'));
    return {alerts,writes,confirmed};
  },text);
  expect(result.writes).toBe(0);expect(result.confirmed).toBe(0);expect(result.alerts[0]).toContain('did not contain any restorable');
});

for(const reason of ['foreign','unscoped','recovery','unknown-format','missing-owner'])test(`does not disclose ${reason} copy`,async({page})=>{
  await isolated(page);
  await page.evaluate(async reason=>{
    const hidden=structuredClone(row);hidden.id='copy-2';hidden.storage['football-session-planner-v3']='private forbidden payload';
    if(reason==='foreign')hidden.saveContext.scope='owner-B';
    if(reason==='unscoped')delete hidden.saveContext;
    if(reason==='recovery')hidden.recoveryState={other:{value:'secret'}};
    if(reason==='unknown-format')hidden.experimentalReceiptHistory={version:2,receipts:[]};
    if(reason==='missing-owner')delete hidden.saveContext.entries['football-session-planner-v3'].principalScope;
    await put(hidden);await historyModule.openSnapshotHistory(viewOptions);
  },reason);
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});
  await expect(dialog).toContainText('Some copies could not be verified');await expect(dialog.getByRole('button',{name:'Download review file'})).toHaveCount(1);
  await expect(dialog).not.toContainText('private forbidden payload');
});

for(const change of ['changed','removed','scope','aba'])test(`download blocks ${change} after list render`,async({page})=>{
  await isolated(page);await page.evaluate(()=>historyModule.openSnapshotHistory(viewOptions));
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});await expect(dialog).toContainText('1 verified browser copies');
  await page.evaluate(async change=>{
    if(change==='changed'){const changed=structuredClone(row);changed.storage['football-session-planner-v3']='successor';await put(changed);}
    if(change==='removed')await new Promise(resolve=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').delete(row.id);tx.oncomplete=resolve;});
    if(change==='scope')scope='owner-B';
    if(change==='aba'){scope='owner-B';dispatchEvent(new CustomEvent('platform:user-change'));scope='owner-A';dispatchEvent(new CustomEvent('platform:user-change'));}
    window.downloads=0;const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){downloads++;return original.call(this);};
  },change);
  if(change!=='aba')await dialog.getByRole('button',{name:'Download review file'}).click();
  await expect(dialog).toContainText(change==='scope'||change==='aba'?'Account or access changed':'copy changed or could not be verified');
  expect(await page.evaluate(()=>downloads)).toBe(0);
});

test('bounded scans report partial; absent database is never created',async({page})=>{
  await isolated(page);
  const result=await page.evaluate(async()=>{
    await put({...row,id:'copy-2'});
    const small=await reader.readSnapshotHistory({...readOptions,maxRows:1});
    const bytes=await reader.readSnapshotHistory({...readOptions,maxBytes:1});
    const absentName='qa-absent-'+crypto.randomUUID();
    const absent=await reader.readSnapshotHistory({...readOptions,databaseName:absentName});
    return {small:{status:small.status,count:small.rows.length},bytes:bytes.status,absent:absent.status,created:(await indexedDB.databases()).some(x=>x.name===absentName)};
  });
  expect(result).toEqual({small:{status:'partial',count:1},bytes:'partial',absent:'absent',created:false});
});

test('listing and downloading use only readonly transactions and never mutate saved rows',async({page})=>{
  await isolated(page);
  await page.evaluate(()=>{
    window.mutations=0;for(const name of ['put','add','delete','clear']){const original=IDBObjectStore.prototype[name];IDBObjectStore.prototype[name]=function(...args){mutations++;return original.apply(this,args);};}
    window.modes=[];const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...args){modes.push(mode||'readonly');return original.call(this,stores,mode,...args);};
  });
  await page.evaluate(()=>historyModule.openSnapshotHistory(viewOptions));
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Download review file'}).click();await promise;
  expect(await page.evaluate(()=>({mutations,modes}))).toEqual({mutations:0,modes:['readonly','readonly']});
});

test('denied read and auth change during reading never render a retained payload',async({page})=>{
  await isolated(page);
  const report=await page.evaluate(async()=>reader.readSnapshotHistory({...readOptions,indexedDB:{databases:async()=>{throw new Error('denied');}}}));
  expect(report.status).toBe('unavailable');
  await page.evaluate(async()=>{
    const delayed={databases:async()=>{dispatchEvent(new CustomEvent('platform:user-change'));return indexedDB.databases();},open:(...args)=>indexedDB.open(...args)};
    await historyModule.openSnapshotHistory({...viewOptions,indexedDB:delayed});
  });
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});await expect(dialog).toContainText('Account or access changed');
  await expect(dialog.getByRole('button',{name:'Download review file'})).toHaveCount(0);
});


test('bounded history pages reach later copies without changing storage',async({page})=>{
  await isolated(page);
  await page.evaluate(async()=>{
    for(let n=2;n<=102;n++)await put({...row,id:'copy-'+String(n).padStart(4,'0')});
    await historyModule.openSnapshotHistory(viewOptions);
  });
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});
  await expect(dialog).toContainText('This list is incomplete');
  await expect(dialog.getByRole('button',{name:'Download review file'})).toHaveCount(100);
  await dialog.getByRole('button',{name:'Next copies'}).click();
  await expect(dialog.getByRole('button',{name:'Download review file'})).toHaveCount(2);
  await expect(dialog.getByRole('button',{name:'Next copies'})).toHaveCount(0);
});


test('size-bounded pagination does not skip a copy that fits on the next page',async({page})=>{
  await isolated(page);
  const result=await page.evaluate(async()=>{
    await put({...row,id:'copy-2'});
    const maxBytes=JSON.stringify(row).length*2+10;
    const first=await reader.readSnapshotHistory({...readOptions,maxBytes});
    const second=await reader.readSnapshotHistory({...readOptions,maxBytes,beforeKey:first.nextKey});
    return {first:first.rows.map(r=>r.id),second:second.rows.map(r=>r.id),skipped:first.skipped+second.skipped};
  });
  expect(result).toEqual({first:['copy-2'],second:['copy-1'],skipped:0});
});

test('mobile review fits viewport and closing restores focus',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await isolated(page);
  await page.evaluate(async()=>{
    const opener=document.createElement('button');opener.id='history-opener';opener.textContent='Open copies';document.body.append(opener);opener.focus();
    await historyModule.openSnapshotHistory(viewOptions);
  });
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});
  await dialog.locator('summary').click();
  const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await dialog.screenshot({path:`/private/tmp/snapshot-history-mobile-${info.project.name}.png`});
  await dialog.getByRole('button',{name:'Close saved copies'}).click();
  await expect(page.locator('#history-opener')).toBeFocused();
});


test('unexpected database schema is unavailable, never repaired or treated as empty',async({page})=>{
  await isolated(page);
  const result=await page.evaluate(async()=>{
    const name='qa-wrong-schema-'+crypto.randomUUID();
    const database=await new Promise(resolve=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots',{keyPath:'other'});r.onsuccess=()=>resolve(r.result);});
    const report=await reader.readSnapshotHistory({...readOptions,databaseName:name});
    const keyPath=database.transaction('snapshots').objectStore('snapshots').keyPath;database.close();
    return {status:report.status,keyPath};
  });
  expect(result).toEqual({status:'unavailable',keyPath:'other'});
});


test('an already-loaded review reads and downloads copies with all network requests blocked',async({page})=>{
  await isolated(page);await page.route('**/*',route=>route.abort('internetdisconnected'));
  await page.evaluate(()=>historyModule.openSnapshotHistory(viewOptions));
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});await expect(dialog).toContainText('1 verified browser copies');
  const promise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download review file'}).click();
  const file=JSON.parse(await readFile(await (await promise).path(),'utf8'));
  expect(file.versions[0]).toEqual(await page.evaluate(()=>row));
});

test('failed lazy loading leaves Storage health open with a retry explanation',async({page})=>{
  await isolated(page);
  await page.evaluate(async()=>{
    const {openStorageHealth}=await import('/src/core/storage-health-dialog.mjs');
    await openStorageHealth({documentRef:document,storage:localStorage,indexedDB,navigatorRef:{},getScope:()=>scope,
      getSnapshotScope:()=>scope,reviewSnapshots:async()=>{throw new Error('offline asset');}});
  });
  const dialog=page.getByRole('dialog',{name:'Storage health',exact:true});
  await dialog.getByRole('button',{name:'Review saved browser copies'}).click();
  await expect(dialog).toContainText('Saved-copy review could not open');
  await expect(dialog.getByRole('button',{name:'Review saved browser copies'})).toBeEnabled();
});


test('closing Storage health during lazy loading cancels the later review opening',async({page})=>{
  await installStorageHealthAppFixture(page);await page.goto('/?workspace=medical-team');
  await waitForStorageHealthApp(page);
  let release,requested=false;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/src/core/snapshot-history-dialog.mjs',async route=>{requested=true;await gate;await route.continue();});
  await page.locator('#profileMenuButton').click();await page.getByRole('menuitem',{name:'Storage health',exact:true}).click();
  const health=page.getByRole('dialog',{name:'Storage health',exact:true});
  await health.getByRole('button',{name:'Review saved browser copies'}).click();
  await expect.poll(()=>requested).toBe(true);await health.getByRole('button',{name:'Close storage health'}).click();release();
  await page.evaluate(async()=>{await import('/src/core/snapshot-history-dialog.mjs');await new Promise(resolve=>setTimeout(resolve,0));});
  await expect(page.getByRole('dialog',{name:'Saved browser copies'})).toHaveCount(0);
});


test('clinical content stays out of the shared preview while the admin export preserves the full copy',async({page})=>{
  await isolated(page);
  await page.evaluate(async()=>{
    const key='football-medical-team-v1';row.storage[key]='synthetic confidential clinical detail';
    row.saveContext.entries[key]={principalScope:scope,pendingCentralSync:false,serverRevision:3};
    viewOptions.protectedStorageKeys.push(key);viewOptions.storageLabels[key]='Medical Room';
    await put(row);await historyModule.openSnapshotHistory(viewOptions);
  });
  const dialog=page.getByRole('dialog',{name:'Saved browser copies'});
  await expect(dialog).toContainText('review clinical details in Medical');
  await expect(dialog).not.toContainText('synthetic confidential clinical detail');
  const promise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download review file'}).click();
  const content=JSON.parse(await readFile(await (await promise).path(),'utf8'));
  expect(content.versions[0]).toEqual(await page.evaluate(()=>row));
});
