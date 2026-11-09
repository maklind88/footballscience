// Read-only codec. No writer, database creation, retention or repair.
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
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function unpack(packet) {
  if (!packet || !['gzip', 'raw'].includes(packet.codec) || !(packet.bytes instanceof Uint8Array) ||
      !Number.isSafeInteger(packet.rawLength) || packet.rawLength < 0 || packet.rawLength > maxPlainBytes ||
      packet.bytes.length > maxPlainBytes || await digest(packet.bytes) !== packet.encodedDigest) throw new Error('Corrupt packet');
  const stream = byteStream(packet.bytes);
  const bytes = await collect(packet.codec === 'gzip' ? stream.pipeThrough(new DecompressionStream('gzip')) : stream, packet.rawLength);
  if (bytes.length !== packet.rawLength || await digest(bytes) !== packet.plainDigest) throw new Error('Corrupt contents');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
