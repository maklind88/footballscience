import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { restoreReviewedStaging, stagingRestoreAssets, stagingRestoreTarget as target } from "../scripts/lib/reviewed-staging-restore.mjs";

function fixture() {
  const input = { deploymentUrl: "https://footballscience-reviewed1-makattack.vercel.app", sourceSha: "a".repeat(40),
    projectId: target.project, teamId: target.team, stagingUrl: `https://${target.staging}` };
  const deployment = { id: "dpl_reviewed", url: new URL(input.deploymentUrl).hostname, projectId: target.project, readyState: "READY", target: null };
  const config = { buildId: deployment.id, url: `https://${target.database}.supabase.co` };
  const writes = [], reads = [];
  let routed = false;
  const options = { input,
    inspect: async host => host === target.production ? { id: "dpl_production" } : host === target.staging ? { id: routed ? deployment.id : "dpl_old" } : deployment,
    readText: async (host, asset) => { reads.push([host, asset]); return asset === "api/client-config" ? JSON.stringify(config) : "reviewed " + asset; },
    readSource: async (_, asset) => Buffer.from("reviewed " + asset),
    assign: async (id, alias) => { writes.push({ id, alias }); routed = true; }, pause: async () => {}, attempts: 2,
  };
  return { options, deployment, config, writes, reads };
}
test("only staging alias is assigned after all reviewed assets, and verified afterward", async () => {
  const f = fixture(), result = await restoreReviewedStaging(f.options);
  assert.deepEqual(f.writes, [{ id: "dpl_reviewed", alias: target.staging }]);
  assert.equal(result.productionUnchanged, true);
  assert.equal(result.verifiedAssets, 9);
  assert.equal(f.reads.length, 2 * (stagingRestoreAssets.length + 1));
});
for (const mutation of [
  f => f.options.input.deploymentUrl = "https://footballscience.xyz",
  f => f.options.input.deploymentUrl += "/?secret=1",
  f => f.options.input.sourceSha = "main",
  f => f.options.input.stagingUrl = "https://footballscience.xyz",
  f => f.options.input.projectId = "wrong",
  f => f.options.input.teamId = "wrong",
  f => f.deployment.projectId = "wrong",
  f => f.deployment.readyState = "BUILDING",
  f => f.deployment.target = "production",
  f => f.config.url = "https://bustidorxevacosqhkcz.supabase.co",
  f => f.config.buildId = "dpl_other",
  f => f.options.readSource = async () => Buffer.from("different source"),
]) test(`unsafe input or mismatched proof stops before alias mutation (${mutation.toString()})`, async () => {
  const f = fixture(); mutation(f);
  await assert.rejects(restoreReviewedStaging(f.options)); assert.equal(f.writes.length, 0);
});
test("failed source read stops before mutation", async () => {
  const f = fixture(); f.options.readText = async () => { throw new Error("unavailable"); };
  await assert.rejects(restoreReviewedStaging(f.options)); assert.equal(f.writes.length, 0);
});
test("source checks finish before alias assignment", async () => {
  const f = fixture(), assign = f.options.assign;
  f.options.assign = async (...args) => { assert.equal(f.reads.length, stagingRestoreAssets.length + 1); await assign(...args); };
  await restoreReviewedStaging(f.options);
});
test("failure to propagate does not trigger any additional mutation", async () => {
  const f = fixture(); f.options.assign = async (...args) => f.writes.push(args);
  await assert.rejects(restoreReviewedStaging(f.options), /alias verification failed/);
  assert.equal(f.writes.length, 1);
});
test("production routing change is reported", async () => {
  const f = fixture(), inspect = f.options.inspect; let probes = 0;
  f.options.inspect = async host => host === target.production && ++probes > 1 ? { id: "dpl_changed" } : inspect(host);
  await assert.rejects(restoreReviewedStaging(f.options), /Production routing changed/);
});
test("restore workflow uses the shared non-cancelling release queue and exact checkout guard", () => {
  const workflow = readFileSync(new URL("../.github/workflows/staging-smoke.yml", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../scripts/restore-reviewed-staging.mjs", import.meta.url), "utf8");
  assert.match(workflow, /inputs\.restore_staging_deployment != ''\) && 'footballscience-production-edge-release'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(runner, /git\(\["rev-parse", "HEAD"\]\) !== env\.GITHUB_SHA/);
  assert.match(runner, /git\(\["status", "--porcelain"\]\)/);
  assert.match(runner, /verify-vercel-release-traffic\.mjs/);
  assert.doesNotMatch(runner, /--token/);
});
