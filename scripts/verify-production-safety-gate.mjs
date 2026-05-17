import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowEmergency = process.env.RELEASE_ACK_EMERGENCY === "1";
const skipStagingTreeCheck = process.env.RELEASE_SKIP_STAGING_TREE_CHECK === "1";
const failures = [];
const warnings = [];

function clean(value) {
  return String(value || "").trim();
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function runGit(args) {
  return spawnSync("git", args, { cwd: rootDir, stdio: "ignore" }).status === 0;
}

function requireFile(relativePath, label = relativePath) {
  if (!fs.existsSync(path.join(rootDir, relativePath))) {
    failures.push(`${label} is missing.`);
  }
}

function requireEnv(name) {
  if (!clean(process.env[name])) {
    failures.push(`${name} is required for production safety.`);
  }
}

function shortRef(value) {
  return clean(value).slice(0, 7) || "unknown";
}

function isAncestor(baseRef, targetRef) {
  if (!baseRef || !targetRef) return false;
  return runGit(["merge-base", "--is-ancestor", baseRef, targetRef]);
}

function ensureStagingTreeMatchesReleaseCandidate() {
  if (skipStagingTreeCheck) {
    warnings.push("Skipped staging tree check because RELEASE_SKIP_STAGING_TREE_CHECK=1.");
    return;
  }

  runGit(["fetch", "--quiet", "origin", "main", "staging"]);
  const releaseCommit = tryGit(["rev-parse", "HEAD"]);
  const releaseTree = tryGit(["rev-parse", "HEAD^{tree}"]);
  const mainCommit = tryGit(["rev-parse", "origin/main"]);
  const stagingCommit = tryGit(["rev-parse", "origin/staging"]);
  const stagingTree = tryGit(["rev-parse", "origin/staging^{tree}"]);

  if (!stagingTree) {
    failures.push("origin/staging could not be resolved. Push the release candidate to staging before production.");
    return;
  }

  if (releaseTree && stagingTree && releaseTree !== stagingTree) {
    const details = [
      `release=${shortRef(releaseCommit)}`,
      `main=${shortRef(mainCommit)}`,
      `staging=${shortRef(stagingCommit)}`,
    ].join(", ");
    if (stagingCommit && mainCommit && isAncestor(stagingCommit, mainCommit)) {
      failures.push(
        `The production candidate tree does not match origin/staging (${details}). ` +
          "Staging appears behind main. Push the exact main candidate to staging, let Staging Deploy finish, then retry production."
      );
      return;
    }

    if (mainCommit && stagingCommit && isAncestor(mainCommit, stagingCommit)) {
      failures.push(
        `The production candidate tree does not match origin/staging (${details}). ` +
          "Staging contains a different or newer tree than main. Re-align staging to the exact production candidate before retrying."
      );
      return;
    }

    failures.push(
      `The production candidate tree does not match origin/staging (${details}). ` +
        "Main and staging have diverged. Verify the exact same code on staging before production."
    );
  }
}

requireFile(".github/workflows/qa.yml", "GitHub QA workflow");
requireFile(".github/workflows/staging-deploy.yml", "GitHub staging deploy workflow");
requireFile(".github/workflows/staging-smoke.yml", "GitHub staging smoke workflow");
requireFile(".github/workflows/production-deploy.yml", "GitHub production deploy workflow");
requireFile("scripts/verify-local-live-isolation.mjs", "local/live isolation verifier");
requireFile("scripts/verify-staging-env.mjs", "staging environment verifier");
requireFile("scripts/verify-live-qa-env.mjs", "live QA environment verifier");
requireFile("qa/production.live.spec.mjs", "authenticated live smoke test");

const branch = clean(process.env.GITHUB_REF_NAME) || tryGit(["branch", "--show-current"]) || "detached";
if (branch !== "main") {
  failures.push(`Production releases must run from main. Current ref: ${branch}.`);
}

if ((process.env.RELEASE_ALLOW_DIRTY === "1" || process.env.RELEASE_ALLOW_UNPUSHED === "1") && !allowEmergency) {
  failures.push("Emergency release overrides require RELEASE_ACK_EMERGENCY=1 so accidental dirty/unpushed deploys stay blocked.");
}

const productionBaseUrl = clean(process.env.LIVE_QA_BASE_URL) || "https://footballscience.xyz";
const stagingBaseUrl = clean(process.env.STAGING_QA_BASE_URL);
const productionHost = hostFromUrl(productionBaseUrl);
const stagingHost = hostFromUrl(stagingBaseUrl);

for (const name of [
  "LIVE_QA_USERNAME",
  "LIVE_QA_PASSWORD",
  "STAGING_QA_BASE_URL",
  "STAGING_QA_USERNAME",
  "STAGING_QA_PASSWORD",
  "SUPABASE_PROJECT_REF",
  "STAGING_SUPABASE_PROJECT_REF",
]) {
  requireEnv(name);
}

if (!productionHost) {
  failures.push("LIVE_QA_BASE_URL must be a valid production URL.");
}

if (!stagingHost) {
  failures.push("STAGING_QA_BASE_URL must be a valid staging URL.");
}

if (productionHost && stagingHost && productionHost === stagingHost) {
  failures.push("STAGING_QA_BASE_URL must not point at the production host.");
}

if (clean(process.env.SUPABASE_PROJECT_REF) === clean(process.env.STAGING_SUPABASE_PROJECT_REF)) {
  failures.push("STAGING_SUPABASE_PROJECT_REF must not equal SUPABASE_PROJECT_REF.");
}

ensureStagingTreeMatchesReleaseCandidate();

console.log("Production safety gate");
console.log(`- ref: ${branch}`);
console.log(`- production: ${productionHost || "invalid"}`);
console.log(`- staging: ${stagingHost || "invalid"}`);
console.log(`- staging tree match: ${skipStagingTreeCheck ? "skipped" : failures.some((failure) => failure.includes("staging")) ? "no" : "yes"}`);
warnings.forEach((warning) => console.warn(`- warning: ${warning}`));

if (failures.length) {
  console.error("\nProduction safety gate failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("- status: ok");
}
