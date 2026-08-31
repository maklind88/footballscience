import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const READ_BUFFER_BYTES = 1024 * 1024;

export class TrackingFileIntegrityError extends Error {
  constructor(message, code = "TRACKING_FILE_INTEGRITY_FAILED") {
    super(message);
    this.name = "TrackingFileIntegrityError";
    this.code = code;
    this.statusCode = 409;
  }
}

function integrityError(message, code) {
  throw new TrackingFileIntegrityError(message, code);
}

function expectedHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(hash)) {
    integrityError("Tracking file checksum is unavailable.", "TRACKING_FILE_CHECKSUM_INVALID");
  }
  return hash;
}

function expectedBytes(value) {
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

function fileIdentity(stat) {
  return Object.freeze({
    device: String(stat.dev),
    inode: String(stat.ino),
    bytes: String(stat.size),
    mode: String(stat.mode),
    modifiedNs: String(stat.mtimeNs),
    changedNs: String(stat.ctimeNs),
  });
}

function sameIdentity(first = {}, second = {}) {
  return ["device", "inode", "bytes", "mode", "modifiedNs", "changedNs"]
    .every((key) => String(first[key]) === String(second[key]));
}

async function openRegularFile(filePath, options = {}) {
  let handle;
  try {
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) {
      integrityError("Tracking input is not a regular file.", "TRACKING_FILE_TYPE_UNSAFE");
    }
    const mode = Number(stat.mode);
    if (options.executable && !(mode & 0o111)) {
      integrityError("Tracking runtime is not executable.", "TRACKING_FILE_NOT_EXECUTABLE");
    }
    if (options.immutable && (mode & 0o222)) {
      integrityError("Tracking file is not sealed read-only.", "TRACKING_FILE_NOT_IMMUTABLE");
    }
    const maximumBytes = expectedBytes(options.expectedBytes);
    if (maximumBytes !== null && BigInt(maximumBytes) !== stat.size) {
      integrityError("Tracking file size does not match its sealed identity.", "TRACKING_FILE_SIZE_MISMATCH");
    }
    return { handle, stat };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof TrackingFileIntegrityError) throw error;
    integrityError("Tracking file could not be opened safely.", "TRACKING_FILE_UNAVAILABLE");
  }
}

async function hashHandle(handle, bytes) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
  let position = 0;
  while (position < bytes) {
    const length = Math.min(buffer.byteLength, bytes - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead < 1) {
      integrityError("Tracking file changed while it was verified.", "TRACKING_FILE_CHANGED");
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

export async function captureTrackingFileSeal(filePath, options = {}) {
  const hash = expectedHash(options.expectedSha256);
  const { handle, stat } = await openRegularFile(filePath, options);
  try {
    const bytes = Number(stat.size);
    if (!Number.isSafeInteger(bytes)) {
      integrityError("Tracking file is too large to verify safely.", "TRACKING_FILE_SIZE_UNSAFE");
    }
    if (options.verifyChecksum !== false && await hashHandle(handle, bytes) !== hash) {
      integrityError("Tracking file checksum does not match its sealed identity.", "TRACKING_FILE_CHECKSUM_MISMATCH");
    }
    const finalStat = await handle.stat({ bigint: true });
    if (!sameIdentity(fileIdentity(stat), fileIdentity(finalStat))) {
      integrityError("Tracking file changed while it was verified.", "TRACKING_FILE_CHANGED");
    }
    return Object.freeze({
      sha256: hash,
      bytes,
      identity: fileIdentity(finalStat),
    });
  } finally {
    await handle.close();
  }
}

export async function sealTrackingSourceFile(filePath, options = {}) {
  const hash = expectedHash(options.expectedSha256);
  const { handle, stat } = await openRegularFile(filePath, {
    expectedBytes: options.expectedBytes,
  });
  try {
    const bytes = Number(stat.size);
    if (!Number.isSafeInteger(bytes)) {
      integrityError("Tracking file is too large to verify safely.", "TRACKING_FILE_SIZE_UNSAFE");
    }
    if (options.verifyChecksum !== false && await hashHandle(handle, bytes) !== hash) {
      integrityError("Tracking file checksum does not match its sealed identity.", "TRACKING_FILE_CHECKSUM_MISMATCH");
    }
    if (Number(stat.mode) & 0o222) await handle.chmod(0o400);
    const sealedStat = await handle.stat({ bigint: true });
    const before = fileIdentity(stat);
    const sealed = fileIdentity(sealedStat);
    if (before.device !== sealed.device
      || before.inode !== sealed.inode
      || before.bytes !== sealed.bytes
      || before.modifiedNs !== sealed.modifiedNs
      || (Number(sealedStat.mode) & 0o222)) {
      integrityError("Tracking source changed while it was sealed.", "TRACKING_FILE_CHANGED");
    }
    return Object.freeze({ sha256: hash, bytes, identity: sealed });
  } finally {
    await handle.close();
  }
}

export async function verifyTrackingFileSeal(filePath, seal = {}, options = {}) {
  const current = await captureTrackingFileSeal(filePath, {
    expectedSha256: seal.sha256,
    expectedBytes: seal.bytes,
    verifyChecksum: false,
    immutable: options.immutable !== false,
    executable: options.executable === true,
  });
  if (!sameIdentity(current.identity, seal.identity)) {
    integrityError("Tracking file changed after it was sealed.", "TRACKING_FILE_CHANGED");
  }
  return current;
}

export const _private = Object.freeze({ fileIdentity, sameIdentity });
