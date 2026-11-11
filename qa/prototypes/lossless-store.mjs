import { serialize, pack, unpack, digest, bytesEqual } from './lossless-codec.mjs';

// Deliberately separate QA database: no migration, deletes, legacy writes,
// auth, sync, retention, browser cleanup, or production activation path.
export async function openLosslessStore(name, mode = 'standalone') {
  if (!/^qa-lossless-[a-z0-9-]+$/.test(name) || !['standalone', 'pooled'].includes(mode)) throw new Error('QA database required');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error('Prototype database blocked')); };
    request.onupgradeneeded = () => {
      if (blocked) { request.transaction.abort(); return; }
      request.result.createObjectStore('versions', { keyPath: 'key' });
      request.result.createObjectStore('blocks', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
  });
  db.onversionchange = () => db.close();
  const versionKey = (scope, id) => JSON.stringify([scope, id]);
  const failScope = (scope, id) => {
    if (typeof scope !== 'string' || !scope || typeof id !== 'string' || !id) throw new Error('Scope and id required');
  };

  async function append(snapshot) {
    // Copy the caller's object before the first await; later edits cannot change
    // the generation currently being encoded. Unknown JSON fields are retained.
    const original = serialize(snapshot), copy = JSON.parse(original);
    const scope = copy.saveContext?.scope, id = copy.id;
    failScope(scope, id);
    const blocks = [], refs = [];
    if (mode === 'pooled') {
      if (!copy.storage || Array.isArray(copy.storage) || typeof copy.storage !== 'object') throw new Error('Storage object required');
      for (const [key, value] of Object.entries(copy.storage)) {
        if (typeof value !== 'string' || copy.saveContext.entries?.[key]?.principalScope !== scope) throw new Error('Unverified payload owner');
        const packet = await pack(JSON.stringify(value));
        const blockKey = JSON.stringify([scope, key, packet.plainDigest]);
        blocks.push({ key: blockKey, ...packet });
        copy.storage[key] = { prototypeRef: blockKey };
        refs.push([key, blockKey]);
      }
    }
    const row = { key: versionKey(scope, id), scope, id, format: 1, mode,
      originalDigest: await digest(new TextEncoder().encode(original)),
      packet: await pack(JSON.stringify(copy)), refs };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['versions', 'blocks'], 'readwrite');
      let failure, inserted = false;
      tx.oncomplete = () => resolve({ inserted });
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Prototype transaction aborted'));
      const abort = error => { failure = error; tx.abort(); };
      const versions = tx.objectStore('versions'), store = tx.objectStore('blocks');
      const existing = versions.get(row.key);
      existing.onsuccess = () => {
        try {
          // No overwrite, including an id reused for another generation.
          if (existing.result) {
            const prior = existing.result;
            if (prior.format !== row.format || prior.scope !== row.scope || prior.id !== row.id ||
                prior.originalDigest !== row.originalDigest || prior.mode !== row.mode ||
                JSON.stringify(prior.refs) !== JSON.stringify(row.refs) ||
                prior.packet?.codec !== row.packet.codec || prior.packet?.rawLength !== row.packet.rawLength ||
                prior.packet?.plainDigest !== row.packet.plainDigest || prior.packet?.encodedDigest !== row.packet.encodedDigest ||
                !bytesEqual(prior.packet?.bytes, row.packet.bytes)) throw new Error('Immutable version collision');
          }
          let remaining = blocks.length;
          const finish = () => { if (!existing.result) { versions.add(row); inserted = true; } };
          if (!remaining) { finish(); return; }
          for (const block of blocks) {
            const read = store.get(block.key);
            read.onsuccess = () => {
              try {
                const previous = read.result;
                if (previous && (previous.plainDigest !== block.plainDigest || previous.rawLength !== block.rawLength ||
                    previous.encodedDigest !== block.encodedDigest || previous.codec !== block.codec ||
                    !bytesEqual(previous.bytes, block.bytes))) throw new Error('Shared block mismatch');
                // An idempotent retry may not silently repair missing blocks.
                if (!previous && existing.result) throw new Error('Missing shared block');
                if (!previous) store.add(block);
                if (--remaining === 0) finish();
              } catch (error) { abort(error); }
            };
          }
        } catch (error) { abort(error); }
      };
    });
  }

  async function read(scope, id) {
    failScope(scope, id);
    // Fetch the whole dependency set in one read transaction. Decompression is
    // outside it: async codecs must not leave half-finished IDB transactions.
    const { row, blocks } = await new Promise((resolve, reject) => {
      const tx = db.transaction(['versions', 'blocks'], 'readonly');
      let row; const blocks = new Map();
      tx.oncomplete = () => resolve({ row, blocks });
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Read aborted'));
      const request = tx.objectStore('versions').get(versionKey(scope, id));
      request.onsuccess = () => {
        row = request.result;
        if (!row || !Array.isArray(row.refs)) return;
        for (const pair of row.refs) {
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[1] !== 'string') { tx.abort(); return; }
          const read = tx.objectStore('blocks').get(pair[1]);
          read.onsuccess = () => blocks.set(pair[1], read.result);
        }
      };
    });
    if (!row) throw new Error('Version unavailable');
    if (row.format !== 1 || !['standalone', 'pooled'].includes(row.mode) || row.scope !== scope || row.id !== id ||
        !Array.isArray(row.refs)) throw new Error('Unsupported version');
    const copy = JSON.parse(await unpack(row.packet));
    if (row.mode === 'pooled') {
      if (!copy.storage || Object.keys(copy.storage).length !== row.refs.length) throw new Error('Invalid references');
      for (const [key, ref] of row.refs) {
        const block = blocks.get(ref);
        if (!block || block.key !== ref || copy.storage[key]?.prototypeRef !== ref ||
            copy.saveContext?.entries?.[key]?.principalScope !== scope ||
            JSON.stringify([scope, key, block.plainDigest]) !== ref) throw new Error('Missing or foreign block');
        const value = JSON.parse(await unpack(block));
        if (typeof value !== 'string') throw new Error('Invalid payload');
        copy.storage[key] = value;
      }
    } else if (row.refs.length) throw new Error('Unexpected references');
    const text = JSON.stringify(copy);
    if (copy.id !== id || copy.saveContext?.scope !== scope ||
        await digest(new TextEncoder().encode(text)) !== row.originalDigest) throw new Error('Version integrity failure');
    return text;
  }
  // Round-trip recovery produces the original full envelope, not a write to
  // user data or a claim that the application's import flow accepts every form.
  // Bytes keep recovery independent of browser Blob URL/file loading (including
  // WebKit's offline I/O boundary). Download UI is intentionally not implemented.
  const exportVersion = async (scope, id) => new TextEncoder().encode(await read(scope, id));
  async function stats() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['versions', 'blocks'], 'readonly');
      const versions = tx.objectStore('versions').getAll(), blocks = tx.objectStore('blocks').getAll();
      tx.oncomplete = () => {
        const rows = [...versions.result, ...blocks.result];
        let encodedBytes = 0;
        const metadata = rows.map(row => {
          const copy = { ...row };
          if (copy.packet) { encodedBytes += copy.packet.bytes.length; copy.packet = { ...copy.packet, bytes: null }; }
          if (copy.bytes) { encodedBytes += copy.bytes.length; copy.bytes = null; }
          return copy;
        });
        resolve({ versions: versions.result.length, blocks: blocks.result.length, encodedBytes,
          metadataUtf8Bytes: new TextEncoder().encode(JSON.stringify(metadata)).length });
      };
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }
  return { append, read, exportVersion, stats, close: () => db.close() };
}
