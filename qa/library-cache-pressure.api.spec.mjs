import { test, expect } from "@playwright/test";
import { createExerciseLibraryRuntimeController } from "../src/modules/exercise-library/exercise-library-runtime-controller.mjs";
import { createExerciseLibraryStateAdapter } from "../src/modules/exercise-library/exercise-library-state.mjs";
import { inspectLibraryMirror } from "../src/core/library-storage-diagnostic.mjs";

function harness() {
  let now = "2026-10-07T10:00:00.000Z", failure = "";
  const native = new Map(), memory = new Map(), changes = [];
  const stateAdapter = createExerciseLibraryStateAdapter({ getNow: () => now });
  const controller = createExerciseLibraryRuntimeController({ stateAdapter,
    win: { localStorage: { getItem: key => memory.get(key) ?? native.get(key) ?? null,
      setItem: (key, value) => { if (failure === key) throw new Error("Quota exceeded");
        if ((memory.get(key) ?? native.get(key)) !== value) changes.push(key);
        native.set(key, value); memory.set(key, value); } } },
    exerciseLibraryStorageKey: "library", exerciseLibraryBackupStorageKey: "backup",
    exerciseLibraryFoldersStorageKey: "folders", exerciseLibraryFoldersBackupStorageKey: "folder-backup",
  });
  return { controller, native, memory, changes, tick: () => { now = "2026-10-07T11:00:00.000Z"; }, fail: key => { failure = key; } };
}
for (const folders of [false, true]) {
  test(`unchanged ${folders ? "folders" : "exercises"} do not create a timestamp-only central backup change`, () => {
    const h = harness(), key = folders ? "folder-backup" : "backup";
    const write = folders ? h.controller.writeSessionPlannerExerciseLibraryFoldersToStorage : h.controller.writeSessionPlannerExerciseLibraryToStorage;
    const result = write([{id:"one", title:"Private content", name:"Private folder", archivedAt:"2026-01-01T00:00:00Z"}]);
    const content = folders ? result.folders : result.exercises;
    const original = h.native.get(key), count = h.changes.length;
    h.tick();
    expect(write(content)).toMatchObject({saved:true, backupSaved:true});
    expect(h.native.get(key)).toBe(original);
    expect(h.changes).toHaveLength(count);
    write(content.map(row=>({...row, title:"Changed", name:"Changed", updatedAt:"2026-10-07T11:00:00.000Z"})));
    expect(h.native.get(key)).not.toBe(original);
    expect(JSON.parse(h.native.get(key)).savedAt).toBe("2026-10-07T11:00:00.000Z");
  });
}
test("a memory-only matching backup still gets written locally and cannot hide quota failure", () => {
  const h=harness(), first=h.controller.writeSessionPlannerExerciseLibraryToStorage([{id:"one",title:"Keep me"}]);
  const backup=h.native.get("backup"); h.native.delete("backup"); h.tick(); h.fail("backup");
  expect(h.controller.writeSessionPlannerExerciseLibraryToStorage(first.exercises)).toMatchObject({saved:true,backupSaved:false});
  expect(h.native.has("backup")).toBe(false);
  h.fail("");
  expect(h.controller.writeSessionPlannerExerciseLibraryToStorage(first.exercises)).toMatchObject({saved:true,backupSaved:true});
  expect(h.native.get("backup")).toBe(backup);
});
test("failed primary write preserves both old native copies",()=>{
  const h=harness(); h.controller.writeSessionPlannerExerciseLibraryToStorage([{id:"one",title:"Original"}]);
  const before=[...h.native]; h.fail("library");
  expect(h.controller.writeSessionPlannerExerciseLibraryToStorage([{id:"two",title:"New"}]).saved).toBe(false);
  expect([...h.native]).toEqual(before);
});
test("backup comparison is native, conservative, content-free and never writes",()=>{
  const key="football-session-exercise-library-v1", bk="football-session-exercise-library-backup-v1";
  const exercises=[{id:"private-id",title:"private-title",archivedAt:"private-time"}];
  const values=new Map([[key,JSON.stringify(exercises)],[bk,JSON.stringify({schema:bk,count:1,exercises})]]);
  const storage={getItem:key=>values.get(key)??null}; const before=[...values];
  expect(inspectLibraryMirror(storage)).toEqual({status:"matching",exerciseCount:1,backupExerciseCount:1});
  expect(JSON.stringify(inspectLibraryMirror(storage))).not.toContain("private");
  expect([...values]).toEqual(before);
  values.set(key,"[]"); expect(inspectLibraryMirror(storage).status).toBe("different");
  values.set(bk,JSON.stringify({schema:bk,count:2,exercises})); expect(inspectLibraryMirror(storage).status).toBe("invalid");
  values.delete(bk); expect(inspectLibraryMirror(storage).status).toBe("missing");
  expect(inspectLibraryMirror({getItem(){throw new Error("secret")}})).toEqual({status:"unavailable"});
});
test("concurrent edits during mirror comparison never report matching",()=>{
  let reads=0; const array='[{"id":"one"}]';
  const storage={getItem:key=>{ reads++; if(reads>2)return "changed";
    return key.includes("backup")?JSON.stringify({schema:key,count:1,exercises:JSON.parse(array)}):array; }};
  expect(inspectLibraryMirror(storage)).toEqual({status:"changed"});
});

 test("matching backups retain unknown envelope metadata verbatim; corrupt backups are repaired",()=>{
  const h=harness(), first=h.controller.writeSessionPlannerExerciseLibraryToStorage([{id:"one",title:"Keep me"}]);
  const extra=JSON.stringify({...JSON.parse(h.native.get("backup")),futureMetadata:{keep:"verbatim"}},null,2);
  h.native.set("backup",extra); h.memory.set("backup",extra); h.tick();
  expect(h.controller.writeSessionPlannerExerciseLibraryToStorage(first.exercises).backupSaved).toBe(true);
  expect(h.native.get("backup")).toBe(extra);
  h.native.set("backup","corrupt");h.memory.set("backup","corrupt");
  expect(h.controller.writeSessionPlannerExerciseLibraryToStorage(first.exercises).backupSaved).toBe(true);
  expect(JSON.parse(h.native.get("backup")).exercises).toEqual(first.exercises);
});

 test("different save scopes and generations are not identical snapshots", async()=>{
  const {sameSnapshotContents}=await import("../src/core/distinct-snapshot-store.mjs");
  const value={schema:"v1",app:"FS",storage:{library:"same"},recoveryCopies:{},recoverySeparations:[],recoveryState:{},saveContext:{scope:"owner-A",entries:{library:{writes:1,pendingCentralSync:true}}}};
  expect(sameSnapshotContents(value,structuredClone(value))).toBe(true);
  expect(sameSnapshotContents(value,{...value,saveContext:{...value.saveContext,scope:"owner-B"}})).toBe(false);
  expect(sameSnapshotContents(value,{...value,saveContext:{...value.saveContext,entries:{library:{writes:2,pendingCentralSync:true}}}})).toBe(false);
  const {saveContext,...legacy}=value;expect(sameSnapshotContents(legacy,value)).toBe(false);
});
