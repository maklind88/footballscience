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
requirePackageScript("release:restore-readiness", "node scripts/verify-app-state-restore-readiness.mjs");
requirePackageScript("release:restore-drill", "node scripts/verify-app-state-restore-drill.mjs");
requirePackageScript("release:monitor", "npm run release:postdeploy && npm run release:backup && npm run release:restore-readiness && npm run release:restore-drill && npm run qa:live:required");
requirePackageScript("release:rules", "node scripts/verify-release-rules.mjs");
requirePackageScript("release:vercel-token", "node scripts/verify-vercel-token.mjs");
requirePackageScript("storage:guard", "node scripts/verify-storage-key-policy.mjs");
requirePackageScript("security:platform", "node scripts/verify-platform-security.mjs");

requireText("vercel.json", "scripts/vercel-ignore-build.mjs", "automatic Vercel production builds must stay blocked");
requireText("package.json", "npm run storage:guard", "full QA must include the storage key policy gate");
requireText("package.json", "npm run security:platform", "full QA must include the platform security control-plane gate");
requireText("scripts/verify-storage-key-policy.mjs", "approvedLocalOnlyStorageKeys", "new local-only storage keys must be explicitly justified");
requireText("scripts/verify-platform-security.mjs", "Platform security verification: ok", "platform tenant isolation and permission matrix must stay testable");
requireText("src/core/permission-matrix.cjs", "platformPermissionMatrix", "backend permissions must live in the central permission matrix");
requireText("api/_lib/platform-security.js", "footballscience-api-security-event-v1", "API observability must keep a stable structured log schema");
requireText("api/_lib/platform-security.js", "X-RateLimit-Limit", "API guard must expose rate limit state");
requireText("api/_lib/platform-security.js", "api.permission_denied", "API guard must log blocked backend permissions");
requireText("api/_lib/supabase-admin.js", "finishApiRequest", "API JSON responses must close security observability spans");
requireText("supabase/migrations/20260510030705_platform_security_control_plane.sql", "public.platform_permission_matrix", "database must include a server-owned permission matrix");
requireText("supabase/migrations/20260510030705_platform_security_control_plane.sql", "public.platform_security_events", "database must include security event storage for incidents");
requireText("supabase/migrations/20260510030705_platform_security_control_plane.sql", "app_private.has_platform_permission", "RLS policies need a server-side permission helper");
requireText("api/app-state-backup.js", "backupMatchesPointer", "backup status must verify pointer/object integrity");
requireText("api/app-state-backup.js", "manifestCoverage", "backup status must expose restore-readiness metadata without raw entries");
requireText("api/app-state-backup.js", "createRestoreDrillSummary", "backup restore drill must parse the latest backup without writing data");
requireText("scripts/verify-app-state-restore-readiness.mjs", "dataSafetyRegistry.keys()", "restore readiness must check every protected Data Safety key");
requireText("scripts/verify-app-state-restore-drill.mjs", "dryRun", "restore drill must prove it is read-only");
requireText("vercel.json", "/api/app-state-backup-status", "backup status route must reuse the existing backup function");
requireText("scripts/verify-production-deploy.mjs", "/api/app-state-backup-status", "postdeploy must prove backup status endpoint is protected");
requireText("scripts/verify-production-deploy.mjs", "Live app.js hash does not match this release", "postdeploy must prove production is serving the expected release asset");
requireText("scripts/verify-ci-release-env.mjs", "CRON_SECRET", "production CI must include the cron secret used for backup freshness checks");
requireText("scripts/verify-vercel-token.mjs", "Vercel deployment token: ok", "CI must verify the Vercel token before deployment commands run");

requireText(".github/workflows/staging-deploy.yml", "branches:", "staging must deploy from the staging branch");
requireText(".github/workflows/staging-deploy.yml", "- staging", "staging branch must remain explicit");
requireText(".github/workflows/staging-deploy.yml", "npm run qa", "staging must run full QA");
requireText(".github/workflows/staging-deploy.yml", "npm run qa:staging:required", "staging must prove authenticated smoke");
requireText(".github/workflows/staging-deploy.yml", "npm run release:vercel-token", "staging must fail closed when the Vercel token is invalid");
requireText(".github/workflows/staging-deploy.yml", "api.vercel.com/v2/deployments", "staging alias should use the API path that works for subdomains");

requireText(".github/workflows/production-deploy.yml", "workflows:", "production deploy must be triggered by QA");
requireText(".github/workflows/production-deploy.yml", "- QA", "production deploy must wait for QA");
requireText(".github/workflows/production-deploy.yml", "npm run release:safety", "production deploy must keep the safety gate");
requireText(".github/workflows/production-deploy.yml", "npm run qa:staging:required", "production deploy must verify staging first");
requireText(".github/workflows/production-deploy.yml", "npm run release:vercel-token", "production must fail closed when the Vercel token is invalid");
requireText(".github/workflows/production-deploy.yml", "vercel@53.2.0 deploy --prebuilt --prod", "production deploy must use the pinned Vercel CLI prebuilt path");
requireText(".github/workflows/production-deploy.yml", "npm run release:postdeploy", "production deploy must verify the live domain");
requireText(".github/workflows/production-deploy.yml", "npm run qa:live:required", "production deploy must run authenticated live smoke");
requireText(".github/workflows/production-deploy.yml", "CRON_SECRET", "production deploy must receive the cron secret required by the release environment gate");

requireText(".github/workflows/production-smoke.yml", "schedule:", "production monitoring must run automatically");
requireText(".github/workflows/production-smoke.yml", "npm run release:monitor", "production monitoring must run postdeploy and live smoke");
requireText(".github/workflows/production-smoke.yml", "CRON_SECRET", "production monitoring must verify backup freshness with the cron secret");

requireText(".github/workflows/production-rollback.yml", "workflow_dispatch:", "rollback must be manual only");
requireText(".github/workflows/production-rollback.yml", "ROLLBACK", "rollback must require explicit confirmation");
requireText(".github/workflows/production-rollback.yml", "npm run release:vercel-token", "rollback must fail closed when the Vercel token is invalid");
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
