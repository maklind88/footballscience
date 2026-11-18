// Encoder for the disabled compact history candidate. Existing reader owns decoding.
const encoder = new TextEncoder();
const byteStream = bytes => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
async function collect(stream, limit) {
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('Stream size limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export const maxPlainBytes = 8 * 1024 * 1024;
export const bytesEqual = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array &&
  a.length === b.length && a.every((value, index) => value === b[index]);
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function assertJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0))) return;
  if (typeof value !== 'object' || ancestors.has(value) ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) throw new Error('Unsupported JSON value');
  ancestors.add(value);
  if (Array.isArray(value) && (Object.keys(value).length !== value.length ||
      Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))
    throw new Error('Sparse or extended array');
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Unsupported JSON property');
    assertJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}
export function serialize(value) {
  assertJson(value);
  const text = JSON.stringify(value);
  if (encoder.encode(text).length > maxPlainBytes) throw new Error('Snapshot size limit');
  return text;
}
export async function pack(text) {
  const plain = encoder.encode(text);
  if (plain.length > maxPlainBytes) throw new Error('Snapshot size limit');
  const compressed = await collect(byteStream(plain).pipeThrough(new CompressionStream('gzip')), maxPlainBytes + 65536);
  const codec = compressed.length < plain.length ? 'gzip' : 'raw';
  const bytes = codec === 'gzip' ? compressed : plain;
  return { codec, bytes, rawLength: plain.length, plainDigest: await digest(plain), encodedDigest: await digest(bytes) };
}
