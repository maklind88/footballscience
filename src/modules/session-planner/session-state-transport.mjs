const SESSION_KEY = "football-session-planner-v3";
const ENCODING = "gzip-base64-v1";
const MAX_VALUE_BYTES = 12 * 1024 * 1024;
const MAX_ENCODED_CHARS = 4 * 1024 * 1024 - 65536;
const COMPRESSION_THRESHOLD = 256 * 1024;

export function canDecodeSessionTransport() {
  return typeof DecompressionStream === "function";
}

async function readBoundedStream(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Session data exceeds the transfer limit. Changes remain pending.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function encodeSessionTransport(key, value) {
  if (key !== SESSION_KEY || typeof value !== "string") return value;
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > MAX_VALUE_BYTES) throw new Error("Session data exceeds the storage limit. Changes remain pending.");
  if (bytes.byteLength < COMPRESSION_THRESHOLD || typeof CompressionStream !== "function" || !canDecodeSessionTransport()) return value;
  const compressed = await readBoundedStream(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    Math.floor(MAX_ENCODED_CHARS * 3 / 4)
  );
  let binary = "";
  for (let offset = 0; offset < compressed.length; offset += 8192) {
    binary += String.fromCharCode(...compressed.subarray(offset, offset + 8192));
  }
  return { encoding: ENCODING, data: btoa(binary) };
}

export async function decodeSessionTransport(key, value) {
  if (typeof value === "string" || value === undefined) return value;
  if (key !== SESSION_KEY || value?.encoding !== ENCODING || typeof value.data !== "string" ||
      !value.data.length || value.data.length > MAX_ENCODED_CHARS || value.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) {
    throw new Error("Invalid session transfer. Existing data was kept.");
  }
  const compressed = Uint8Array.from(atob(value.data), (character) => character.charCodeAt(0));
  const bytes = await readBoundedStream(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")), MAX_VALUE_BYTES
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function decodeSessionResponse(payload = {}) {
  if (payload.entries && Object.hasOwn(payload.entries, SESSION_KEY)) {
    payload.entries[SESSION_KEY] = await decodeSessionTransport(SESSION_KEY, payload.entries[SESSION_KEY]);
  }
  if (payload.key === SESSION_KEY && Object.hasOwn(payload, "value")) {
    payload.value = await decodeSessionTransport(SESSION_KEY, payload.value);
  }
  return payload;
}
