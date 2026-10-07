import { test, expect } from "@playwright/test";

test("snapshots deduplicate atomically while preserving distinct recovery data and old history", async ({page})=>{
  await page.goto("/");
  const result=await page.evaluate(async()=>{
    const {storeDistinctSnapshot}=await import("/src/core/distinct-snapshot-store.mjs");
    const name="qa-distinct-"+crypto.randomUUID();
    const database=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>{
      r.result.createObjectStore("snapshots",{keyPath:"id"});r.result.createObjectStore("latest",{keyPath:"id"});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const row=(id,extra={})=>({id,schema:"backup-v1",app:"Football Science",createdAt:id,reason:id,
      storage:{library:JSON.stringify([{id:"archived",archivedAt:"2026-01-01",diagram:"preserved",versions:[{title:"old"}]}])},
      recoveryCopies:{},recoverySeparations:[],recoveryState:{},saveContext:{scope:"owner",entries:{}},...extra});
    const write=snapshot=>storeDistinctSnapshot(database,"snapshots","latest",snapshot);
    const all=()=>new Promise((resolve,reject)=>{const r=database.transaction("snapshots").objectStore("snapshots").getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try {
      const first=await write(row("1"));
      const repeats=await Promise.all([write(row("2")),write(row("3")),write(row("4"))]);
      const unchanged=await all();
      const recovery=await write(row("5",{recoveryState:{medical:{entry:{pendingCentralSync:true,principalScope:"different-owner"}}}}));
      const historical=await all();
      // Even if the latest pointer survives, a missing history row must be repaired.
      await new Promise((resolve,reject)=>{const tx=database.transaction("snapshots","readwrite");tx.objectStore("snapshots").delete("5");tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
      const repaired=await write(row("6",{recoveryState:{medical:{entry:{pendingCentralSync:true,principalScope:"different-owner"}}}}));
      const final=await all();
      return {first,repeats,unchanged:unchanged.map(x=>x.id),recovery,historical:historical.map(x=>x.id),repaired,
        final:final.map(x=>x.id),original:final[0].storage.library===row("1").storage.library};
    } finally {database.close();indexedDB.deleteDatabase(name);}
  });
  expect(result).toEqual({first:{written:true,createdAt:"1"},repeats:Array(3).fill({written:false,createdAt:"1"}),
    unchanged:["1"],recovery:{written:true,createdAt:"5"},historical:["1","5"],repaired:{written:true,createdAt:"6"},final:["1","6"],original:true});
});

test("an aborted snapshot transaction never reports success or removes the previous backup",async({page})=>{
  await page.goto("/");
  const result=await page.evaluate(async()=>{
    const {storeDistinctSnapshot}=await import("/src/core/distinct-snapshot-store.mjs");
    const name="qa-abort-"+crypto.randomUUID();
    const db=await new Promise(resolve=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>{
      r.result.createObjectStore("snapshots",{keyPath:"id"});r.result.createObjectStore("latest",{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);});
    const snapshot={id:"old",schema:"v1",app:"FS",createdAt:"old",storage:{key:"original"},recoveryCopies:{},recoverySeparations:[],recoveryState:{},saveContext:{scope:"owner",entries:{}}};
    try {
      await storeDistinctSnapshot(db,"snapshots","latest",snapshot);
      const broken={transaction(...args){const tx=db.transaction(...args);const original=tx.objectStore.bind(tx);
        tx.objectStore=name=>{const store=original(name);if(name==="latest")store.put=()=>{tx.abort();throw new Error("Simulated failure");};return store;};return tx;}};
      let rejected=false;try{await storeDistinctSnapshot(broken,"snapshots","latest",{...snapshot,id:"new",storage:{key:"new"}});}catch{rejected=true;}
      const rows=await new Promise(resolve=>{const r=db.transaction("snapshots").objectStore("snapshots").getAll();r.onsuccess=()=>resolve(r.result);});
      return {rejected,rows:rows.map(row=>({id:row.id,storage:row.storage}))};
    }finally{db.close();indexedDB.deleteDatabase(name);}
  });
  expect(result).toEqual({rejected:true,rows:[{id:"old",storage:{key:"original"}}]});
});
