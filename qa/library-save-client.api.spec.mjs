import { test, expect } from "@playwright/test";
import { createLibrarySaveClient } from "../src/modules/exercise-library/library-save-client.mjs";
import { applyLibraryChange, createLibraryChange, librarySaveKeys } from "../src/modules/exercise-library/library-save-protocol.mjs";
const key = librarySaveKeys[0];
const initial = [{id:"a",title:"A",archivedAt:""},{id:"b",title:"B",archivedAt:""}];
const text = value => JSON.stringify(value);
function memoryStore() {
  const pending = new Map(), baseline = new Map(); let broken = false;
  return { pending, break: value => { broken = value; },
    async list(scope) { if(broken) throw Error("unavailable"); return structuredClone([...pending.values()].filter(row=>row.scope===scope)); },
    async putPending(row) { if(broken) throw Error("quota"); const value={...structuredClone(row),id:row.scope+row.change.id};pending.set(value.id,value);return value; },
    async cache(scope,key,value,revision,row) { if(broken) throw Error("quota"); baseline.set(scope+key,{value,revision}); if(row)pending.delete(row.id);return {cached:true}; },
    async baseline(scope,key) { return baseline.get(scope+key); },
    async exportScope(scope) { return {pending:await this.list(scope)}; },
  };
}
function harness(options={}) {
  const store=options.store||memoryStore(); let scope="owner",online=true,allowed=true,sequence=0,value=text(initial),revision=1;
  const sent=[],states=[];
  const send=async (k,change,baseRevision)=>{
    sent.push(change);
    if(!online)throw Error("offline");
    if(options.send)return options.send(k,change,baseRevision);
    const applied=applyLibraryChange(value,change);
    if(!applied.ok)return {ok:false,status:409,conflicts:applied.conflicts,reason:"conflict"};
    value=applied.value;revision++;
    return {ok:true,value,metadata:{revision},libraryChange:{id:change.id}};
  };
  const client=createLibrarySaveClient({store,getScope:()=>scope,canWrite:()=>allowed,send,makeId:()=>`change-${++sequence}`,onState:(...args)=>states.push(args)});
  return {client,store,sent,states,online:v=>{online=v;},scope:v=>{scope=v;},allow:v=>{allowed=v;},server:v=>{value=text(v);revision++;},value:()=>JSON.parse(value)};
}

test("record changes preserve colleagues, archives and exact replay",()=>{
 const a=initial.map(row=>row.id==="a"?{...row,title:"Updated A"}:row);
 const change=createLibraryChange(key,text(initial),text(a),"id");
 const colleague=initial.map(row=>row.id==="b"?{...row,title:"Updated B"}:row);
 const merged=applyLibraryChange(text(colleague),change);
 expect(JSON.parse(merged.value).map(row=>row.title)).toEqual(["Updated A","Updated B"]);
 expect(applyLibraryChange(merged.value,change).unchanged).toBe(true);
 expect(applyLibraryChange(text([{...initial[0],archivedAt:"2026-10-07"},initial[1]]),change).ok).toBe(false);
 expect(()=>createLibraryChange(key,text(initial),text([initial[0]]),"id")).toThrow("Archive");
 expect(()=>applyLibraryChange("[]",{...change,records:[...change.records,...change.records]})).toThrow();
});

test("full local storage does not block a confirmed online save",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);h.store.break(true);
 const result=await h.client.save(key,text(initial),text([{...initial[0],title:"central"},initial[1]]));
 expect(result).toMatchObject({saved:true,centrallySaved:true,cached:false});
 expect(h.value()[0].title).toBe("central");
});

test("offline journal survives a new client and replays without changing another record",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);h.online(false);
 const next=[{...initial[0],title:"offline"},initial[1]];
 expect(await h.client.save(key,text(initial),text(next))).toMatchObject({saved:true,locallySaved:true,centrallySaved:false,pending:true});
 expect(h.store.pending.size).toBe(1);
 const restored=harness({store:h.store});
 expect(JSON.parse((await restored.client.loadOffline(key)).value)[0].title).toBe("offline");
 restored.server([initial[0],{...initial[1],title:"colleague"}]);
 await restored.client.observe(key,text(restored.value()),2);await restored.client.replay();
 expect(restored.value().map(row=>row.title)).toEqual(["offline","colleague"]);
 expect(h.store.pending.size).toBe(0);
});

test("both stores failing never claim saved and keep the caller's draft untouched",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);h.online(false);h.store.break(true);
 const draft=text([{...initial[0],title:"do not lose"},initial[1]]);
 expect(await h.client.save(key,text(initial),draft)).toMatchObject({saved:false,locallySaved:false,centrallySaved:false});
 expect(JSON.parse(draft)[0].title).toBe("do not lose");
});

test("a competing change is retained separately and cannot replace the current baseline",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);
 h.server([{...initial[0],title:"colleague"},initial[1]]);
 const result=await h.client.save(key,text(initial),text([{...initial[0],title:"mine"},initial[1]]));
 expect(result).toMatchObject({saved:false,conflict:true,locallySaved:true});
 await h.client.observe(key,text(h.value()),2);
 const projected=await h.client.project(key);
 expect(JSON.parse(projected.value)[0].title).toBe("colleague");expect(projected.conflicts).toHaveLength(1);
 expect(h.store.pending.size).toBe(1);
});

test("unconfirmed server responses cannot acknowledge or remove a journal entry",async()=>{
 const h=harness({send:async()=>({ok:true,value:text(initial),metadata:{revision:2}})});
 await h.client.observe(key,text(initial),1);
 const result=await h.client.save(key,text(initial),text([{...initial[0],title:"pending"},initial[1]]));
 expect(result.centrallySaved).toBe(false);expect(h.store.pending.size).toBe(1);
});

test("account changes during a request hide the receipt and do not replay the old owner",async()=>{
 let release;const h=harness({send:async(k,change)=>new Promise(resolve=>{release=()=>resolve({ok:true,value:text([{...initial[0],title:"private"},initial[1]]),metadata:{revision:2},libraryChange:{id:change.id}});})});
 await h.client.observe(key,text(initial),1);
 const saving=h.client.save(key,text(initial),text([{...initial[0],title:"private"},initial[1]]));
 while(!release)await new Promise(resolve=>setTimeout(resolve,0));h.scope("other");release();
 expect(await saving).toMatchObject({saved:false,staleContext:true});
 expect(await h.client.loadOffline(key)).toBeNull();await h.client.replay();expect(h.sent).toHaveLength(1);
 expect(h.store.pending.size).toBe(1);
});

test("revoked edit permission cannot send or discard queued work",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);h.online(false);
 await h.client.save(key,text(initial),text([{...initial[0],title:"pending"},initial[1]]));
 h.online(true);h.allow(false);await h.client.replay();expect(h.sent).toHaveLength(1);expect(h.store.pending.size).toBe(1);
});

test("an imported backup waits for explicit review and never replays automatically",async()=>{
 const {importLibraryRecovery}=await import("../src/modules/exercise-library/library-recovery-import.mjs");
 const h=harness();await h.client.observe(key,text(initial),1);
 const backup={schema:"football-library-recovery-v1",baselines:[{scope:"owner",key,value:text([{...initial[0],title:"Backup version"},initial[1]])}]};
 await importLibraryRecovery({payload:backup,client:h.client,getScope:()=>"owner"});
 expect(h.store.pending.size).toBe(1);await h.client.replay();expect(h.sent).toHaveLength(0);
 expect(JSON.parse((await h.client.project(key)).value)[0].title).toBe("A");
 await expect(importLibraryRecovery({payload:backup,client:h.client,getScope:()=>"another-account"})).rejects.toThrow("another account");
});

test("review based on an older central version refuses to overwrite a new colleague edit",async()=>{
 const h=harness();await h.client.observe(key,text(initial),1);h.online(false);
 await h.client.save(key,text(initial),text([{...initial[0],title:"local"},initial[1]]));
 const row=[...h.store.pending.values()][0];h.online(true);
 await h.client.observe(key,text([{...initial[0],title:"new colleague"},initial[1]]),2);
 expect(await h.client.resolvePending(row,"local",text(initial))).toMatchObject({saved:false});
 expect(h.sent).toHaveLength(1);expect(h.store.pending.size).toBe(1);
});


test("normalized editor defaults do not create false conflicts or rewrite untouched legacy records", async () => {
  const {prepareLibraryViewChange} = await import("../src/modules/exercise-library/library-view-changes.mjs");
  const raw=[{id:"a",title:"A",extra:"preserve"},{id:"b",title:"B"}];
  const view=raw.map(({id,title})=>({id,title,archivedAt:"",tags:[]}));
  const change=prepareLibraryViewChange(key,text(raw),view,[{...view[0],title:"Edited"},view[1]]);
  const operation=createLibraryChange(key,change.before,change.after,"ui");
  expect(operation.records).toHaveLength(1);
  expect(operation.records[0].before).toEqual(raw[0]);
  const server=[raw[0],{...raw[1],title:"Colleague"}];
  const saved=applyLibraryChange(text(server),operation);
  expect(saved.ok).toBe(true);
  expect(JSON.parse(saved.value)).toEqual([{...view[0],title:"Edited",extra:"preserve"},server[1]]);
});

test("an omitted library response preserves the current read and only explicit denial blocks it",async()=>{
 const {createLibrarySaveBridge}=await import("../src/modules/exercise-library/library-save-bridge.mjs");
 const views=[];
 const bridge=createLibrarySaveBridge({win:{addEventListener(){},dispatchEvent(){},CustomEvent:class{}},getScope:()=>"owner",
  isDevelopment:()=>false,canWrite:()=>true,getPending:()=>null,syncKey:async()=>({ok:false}),setCached:(key,value)=>views.push(value)});
 await bridge.prepare({[key]:text(initial)},{[key]:{revision:1}});
 await bridge.prepare({},{},{readKeys:[key]});
 expect(bridge.client.isReady(key)).toBe(true);expect(views.at(-1)).toBe(text(initial));
 await bridge.prepare({},{},{readKeys:[key],deniedKeys:[key]});
 expect(bridge.client.isReady(key)).toBe(false);expect(views.at(-1)).toBe("[]");
});


test("an invalid library payload or unavailable native read does not discard another module read",async()=>{
 const {createLibrarySaveBridge}=await import("../src/modules/exercise-library/library-save-bridge.mjs");
 const views=[];
 const bridge=createLibrarySaveBridge({win:{addEventListener(){},dispatchEvent(){},CustomEvent:class{}},getScope:()=>"owner",
  isDevelopment:()=>false,canWrite:()=>true,getPending:()=>null,syncKey:async()=>({ok:false}),setCached:(key,value)=>views.push(value),readNative:()=>{throw Error("Storage denied");}});
 await bridge.prepare({[key]:"invalid"},{[key]:{revision:1}});
 expect(bridge.state(key).readError).toBe(true);expect(bridge.apply(key,"invalid")).toBe(true);expect(views).toEqual([]);
 await bridge.prepare({[key]:text(initial)},{[key]:{revision:2}});
 expect(bridge.state(key).readError).toBeUndefined();expect(views.at(-1)).toBe(text(initial));
});
