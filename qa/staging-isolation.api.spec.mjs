import { expect, test } from "@playwright/test";
import { assertStagingDeploymentIdentity, readIsolationClientConfig, readStagingIsolationReport } from "../scripts/lib/staging-isolation.mjs";

const hosts = { branch: "branch.vercel.app", staging: "staging.example.com", live: "live.example.com" };
const env = { VERCEL_TOKEN: "test-token", VERCEL_ORG_ID: "team_owner", VERCEL_PROJECT_ID: "prj_expected" };
const stagingRef = "pokrksgempkuraueglpu";
const liveRef = "bustidorxevacosqhkcz";
const config = (ref) => Response.json({ url: `https://${ref}.supabase.co`, ok: true });
function deployments() {
  const shared = { id: "dpl_staging", projectId: env.VERCEL_PROJECT_ID, readyState: "READY", target: null, meta: { githubCommitRef: "staging" } };
  return { branch: structuredClone(shared), staging: structuredClone(shared), live: { ...shared, id: "dpl_live", target: "production", meta: { githubCommitRef: "main" } } };
}
function fixture({ protectedBranch = true, metadata = deployments(), liveProject = liveRef, apiStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.hostname === "api.vercel.com") {
      expect(options.redirect).toBe("error");
      expect(options.headers.Authorization).toBe(`Bearer ${env.VERCEL_TOKEN}`);
      expect(url.searchParams.get("teamId")).toBe(env.VERCEL_ORG_ID);
      const host = decodeURIComponent(url.pathname.split("/").at(-1));
      const key = Object.keys(hosts).find((key) => hosts[key] === host);
      return Response.json(metadata[key], { status: apiStatus });
    }
    expect(options.redirect).toBe("manual");
    expect(options.headers).toBeUndefined();
    if (url.hostname === hosts.branch && protectedBranch) return new Response(null, { status: 302, headers: { location: "https://vercel.com/login" } });
    return config(url.hostname === hosts.live ? liveProject : stagingRef);
  };
  return { calls, fetchImpl, env };
}

test("public staging config does not require Vercel credentials", async () => {
  const options = fixture({ protectedBranch: false });
  const report = await readStagingIsolationReport(hosts, { ...options, env: {} });
  expect(report.stagingBranch.supabaseRef).toBe(stagingRef);
  expect(options.calls).toHaveLength(3);
});

test("protected staging is verified through exact deployment metadata without a protection bypass", async () => {
  const options = fixture();
  const report = await readStagingIsolationReport(hosts, options);
  expect(report.stagingBranch.verifiedDeploymentId).toBe("dpl_staging");
  expect(report.stagingBranch.supabaseRef).toBe(stagingRef);
  expect(report.live.supabaseRef).toBe(liveRef);
  expect(options.calls).toHaveLength(6);
  expect(options.calls.every(({ url }) => url.hostname !== "vercel.com")).toBe(true);
});

test("protected staging fails closed without credentials or API access", async () => {
  await expect(readStagingIsolationReport(hosts, { ...fixture(), env: {} })).rejects.toThrow("requires VERCEL_TOKEN");
  await expect(readStagingIsolationReport(hosts, fixture({ apiStatus: 403 }))).rejects.toThrow("metadata check failed (403)");
});

for (const scenario of ["different artifact", "same as live", "wrong project", "not ready", "production staging", "wrong branch", "preview live", "missing id"]) {
  test(`deployment identity rejects ${scenario}`, () => {
    const data = deployments();
    if (scenario === "different artifact") data.staging.id = "other";
    if (scenario === "same as live") data.live.id = data.branch.id;
    if (scenario === "wrong project") data.staging.projectId = "prj_other";
    if (scenario === "not ready") data.branch.readyState = "ERROR";
    if (scenario === "production staging") data.branch.target = "production";
    if (scenario === "wrong branch") data.branch.meta.githubCommitRef = "main";
    if (scenario === "preview live") data.live.target = null;
    if (scenario === "missing id") delete data.live.id;
    expect(() => assertStagingDeploymentIdentity(data, env.VERCEL_PROJECT_ID)).toThrow();
  });
}

test("protected alias drift stops before automatic repair can be reached", async () => {
  const data = deployments();
  data.staging.id = "dpl_live";
  await expect(readStagingIsolationReport(hosts, fixture({ metadata: data }))).rejects.toThrow("refusing automatic alias repair");
});

test("matching database refs remain visible to the isolation guard", async () => {
  const report = await readStagingIsolationReport(hosts, fixture({ liveProject: stagingRef }));
  expect(report.stagingBranch.supabaseRef).toBe(report.live.supabaseRef);
});

test("missing, malformed and HTML client config responses fail closed", async () => {
  for (const url of [undefined, "http://example.com", "https://not-supabase.example", `https://${stagingRef}.supabase.co/other`]) {
    await expect(readIsolationClientConfig(hosts.branch, async () => Response.json({ url }))).rejects.toThrow("invalid Supabase configuration");
  }
  await expect(readIsolationClientConfig(hosts.branch, async () => new Response("<html>Login</html>"))).rejects.toThrow("invalid Supabase configuration");
});

test("public Live protection is not silently accepted by metadata fallback", async () => {
  await expect(readStagingIsolationReport(hosts, { env, fetchImpl: async () => new Response(null, { status: 302 }) })).rejects.toThrow("protected or redirected");
});
