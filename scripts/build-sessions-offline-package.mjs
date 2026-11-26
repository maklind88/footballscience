import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "/sessions-offline-shell.html";
const manifestName = "sessions-offline-package.json";
const digest = value => createHash("sha256").update(value).digest("hex");

function codePath(path) {
  return [entry, "/styles.css", "/platform-feedback.css", "/session-planner-overrides.css"].includes(path) ||
    /^\/(?:src|assets)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:mjs|js|css|json|png|svg|webp|gif|woff2)$/.test(path);
}

function localReference(source, reference) {
  if (!/\.m?js$/.test(source) && (reference.startsWith("data:") || reference.startsWith("#"))) return "";
  if (/\.m?js$/.test(source) && !/^\.\.?\//.test(reference)) {
    throw new Error("Offline assets must use relative references: " + reference);
  }
  if (reference.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(reference) || /[\\%\s]/.test(reference)) {
    throw new Error("Offline assets must use relative references: " + reference);
  }
  const local = resolveOfflineReference(source, reference);
  if (!codePath(local)) throw new Error("Unexpected Sessions offline dependency: " + local);
  return local;
}

function resolveOfflineReference(source, reference) {
  return posix.resolve(dirname(source), reference.split(/[?#]/, 1)[0]);
}

function references(path, source) {
  if (path.endsWith(".html")) {
    if (!/<head(?:\s[^>]*)?>/i.test(source) || /<base(?:\s|>)/i.test(source)) {
      throw new Error("Sessions offline HTML needs a head and reserves the base element for the worker.");
    }
    return [...source.matchAll(/<(?:link|script|img)\b([^>]*)>/gi)].map(([, attributes]) => {
      const reference = attributes.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!reference) throw new Error("Sessions offline HTML requires quoted script, stylesheet, and image references.");
      return reference;
    });
  }
  if (path.endsWith(".css")) {
    return [
      ...source.matchAll(/\burl\(\s*["']?([^"'()\s]+)["']?\s*\)/gi),
      ...source.matchAll(/@import\s+["']([^"']+)["']/gi),
    ].map(([, reference]) => reference);
  }
  if (!/\.m?js$/.test(path)) return [];
  const importCalls = [...source.matchAll(/\bimport\s*\(\s*([^)]*)/g)];
  if (importCalls.some(([, expression]) => !/^\s*(?:"[^"]+"|'[^']+')\s*$/.test(expression))) {
    throw new Error("Offline module has a dynamic dependency without a literal path: " + path);
  }
  return [...source.matchAll(/\b(?:from\s+|import\s*\(\s*|import\s*)["']([^"'\r\n]+)["']/g)].map(([, reference]) => reference);
}

export async function buildSessionsOfflinePackage({ directory = root, overrides = new Map() } = {}) {
  const files = new Map();
  async function add(path) {
    if (files.has(path)) return;
    const bytes = overrides.get(path) ?? await readFile(resolve(directory, "." + path));
    const body = Buffer.from(bytes);
    files.set(path, body);
    for (const reference of references(path, body.toString("utf8"))) {
      const dependency = localReference(path, reference);
      if (dependency) await add(dependency);
    }
  }
  await add(entry);
  const assets = [...files.keys()].sort().map(path => ({ path, bytes: files.get(path).length, sha256: digest(files.get(path)) }));
  const content = { schema: 1, assets };
  const packageId = digest(JSON.stringify(content));
  return { packageId, files, manifest: { ...content, packageId } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { output: { type: "string", default: resolve(root, manifestName) } } });
  const built = await buildSessionsOfflinePackage();
  await writeFile(values.output, JSON.stringify(built.manifest, null, 2) + "\n");
  console.log(JSON.stringify({ packageId: built.packageId, files: built.files.size,
    bytes: built.manifest.assets.reduce((total, asset) => total + asset.bytes, 0) }));
}
