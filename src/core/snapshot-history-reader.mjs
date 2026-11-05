import { isReviewableSnapshot } from './snapshot-history-format.mjs';

// Read only: never create/upgrade a database, repair a row, or prune history.
export async function readSnapshotHistory({ indexedDB, databaseName, storeName = 'snapshots', scope, allowedKeys,
  id, beforeKey, maxRows = 100, maxBytes = 20 * 1024 * 1024, timeoutMs = 3000 }) {
  const empty = status => ({ status, rows:[], skipped:0, inspected:0, nextKey:null });
  if (!scope || !indexedDB?.databases || !(allowedKeys instanceof Set)) return empty('unavailable');
  let enumerationTimer;
  try {
    const databases = await Promise.race([indexedDB.databases(),new Promise((_,reject)=>{
      enumerationTimer=setTimeout(()=>reject(new Error('Storage unavailable')),timeoutMs);
    })]);
    if (!Array.isArray(databases)) return empty('unavailable');
    if (!databases.some(database=>database.name===databaseName)) return empty('absent');
  } catch { return empty('unavailable'); }
  finally { clearTimeout(enumerationTimer); }
  return new Promise(resolve=>{
    const report=empty('complete');let database,transaction,finished=false,bytes=0;
    const finish=status=>{
      if(finished)return;finished=true;clearTimeout(timer);
      if(status!=='complete') { try{transaction?.abort();}catch{} }
      database?.close();report.status=status;
      // An aborted/denied read must not look like a complete empty history.
      if(status==='unavailable')report.rows=[];
      resolve(report);
    };
    const timer=setTimeout(()=>finish('partial'),timeoutMs);
    try {
      const request=indexedDB.open(databaseName);
      request.onupgradeneeded=()=>request.transaction.abort();
      request.onerror=request.onblocked=()=>finish('unavailable');
      request.onsuccess=()=>{
        database=request.result;
        if(finished){database.close();return;}
        database.onversionchange=()=>finish('partial');
        if(!database.objectStoreNames.contains(storeName)){finish('unavailable');return;}
        try {
          transaction=database.transaction(storeName,'readonly');
          transaction.oncomplete=()=>finish('complete');
          transaction.onerror=transaction.onabort=()=>finish('unavailable');
          const store=transaction.objectStore(storeName);
          if(store.keyPath!=='id'){finish('unavailable');return;}
          const read=id===undefined?store.openCursor(beforeKey === undefined ? null : IDBKeyRange.upperBound(beforeKey,true),'prev'):store.get(id);
          read.onerror=()=>finish('unavailable');
          read.onsuccess=()=>{
            if(finished)return;
            const cursor=id===undefined?read.result:null,row=cursor?.value ?? (id===undefined?undefined:read.result);
            if(row===undefined)return;
            try {
              if(report.inspected>=maxRows){finish('partial');return;}
              const size=JSON.stringify(row).length*2;
              if(size>maxBytes){if(cursor){report.nextKey=cursor.key;report.skipped++;}finish('partial');return;}
              if(bytes+size>maxBytes){finish('partial');return;}
              bytes+=size;
              report.inspected++;
              if(cursor)report.nextKey=cursor.key;
              if(isReviewableSnapshot(row,scope,allowedKeys))report.rows.push(row);else report.skipped++;
              cursor?.continue();
            } catch {finish('unavailable');}
          };
        } catch {finish('unavailable');}
      };
    } catch {finish('unavailable');}
  });
}
