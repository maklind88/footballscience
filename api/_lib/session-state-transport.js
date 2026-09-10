const { gzip, gunzip } = require("node:zlib");
const { promisify } = require("node:util");
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const SESSION_KEY = "football-session-planner-v3";
const ENCODING = "gzip-base64-v1";
const MAX_VALUE_BYTES = 12 * 1024 * 1024;
const MAX_ENCODED_CHARS = 4 * 1024 * 1024 - 65536;

function transportError(message, status = 400) {
  return Object.assign(new Error(message), { code: "SESSION_TRANSPORT", status });
}

async function decodeSessionStateValue(key, value) {
  if (typeof value === "string" || value === undefined) return value;
  if (key !== SESSION_KEY || value?.encoding !== ENCODING || typeof value.data !== "string" ||
      value.data.length > MAX_ENCODED_CHARS || !value.data.length ||
      value.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) {
    throw transportError("Invalid session transfer. Nothing was saved.");
  }
  try {
    const bytes = await gunzipAsync(Buffer.from(value.data, "base64"), { maxOutputLength: MAX_VALUE_BYTES });
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw transportError("Session transfer could not be decoded. Nothing was saved.", error.code === "ERR_BUFFER_TOO_LARGE" ? 413 : 400);
  }
}

function acceptsSessionTransport(req) {
  return new URL(req.url, "http://localhost").searchParams.get("sessionTransport") === ENCODING;
}

async function encodeSessionStateValue(req, key, value) {
  if (key !== SESSION_KEY || typeof value !== "string") return value;
  if (!acceptsSessionTransport(req) || Buffer.byteLength(value) < 256 * 1024) {
    if (Buffer.byteLength(JSON.stringify(value)) > 4400000) {
      throw transportError("This session needs the updated transfer format. Keep local changes and update the page before retrying.", 413);
    }
    return value;
  }
  if (Buffer.byteLength(value) > MAX_VALUE_BYTES) throw transportError("Session data exceeds the storage limit.", 413);
  const data = (await gzipAsync(value)).toString("base64");
  if (data.length > MAX_ENCODED_CHARS) throw transportError("Session data exceeds the transfer limit.", 413);
  return { encoding: ENCODING, data };
}

module.exports = { decodeSessionStateValue, encodeSessionStateValue };
