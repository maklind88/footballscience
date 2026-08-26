import { canonicalDigest, canonicalJson, invariant } from "./leaderboard-production-release-security.mjs";
import { assertManifestBlob, sourceRequestFiles } from "./leaderboard-production-source-manifest.mjs";
import { assertRateHeaders } from "./leaderboard-production-vercel-transport.mjs";

export function assertSourceRequestFiles(manifest, baseline) {
  invariant(baseline?.vercel?.filesApi?.source?.requestFilesSha256 === "291c00107b9d17c93c830a78deb8ebd0f3fec82d3e261c432c6bf04549c40238", "Frozen Vercel source-request baseline drifted.");
  const files = sourceRequestFiles(manifest);
  invariant(files.length === baseline.vercel.filesApi.source.projectedCount, "Vercel source request cardinality drifted.");
  const actualDigest = canonicalDigest(files);
  invariant(actualDigest === baseline.vercel.filesApi.source.requestFilesSha256, "Vercel source request canonical SHA256 drifted.");
  invariant(Buffer.byteLength(`${canonicalJson(files)}\n`, "utf8") === baseline.vercel.filesApi.source.requestFilesBytes, "Vercel source request canonical byte length drifted.");
  invariant(deploymentContentResponseLimit(baseline.vercel.filesApi.source.largestFile.size) === baseline.vercel.filesApi.source.largestFile.contentResponseLimit, "Frozen largest-file response bound drifted.");
  for (const row of files) {
    invariant(canonicalJson(Object.keys(row).sort()) === canonicalJson(["file", "sha", "size"]), "Vercel source request row allowlist drifted.");
    invariant(typeof row.file === "string" && /^[0-9a-f]{40}$/.test(row.sha) && Number.isSafeInteger(row.size) && row.size >= 0, "Vercel source request row was malformed.");
  }
  return files;
}

export function assertUploadResponse(result) {
  invariant(result?.status === 200 && result.headers && result.payload && typeof result.payload === "object" && !Array.isArray(result.payload), "Vercel file upload response was malformed.");
  const keys = Object.keys(result.payload).sort();
  invariant(keys.length === 0 || canonicalJson(keys) === canonicalJson(["urls"]), "Vercel file upload response contained unexpected fields.");
  if (keys.length) invariant(Array.isArray(result.payload.urls) && result.payload.urls.every((url) => typeof url === "string" && url.length <= 2048), "Vercel file upload URLs were malformed.");
  assertRateHeaders(result.headers);
  return true;
}

export function uniqueUploadRows(manifest, baseline) {
  const byDigest = new Map();
  for (const row of manifest.files) {
    const existing = byDigest.get(row.sha);
    if (existing) invariant(existing.size === row.size && existing.sha256 === row.sha256 && existing.gitBlob === row.gitBlob, "Raw SHA1 upload deduplication was not byte-identical.");
    else byDigest.set(row.sha, row);
  }
  const rows = [...byDigest.values()].sort((left, right) => left.sha.localeCompare(right.sha));
  invariant(rows.length === baseline.vercel.filesApi.source.uniqueUploadCount && rows.reduce((total, row) => total + row.size, 0) === baseline.vercel.filesApi.source.uniqueUploadBytes, "Vercel unique upload count/bytes drifted.");
  const canary = rows.find(({ file }) => file === baseline.vercel.filesApi.source.canary.file);
  invariant(canary && canonicalJson(canary) === canonicalJson(baseline.vercel.filesApi.source.canary), "Vercel upload canary drifted.");
  return [canary, ...rows.filter((row) => row !== canary)];
}

export async function uploadSourceFiles({ repoDir, manifest, baseline, upload }) {
  invariant(typeof upload === "function", "Vercel upload transport was missing.");
  const rows = uniqueUploadRows(manifest, baseline);
  invariant(rows.length > 1, "Vercel source upload did not contain a canary plus bulk set.");
  let uploaded = 0;
  for (const [index, row] of rows.entries()) {
    const bytes = assertManifestBlob(repoDir, row);
    const result = await upload({ row, bytes, phase: index === 0 ? "canary" : "bulk" });
    assertUploadResponse(result);
    uploaded += 1;
  }
  return { canary: 1, bulk: uploaded - 1, uniqueDigests: uploaded };
}

function regularMode(value) { return value === "100644" || value === 100644 || value === 33188; }

function safeRemoteName(value) {
  return typeof value === "string" && value.length > 0 && value === value.normalize("NFC") && !value.includes("/") && value !== "." && value !== ".." && !/[\\\x00-\x1f\x7f]/.test(value);
}

export function flattenDeploymentFiles(payload) {
  const roots = Array.isArray(payload) ? payload : payload?.files;
  invariant(Array.isArray(roots), "Vercel deployment files response was malformed.");
  const files = [];
  const visit = (nodes, prefix = "") => {
    invariant(Array.isArray(nodes), "Vercel deployment file children were malformed.");
    for (const node of nodes) {
      invariant(node && typeof node === "object" && !Array.isArray(node) && safeRemoteName(node.name), "Vercel deployment file node was malformed or unsafe.");
      const file = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === "directory") {
        invariant(Array.isArray(node.children) && node.uid === undefined, "Vercel deployment directory schema drifted.");
        visit(node.children, file);
      } else {
        invariant(node.type === "file" && regularMode(node.mode) && typeof node.uid === "string" && /^[A-Za-z0-9._-]+$/.test(node.uid), "Vercel deployment entry was not a regular file.");
        invariant(node.children === undefined, "Vercel deployment file unexpectedly had children.");
        invariant(node.size === undefined || (Number.isSafeInteger(node.size) && node.size >= 0), "Vercel deployment file size was malformed.");
        files.push({ file, uid: node.uid, mode: "100644", size: node.size });
      }
    }
  };
  visit(roots);
  invariant(new Set(files.map(({ file }) => file)).size === files.length, "Vercel deployment files contained duplicate paths.");
  return files.sort((left, right) => Buffer.compare(Buffer.from(left.file), Buffer.from(right.file)));
}

export function assertDeploymentFileTree(payload, manifest) {
  const remote = flattenDeploymentFiles(payload);
  invariant(remote.length === manifest.files.length, "Vercel deployment file cardinality drifted.");
  for (let index = 0; index < remote.length; index += 1) {
    const expected = manifest.files[index]; const actual = remote[index];
    invariant(actual.file === expected.file && (actual.size === undefined || Number(actual.size) === expected.size), `Vercel deployment file tree drifted at ${expected.file}.`);
  }
  return remote;
}

export function decodeDeploymentFileContent(response) {
  invariant(response?.status === 200 && Buffer.isBuffer(response.bytes) && response.headers, "Vercel deployment file-content response was malformed.");
  const contentType = (response.headers.get("content-type") || "").trim().toLowerCase();
  if (/^application\/octet-stream(?:\s*;\s*[a-z0-9!#$%&'*+.^_`|~-]+=[a-z0-9!#$%&'*+.^_`|~-]+)*$/.test(contentType)) return response.bytes;
  invariant(/^application\/json(?:\s*;\s*charset=[a-z0-9._-]+)?$/.test(contentType), "Vercel deployment file-content encoding was unknown.");
  let payload;
  try { payload = JSON.parse(response.bytes.toString("utf8")); } catch { throw new Error("Vercel deployment file-content JSON was malformed."); }
  invariant(payload && canonicalJson(Object.keys(payload).sort()) === canonicalJson(["data", "encoding"]) && payload.encoding === "base64" && typeof payload.data === "string", "Vercel deployment file-content encoding was unknown.");
  const decoded = Buffer.from(payload.data, "base64");
  invariant(decoded.toString("base64").replace(/=+$/, "") === payload.data.replace(/=+$/, ""), "Vercel deployment file-content base64 was malformed.");
  return decoded;
}

export function deploymentContentResponseLimit(expectedSize) {
  invariant(Number.isSafeInteger(expectedSize) && expectedSize >= 0, "Expected deployment file size was invalid.");
  const base64Bytes = 4 * Math.ceil(expectedSize / 3);
  const limit = Math.max(expectedSize, base64Bytes + 4096);
  invariant(Number.isSafeInteger(limit) && limit <= 64 * 1024 * 1024, "Expected deployment file exceeded the reviewed response bound.");
  return limit;
}

export async function verifyDeploymentFileContents({ remoteFiles, manifest, loadContent, hash }) {
  invariant(remoteFiles.length === manifest.files.length && typeof loadContent === "function" && typeof hash === "function", "Vercel deployment content verifier inputs drifted.");
  for (let index = 0; index < remoteFiles.length; index += 1) {
    const expected = manifest.files[index];
    invariant(remoteFiles[index]?.file === expected.file, "Vercel deployment content path/order drifted.");
    const response = await loadContent(remoteFiles[index], expected, deploymentContentResponseLimit(expected.size));
    const bytes = decodeDeploymentFileContent(response);
    invariant(bytes.length === expected.size && hash("sha1", bytes) === expected.sha && hash("sha256", bytes) === expected.sha256, `Vercel deployment file contents drifted at ${expected.file}.`);
  }
  return { verified: manifest.files.length, contentProtocol: "v8-file-id" };
}
