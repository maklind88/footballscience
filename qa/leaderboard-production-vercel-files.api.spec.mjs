import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { canonicalDigest, canonicalJson } from "../scripts/lib/leaderboard-production-release-security.mjs";
import { assertPreviewCreateBody, buildPreviewCreateBody, buildStagedProductionCreateBody, collectDeploymentPages, previewAttemptMeta, resolveAmbiguousCreate, selectDeploymentCandidates } from "../scripts/lib/leaderboard-production-vercel-deployments.mjs";
import { assertDeploymentFileTree, assertSourceRequestFiles, assertUploadResponse, decodeDeploymentFileContent, deploymentContentResponseLimit, flattenDeploymentFiles, uniqueUploadRows, verifyDeploymentFileContents } from "../scripts/lib/leaderboard-production-vercel-files.mjs";
import { aliasSnapshot, assertAliasBaseline, assertAliasesUnchanged, assertPreviewDeployment, assertPreviewSupabaseRef, assertProductionProjectEligible, assertVercelProject, deploymentCreatedAt, deploymentId, deploymentProjectId, deploymentState } from "../scripts/lib/leaderboard-production-vercel-state.mjs";
import { VERCEL_API_ORIGIN, VercelRequestError, assertExactHeaders, assertNoProxyEnvironment, assertRateHeaders, vercelApiUrl, vercelRequest } from "../scripts/lib/leaderboard-production-vercel-transport.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, "scripts/leaderboard-production-release-baseline.json"), "utf8"));
const runner = fs.readFileSync(path.join(rootDir, "scripts/leaderboard-production-code-release.mjs"), "utf8");
const workflow = fs.readFileSync(path.join(rootDir, ".github/workflows/leaderboard-production-code-release.yml"), "utf8");
const response = (payload, { status = 200, contentType = "application/json", headers = {} } = {}) => new Response(typeof payload === "string" || payload instanceof Uint8Array ? payload : JSON.stringify(payload), { status, headers: { "content-type": contentType, ...headers } });

function fixture() {
  const next = structuredClone(baseline);
  const rows = [
    { file: "app.js", sha: crypto.createHash("sha1").update("one").digest("hex"), size: 3, sha256: crypto.createHash("sha256").update("one").digest("hex"), gitBlob: "a".repeat(40) },
    { file: "src/module.mjs", sha: crypto.createHash("sha1").update("two").digest("hex"), size: 3, sha256: crypto.createHash("sha256").update("two").digest("hex"), gitBlob: "b".repeat(40) },
  ];
  const files = rows.map(({ file, sha, size }) => ({ file, sha, size }));
  Object.assign(next.vercel.filesApi.source, { projectedCount: 2, uniqueUploadCount: 2, uniqueUploadBytes: 6, totalBytes: 6, requestFilesSha256: canonicalDigest(files), requestFilesBytes: Buffer.byteLength(`${canonicalJson(files)}\n`), largestFile: { file: "app.js", size: 3, contentResponseLimit: deploymentContentResponseLimit(3) }, canary: rows[0] });
  const manifest = { schema: next.vercel.filesApi.source.schema, commit: next.candidate.sha, tree: next.candidate.tree, ignoreSha256: next.vercel.filesApi.source.ignoreSha256, trackedCount: 2, projectedCount: 2, totalBytes: 6, files: rows, manifestSha256: "c".repeat(64) };
  next.vercel.filesApi.source.manifestSha256 = manifest.manifestSha256;
  const meta = previewAttemptMeta({ baseline: next, orchestrationSha: "d".repeat(40), artifactSha256: "e".repeat(64), manifest, requestFilesSha256: next.vercel.filesApi.source.requestFilesSha256, workflow: "leaderboard-production-code-release.yml", runId: "123", runAttempt: "1", nonce: "nonce-files-proof-123" });
  const body = buildPreviewCreateBody({ baseline: next, files, meta }).value;
  return { baseline: next, manifest, files, meta: body.meta, body };
}

function deployment({ id = "dpl_Exact123", meta, startedAt = 1_000_000, target = null, state = "READY", url = "footballscience-proof-makattack.vercel.app" } = {}) {
  return { id, uid: id, projectId: baseline.vercel.projectId, project: { id: baseline.vercel.projectId }, teamId: baseline.vercel.teamId, name: baseline.vercel.projectName, target, readyState: state, state, createdAt: startedAt, created: startedAt, meta, url, alias: [], customEnvironment: null, buildingAt: startedAt + 1, ready: startedAt + 2 };
}

test("exact API origin, path, query, headers, body, redirect, and response schemas are fail closed", async () => {
  expect(VERCEL_API_ORIGIN).toBe("https://api.vercel.com");
  expect(assertNoProxyEnvironment({}, [])).toBe(true); for (const name of ["HTTPS_PROXY", "NODE_USE_ENV_PROXY", "npm_config_proxy"]) expect(() => assertNoProxyEnvironment({ [name]: "https://proxy.example" }, [])).toThrow(/forbids proxy/);
  for (const fixture of [{ source: { NODE_OPTIONS: '"--use-env-proxy"' }, argv: [] }, { source: {}, argv: ["--use_env_proxy"] }, { source: { NODE_OPTIONS: "--use_env-proxy" }, argv: [] }]) expect(() => assertNoProxyEnvironment(fixture.source, fixture.argv)).toThrow(/forbids proxy/);
  expect(vercelApiUrl("/v9/projects/prj", { teamId: baseline.vercel.teamId }).href).toBe(`https://api.vercel.com/v9/projects/prj?teamId=${baseline.vercel.teamId}`);
  for (const bad of ["//attacker.example/x", "/x?target=evil", "/x#evil", "https://attacker.example/x", "/x\nheader"]) expect(() => vercelApiUrl(bad)).toThrow();
  for (const query of [{ until: Infinity }, { until: 1.5 }, { "bad-key": 1 }, { teamId: {} }]) expect(() => vercelApiUrl("/v6/deployments", query)).toThrow();
  expect(() => assertExactHeaders({ Accept: "a", accept: "b" }, ["Accept", "accept"])).toThrow(/duplicate/);
  expect(() => assertExactHeaders({ "'x-vercel-digest'": "x" }, ["x-vercel-digest"])).toThrow();
  let request;
  const exact = await vercelRequest({ pathname: "/v9/projects/prj", query: { teamId: baseline.vercel.teamId }, token: "token-123456", expectedStatus: 200, fetchImpl: async (url, init) => { request = { url: url.href, init }; return response({ ok: true }); } });
  expect(exact.payload).toEqual({ ok: true }); expect(request.init).toMatchObject({ method: "GET", redirect: "manual", body: undefined }); expect(request.init.headers.Authorization).toBe("Bearer token-123456");
  const bytes = Buffer.from("canary"); const digest = crypto.createHash("sha1").update(bytes).digest("hex"); let upload;
  await vercelRequest({ pathname: "/v2/files", query: { teamId: baseline.vercel.teamId }, token: "token-123456", method: "POST", bytes, headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "x-vercel-digest": digest }, expectedStatus: 200, fetchImpl: async (url, init) => { upload = { url: url.href, init }; return response({}); } });
  expect(Object.keys(upload.init.headers).sort()).toEqual(["Accept", "Authorization", "Content-Length", "Content-Type", "x-vercel-digest"].sort()); expect(upload.init.headers).toMatchObject({ "Content-Type": "application/octet-stream", "Content-Length": "6", "x-vercel-digest": digest }); expect(upload.init.redirect).toBe("manual");
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", method: "GET", json: {}, expectedStatus: 200, fetchImpl: async () => response({}) })).rejects.toThrow(/method\/body/);
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", method: "POST", expectedStatus: 200, fetchImpl: async () => response({}) })).rejects.toThrow(/method\/body/);
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", expectedStatus: 200, responseType: "xml", fetchImpl: async () => response({}) })).rejects.toThrow(/response contract/);
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", expectedStatus: 200, fetchImpl: async () => response("redirect", { status: 302, contentType: "text/plain" }) })).rejects.toMatchObject({ name: "VercelRequestError", kind: "redirect" });
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", expectedStatus: 200, fetchImpl: async () => response("{}", { contentType: "application/json-evil" }) })).rejects.toThrow(/non-JSON/);
  await expect(vercelRequest({ pathname: "/x", token: "token-123456", expectedStatus: 200, maxBytes: 3, fetchImpl: async () => response({ too: "large" }) })).rejects.toThrow(/bounded body/);
});

test("project preconditions are exact and production remains disabled", () => {
  const project = { id: baseline.vercel.projectId, accountId: baseline.vercel.teamId, name: baseline.vercel.projectName, link: { type: "github", repoId: baseline.vercel.filesApi.project.repoId, repo: baseline.vercel.projectName, org: "maklind88" }, rootDirectory: null, commandForIgnoringBuildStep: baseline.vercel.filesApi.project.commandForIgnoringBuildStep, autoAssignCustomDomains: false };
  expect(assertVercelProject(project, baseline)).toMatchObject({ autoAssignCustomDomains: false });
  for (const drift of [{ ...project, autoAssignCustomDomains: true }, { ...project, accountId: "wrong" }, { ...project, rootDirectory: undefined }, { ...project, commandForIgnoringBuildStep: undefined }, { ...project, commandForIgnoringBuildStep: "node scripts/vercel-ignore-build.mjs" }, { ...project, link: { ...project.link, repoId: "wrong" } }]) expect(() => assertVercelProject(drift, baseline)).toThrow();
  expect(() => assertProductionProjectEligible(project, baseline)).toThrow(/production is disabled/);
  const { files, meta } = fixture(); expect(() => buildStagedProductionCreateBody({ baseline, files, meta, project })).toThrow(/disabled/);
});

test("preview create body binds every file and exact immutable attempt metadata", () => {
  const f = fixture(); expect(assertPreviewCreateBody(f.body, f.baseline)).toBe(f.body);
  for (const forbidden of ["target", "gitSource", "gitMetadata", "env", "buildEnv", "projectSettings", "customEnvironment", "deploymentId", "aliases", "withLatestCommit", "forceNew"]) {
    const body = { ...f.body, [forbidden]: forbidden === "target" ? null : {} }; expect(() => assertPreviewCreateBody(body, f.baseline)).toThrow();
  }
  const mutateAndRehash = (change) => { const body = structuredClone(f.body); change(body); const { createIntentSha256, ...meta } = body.meta; body.meta.createIntentSha256 = canonicalDigest({ name: body.name, project: body.project, files: body.files, meta }); return body; };
  expect(() => assertPreviewCreateBody(mutateAndRehash((body) => { body.files[0].sha = "f".repeat(40); }), f.baseline)).toThrow(/source-file digest/);
  expect(() => assertPreviewCreateBody(mutateAndRehash((body) => { delete body.meta.planArtifactSha256; }), f.baseline)).toThrow(/keyset/);
  expect(() => assertPreviewCreateBody(mutateAndRehash((body) => { body.meta.extra = "x"; }), f.baseline)).toThrow(/keyset/);
  expect(() => assertPreviewCreateBody(mutateAndRehash((body) => { body.files[0].extra = true; }), f.baseline)).toThrow();
  expect(() => previewAttemptMeta({ baseline: f.baseline, orchestrationSha: "d".repeat(40), artifactSha256: "e".repeat(64), manifest: f.manifest, requestFilesSha256: "f".repeat(64), workflow: "leaderboard-production-code-release.yml", runId: "1", runAttempt: "1", nonce: "nonce-files-proof" })).toThrow(/request digest/);
});

test("upload canary, dedupe, response, rate headers, and request rows are exact", () => {
  const f = fixture(); expect(uniqueUploadRows(f.manifest, f.baseline)).toHaveLength(2);
  const headers = new Headers({ "x-ratelimit-remaining": "9" }); expect(assertUploadResponse({ status: 200, headers, payload: {} })).toBe(true); expect(assertUploadResponse({ status: 200, headers, payload: { urls: ["opaque"] } })).toBe(true);
  for (const bad of [{ status: 201, headers, payload: {} }, { status: 200, headers, payload: { url: "x" } }, { status: 200, headers, payload: { urls: [7] } }, { status: 200, headers, payload: [] }]) expect(() => assertUploadResponse(bad)).toThrow();
  expect(assertRateHeaders(headers)).toEqual({ remaining: 9 }); expect(() => assertRateHeaders(new Headers({ "x-ratelimit-remaining": "0" }))).toThrow(/exhausted/);
  const duplicate = structuredClone(f.manifest); duplicate.files[1] = { ...duplicate.files[1], sha: duplicate.files[0].sha, size: duplicate.files[0].size, sha256: duplicate.files[0].sha256, gitBlob: duplicate.files[0].gitBlob };
  duplicate.files[1].file = "duplicate.js"; f.baseline.vercel.filesApi.source.uniqueUploadCount = 1; f.baseline.vercel.filesApi.source.uniqueUploadBytes = 3; expect(uniqueUploadRows(duplicate, f.baseline)).toHaveLength(1);
});

test("deployment resolver requires exact meta, project/team/target/time, pagination, and one candidate", async () => {
  const f = fixture(); const startedAt = 1_000_000; const exact = deployment({ meta: f.meta, startedAt });
  expect(selectDeploymentCandidates([exact], { baseline: f.baseline, meta: f.meta, startedAt, target: null })).toEqual([exact]);
  for (const drift of [
    { ...exact, meta: { ...exact.meta, extra: "x" } }, { ...exact, teamId: "wrong" }, { ...exact, target: "production" }, { ...exact, createdAt: startedAt - 6000, created: startedAt - 6000 }, { ...exact, projectId: "wrong", project: { id: "wrong" } },
  ]) expect(selectDeploymentCandidates([drift], { baseline: f.baseline, meta: f.meta, startedAt, target: null })).toEqual([]);
  for (const malformed of [{ ...exact, uid: "dpl_Other" }, { ...exact, state: "ERROR" }, { ...exact, created: startedAt + 1 }, {}]) expect(() => selectDeploymentCandidates([malformed], { baseline: f.baseline, meta: f.meta, startedAt, target: null })).toThrow();
  const pages = [{ deployments: [], pagination: { next: 99 } }, { deployments: [exact], pagination: { next: null } }]; expect(await collectDeploymentPages(async ({ page }) => pages[page])).toEqual([exact]);
  await expect(collectDeploymentPages(async () => ({ deployments: [], pagination: {} }))).rejects.toThrow(/pagination/);
  expect(await resolveAmbiguousCreate({ baseline: f.baseline, meta: f.meta, startedAt, target: null, loadPage: async () => ({ deployments: [exact], pagination: { next: null } }), inspect: async () => exact, sleep: async () => {} })).toEqual(exact);
  await expect(resolveAmbiguousCreate({ baseline: f.baseline, meta: f.meta, startedAt, target: null, loadPage: async () => ({ deployments: [], pagination: { next: null } }), inspect: async () => exact, sleep: async () => {} })).rejects.toThrow(/UNKNOWN/);
  const second = { ...exact, id: "dpl_Second", uid: "dpl_Second" }; await expect(resolveAmbiguousCreate({ baseline: f.baseline, meta: f.meta, startedAt, target: null, loadPage: async () => ({ deployments: [exact, second], pagination: { next: null } }), inspect: async (id) => id === exact.id ? exact : second, sleep: async () => {} })).rejects.toThrow(/Multiple exact/);
});

test("deployment identity rejects conflicting fallback fields and preview proves a real build", () => {
  const f = fixture(); const exact = deployment({ meta: f.meta });
  expect(deploymentId(exact)).toBe(exact.id); expect(deploymentProjectId(exact)).toBe(baseline.vercel.projectId); expect(deploymentState(exact)).toBe("READY"); expect(deploymentCreatedAt(exact)).toBe(1_000_000);
  expect(assertPreviewDeployment({ ...exact, source: "non-authoritative-wrong" }, { meta: f.meta }, f.baseline)).toMatchObject({ target: null, readyState: "READY" });
  for (const drift of [{ ...exact, buildingAt: undefined }, { ...exact, ready: 1 }, { ...exact, target: undefined }, { ...exact, alias: ["live.example"] }, { ...exact, customEnvironment: { id: "x" } }, { ...exact, url: "attacker.example" }]) expect(() => assertPreviewDeployment(drift, { meta: f.meta }, f.baseline)).toThrow();
});

test("alias baseline and exact preview Supabase origin prevent live/staging drift", () => {
  const records = Object.fromEntries([
    [baseline.hosts.production, deployment({ id: baseline.vercel.oldProductionDeployment.id, meta: {} })],
    [baseline.hosts.www, deployment({ id: baseline.vercel.oldProductionDeployment.id, meta: {} })],
    [baseline.hosts.staging, deployment({ id: baseline.vercel.stagingDeployment.id, meta: {} })],
    [baseline.hosts.stagingBranch, deployment({ id: baseline.vercel.stagingDeployment.id, meta: {} })],
  ]);
  const exact = assertAliasBaseline(aliasSnapshot(records, baseline), baseline); expect(assertAliasesUnchanged(exact, structuredClone(exact))).toEqual(exact);
  expect(() => assertAliasBaseline({ ...exact, [baseline.hosts.production]: "dpl_wrong" }, baseline)).toThrow(); expect(() => assertAliasesUnchanged(exact, { ...exact, [baseline.hosts.staging]: "dpl_wrong" })).toThrow();
  expect(assertPreviewSupabaseRef({ url: `https://${baseline.supabase.stagingRef}.supabase.co` }, baseline)).toBe(baseline.supabase.stagingRef);
  for (const url of [`https://${baseline.supabase.productionRef}.supabase.co`, `https://${baseline.supabase.stagingRef}.supabase.co.attacker.example`, `http://${baseline.supabase.stagingRef}.supabase.co`, `https://user@${baseline.supabase.stagingRef}.supabase.co`]) expect(() => assertPreviewSupabaseRef({ url }, baseline)).toThrow();
});

test("remote source tree and content protocol rehash every exact projected file", async () => {
  const f = fixture(); const remotePayload = [{ name: "app.js", type: "file", uid: "file_one", mode: 100644, size: 3 }, { name: "src", type: "directory", children: [{ name: "module.mjs", type: "file", uid: "file_two", mode: 33188, size: 3 }] }];
  const remote = assertDeploymentFileTree(remotePayload, f.manifest); expect(remote.map(({ file }) => file)).toEqual(["app.js", "src/module.mjs"]);
  const bodies = new Map([["app.js", Buffer.from("one")], ["src/module.mjs", Buffer.from("two")]]); const seen = [];
  const verified = await verifyDeploymentFileContents({ remoteFiles: remote, manifest: f.manifest, loadContent: async (file, expected, limit) => { seen.push({ file: file.file, expected: expected.file, limit }); return { status: 200, headers: new Headers({ "content-type": "application/octet-stream" }), bytes: bodies.get(file.file) }; }, hash: (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest("hex") });
  expect(verified.verified).toBe(2); expect(seen.every(({ file, expected }) => file === expected)).toBe(true);
  expect(decodeDeploymentFileContent({ status: 200, headers: new Headers({ "content-type": "application/json; charset=utf-8" }), bytes: Buffer.from(JSON.stringify({ data: Buffer.from("one").toString("base64"), encoding: "base64" })) }).toString()).toBe("one");
  expect(() => decodeDeploymentFileContent({ status: 200, headers: new Headers({ "content-type": "application/octet-stream-evil" }), bytes: Buffer.from("one") })).toThrow(/encoding/);
  for (const bad of [[{ name: "", type: "file", uid: "x", mode: 100644 }], [{ name: "not-normalized-e\u0301", type: "file", uid: "x", mode: 100644 }], [{ name: "link", type: "file", uid: "x", mode: 120000 }], [{ name: "x", type: "file", uid: "x", mode: 100644, size: -1 }]]) expect(() => flattenDeploymentFiles(bad)).toThrow();
});

test("rail statically has exact endpoints, no source leakage, and no production continuation", () => {
  for (const endpoint of ["/v2/files", "/v13/deployments", "/v6/deployments", "/v6/deployments/${encodeURIComponent(id)}/files", "/v8/deployments/${encodeURIComponent(id)}/files/${encodeURIComponent(file.uid)}", "/v12/deployments/${encodeURIComponent(id)}/cancel"]) expect(runner).toContain(endpoint);
  expect(runner).toContain("redirect: \"error\""); expect(runner).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:token|payload|body|bytes|meta)/i);
  expect(workflow).not.toMatch(/target:\s*production|--prod|\bpromote\b|\brollback\b|gitSource|projectSettings|buildEnv/);
  expect(workflow.match(/--mode preview-apply/g)).toHaveLength(1); expect(workflow).toContain("needs.plan.result == 'success'");
});
