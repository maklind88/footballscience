import { canonicalJson, invariant } from "./leaderboard-production-release-security.mjs";

export const VERCEL_API_ORIGIN = "https://api.vercel.com";
const allowedMethods = new Set(["GET", "POST", "PATCH"]);
const responseLimit = 2 * 1024 * 1024;
const absoluteResponseLimit = 64 * 1024 * 1024;
const proxyEnvironmentNames = ["ALL_PROXY", "GLOBAL_AGENT_HTTP_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NODE_USE_ENV_PROXY", "NO_PROXY", "all_proxy", "http_proxy", "https_proxy", "no_proxy", "npm_config_https_proxy", "npm_config_proxy"];

export class VercelRequestError extends Error {
  constructor(message, kind, status = null) { super(message); this.name = "VercelRequestError"; this.kind = kind; this.status = status; }
}

export function assertNoProxyEnvironment(source = process.env, execArgv = process.execArgv) {
  const hasProxyFlag = (value) => String(value || "").replaceAll("_", "-").includes("--use-env-proxy");
  invariant(Array.isArray(execArgv) && !proxyEnvironmentNames.some((name) => String(source?.[name] || "")) && !hasProxyFlag(source?.NODE_OPTIONS) && !execArgv.some(hasProxyFlag), "Vercel API transport forbids proxy environment or runtime overrides.");
  return true;
}

export function vercelApiUrl(pathname, query = {}) {
  invariant(typeof pathname === "string" && pathname.startsWith("/") && !pathname.startsWith("//") && !/[\r\n\0?#]/.test(pathname), "Vercel API path was invalid.");
  const url = new URL(pathname, VERCEL_API_ORIGIN);
  invariant(url.origin === VERCEL_API_ORIGIN && url.username === "" && url.password === "", "Vercel API origin escaped the canonical host.");
  for (const [key, value] of Object.entries(query)) {
    invariant(/^[A-Za-z][A-Za-z0-9]*$/.test(key) && (typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value) && Number.isFinite(value))), "Vercel API query schema drifted.");
    url.searchParams.set(key, String(value));
  }
  return url;
}

function assertBearer(token) {
  invariant(typeof token === "string" && token.length >= 8 && token.length <= 4096 && !/[\r\n\0]/.test(token), "Vercel credential was missing or malformed.");
}

export function assertExactHeaders(headers, expectedNames) {
  invariant(headers && Object.getPrototypeOf(headers) === Object.prototype, "Vercel request headers were malformed.");
  const actual = Object.keys(headers);
  const normalized = actual.map((name) => name.toLowerCase());
  const expected = [...expectedNames].map((name) => name.toLowerCase());
  invariant(new Set(normalized).size === normalized.length, "Vercel request contained case-conflicting duplicate headers.");
  invariant(new Set(expected).size === expected.length, "Vercel expected-header contract contained duplicates.");
  invariant(canonicalJson(normalized.sort()) === canonicalJson(expected.sort()), "Vercel request header names drifted.");
  for (const [name, value] of Object.entries(headers)) {
    invariant(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && !/^['"].*['"]$/.test(name), "Vercel request used a quoted or invalid header name.");
    invariant(typeof value === "string" && !/[\r\n\0]/.test(value), "Vercel request header value contained control bytes.");
  }
  return headers;
}

async function boundedBytes(response, limit) {
  const declared = response.headers.get("content-length");
  if (declared !== null) invariant(/^\d+$/.test(declared) && Number(declared) <= limit, "Vercel response exceeded the bounded body size.");
  if (!response.body) return Buffer.alloc(0);
  const chunks = []; let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    invariant(total <= limit, "Vercel response exceeded the bounded body size.");
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export async function vercelRequest({ pathname, query = {}, method = "GET", token, json, bytes, headers = {}, expectedStatus, maxBytes = responseLimit, responseType = "json", jsonShape = "object", label = "Vercel API request", fetchImpl = fetch }) {
  assertNoProxyEnvironment();
  assertBearer(token);
  invariant(allowedMethods.has(method) && typeof fetchImpl === "function", "Vercel request method/transport was invalid.");
  invariant((responseType === "json" || responseType === "bytes") && (jsonShape === "object" || jsonShape === "any"), "Vercel response contract was invalid.");
  invariant((json === undefined) !== (bytes === undefined) || (json === undefined && bytes === undefined), "Vercel request body type was ambiguous.");
  invariant(Number.isSafeInteger(maxBytes) && maxBytes >= 0 && maxBytes <= absoluteResponseLimit, "Vercel response bound was invalid.");
  invariant(method === "GET" ? json === undefined && bytes === undefined : json !== undefined || bytes !== undefined, "Vercel method/body contract drifted.");
  const accepted = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  invariant(accepted.length > 0 && accepted.every((status) => Number.isInteger(status) && status >= 200 && status < 300), "Vercel expected status was invalid.");
  let body;
  if (json !== undefined) body = Buffer.from(`${canonicalJson(json)}\n`, "utf8");
  if (bytes !== undefined) { invariant(Buffer.isBuffer(bytes), "Vercel binary request body was invalid."); body = bytes; }
  const bodyHeaders = json !== undefined ? { "Content-Type": "application/json" } : {};
  const fixed = { Accept: responseType === "json" ? "application/json" : "application/octet-stream", Authorization: `Bearer ${token}`, ...bodyHeaders, ...headers };
  assertExactHeaders(fixed, ["Accept", "Authorization", ...Object.keys(bodyHeaders), ...Object.keys(headers)]);
  let response;
  try {
    response = await fetchImpl(vercelApiUrl(pathname, query), { method, headers: fixed, body, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new VercelRequestError(`${label} transport failed; outcome is unknown and must not be retried.`, "transport");
  }
  invariant(response && Number.isInteger(response.status), `${label} returned a malformed response.`);
  if (response.status >= 300 && response.status < 400) throw new VercelRequestError(`${label} returned a forbidden redirect.`, "redirect", response.status);
  if (!accepted.includes(response.status)) throw new VercelRequestError(`${label} returned status ${response.status}; no retry is allowed.`, "status", response.status);
  const payloadBytes = await boundedBytes(response, maxBytes);
  if (responseType === "bytes") return { status: response.status, headers: response.headers, bytes: payloadBytes };
  const contentType = (response.headers.get("content-type") || "").trim();
  invariant(/^application\/json(?:\s*;\s*charset=[A-Za-z0-9._-]+)?$/i.test(contentType), `${label} returned a non-JSON content type.`);
  let payload;
  try { payload = payloadBytes.length ? JSON.parse(payloadBytes.toString("utf8")) : {}; } catch { throw new VercelRequestError(`${label} returned malformed JSON.`, "invalid-json", response.status); }
  invariant(payload && typeof payload === "object" && (jsonShape === "any" || !Array.isArray(payload)), `${label} returned malformed JSON.`);
  return { status: response.status, headers: response.headers, payload, requestBytes: body };
}

export function assertRateHeaders(headers) {
  const remaining = headers.get("x-ratelimit-remaining");
  if (remaining === null) return { remaining: null };
  invariant(/^\d+$/.test(remaining), "Vercel rate-limit header was malformed.");
  invariant(Number(remaining) > 0, "Vercel rate limit was exhausted; no further mutation is allowed.");
  return { remaining: Number(remaining) };
}
