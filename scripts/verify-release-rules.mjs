import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireText(relativePath, text, reason) {
  const content = read(relativePath);
  if (!content.includes(text)) {
    failures.push(`${relativePath} must contain ${JSON.stringify(text)} (${reason}).`);
  }
}

function requirePackageScript(name, expected) {
  const packageJson = JSON.parse(read("package.json") || "{}");
  const actual = packageJson.scripts?.[name] || "";
  if (actual !== expected) {
    failures.push(`package.json script ${name} must be ${JSON.stringify(expected)}.`);
  }
}

requirePackageScript("release:backup", "node scripts/verify-app-state-backup-freshness.mjs");
requirePackageScript("release:monitor", "npm run release:postdeploy && npm run release:backup && npm run qa:live:required");
requirePackageScript("release:rules", "node scripts/verify-release-rules.mjs");

requireText("vercel.json", "scripts/vercel-ignore-build.mjs", "automatic Vercel production builds must stay blocked");
requireText("api/app-state-backup-status.js", "backupMatchesPointer", "backup status must verify pointer/object integrity");
requireText("scripts/verify-production-deploy.mjs", "/api/app-state-backup-status", "postdeploy must prove backup status endpoint is protected");
requireText("scripts/verify-ci-release-env.mjs", "CRON_SECRET", "production CI must include the cron secret used for backup freshness checks");

requireText(".github/workflows/staging-deploy.yml", "branches:", "staging must deploy from the staging branch");
requireText(".github/workflows/staging-deploy.yml", "- staging", "staging branch must remain explicit");
requireText(".github/workflows/staging-deploy.yml", "npm run qa", "staging must run full QA");
requireText(".github/workflows/staging-deploy.yml", "npm run qa:staging:required", "staging must prove authenticated smoke");
requireText(".github/workflows/staging-deploy.yml", "api.vercel.com/v2/deployments", "staging alias should use the API path that works for subdomains");

requireText(".github/workflows/production-deploy.yml", "workflows:", "production deploy must be triggered by QA");
requireText(".github/workflows/production-deploy.yml", "- QA", "production deploy must wait for QA");
requireText(".github/workflows/production-deploy.yml", "npm run release:safety", "production deploy must keep the safety gate");
requireText(".github/workflows/production-deploy.yml", "npm run qa:staging:required", "production deploy must verify staging first");
requireText(".github/workflows/production-deploy.yml", "vercel@53.2.0 deploy --prebuilt --prod", "production deploy must use the pinned Vercel CLI prebuilt path");
requireText(".github/workflows/production-deploy.yml", "npm run release:postdeploy", "production deploy must verify the live domain");
requireText(".github/workflows/production-deploy.yml", "npm run qa:live:required", "production deploy must run authenticated live smoke");
requireText(".github/workflows/production-deploy.yml", "CRON_SECRET", "production deploy must receive the cron secret required by the release environment gate");

requireText(".github/workflows/production-smoke.yml", "schedule:", "production monitoring must run automatically");
requireText(".github/workflows/production-smoke.yml", "npm run release:monitor", "production monitoring must run postdeploy and live smoke");
requireText(".github/workflows/production-smoke.yml", "CRON_SECRET", "production monitoring must verify backup freshness with the cron secret");

requireText(".github/workflows/production-rollback.yml", "workflow_dispatch:", "rollback must be manual only");
requireText(".github/workflows/production-rollback.yml", "ROLLBACK", "rollback must require explicit confirmation");
requireText(".github/workflows/production-rollback.yml", "vercel@53.2.0 rollback", "rollback must use the pinned Vercel CLI");
requireText(".github/workflows/production-rollback.yml", "npm run release:postdeploy", "rollback must verify the live domain");
requireText(".github/workflows/production-rollback.yml", "npm run qa:live:required", "rollback must run authenticated live smoke");

if (failures.length) {
  console.error("Release rules verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Release rules verification: ok");
}
