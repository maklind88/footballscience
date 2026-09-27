const { createHash } = require("node:crypto");
const { gzipSync, gunzipSync } = require("node:zlib");
const MAX_BYTES = 32 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = () => { throw new Error("Sessions backup chunk could not be verified."); };

function encodeBackupChunk(rows) {
  const raw = Buffer.from(JSON.stringify(rows));
  if (raw.length > MAX_BYTES || !Array.isArray(rows) || rows.length < 1 || rows.length > 10) fail();
  return { encoding: "gzip-base64", bytes: raw.length, sha256: digest(raw),
    receiptCount: rows.length, data: gzipSync(raw).toString("base64") };
}

function decodeBackupChunk(chunk) {
  if (chunk?.encoding !== "gzip-base64" || !Number.isSafeInteger(chunk.bytes) ||
    chunk.bytes < 1 || chunk.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(chunk.sha256) ||
    typeof chunk.data !== "string" || chunk.data.length > MAX_BYTES ||
    !Number.isSafeInteger(chunk.receiptCount) || chunk.receiptCount < 1 || chunk.receiptCount > 10) fail();
  const compressed = Buffer.from(chunk.data, "base64");
  if (compressed.toString("base64") !== chunk.data) fail();
  const raw = gunzipSync(compressed, { maxOutputLength: MAX_BYTES });
  if (raw.length !== chunk.bytes || digest(raw) !== chunk.sha256) fail();
  const rows = JSON.parse(raw.toString("utf8"));
  if (!Array.isArray(rows) || rows.length !== chunk.receiptCount) fail();
  return rows;
}

module.exports = { MAX_BYTES, encodeBackupChunk, decodeBackupChunk };
