import { test, expect } from "@playwright/test";

test("library database retains pending work across reopen and budgets only central cache",async({page})=>{
 await page.goto("/");
 const result=await page.evaluate(async()=>{
  const {createLibrarySaveStore}=await import("/src/modules/exercise-library/library-save-store.mjs");
  const key="football-session-exercise-library-v1",databaseName="qa-library-"+crypto.randomUUID();
  let store=createLibrarySaveStore({databaseName});
  try{
   const row=await store.putPending({scope:"pending-owner",key,change:{id:"one",key,records:[]},createdAt:1});
   const raw='[{"id":"original","title":"Original recovery"}]';
   const archives=await Promise.all([store.archive("a",key,raw,{owner:"a",serverRevision:1},{generation:1}),store.archive("a",key,raw,{owner:"a",serverRevision:2},{generation:1})]);
   await store.cache("a",key,"a".repeat(5*1024*1024),1);
   await store.cache("b",key,"b".repeat(5*1024*1024),1);
   await store.close();store=createLibrarySaveStore({databaseName});
   return {pending:(await store.list("pending-owner")).length,foreign:(await store.list("b")).length,
    evicted:await store.baseline("a",key),current:(await store.baseline("b",key)).revision,
    archives:(await store.list("a","recovery")).map(row=>row.value),same:archives[0].id===archives[1].id,
    exported:(await store.exportScope("b")).pending.length};
  }finally{await store.close();indexedDB.deleteDatabase(databaseName);}
 });
 expect(result).toEqual({pending:1,foreign:0,evicted:null,current:1,archives:['[{"id":"original","title":"Original recovery"}]'],same:true,exported:0});
});

test("aborted acknowledgement keeps both the pending operation and previous baseline",async({page})=>{
 await page.goto("/");
 const result=await page.evaluate(async()=>{
  const {createLibrarySaveStore}=await import("/src/modules/exercise-library/library-save-store.mjs");
  const key="football-session-exercise-library-v1",databaseName="qa-library-abort-"+crypto.randomUUID();
  const store=createLibrarySaveStore({databaseName});let rejected=false;
  try{
   await store.cache("owner",key,"old",1);
   const row=await store.putPending({scope:"owner",key,change:{id:"one",key,records:[]},createdAt:1});
   const original=IDBObjectStore.prototype.delete;
   IDBObjectStore.prototype.delete=function(id){if(this.name==="pending"){this.transaction.abort();throw new Error("simulated disk failure");}return original.call(this,id);};
   try{await store.cache("owner",key,"new",2,row);}catch{rejected=true;}finally{IDBObjectStore.prototype.delete=original;}
   return {rejected,baseline:(await store.baseline("owner",key)).value,pending:(await store.list("owner")).length};
  }finally{await store.close();indexedDB.deleteDatabase(databaseName);}
 });
 expect(result).toEqual({rejected:true,baseline:"old",pending:1});
});

test("immutable library generations reject id reuse and exact acknowledgements preserve successors",async({page})=>{
 await page.goto("/");
 const result=await page.evaluate(async()=>{
  const {createLibrarySaveStore}=await import("/src/modules/exercise-library/library-save-store.mjs");
  const key="football-session-exercise-library-v1",databaseName="qa-library-generation-"+crypto.randomUUID(),store=createLibrarySaveStore({databaseName});
  try{
   const first=await store.putPending({scope:"owner",key,change:{id:"one",key,records:[]},createdAt:1});
   let rejected=false;try{await store.putPending({...first,change:{...first.change,records:["different"]}});}catch{rejected=true;}
   await store.putPending({scope:"owner",key,change:{id:"two",key,records:[]},createdAt:0});
   const order=(await store.list("owner")).map(row=>row.change.id);
   if(JSON.stringify(order)!==JSON.stringify(["one","two"])) throw new Error("Wall-clock reversal reordered durable edits");
   await store.putPending(first);
   await store.cache("owner",key,"[]",2,first);
   return {rejected,ids:(await store.list("owner")).map(row=>row.change.id)};
  }finally{await store.close();indexedDB.deleteDatabase(databaseName);}
 });
 expect(result).toEqual({rejected:true,ids:["two"]});
});

test("cache pressure cannot evict a baseline required by pending offline work",async({page})=>{
 await page.goto("/");
 const result=await page.evaluate(async()=>{
  const {createLibrarySaveStore}=await import("/src/modules/exercise-library/library-save-store.mjs");
  const key="football-session-exercise-library-v1",databaseName="qa-library-pinned-"+crypto.randomUUID(),store=createLibrarySaveStore({databaseName});
  try{
   await store.cache("owner",key,"p".repeat(5*1024*1024),1);
   await store.putPending({scope:"owner",key,change:{id:"one",key,records:[]},createdAt:1});
   const second=await store.cache("other",key,"q".repeat(5*1024*1024),1);
   return {second,retained:(await store.baseline("owner",key)).revision,pending:(await store.list("owner")).length,other:await store.baseline("other",key)};
  }finally{await store.close();indexedDB.deleteDatabase(databaseName);}
 });
 expect(result).toEqual({second:{cached:false},retained:1,pending:1,other:null});
});

test("library recovery review applies an explicitly selected version and archives its predecessor",async({page})=>{
 await page.goto("/");
 await page.evaluate(async()=>{
  const {createLibrarySaveStore}=await import("/src/modules/exercise-library/library-save-store.mjs");
  const {createLibrarySaveClient}=await import("/src/modules/exercise-library/library-save-client.mjs");
  const {applyLibraryChange}=await import("/src/modules/exercise-library/library-save-protocol.mjs");
  const {openLibrarySaveReview}=await import("/src/modules/exercise-library/library-save-review.mjs");
  const key="football-session-exercise-library-v1",databaseName="qa-library-review-"+crypto.randomUUID(),store=createLibrarySaveStore({databaseName});
  let online=false,value='[{"id":"a","title":"Original"}]',revision=1;
  const client=createLibrarySaveClient({store,getScope:()=>"owner",canWrite:()=>true,send:async(k,change)=>{
   if(!online)return {ok:false};const applied=applyLibraryChange(value,change);
   if(!applied.ok)return {ok:false,status:409,conflicts:applied.conflicts};value=applied.value;
   return {ok:true,value,metadata:{revision:++revision},libraryChange:{id:change.id}};
  }});
  await client.observe(key,value,revision);const exported=await client.exportRecovery();await client.save(key,value,'[{"id":"a","title":"Retained version"}]');
  value='[{"id":"a","title":"Colleague version"}]';revision++;online=true;await client.observe(key,value,revision);
  window.__libraryReview={store,key,exported,value:()=>value,close:async()=>{await store.close();indexedDB.deleteDatabase(databaseName);}};
  await openLibrarySaveReview({win:window,client,getScope:()=>"owner",refresh:async()=>true});
 });
 const dialog=page.getByRole("dialog",{name:"Library saved versions",exact:true});
 await expect(dialog).toContainText("Retained version");
 await dialog.getByText("Retained version",{exact:true}).click();await expect(dialog).toContainText("Colleague version");
 await dialog.getByRole("button",{name:"Use my retained version",exact:true}).click();
 await page.getByRole("button",{name:"Confirm",exact:true}).click();
 await expect(dialog).toContainText("Version reviewed");
 expect(await page.evaluate(async()=>({value:JSON.parse(window.__libraryReview.value())[0].title,pending:(await window.__libraryReview.store.list("owner")).length,archived:(await window.__libraryReview.store.list("owner","recovery")).length})))
  .toEqual({value:"Retained version",pending:0,archived:1});
 const exported=await page.evaluate(()=>window.__libraryReview.exported);
 await dialog.getByLabel("Review a library backup file").setInputFiles({name:"library-recovery.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(exported))});
 await expect(dialog).toContainText("Original");
 expect(await page.evaluate(()=>JSON.parse(window.__libraryReview.value())[0].title)).toBe("Retained version");
 await dialog.getByRole("button",{name:"Use my retained version",exact:true}).click();
 await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
 await expect(dialog).toContainText("Version reviewed");
 expect(await page.evaluate(()=>JSON.parse(window.__libraryReview.value())[0].title)).toBe("Original");
 await dialog.getByRole("button",{name:"Close",exact:true}).click();await page.evaluate(()=>window.__libraryReview.close());
});


test("an uncached central receipt keeps the exact pending generation for offline recovery", async ({page}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const {createLibrarySaveStore} = await import("/src/modules/exercise-library/library-save-store.mjs");
    const key = "football-session-exercise-library-v1", databaseName = "qa-library-receipt-" + crypto.randomUUID();
    const store = createLibrarySaveStore({databaseName});
    try {
      await store.cache("owner", key, "old", 1);
      const pending = await store.putPending({scope:"owner",key,change:{id:"one",key,records:[]},createdAt:1});
      const receipt = await store.cache("owner",key,"x".repeat(9*1024*1024),2,pending);
      return {receipt, pending:(await store.list("owner")).length, baseline:(await store.baseline("owner",key)).value};
    } finally { await store.close(); indexedDB.deleteDatabase(databaseName); }
  });
  expect(result).toEqual({receipt:{cached:false},pending:1,baseline:"old"});
});

test("explicit read denial survives reopen and preserves the complete recovery export", async ({page}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const {createLibrarySaveStore} = await import("/src/modules/exercise-library/library-save-store.mjs");
    const {createLibrarySaveClient} = await import("/src/modules/exercise-library/library-save-client.mjs");
    const key="football-session-exercise-library-v1", databaseName="qa-library-access-"+crypto.randomUUID();
    let store=createLibrarySaveStore({databaseName});
    const make = () => createLibrarySaveClient({store,getScope:()=>"owner",canWrite:()=>true,send:async()=>({ok:false})});
    try {
      let client=make(); await client.observe(key,'[{"id":"a","title":"Original"}]',1);
      await client.save(key,'[{"id":"a","title":"Original"}]','[{"id":"a","title":"Retained"}]');
      const before=await client.exportRecovery(); await client.denyRead(key);
      const ready=client.isReady(key); await store.close();store=createLibrarySaveStore({databaseName});client=make();
      const offline=await client.loadOffline(key), after=await client.exportRecovery();
      const retained=JSON.stringify([before.pending,before.baselines,before.recovery])===JSON.stringify([after.pending,after.baselines,after.recovery]);
      await client.observe(key,'[{"id":"a","title":"Original"}]',1);
      return {ready,offline,retained,reallowed:client.isReady(key),pending:(await store.list("owner")).length};
    } finally {await store.close();indexedDB.deleteDatabase(databaseName);}
  });
  expect(result).toEqual({ready:false,offline:null,retained:true,reallowed:true,pending:1});
});
