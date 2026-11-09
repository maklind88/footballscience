export const readFailure = status => Object.assign(new Error(status), { status });

// Never call the write-capable prototype opener. Enumeration + abort-on-upgrade
// avoids creating a schema if a database disappears between check and open.
export async function readExistingVersion({ factory, source, scope, id, signal, maxBytes, maxBlocks }) {
  if (!factory?.databases) throw readFailure('unavailable');
  const databases = await factory.databases();
  if (signal.aborted) throw readFailure('limited');
  if (!databases.some(row => row.name === source.name)) throw readFailure('absent');
  return new Promise((resolve, reject) => {
    let db, tx, done = false, row, decodedBytes = 0, encodedBytes = 0;
    const blocks = new Map();
    const finish = (error, value) => {
      if (done) return;
      done = true; signal.removeEventListener('abort', cancelled);
      if (error) { try { tx?.abort(); } catch {} }
      db?.close(); error ? reject(error) : resolve(value);
    };
    const cancelled = () => finish(readFailure('limited'));
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) { cancelled(); return; }
    const packetBudget = packet => {
      if (!packet || !(packet.bytes instanceof Uint8Array) || !Number.isSafeInteger(packet.rawLength) || packet.rawLength < 0)
        throw readFailure('corrupt');
      decodedBytes += packet.rawLength; encodedBytes += packet.bytes.length;
      if (decodedBytes > maxBytes || encodedBytes > maxBytes) throw readFailure('limited');
    };
    try {
      const request = factory.open(source.name); // No version argument.
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = request.onblocked = () => finish(readFailure('unavailable'));
      request.onsuccess = () => {
        db = request.result;
        if (done) { db.close(); return; }
        db.onversionchange = () => finish(readFailure('unavailable'));
        try {
          const stores = source.format === 'legacy' ? [source.storeName || 'snapshots'] : ['versions', 'blocks'];
          if (stores.some(name => !db.objectStoreNames.contains(name))) throw readFailure('unsupported');
          tx = db.transaction(stores, 'readonly');
          tx.onabort = tx.onerror = () => finish(readFailure('unavailable'));
          tx.oncomplete = () => finish(null, { row, blocks, decodedBytes, encodedBytes });
          const store = tx.objectStore(stores[0]);
          if (store.keyPath !== (source.format === 'legacy' ? 'id' : 'key') ||
              (source.format !== 'legacy' && tx.objectStore('blocks').keyPath !== 'key')) throw readFailure('unsupported');
          const get = store.get(source.format === 'legacy' ? id : JSON.stringify([scope, id]));
          get.onsuccess = () => {
            try {
              row = get.result;
              if (row === undefined) return;
              if (source.format === 'legacy') {
                if (new TextEncoder().encode(JSON.stringify(row)).length > maxBytes) throw readFailure('limited');
                return;
              }
              if (row.format !== 1 || !['standalone', 'pooled'].includes(row.mode) ||
                  Object.keys(row).some(key => !['key','scope','id','format','mode','originalDigest','packet','refs'].includes(key)))
                throw readFailure('unsupported');
              if (row.scope !== scope || row.id !== id || row.key !== JSON.stringify([scope, id])) throw readFailure('denied');
              if (!Array.isArray(row.refs)) throw readFailure('corrupt');
              if (row.refs.length > maxBlocks) throw readFailure('limited');
              packetBudget(row.packet);
              const seen = new Set();
              for (const pair of row.refs) {
                if (!Array.isArray(pair) || pair.length !== 2 || pair.some(part => typeof part !== 'string') || seen.has(pair[0]))
                  throw readFailure('corrupt');
                seen.add(pair[0]);
                const [key, ref] = pair, identity = JSON.parse(ref);
                if (!Array.isArray(identity) || identity.length !== 3 || identity[0] !== scope || identity[1] !== key)
                  throw readFailure('denied');
                const getBlock = tx.objectStore('blocks').get(ref);
                getBlock.onsuccess = () => {
                  try {
                    const block = getBlock.result;
                    if (!block) throw readFailure('corrupt');
                    if (Object.keys(block).some(key => !['key','codec','bytes','rawLength','plainDigest','encodedDigest'].includes(key)))
                      throw readFailure('unsupported');
                    packetBudget(block); blocks.set(ref, block);
                  } catch (error) { finish(error.status ? error : readFailure('corrupt')); }
                };
              }
            } catch (error) { finish(error.status ? error : readFailure('corrupt')); }
          };
        } catch (error) { finish(error.status ? error : readFailure('unavailable')); }
      };
    } catch { finish(readFailure('unavailable')); }
  });
}
