import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreReviewedStaging, stagingRestoreAssets, stagingRestoreTarget, validateStagingRestoreInput } from "./lib/reviewed-staging-restore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = process.env, run = promisify(execFile);
const input = { deploymentUrl: env.RESTORE_STAGING_DEPLOYMENT, sourceSha: env.RESTORE_STAGING_SOURCE_SHA,
  projectId: env.VERCEL_PROJECT_ID, teamId: env.VERCEL_ORG_ID, stagingUrl: env.STAGING_QA_BASE_URL };
const host = validateStagingRestoreInput(input);
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
if (env.GITHUB_ACTIONS !== "true" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "") || git(["rev-parse", "HEAD"]) !== env.GITHUB_SHA
  || git(["status", "--porcelain"])) throw new Error("Restore requires a clean exact-SHA GitHub checkout in the shared release queue.");
if (!env.VERCEL_TOKEN) throw new Error("Vercel authentication is required.");
git(["merge-base", "--is-ancestor", input.sourceSha, "HEAD"]);
execFileSync("node", ["scripts/verify-vercel-release-traffic.mjs"], { cwd: root, env, stdio: "inherit" });
const linkPath = path.join(root, ".vercel", "project.json");
if (fs.existsSync(linkPath)) {
  const link = JSON.parse(fs.readFileSync(linkPath, "utf8"));
  if (link.projectId !== stagingRestoreTarget.project || link.orgId !== stagingRestoreTarget.team) throw new Error("Local Vercel binding does not match the canonical project.");
} else {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.writeFileSync(linkPath, JSON.stringify({ projectId: stagingRestoreTarget.project, orgId: stagingRestoreTarget.team, projectName: "footballscience" }));
}
const allowedHosts = new Set([host, stagingRestoreTarget.staging, stagingRestoreTarget.production]);
const allowedAssets = new Set(["api/client-config", ...stagingRestoreAssets]);
const request = async (path, options = {}) => {
  const url = new URL(path, "https://api.vercel.com"); url.searchParams.set("teamId", stagingRestoreTarget.team);
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Vercel staging request failed (${response.status}).`);
  return response.json();
};
const result = await restoreReviewedStaging({ input,
  inspect: async hostname => {
    if (!allowedHosts.has(hostname)) throw new Error("Unapproved deployment probe.");
    const value = await request(`/v13/deployments/${hostname}`);
    return { ...value, projectId: value.projectId || value.project?.id };
  },
  readSource: (sha, asset) => execFileSync("git", ["show", `${sha}:${asset}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 }),
  readText: async (hostname, asset) => {
    if (!allowedHosts.has(hostname) || !allowedAssets.has(asset)) throw new Error("Unapproved source probe.");
    const url = new URL(`/${asset}`, `https://${hostname}`); url.searchParams.set("restoreVerify", Date.now());
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (hostname !== host || ![301, 302, 303, 307, 308, 401, 403].includes(response.status)) throw new Error(`Staging source probe failed (${response.status}).`);
    let stdout;
    try {
      ({ stdout } = await run("npx", ["--yes", "vercel@53.2.0", "curl", url.pathname + url.search, "--deployment", url.origin,
        "--scope", stagingRestoreTarget.team, "--", "--silent", "--show-error", "--max-time", "30", "--proto", "=https", "--no-location", "--max-redirs", "0", "--write-out", "\n%{http_code}"],
      { cwd: root, env, encoding: "utf8", timeout: 90000, maxBuffer: 8 * 1024 * 1024 }));
    } catch { throw new Error("Authenticated staging source probe failed."); }
    const separator = stdout.lastIndexOf("\n");
    if (separator < 0 || !/^2\d\d$/.test(stdout.slice(separator + 1).trim())) throw new Error("Authenticated staging source probe was not successful.");
    return stdout.slice(0, separator);
  },
  assign: (deploymentId, alias) => request(`/v2/deployments/${deploymentId}/aliases`, { method: "POST", body: JSON.stringify({ alias }) }),
});
console.log(JSON.stringify(result));
