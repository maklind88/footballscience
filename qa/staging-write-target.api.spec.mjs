import { expect, test } from "@playwright/test";
import {
  verifyCompletedStagingWriteProof,
  verifyStagingWriteBuildEnvironment,
  verifyStagingWriteTarget,
} from "../scripts/verify-staging-write-target.mjs";

const sha = "1".repeat(40);
const noWait = async () => {};
const stageRef = "pokrksgempkuraueglpu";
const liveRef = "bustidorxevacosqhkcz";
const deploymentId = "dpl_TestStage4567890123";
const env = {
  GITHUB_SHA: sha, GITHUB_REPOSITORY: "example/platform", GITHUB_TOKEN: "actions-test",
  VERCEL_TOKEN: "vercel-test", VERCEL_ORG_ID: "test-org", VERCEL_PROJECT_ID: "test-project",
  STAGING_DEPLOYMENT_URL: "https://immutable-staging.vercel.app", STAGING_QA_BASE_URL: "https://staging.footballscience.xyz",
  STAGING_SUPABASE_PROJECT_REF: stageRef, SUPABASE_PROJECT_REF: liveRef,
};
const config = (ref, buildId) => ({ ok: true, url: `https://${ref}.supabase.co`, buildId });
const metadata = {
  id: deploymentId, target: null, readyState: "READY", projectId: env.VERCEL_PROJECT_ID,
  meta: { githubCommitRef: "staging", githubCommitSha: sha, scheduleQaDatabaseMode: "database" },
};

function simulate({ deployment = metadata, alias = metadata, staging = config(stageRef, deploymentId) } = {}) {
  return async (url, options) => {
    expect(options.redirect).toBe("error");
    expect(options.method).toBeUndefined();
    if (url.hostname === "api.vercel.com") {
      expect(options.headers.Authorization).toBe("Bearer vercel-test");
      return Response.json(url.pathname.endsWith("staging.footballscience.xyz") ? alias : deployment);
    }
    expect(options.headers).toBeUndefined();
    return Response.json(url.hostname === "footballscience.xyz" ? config(liveRef, "live-build") : staging);
  };
}

test("staging database mode must be known before any fixture can write", () => {
  expect(verifyStagingWriteBuildEnvironment("APP_STATE_DATABASE_MODE=database\n")).toBe("STAGING_APP_STATE_DATABASE_MODE=database");
  expect(() => verifyStagingWriteBuildEnvironment("APP_STATE_DATABASE_MODE=legacy\n")).toThrow(/atomic app-state/);
});

test("staging write gate allows only the aliased exact-commit preview with a distinct database", async () => {
  await expect(verifyStagingWriteTarget({ env, wait: noWait, request: simulate() })).resolves.toEqual({ buildId: deploymentId, liveRef });
  await expect(verifyStagingWriteTarget({ env, wait: noWait, request: simulate({ alias: { ...metadata, id: "dpl_StaleAlias" } }) })).rejects.toThrow(/exact staging deployment/);
  await expect(verifyStagingWriteTarget({ env, wait: noWait, request: simulate({ staging: config(liveRef, deploymentId) }) })).rejects.toThrow(/separate from production/);
  await expect(verifyStagingWriteTarget({ env, wait: noWait, request: simulate({ deployment: { ...metadata, target: "production" } }) })).rejects.toThrow(/approved database-backed preview/);
  await expect(verifyStagingWriteTarget({ env, wait: noWait, request: simulate({ staging: config(stageRef, "stale-build") }) })).rejects.toThrow(/exact staging deployment/);
});

test("staging waits through propagation only while staging still uses the approved backend", async () => {
  let waits = 0;
  const old = simulate({ alias: { ...metadata, id: "dpl_StaleAlias" }, staging: config(stageRef, "stale-build") });
  const current = simulate();
  await expect(verifyStagingWriteTarget({
    env,
    wait: async () => { waits += 1; },
    request: (url, options) => (waits ? current : old)(url, options),
  })).resolves.toEqual({ buildId: deploymentId, liveRef });
  expect(waits).toBe(1);
  await expect(verifyStagingWriteTarget({
    env,
    wait: async () => { throw new Error("Wrong backend must not be retried"); },
    request: simulate({ staging: config(liveRef, "stale-build") }),
  })).rejects.toThrow(/separate from production/);
});

test("production gate refuses a successful staging workflow if the write proofs were skipped", async () => {
  let proofResult = "skipped";
  const request = async url => Response.json(url.pathname.endsWith("/jobs") ? {
    jobs: [{ conclusion: "success", steps: [{ name: "Isolated Schedule and Chat write, reload, and cleanup proofs", conclusion: proofResult }] }],
  } : { workflow_runs: [{ id: 17, head_sha: sha, head_branch: "staging", conclusion: "success" }] });
  await expect(verifyCompletedStagingWriteProof({ env, request })).rejects.toThrow(/did not pass/);
  proofResult = "success";
  await expect(verifyCompletedStagingWriteProof({ env, request })).resolves.toBe(17);
});
