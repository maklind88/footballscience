import { unpack, digest } from './snapshot-compact-codec.mjs';

// Shared pure reader; no database opens, writes, repair, or fallback.
export async function decodeLosslessVersion(row, blocks, scope, id) {
  if (row?.format !== 1 || !['standalone', 'pooled'].includes(row.mode) || row.scope !== scope || row.id !== id ||
      row.key !== JSON.stringify([scope, id]) || !Array.isArray(row.refs)) throw new Error('Unsupported version');
  const copy = JSON.parse(await unpack(row.packet));
  if (row.mode === 'pooled') {
    if (!copy.storage || Object.keys(copy.storage).length !== row.refs.length) throw new Error('Invalid references');
    const seen = new Set();
    for (const [key, ref] of row.refs) {
      if (seen.has(key)) throw new Error('Duplicate reference');
      seen.add(key);
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
