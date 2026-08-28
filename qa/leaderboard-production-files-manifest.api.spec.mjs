import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { canonicalDigest, canonicalJson } from "../scripts/lib/leaderboard-production-release-security.mjs";
import { assertManifestBlob, assertSourceManifest, buildSourceManifest, isProjectedPath, parseGitTree, parseIgnoreProjection, sourceRequestFiles } from "../scripts/lib/leaderboard-production-source-manifest.mjs";
import { assertSourceRequestFiles, deploymentContentResponseLimit, uniqueUploadRows } from "../scripts/lib/leaderboard-production-vercel-files.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, "scripts/leaderboard-production-release-baseline.json"), "utf8"));
const sourceCode = fs.readFileSync(path.join(rootDir, "scripts/lib/leaderboard-production-source-manifest.mjs"), "utf8");

function ensureCandidateObject() {
  const git = (args) => execFileSync("git", ["-c", `safe.directory=${rootDir}`, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  try {
    git(["cat-file", "-e", `${baseline.candidate.sha}^{commit}`]);
  } catch {
    git(["fetch", "--no-tags", "--depth=1", "origin", baseline.candidate.sha]);
    expect(git(["rev-parse", "FETCH_HEAD^{commit}"])).toBe(baseline.candidate.sha);
  }
}

ensureCandidateObject();

test("Git-object source manifest exactly matches the frozen c1 projection", () => {
  const manifest = assertSourceManifest(buildSourceManifest(rootDir, baseline), baseline);
  expect(manifest).toMatchObject({
    schema: "footballscience-leaderboard-vercel-source-manifest-v1",
    commit: baseline.candidate.sha,
    tree: baseline.candidate.tree,
    trackedCount: 1538,
    projectedCount: 1039,
    totalBytes: 33_686_765,
    manifestSha256: "5a6f8f8f6bac6dc0263014d2da7474eea14906b6c871e5cbd6f5c818c5f15b7d",
  });
  const request = assertSourceRequestFiles(manifest, baseline);
  expect(canonicalDigest(request)).toBe("291c00107b9d17c93c830a78deb8ebd0f3fec82d3e261c432c6bf04549c40238");
  expect(Buffer.byteLength(`${canonicalJson(request)}\n`)).toBe(126_674);
  expect(uniqueUploadRows(manifest, baseline)).toHaveLength(1038);
  expect(deploymentContentResponseLimit(16_776_671)).toBe(22_372_992);
  const canary = manifest.files.find(({ file }) => file === ".vercelignore");
  expect(canary).toEqual(baseline.vercel.filesApi.source.canary);
  expect(assertManifestBlob(rootDir, canary).length).toBe(245);
  const config = baseline.vercel.filesApi.project.candidateConfig;
  const configRow = manifest.files.find(({ file }) => file === config.file);
  expect(configRow).toMatchObject({ file: "vercel.json", size: 1814, sha256: "341f61a369f0cd584d7a11aa0945e81605d0c064bc11603a8abc06f65b32d574", gitBlob: "6da4a55db7b42bb38ab409039f9ae9ebd50131c2" });
  expect(JSON.parse(assertManifestBlob(rootDir, configRow).toString("utf8")).ignoreCommand).toBe("node scripts/vercel-ignore-build.mjs");
});

test("manifest assertion recomputes schema, ordering, sums, rows, and canonical digest", () => {
  const rowA = { file: "a.txt", sha: "1".repeat(40), size: 1, sha256: "2".repeat(64), gitBlob: "3".repeat(40) };
  const rowB = { file: "b.txt", sha: "4".repeat(40), size: 2, sha256: "5".repeat(64), gitBlob: "6".repeat(40) };
  const fixtureBaseline = structuredClone(baseline);
  Object.assign(fixtureBaseline.vercel.filesApi.source, { trackedCount: 2, projectedCount: 2, totalBytes: 3, largestFile: { file: "b.txt", size: 2, contentResponseLimit: deploymentContentResponseLimit(2) } });
  fixtureBaseline.vercel.filesApi.project.candidateConfig = { file: "a.txt", size: 1, sha256: rowA.sha256, gitBlob: rowA.gitBlob, ignoreCommand: "node scripts/vercel-ignore-build.mjs" };
  const core = { schema: fixtureBaseline.vercel.filesApi.source.schema, commit: fixtureBaseline.candidate.sha, tree: fixtureBaseline.candidate.tree, ignoreSha256: fixtureBaseline.vercel.filesApi.source.ignoreSha256, trackedCount: 2, projectedCount: 2, totalBytes: 3, files: [rowA, rowB] };
  const exact = { ...core, manifestSha256: canonicalDigest(core) }; fixtureBaseline.vercel.filesApi.source.manifestSha256 = exact.manifestSha256;
  expect(assertSourceManifest(exact, fixtureBaseline)).toBe(exact);
  for (const mutated of [
    { ...exact, totalBytes: 4 },
    { ...exact, files: [rowB, rowA] },
    { ...exact, files: [{ ...rowA, extra: true }, rowB] },
    { ...exact, files: [{ ...rowA, file: "../escape" }, rowB] },
    { ...exact, manifestSha256: "f".repeat(64) },
    { ...exact, surprise: true },
  ]) expect(() => assertSourceManifest(mutated, fixtureBaseline)).toThrow();
});

test("NUL-safe Git tree and reviewed ignore grammar reject unsafe objects and paths", () => {
  const blob = "a".repeat(40); const exact = Buffer.from(`100644 blob ${blob}\talpha/file.txt\0`);
  expect(parseGitTree(exact)).toEqual([{ mode: "100644", type: "blob", gitBlob: blob, file: "alpha/file.txt" }]);
  for (const hostile of [
    Buffer.from(`120000 blob ${blob}\tlink\0`),
    Buffer.from(`100644 blob ${blob}\t../escape\0`),
    Buffer.from(`100644 blob ${blob}\tbad\\path\0`),
    Buffer.from(`100644 blob ${blob}\tcontrol\nname\0`),
    Buffer.from(`100644 blob ${blob}\tmissing-nul`),
  ]) expect(() => parseGitTree(hostile)).toThrow();
  const patterns = baseline.vercel.filesApi.source.ignorePatterns;
  expect(parseIgnoreProjection(Buffer.from(`${patterns.join("\n")}\n`), patterns)).toEqual(patterns);
  expect(isProjectedPath("qa/secret.spec.mjs", patterns)).toBe(false); expect(isProjectedPath("src/index.mjs", patterns)).toBe(true); expect(isProjectedPath(".env.production", patterns)).toBe(false);
  expect(() => parseIgnoreProjection(Buffer.from("!src\n"), ["!src"])).toThrow();
});

test("manifest Git reads are replacement-proof, shell-free, and byte-verified", () => {
  expect(sourceCode).toContain('GIT_NO_REPLACE_OBJECTS: "1"');
  expect(sourceCode).toContain('["-c", `safe.directory=${safeRoot}`, ...args]');
  expect(sourceCode).toContain('["cat-file", "-t", gitBlob]');
  expect(sourceCode).toContain("gitBlobSha1(bytes) === gitBlob");
  expect(sourceCode).not.toMatch(/shell:\s*true|execSync|readFileSync\(path\.join\(repoDir/);
  expect(sourceRequestFiles({ files: [{ file: "a", sha: "b", size: 1, sha256: "c", gitBlob: "d" }] })).toEqual([{ file: "a", sha: "b", size: 1 }]);
});
