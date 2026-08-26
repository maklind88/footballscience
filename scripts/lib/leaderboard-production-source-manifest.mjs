import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalDigest, canonicalJson, childEnvironment, invariant } from "./leaderboard-production-release-security.mjs";

const manifestSchema = "footballscience-leaderboard-vercel-source-manifest-v1";
const sha1 = (value) => crypto.createHash("sha1").update(value).digest("hex");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const gitBlobSha1 = (value) => crypto.createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");

function gitBytes(repoDir, args, input) {
  const safeRoot = path.resolve(repoDir);
  const result = spawnSync("git", ["-c", `safe.directory=${safeRoot}`, ...args], {
    cwd: safeRoot,
    env: childEnvironment({ GIT_NO_REPLACE_OBJECTS: "1" }),
    input,
    encoding: null,
    maxBuffer: 96 * 1024 * 1024,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  invariant(!result.error && result.status === 0 && Buffer.isBuffer(result.stdout), "Immutable Git object read failed.");
  return result.stdout;
}

function strictUtf8Path(bytes) {
  const value = bytes.toString("utf8");
  invariant(Buffer.from(value, "utf8").equals(bytes), "Git tree path was not canonical UTF-8.");
  invariant(value === value.normalize("NFC"), "Git tree path was not NFC-normalized.");
  invariant(value && !path.posix.isAbsolute(value) && !value.includes("\\") && !value.includes("\0"), "Git tree path was not a relative POSIX path.");
  invariant(!value.split("/").some((part) => !part || part === "." || part === ".."), "Git tree path contained traversal or an empty component.");
  invariant(!/[\x00-\x1f\x7f]/.test(value), "Git tree path contained a control byte.");
  return value;
}

export function parseGitTree(bytes) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.at(-1) === 0, "Git tree output was not NUL-terminated.");
  const rows = [];
  for (let start = 0; start < bytes.length - 1;) {
    const end = bytes.indexOf(0, start);
    invariant(end > start, "Git tree contained an empty or unterminated record.");
    const record = bytes.subarray(start, end);
    const separator = record.indexOf(9);
    invariant(separator > 0, "Git tree record omitted its path separator.");
    const header = record.subarray(0, separator).toString("ascii");
    const match = header.match(/^(\d{6}) ([a-z]+) ([0-9a-f]{40})$/);
    invariant(match, "Git tree record schema drifted.");
    invariant(match[1] === "100644" && match[2] === "blob", "Git tree contained a forbidden object mode or type.");
    rows.push({ mode: match[1], type: match[2], gitBlob: match[3], file: strictUtf8Path(record.subarray(separator + 1)) });
    start = end + 1;
  }
  invariant(new Set(rows.map(({ file }) => file)).size === rows.length, "Git tree contained duplicate paths.");
  return rows;
}

export function parseIgnoreProjection(bytes, expectedPatterns) {
  const text = bytes.toString("utf8");
  invariant(Buffer.from(text, "utf8").equals(bytes) && !text.includes("\r"), ".vercelignore encoding drifted.");
  const patterns = text.split("\n").filter(Boolean);
  invariant(canonicalJson(patterns) === canonicalJson(expectedPatterns), ".vercelignore patterns drifted from the reviewed projection.");
  invariant(patterns.every((item) => !item.startsWith("!") && !item.startsWith("/") && !/[\x00-\x1f\x7f]/.test(item)), ".vercelignore used an unsupported rule.");
  return patterns;
}

export function isProjectedPath(file, patterns) {
  for (const pattern of patterns) {
    if (pattern === ".env.*") {
      if (/^\.env\..+/.test(file)) return false;
    } else if (file === pattern || file.startsWith(`${pattern}/`)) return false;
  }
  return true;
}

export function readGitBlob(repoDir, gitBlob) {
  invariant(/^[0-9a-f]{40}$/.test(gitBlob), "Git blob identity was invalid.");
  const type = gitBytes(repoDir, ["cat-file", "-t", gitBlob]).toString("ascii").trim();
  invariant(type === "blob", "Git object type was not blob.");
  const bytes = gitBytes(repoDir, ["cat-file", "blob", gitBlob]);
  invariant(gitBlobSha1(bytes) === gitBlob, "Git object bytes did not match the requested blob identity.");
  return bytes;
}

export function buildSourceManifest(repoDir, releaseBaseline) {
  const candidate = releaseBaseline.candidate;
  const expected = releaseBaseline.vercel.filesApi.source;
  const tree = gitBytes(repoDir, ["rev-parse", `${candidate.sha}^{tree}`]).toString("ascii").trim();
  invariant(tree === candidate.tree, "Candidate commit did not resolve to the reviewed tree.");
  const full = parseGitTree(gitBytes(repoDir, ["ls-tree", "-rz", "--full-tree", candidate.sha]));
  invariant(full.length === expected.trackedCount, "Candidate tracked-file count drifted.");
  for (const row of full) invariant(row.mode === "100644" && row.type === "blob", `Candidate contained a forbidden Git entry at ${row.file}.`);
  const ignoreEntry = full.find(({ file }) => file === ".vercelignore");
  invariant(ignoreEntry, "Candidate omitted .vercelignore.");
  const ignoreBytes = readGitBlob(repoDir, ignoreEntry.gitBlob);
  invariant(sha256(ignoreBytes) === expected.ignoreSha256, ".vercelignore bytes drifted.");
  const patterns = parseIgnoreProjection(ignoreBytes, expected.ignorePatterns);
  const files = [];
  let totalBytes = 0;
  for (const entry of full.filter(({ file }) => isProjectedPath(file, patterns))) {
    const bytes = readGitBlob(repoDir, entry.gitBlob);
    invariant(gitBlobSha1(bytes) === entry.gitBlob, `Git blob identity drifted at ${entry.file}.`);
    const row = { file: entry.file, sha: sha1(bytes), size: bytes.length, sha256: sha256(bytes), gitBlob: entry.gitBlob };
    files.push(row);
    totalBytes += row.size;
  }
  files.sort((left, right) => Buffer.compare(Buffer.from(left.file), Buffer.from(right.file)));
  const config = releaseBaseline.vercel.filesApi.project.candidateConfig;
  invariant(config && canonicalJson(Object.keys(config).sort()) === canonicalJson(["file", "gitBlob", "ignoreCommand", "sha256", "size"]), "Candidate Vercel config baseline was malformed.");
  const configRow = files.find(({ file }) => file === config.file);
  invariant(configRow && configRow.gitBlob === config.gitBlob && configRow.sha256 === config.sha256 && configRow.size === config.size, "Candidate Vercel config blob/hash drifted.");
  let configValue;
  try { configValue = JSON.parse(readGitBlob(repoDir, configRow.gitBlob).toString("utf8")); } catch { throw new Error("Candidate Vercel config JSON was malformed."); }
  invariant(configValue && typeof configValue === "object" && !Array.isArray(configValue) && configValue.ignoreCommand === config.ignoreCommand, "Candidate Vercel ignore command drifted.");
  const core = { schema: manifestSchema, commit: candidate.sha, tree, ignoreSha256: expected.ignoreSha256, trackedCount: full.length, projectedCount: files.length, totalBytes, files };
  return { ...core, manifestSha256: canonicalDigest(core) };
}

export function assertSourceManifest(manifest, releaseBaseline) {
  const expected = releaseBaseline.vercel.filesApi.source;
  invariant(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Source manifest was malformed.");
  invariant(canonicalJson(Object.keys(manifest).sort()) === canonicalJson(["commit", "files", "ignoreSha256", "manifestSha256", "projectedCount", "schema", "totalBytes", "trackedCount", "tree"]), "Source manifest schema drifted.");
  invariant(expected.schema === manifestSchema && manifest.schema === expected.schema && manifest.commit === releaseBaseline.candidate.sha && manifest.tree === releaseBaseline.candidate.tree, "Source manifest candidate identity drifted.");
  invariant(manifest.ignoreSha256 === expected.ignoreSha256, "Source manifest ignore projection drifted.");
  invariant(manifest.trackedCount === expected.trackedCount && manifest.projectedCount === expected.projectedCount && manifest.totalBytes === expected.totalBytes, "Source manifest count/size drifted.");
  invariant(Array.isArray(manifest.files) && manifest.files.length === expected.projectedCount && new Set(manifest.files.map(({ file }) => file)).size === manifest.files.length, "Source manifest path cardinality drifted.");
  let totalBytes = 0;
  let previous = null;
  for (const row of manifest.files) {
    invariant(Object.keys(row).sort().join(",") === "file,gitBlob,sha,sha256,size", "Source manifest row schema drifted.");
    invariant(typeof row.file === "string" && row.file && row.file === row.file.normalize("NFC") && !path.posix.isAbsolute(row.file) && !row.file.includes("\\") && !/[\x00-\x1f\x7f]/.test(row.file) && !row.file.split("/").some((part) => !part || part === "." || part === ".."), "Source manifest path was unsafe.");
    invariant(/^[0-9a-f]{40}$/.test(row.sha) && /^[0-9a-f]{40}$/.test(row.gitBlob) && /^[0-9a-f]{64}$/.test(row.sha256) && Number.isSafeInteger(row.size) && row.size >= 0, `Source manifest digest/size drifted at ${row.file}.`);
    if (previous !== null) invariant(Buffer.compare(Buffer.from(previous), Buffer.from(row.file)) < 0, "Source manifest paths were not in strict byte order.");
    previous = row.file;
    totalBytes += row.size;
  }
  invariant(totalBytes === manifest.totalBytes, "Source manifest byte sum drifted.");
  const config = releaseBaseline.vercel.filesApi.project.candidateConfig;
  invariant(config && canonicalJson(Object.keys(config).sort()) === canonicalJson(["file", "gitBlob", "ignoreCommand", "sha256", "size"]) && typeof config.ignoreCommand === "string" && config.ignoreCommand.length > 0, "Candidate Vercel config baseline was malformed.");
  const configRow = manifest.files.find(({ file }) => file === config.file);
  invariant(configRow && configRow.gitBlob === config.gitBlob && configRow.sha256 === config.sha256 && configRow.size === config.size, "Candidate Vercel config blob/hash drifted.");
  const largest = manifest.files.reduce((current, row) => row.size > current.size ? row : current, { file: "", size: -1 });
  invariant(largest.file === expected.largestFile.file && largest.size === expected.largestFile.size, "Source manifest largest-file bound drifted.");
  const { manifestSha256, ...core } = manifest;
  const actualDigest = canonicalDigest(core);
  invariant(manifestSha256 === actualDigest && actualDigest === expected.manifestSha256, "Source manifest canonical SHA256 drifted.");
  return manifest;
}

export function sourceRequestFiles(manifest) {
  return manifest.files.map(({ file, sha, size }) => ({ file, sha, size }));
}

export function assertManifestBlob(repoDir, row) {
  const bytes = readGitBlob(repoDir, row.gitBlob);
  invariant(bytes.length === row.size && sha1(bytes) === row.sha && sha256(bytes) === row.sha256 && gitBlobSha1(bytes) === row.gitBlob, `Git blob bytes drifted at ${row.file}.`);
  return bytes;
}
