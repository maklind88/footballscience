const { createHash } = require("node:crypto");
const { MAX_BYTES, decodeBackupChunk } = require("./session-save-backup-chunks.js");
const { scanSessionSaveBackup, validateSessionSaveBackup, validatePageRows } = require("./session-save-backup.js");

const SCHEMA = "session-save-backup-v3";
const PACK_SCHEMA = "session-save-backup-pack-v1";
const PACK_TARGET_BYTES = 4 * 1024 * 1024;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const fail = (code) => { throw new Error(`Sessions backup archive could not be verified (${code}); previous backup retained.`); };
const pathForPack = (organizationId, digest) => `backups/app-state/session-ledger/${organizationId}/${digest}.json`;

function validateManifest(snapshot, organizationId) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(organizationId) || snapshot?.schema !== SCHEMA ||
      snapshot.organizationId !== organizationId || !Number.isSafeInteger(snapshot.receiptCount) ||
      snapshot.receiptCount < 0 || snapshot.receiptCount > 100000 || !Array.isArray(snapshot.packs) ||
      snapshot.packs.length > 10000 || Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) fail("manifest");
  const entry = validateSessionSaveBackup({ schema: "session-save-backup-v1", organizationId,
    entry: snapshot.entry, receipts: [], effects: [] }, organizationId);
  let count = 0, chunks = 0;
  const hashes = new Set();
  for (const ref of snapshot.packs) {
    if (!/^[a-f0-9]{64}$/.test(ref?.sha256) || hashes.has(ref.sha256) ||
        !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_BYTES ||
        !Number.isSafeInteger(ref.chunkCount) || ref.chunkCount < 1 || ref.chunkCount > 10000 ||
        !Number.isSafeInteger(ref.receiptCount) || ref.receiptCount < ref.chunkCount ||
        ref.receiptCount > ref.chunkCount * 10) fail("pack-reference");
    hashes.add(ref.sha256);
    count += ref.receiptCount;
    chunks += ref.chunkCount;
  }
  if (count !== snapshot.receiptCount || chunks > 10000 || (!entry && count)) fail("count");
  return entry;
}

async function readPack(ref, organizationId, readObject) {
  const result = await readObject(pathForPack(organizationId, ref.sha256));
  if (!result?.ok || typeof result.payload !== "string" ||
      Buffer.byteLength(result.payload) !== ref.bytes || hash(result.payload) !== ref.sha256) fail("pack-content");
  let pack;
  try { pack = JSON.parse(result.payload); } catch { fail("pack-json"); }
  if (pack?.schema !== PACK_SCHEMA || pack.organizationId !== organizationId ||
      !Array.isArray(pack.chunks) || pack.chunks.length !== ref.chunkCount) fail("pack-scope");
  return pack;
}

// Every page is validated against the same revision before it reaches Storage.
// Packs are content-addressed, read back, and never published via latest.json here.
async function readStoredSessionSaveBackup({ readObject, writeObject }, organizationId = "global") {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(organizationId)) fail("scope");
  const packs = [];
  let chunks = [], bytes = 0;
  const flush = async () => {
    if (!chunks.length) return;
    const payload = JSON.stringify({ schema: PACK_SCHEMA, organizationId, chunks });
    const ref = { sha256: hash(payload), bytes: Buffer.byteLength(payload), chunkCount: chunks.length,
      receiptCount: chunks.reduce((sum, chunk) => sum + chunk.receiptCount, 0) };
    if (ref.bytes > MAX_BYTES) fail("pack-size");
    const written = await writeObject(pathForPack(organizationId, ref.sha256), payload);
    // An existing immutable object is acceptable only if its bytes still match.
    if (!written?.ok && ![400, 409].includes(written?.status)) fail("pack-write");
    await readPack(ref, organizationId, readObject);
    packs.push(ref);
    chunks = []; bytes = 0;
  };
  const scanned = await scanSessionSaveBackup(organizationId, async (chunk) => {
    const size = Buffer.byteLength(JSON.stringify(chunk));
    if (chunks.length && bytes + size > PACK_TARGET_BYTES) await flush();
    chunks.push(chunk); bytes += size;
  });
  await flush();
  const snapshot = { schema: SCHEMA, organizationId, entry: scanned.entry, receiptCount: scanned.receiptCount, packs };
  const entry = validateManifest(snapshot, organizationId);
  return { snapshot, entry };
}

// Validate one bounded pack at a time; never assemble the full ledger in memory.
async function validateStoredSessionSaveBackup(snapshot, readObject, organizationId = "global") {
  if (snapshot?.schema !== SCHEMA) return validateSessionSaveBackup(snapshot, organizationId);
  const entry = validateManifest(snapshot, organizationId);
  const identities = new Set();
  for (const ref of snapshot.packs) {
    const pack = await readPack(ref, organizationId, readObject);
    let count = 0;
    for (const chunk of pack.chunks) {
      const rows = decodeBackupChunk(chunk);
      validatePageRows(rows, snapshot, identities);
      count += rows.length;
    }
    if (count !== ref.receiptCount) fail("pack-count");
  }
  if (identities.size !== snapshot.receiptCount) fail("ledger-count");
  return entry;
}

module.exports = { readStoredSessionSaveBackup, validateStoredSessionSaveBackup };
