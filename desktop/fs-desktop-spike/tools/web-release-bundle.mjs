import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const WEB_BUNDLE_SCHEMA = "fs-desktop-web-bundle-v1";
export const WEB_BUNDLE_CONTENT_TYPE = "application/vnd.footballscience.web-bundle";
export const WEB_BUNDLE_MAGIC = Buffer.from("FSWEBPK1", "ascii");
export const WEB_BUNDLE_MAX_FILES = 4_096;
export const WEB_BUNDLE_MAX_HEADER_BYTES = 2 * 1024 * 1024;
export const WEB_BUNDLE_MAX_FILE_BYTES = 24 * 1024 * 1024;
export const WEB_BUNDLE_MAX_TOTAL_BYTES = 128 * 1024 * 1024;

const ROOT_RUNTIME_FILE = /^(?:index\.html|manifest\.webmanifest|[^/]+\.(?:css|js))$/;
const TREE_RUNTIME_FILE = /^(?:src|assets)\/.+\.(?:cjs|css|html|jpg|jpeg|js|json|mjs|png|svg|webmanifest|woff2)$/i;
const CONTENT_TYPES = new Map([
  [".cjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSafeBundlePath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > 240) {
    throw new Error("Web bundle path length is invalid.");
  }
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new Error(`Unsafe web bundle path: ${path}`);
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe web bundle path: ${path}`);
  }
}

function contentTypeFor(path) {
  const contentType = CONTENT_TYPES.get(extname(path).toLowerCase());
  if (!contentType) throw new Error(`Unsupported desktop web asset type: ${path}`);
  return contentType;
}

function trackedRuntimePaths(repositoryRoot) {
  const result = spawnSync("git", ["ls-files", "-z", "--", "index.html", "manifest.webmanifest", "*.css", "*.js", "src", "assets"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString("utf8") || "Unable to enumerate tracked web runtime files.");
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => ROOT_RUNTIME_FILE.test(path) || TREE_RUNTIME_FILE.test(path))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function collectWebReleaseFiles({ repositoryRoot, virtualFiles = new Map() }) {
  const root = resolve(repositoryRoot);
  const entries = new Map();
  for (const path of trackedRuntimePaths(root)) {
    assertSafeBundlePath(path);
    const source = resolve(root, path);
    if (!source.startsWith(`${root}${sep}`)) throw new Error(`Runtime asset escaped repository root: ${path}`);
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Runtime asset must be a regular tracked file: ${path}`);
    entries.set(path, readFileSync(source));
  }
  for (const [path, value] of virtualFiles) {
    assertSafeBundlePath(path);
    if (entries.has(path)) throw new Error(`Virtual desktop asset collides with tracked runtime file: ${path}`);
    entries.set(path, Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
  }
  for (const required of ["index.html", "app.js", "app-runtime.js", "styles.css", "platform-auth-boot.js"]) {
    if (!entries.has(required)) throw new Error(`Required web runtime asset is missing: ${required}`);
  }
  return entries;
}

export function externalizeInlineScripts(indexBytes) {
  const generated = new Map();
  const source = indexBytes.toString("utf8");
  let count = 0;
  const html = source.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, rawAttributes, body) => {
    if (/\bsrc\s*=/i.test(rawAttributes) || !body.trim()) return match;
    const digest = sha256(Buffer.from(body, "utf8")).slice(0, 16);
    // Keep generated classic/module scripts at the document root so relative
    // dynamic imports retain the same base URL as the original inline script.
    const path = `desktop-inline-${String(++count).padStart(2, "0")}-${digest}.js`;
    generated.set(path, Buffer.from(`${body.trim()}\n`, "utf8"));
    return `<script${rawAttributes} src="${path}"></script>`;
  });
  if (count < 1 || /<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(html)) {
    throw new Error("Desktop index transformation did not externalize every inline script.");
  }
  return { html: Buffer.from(html, "utf8"), generated };
}

export function injectDesktopBootstrap(indexBytes, scriptPaths) {
  const source = indexBytes.toString("utf8");
  const marker = "<head>";
  if (!source.includes(marker)) throw new Error("Desktop index is missing a head element.");
  const tags = scriptPaths.map((path) => `<script src="${path}"></script>`).join("\n    ");
  return Buffer.from(source.replace(marker, `${marker}\n    ${tags}`), "utf8");
}

export function buildWebReleaseBundle({ repositoryRoot, virtualFiles = new Map(), bootstrapScripts = [] }) {
  const files = collectWebReleaseFiles({ repositoryRoot, virtualFiles });
  const externalized = externalizeInlineScripts(files.get("index.html"));
  files.set("index.html", injectDesktopBootstrap(externalized.html, bootstrapScripts));
  for (const [path, bytes] of externalized.generated) {
    if (files.has(path)) throw new Error(`Generated desktop script collides with runtime file: ${path}`);
    files.set(path, bytes);
  }
  const paths = [...files.keys()].sort((left, right) => left.localeCompare(right, "en"));
  if (paths.length < 5 || paths.length > WEB_BUNDLE_MAX_FILES) {
    throw new Error("Desktop web bundle file count is outside its safety boundary.");
  }
  const payloads = [];
  const index = [];
  let offset = 0;
  for (const path of paths) {
    assertSafeBundlePath(path);
    const bytes = files.get(path);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > WEB_BUNDLE_MAX_FILE_BYTES) {
      throw new Error(`Desktop web asset size is outside its safety boundary: ${path}`);
    }
    index.push({
      path,
      sha256: sha256(bytes),
      bytes: bytes.length,
      offset,
      contentType: contentTypeFor(path),
    });
    payloads.push(bytes);
    offset += bytes.length;
    if (offset > WEB_BUNDLE_MAX_TOTAL_BYTES) throw new Error("Desktop web bundle exceeds its unpacked byte boundary.");
  }
  const header = Buffer.from(JSON.stringify({ schema: WEB_BUNDLE_SCHEMA, files: index }), "utf8");
  if (header.length > WEB_BUNDLE_MAX_HEADER_BYTES) throw new Error("Desktop web bundle index exceeds its byte boundary.");
  const prefix = Buffer.alloc(WEB_BUNDLE_MAGIC.length + 4);
  WEB_BUNDLE_MAGIC.copy(prefix, 0);
  prefix.writeUInt32BE(header.length, WEB_BUNDLE_MAGIC.length);
  const bytes = Buffer.concat([prefix, header, ...payloads]);
  return {
    bytes,
    contract: {
      schema: WEB_BUNDLE_SCHEMA,
      indexSha256: sha256(header),
      fileCount: index.length,
      unpackedBytes: offset,
    },
  };
}

export function parseWebReleaseBundle(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < WEB_BUNDLE_MAGIC.length + 4) throw new Error("Web bundle is truncated.");
  if (!bytes.subarray(0, WEB_BUNDLE_MAGIC.length).equals(WEB_BUNDLE_MAGIC)) throw new Error("Web bundle magic is invalid.");
  const headerLength = bytes.readUInt32BE(WEB_BUNDLE_MAGIC.length);
  if (headerLength < 1 || headerLength > WEB_BUNDLE_MAX_HEADER_BYTES) throw new Error("Web bundle index length is invalid.");
  const payloadStart = WEB_BUNDLE_MAGIC.length + 4 + headerLength;
  if (payloadStart > bytes.length) throw new Error("Web bundle index is truncated.");
  const header = bytes.subarray(WEB_BUNDLE_MAGIC.length + 4, payloadStart);
  let decoded;
  try {
    decoded = JSON.parse(header.toString("utf8"));
  } catch {
    throw new Error("Web bundle index is malformed.");
  }
  if (decoded?.schema !== WEB_BUNDLE_SCHEMA || !Array.isArray(decoded.files)) throw new Error("Web bundle schema is unsupported.");
  if (decoded.files.length < 5 || decoded.files.length > WEB_BUNDLE_MAX_FILES) throw new Error("Web bundle file count is invalid.");
  const files = new Map();
  let expectedOffset = 0;
  for (const entry of decoded.files) {
    assertSafeBundlePath(entry?.path);
    if (files.has(entry.path)) throw new Error(`Duplicate web bundle path: ${entry.path}`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > WEB_BUNDLE_MAX_FILE_BYTES) {
      throw new Error(`Web bundle file size is invalid: ${entry.path}`);
    }
    if (!Number.isSafeInteger(entry.offset) || entry.offset !== expectedOffset) throw new Error("Web bundle offsets are non-canonical.");
    if (entry.contentType !== contentTypeFor(entry.path)) throw new Error(`Web bundle content type is invalid: ${entry.path}`);
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Web bundle SHA-256 is invalid.");
    const end = payloadStart + entry.offset + entry.bytes;
    if (end > bytes.length) throw new Error(`Web bundle payload is truncated: ${entry.path}`);
    const body = bytes.subarray(payloadStart + entry.offset, end);
    if (sha256(body) !== entry.sha256) throw new Error(`Web bundle asset integrity failed: ${entry.path}`);
    files.set(entry.path, { ...entry, body });
    expectedOffset += entry.bytes;
    if (expectedOffset > WEB_BUNDLE_MAX_TOTAL_BYTES) throw new Error("Web bundle exceeds its unpacked byte boundary.");
  }
  if (payloadStart + expectedOffset !== bytes.length) throw new Error("Web bundle contains trailing or unindexed bytes.");
  return { indexSha256: sha256(header), files, unpackedBytes: expectedOffset };
}
