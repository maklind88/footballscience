import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProductionDeployment,
  verifyProductionPromotion,
} from "../scripts/lib/production-promotion.mjs";
import { runProductionPromotionVerification } from "../scripts/verify-production-promotion.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const deploymentOrigin = "https://footballscience-release-owner.vercel.app";
const liveOrigin = "https://footballscience.xyz";
const deploymentId = "dpl_exact_release";
const projectId = "prj_footballscience";
const commitSha = "a".repeat(40);
const projectRef = "bustidorxevacosqhkcz";

function response(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function deployment(overrides = {}) {
  return {
    id: deploymentId,
    projectId,
    readyState: "READY",
    target: "production",
    meta: { githubCommitSha: commitSha },
    ...overrides,
  };
}

function fakeFetch(options = {}) {
  const liveDeploymentIds = Array.isArray(options.liveDeploymentIds)
    ? [...options.liveDeploymentIds]
    : [options.liveDeploymentId || deploymentId];
  return async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.vercel.com") {
      const inspectedHost = decodeURIComponent(url.pathname.split("/").pop());
      const liveDeploymentId = liveDeploymentIds.length > 1 ? liveDeploymentIds.shift() : liveDeploymentIds[0];
      return response(deployment({ id: inspectedHost === "footballscience.xyz" ? liveDeploymentId : deploymentId }));
    }
    if (url.pathname === "/api/client-config") {
      return response({ ok: true, url: `https://${projectRef}.supabase.co` });
    }
    const relativePath = url.pathname.replace(/^\//, "");
    return response(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
  };
}

function env() {
  return {
    PRODUCTION_DEPLOYMENT_URL: deploymentOrigin,
    LIVE_QA_BASE_URL: liveOrigin,
    SUPABASE_PROJECT_REF: projectRef,
    VERCEL_PROJECT_ID: projectId,
    VERCEL_ORG_ID: "team_owner",
    VERCEL_TOKEN: "not-a-real-token",
    GITHUB_SHA: commitSha,
  };
}

test("production promotion accepts only the exact ready production deployment", () => {
  expect(typeof runProductionPromotionVerification).toBe("function");
  expect(assertProductionDeployment(deployment(), { projectId, commitSha })).toBe(deploymentId);
  expect(() => assertProductionDeployment(deployment({ projectId: "wrong" }), { projectId, commitSha })).toThrow(/wrong Vercel project/);
  expect(() => assertProductionDeployment(deployment({ readyState: "BUILDING" }), { projectId, commitSha })).toThrow(/not ready/);
  expect(() => assertProductionDeployment(deployment({ target: "preview" }), { projectId, commitSha })).toThrow(/target must be production/);
  expect(() => assertProductionDeployment(deployment({ meta: { githubCommitSha: "b".repeat(40) } }), { projectId, commitSha })).toThrow(/release SHA/);
});

test("staged production verification proves project, Supabase, and release assets", async () => {
  await expect(verifyProductionPromotion({ env: env(), fetchImpl: fakeFetch(), rootDir, phase: "staged" }))
    .resolves.toMatchObject({ deploymentId, phase: "staged" });
});

test("live promotion fails closed unless the custom domain resolves to the exact staged deployment", async () => {
  await expect(verifyProductionPromotion({ env: env(), fetchImpl: fakeFetch(), rootDir, phase: "live" }))
    .resolves.toMatchObject({ deploymentId, phase: "live" });
  await expect(verifyProductionPromotion({
    env: env(),
    fetchImpl: fakeFetch({ liveDeploymentId: "dpl_old_live" }),
    rootDir,
    phase: "live",
    liveVerifyAttempts: 1,
    liveVerifyDelayMs: 0,
  })).rejects.toThrow(/expected exact deployment/);
});

test("live promotion waits for bounded custom-domain propagation", async () => {
  await expect(verifyProductionPromotion({
    env: env(),
    fetchImpl: fakeFetch({ liveDeploymentIds: ["dpl_old_live", deploymentId] }),
    rootDir,
    phase: "live",
    liveVerifyAttempts: 2,
    liveVerifyDelayMs: 0,
  })).resolves.toMatchObject({ deploymentId, phase: "live" });
});

test("production promotion rejects staging Supabase and modified assets", async () => {
  const wrongSupabase = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.vercel.com") return response(deployment());
    if (url.pathname === "/api/client-config") return response({ ok: true, url: "https://pokrksgempkuraueglpu.supabase.co" });
    return response("");
  };
  await expect(verifyProductionPromotion({ env: env(), fetchImpl: wrongSupabase, rootDir, phase: "staged" }))
    .rejects.toThrow(/does not use production Supabase/);

  const changedAsset = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.vercel.com") return response(deployment());
    if (url.pathname === "/api/client-config") return response({ ok: true, url: `https://${projectRef}.supabase.co` });
    return response("changed");
  };
  await expect(verifyProductionPromotion({ env: env(), fetchImpl: changedAsset, rootDir, phase: "staged" }))
    .rejects.toThrow(/does not match the release artifact/);
});
