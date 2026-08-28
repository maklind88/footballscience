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

function requireTextInAny(relativePaths, text, reason) {
  const matches = relativePaths.some((relativePath) => read(relativePath).includes(text));
  if (!matches) {
    failures.push(`${relativePaths.join(" or ")} must contain ${JSON.stringify(text)} (${reason}).`);
  }
}

function forbidText(relativePath, text, reason) {
  const content = read(relativePath);
  if (content.includes(text)) {
    failures.push(`${relativePath} must not contain ${JSON.stringify(text)} (${reason}).`);
  }
}

function forbidFile(relativePath, reason) {
  if (fs.existsSync(path.join(rootDir, relativePath))) {
    failures.push(`${relativePath} must not exist (${reason}).`);
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
requirePackageScript("release:monitor-postdeploy", "RELEASE_ALLOW_LIVE_HASH_MISMATCH=1 node scripts/verify-production-deploy.mjs");
requirePackageScript("qa:auth-health", "node scripts/verify-auth-health.mjs");
requirePackageScript("release:monitor", "npm run release:monitor-postdeploy && npm run qa:auth-health && npm run release:staging-isolation && npm run release:backup && npm run release:restore-readiness && npm run release:restore-drill && npm run qa:live:required");
requirePackageScript("release:incident-alert", "node scripts/create-incident-alert.mjs");
requirePackageScript("release:incident-readiness", "node scripts/verify-incident-readiness.mjs");
requirePackageScript("release:rules", "node scripts/verify-release-rules.mjs");
requirePackageScript("qa", "npm run qa:static && npm run qa:playwright");
requirePackageScript("qa:static", "npm run verify:local-isolation && npm run check && npm run release:rules && npm run release:incident-readiness && npm run storage:guard && npm run security:platform && npm run platform:readiness && npm run qa:supabase && npm run qa:perf && npm run architecture:budgets");
requirePackageScript("qa:playwright", "playwright test --config=qa/playwright.config.mjs");
requirePackageScript("qa:playwright:ci", "playwright test --config=qa/playwright.ci.config.mjs");
requirePackageScript("release:traffic", "node scripts/verify-vercel-release-traffic.mjs");
requirePackageScript("release:staging-isolation", "node scripts/verify-staging-live-isolation.mjs");
requirePackageScript("release:staging-isolation:repair", "node scripts/verify-staging-live-isolation.mjs --repair");
requirePackageScript("release:vercel-token", "node scripts/verify-vercel-token.mjs");
requirePackageScript("storage:guard", "node scripts/verify-storage-key-policy.mjs");
requirePackageScript("security:platform", "node scripts/verify-platform-security.mjs");
requirePackageScript("platform:readiness", "node scripts/verify-platform-readiness.mjs");
requirePackageScript("platform:identity:backfill", "node scripts/platform-identity-backfill.mjs");
requirePackageScript("platform:identity:snapshot", "node scripts/platform-identity-snapshot.mjs");

requireText("vercel.json", "scripts/vercel-ignore-build.mjs", "automatic Vercel production builds must stay blocked");
requireText("package.json", "npm run storage:guard", "full QA must include the storage key policy gate");
requireText("package.json", "npm run security:platform", "full QA must include the platform security control-plane gate");
requireText("package.json", "npm run platform:readiness", "full QA must include the platform readiness contract");
requireText("src/core/platform-readiness-contracts.mjs", "PLATFORM_READINESS_SCHEMA", "platform readiness must have a stable schema");
requireText("src/core/platform-readiness-contracts.mjs", "platform:identity:backfill", "platform readiness must expose the identity backfill operation");
requireText("api/platform-readiness.js", "/api/platform-readiness", "admin dashboard must load readiness through the secured API");
requireTextInAny(["app.js", "src/modules/admin/admin-readiness-renderer.mjs"], "Platform Readiness", "admin must expose a platform readiness dashboard");
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
requireText("scripts/verify-production-deploy.mjs", "/api/auth-health", "postdeploy must verify the auth health endpoint exists");
requireText("scripts/verify-production-deploy.mjs", "Live app.js hash does not match this release", "postdeploy must prove production is serving the expected release asset");
requireText("scripts/verify-production-deploy.mjs", "RELEASE_ALLOW_LIVE_HASH_MISMATCH", "production monitor must verify live health even when main is ahead of live");
requireText("scripts/verify-production-deploy.mjs", "chatPushConfig.enabled === true", "postdeploy must fail closed when chat push is not configured");
requireText("scripts/verify-ci-release-env.mjs", "CRON_SECRET", "production CI must include the cron secret used for backup freshness checks");
requireText("scripts/verify-vercel-token.mjs", "Vercel deployment token: ok", "CI must verify the Vercel token before deployment commands run");
requireText("scripts/verify-vercel-release-traffic.mjs", "Production Deploy", "deploy tooling must avoid concurrent production deploy traffic");
requireText("scripts/verify-staging-live-isolation.mjs", "staging branch", "release tooling must compare staging branch, staging alias, and live alias");
requireText("scripts/verify-staging-live-isolation.mjs", '"alias", "set"', "release tooling must be able to repair the staging alias after direct production deploys");
requireText("scripts/restore-staging-alias.mjs", "listLatestStagingDeployments", "staging alias restore must not trust a stale branch alias");
requireText("scripts/restore-staging-alias.mjs", "assertHostServesCurrentRuntime", "staging alias restore must prove the alias serves the release runtime");
requireText("scripts/quick-ui-deploy.mjs", "release:staging-isolation:repair", "fast UI deploy must repair staging/live alias drift after Vercel CLI production deploys");
requireText("scripts/release-ship.mjs", "release:traffic", "deploy commands must check release traffic before calling Vercel");
requireText("scripts/release-ship.mjs", "release:staging-isolation", "deploy commands must verify staging/live isolation before production deploy");
requireText("scripts/release-ship.mjs", "release:staging-isolation:repair", "direct production deploys must repair staging/live alias drift");
requireText("scripts/release-ship.mjs", "requireCanonicalVercelProjectLink", "fast deploys must fail closed when a worktree is linked to the wrong Vercel project");
requireText("scripts/release-ship.mjs", "footballscience", "fast deploys must target the canonical Vercel project");
requireText("scripts/release-auto.mjs", "requireCanonicalVercelProjectLink", "legacy deploys must fail closed when a worktree is linked to the wrong Vercel project");
requireText("scripts/release-auto.mjs", "release:staging-isolation:repair", "legacy deploys must repair staging/live alias drift after direct production deploys");
forbidFile("scripts/lib/release-lock.mjs", "official releases use exact-SHA Git guards and GitHub release concurrency instead of a local machine lock");
forbidText("scripts/release-ship.mjs", "withReleaseLock", "the owning specialist chat must not wait on a local cross-chat lock");
requireText("scripts/release-ship.mjs", "publishFastReleaseToMain", "fast deploys must publish the exact release SHA to origin/main before production deploy");
requireText("scripts/release-ship.mjs", "origin/main did not fast-forward to the release SHA", "fast deploys must fail if main does not match the deployed SHA");
forbidText("scripts/quick-ui-deploy.mjs", "withReleaseLock", "Fast UI deploy must not wait on a local cross-chat lock");
requireText("scripts/quick-ui-deploy.mjs", "verifyCanonicalVercelProjectLink", "Fast UI deploy must verify or repair the canonical Vercel project binding before main push/deploy");
requireText("scripts/lib/vercel-project-link.mjs", "canonicalVercelProjectName = \"footballscience\"", "Vercel project binding verification must target the canonical footballscience project");
requireText("scripts/lib/vercel-project-link.mjs", "repairFromFallback", "isolated specialist worktrees may reuse a verified canonical root binding when their local .vercel link is missing");
requireText("scripts/quick-ui-deploy.mjs", "branchName.startsWith(\"codex/\")", "Fast UI deploy must support isolated codex/* release branches");
requireText("scripts/quick-ui-deploy.mjs", "origin/main did not fast-forward to the exact release SHA", "Fast UI deploy must fail if production would diverge from main");
forbidText("scripts/release-auto.mjs", "withReleaseLock", "legacy tooling must not restore the removed local lock");
requireText("scripts/release-auto.mjs", "release:auto no longer deploys", "legacy direct deployment must fail closed instead of bypassing current guards");
requireText("scripts/verify-vercel-release-traffic.mjs", "RELEASE_SKIP_TRAFFIC_GUARD=1 is not allowed", "traffic guard skip must fail closed unless a reviewed emergency flow exists");
forbidText("scripts/verify-vercel-release-traffic.mjs", "skipped by RELEASE_SKIP_TRAFFIC_GUARD=1", "traffic guard must not silently skip normal release protection");
for (const workflow of [".github/workflows/staging-deploy.yml", ".github/workflows/production-deploy.yml", ".github/workflows/production-rollback.yml"]) {
  requireText(workflow, "group: footballscience-production-edge-release", "staging, production, and rollback must share one release concurrency group");
  requireText(workflow, "cancel-in-progress: false", "release workflows must wait instead of cancelling an active valid release");
}
requireText("scripts/verify-incident-readiness.mjs", "Incident readiness verification: ok", "incident alerting must stay testable");
requireText("scripts/platform-identity-backfill.mjs", "BACKFILL_PLATFORM_IDENTITY", "platform identity backfill must require explicit apply confirmation");
requireText("scripts/platform-identity-backfill.mjs", "--expected-plan-sha256", "platform identity apply must require a reviewed deterministic plan");
requireText("scripts/platform-identity-backfill.mjs", "--expected-user-count", "platform identity apply must lock the reviewed user count");
requireText("scripts/platform-identity-snapshot.mjs", "CAPTURE_PLATFORM_IDENTITY_SNAPSHOT", "platform identity snapshots must require explicit capture confirmation");
requireText("scripts/lib/platform-identity-snapshot.mjs", "footballscience-platform-identity-snapshot-v1", "platform identity rollback must use an integrity-checked snapshot schema");
requireText("scripts/lib/platform-identity-snapshot-io.mjs", "readAfterWriteVerified", "private identity snapshots must be re-read and hash-verified after storage");
requireText(".github/workflows/platform-identity-snapshot-read-only.yml", "environment: platform-staging", "platform identity snapshot inspection must be staging-only");
requireText(".github/workflows/platform-identity-snapshot-read-only.yml", "summary.dryRun !== true", "platform identity snapshot inspection must verify read-only mode");
forbidText(".github/workflows/platform-identity-snapshot-read-only.yml", "--capture", "platform identity snapshot inspection must not capture data");
forbidText(".github/workflows/platform-identity-snapshot-read-only.yml", "--apply", "platform identity snapshot inspection must not apply identity writes");
requireText("qa/platform-identity-backfill.api.spec.mjs", "app_metadata", "platform identity backfill tests must prove server-owned role derivation");
requireText("qa/platform-identity-backfill.api.spec.mjs", "stale plan before any write", "platform identity tests must prove stale plans cannot write");
requireText("qa/platform-identity-snapshot.api.spec.mjs", "tenant scope changes", "identity rollback must fail closed on tenant scope drift");
requireText(".github/workflows/platform-identity-backfill-dry-run.yml", "workflow_dispatch:", "platform identity backfill dry-run must remain manual");
requireText(".github/workflows/platform-identity-backfill-dry-run.yml", "environment: platform-${{ inputs.target }}", "platform identity backfill must use isolated GitHub Environments");
requireText(".github/workflows/platform-identity-backfill-dry-run.yml", "PLATFORM_BACKFILL_ACTOR_ID: ${{ secrets.PLATFORM_BACKFILL_ACTOR_ID }}", "platform identity actor ids must stay masked in public workflow logs");
forbidText(".github/workflows/platform-identity-backfill-dry-run.yml", "--apply", "platform identity dry-run workflow must not expose writes");
forbidText(".github/workflows/platform-identity-backfill-dry-run.yml", "--capture", "platform identity dry-run workflow must not capture snapshots or expose writes");
requireText("qa/production.live.spec.mjs", "production admin account can open Access & Users", "live smoke must prove admin access");
requireText("qa/production.live.spec.mjs", 'toBe("admin")', "live smoke must fail if the release QA account loses admin");
requireText("qa/production.live.spec.mjs", "production peer accounts prove DM unread state and read receipt end-to-end", "live smoke must prove two-account chat delivery and read receipts");
requireText("qa/production.live.spec.mjs", "ensureLivePeerCredentials", "live smoke must support dynamic two-account chat proof when peer secrets are absent");
requireText("scripts/verify-live-qa-env.mjs", "LIVE_QA_REQUIRE_PEER_CHAT", "live QA environment verifier must support mandatory peer chat smoke");

requireText(".github/workflows/full-qa.yml", "workflow_call:", "full QA must be a reusable exact-commit workflow");
requireText(".github/workflows/full-qa.yml", "npm run qa:static", "full QA must retain every static, security, storage, migration, and architecture gate");
requireText(".github/workflows/full-qa.yml", "npm run security:audit", "full QA must retain the dependency security audit");
requireText("qa/playwright.ci.config.mjs", "baseConfig", "CI Playwright must extend the canonical local configuration");
requireText("qa/playwright.ci.config.mjs", "fullyParallel: true", "CI Playwright must split long browser files at test level");
requireText(".github/workflows/full-qa.yml", "project: api-contracts", "full QA must run every API contract in a dedicated job");
for (const shard of [1, 2, 3, 4]) {
  requireText(".github/workflows/full-qa.yml", `name: Browser shard ${shard} of 4`, `browser shard ${shard} must remain required`);
}
requireText(".github/workflows/full-qa.yml", "project: chromium", "full browser coverage must use the canonical Chromium project");
requireText(".github/workflows/full-qa.yml", "npm run qa:playwright:ci -- --project=${{ matrix.project }} --shard=${{ matrix.shard }}/${{ matrix.total }}", "each CI shard must use the canonical project and assigned test range");
forbidText(".github/workflows/full-qa.yml", "continue-on-error", "no full QA shard may be optional");
requireText(".github/workflows/qa.yml", "uses: ./.github/workflows/full-qa.yml", "pull requests and main must run the shared full QA workflow");

requireText(".github/workflows/staging-deploy.yml", "branches:", "staging must deploy from the staging branch");
requireText(".github/workflows/staging-deploy.yml", "- staging", "staging branch must remain explicit");
requireText(".github/workflows/staging-deploy.yml", "uses: ./.github/workflows/full-qa.yml", "staging must run the shared full QA workflow");
requireText(".github/workflows/staging-deploy.yml", "needs: full-qa", "staging deploy must wait for every full QA shard");
requireText(".github/workflows/staging-deploy.yml", "npm run qa:staging:required", "staging must prove authenticated smoke");
requireText(".github/workflows/staging-deploy.yml", "npm run release:vercel-token", "staging must fail closed when the Vercel token is invalid");
requireText(".github/workflows/staging-deploy.yml", "api.vercel.com/v2/deployments", "staging alias should use the API path that works for subdomains");

requireText(".github/workflows/production-deploy.yml", "workflow_dispatch:", "production deploy must be manually triggered by deploy tooling");
forbidText(".github/workflows/production-deploy.yml", "workflow_run:", "production deploy must not auto-run after every main QA success");
requireText(".github/workflows/production-deploy.yml", "uses: ./.github/workflows/full-qa.yml", "production must run the shared full QA workflow");
requireText(".github/workflows/production-deploy.yml", "needs: full-qa", "production deploy must wait for every full QA shard");
requireText(".github/workflows/production-deploy.yml", "npm run release:preflight", "production must retain release preflight after parallel QA");
requireText(".github/workflows/production-deploy.yml", "npm run release:safety", "production deploy must keep the safety gate");
requireText(".github/workflows/production-deploy.yml", "npm run qa:staging:required", "production deploy must verify staging first");
requireText(".github/workflows/production-deploy.yml", "npm run release:vercel-token", "production must fail closed when the Vercel token is invalid");
requireText(".github/workflows/production-deploy.yml", "vercel@53.2.0 deploy --prebuilt --prod", "production deploy must use the pinned Vercel CLI prebuilt path");
requireText(".github/workflows/production-deploy.yml", "deploy --prebuilt --prod --skip-domain", "production deploy must stage the exact production artifact before domain promotion");
requireText(".github/workflows/production-deploy.yml", "node scripts/verify-production-promotion.mjs --phase=staged", "production must verify the staged artifact before promotion");
requireText(".github/workflows/production-deploy.yml", "vercel@53.2.0 promote", "production must promote the already verified artifact without rebuilding");
requireText(".github/workflows/production-deploy.yml", "node scripts/verify-production-promotion.mjs --phase=live", "production must prove the live domain points to the exact deployment");
requireText("scripts/lib/production-promotion.mjs", "liveId !== stagedId", "production promotion must compare exact Vercel deployment ids");
requireText("scripts/lib/production-promotion.mjs", "SUPABASE_PROJECT_REF", "production promotion must prove the production Supabase environment");
requireText("scripts/verify-live-qa-env.mjs", "LEADERBOARD_LIVE_QA_TEAM_ID", "live QA must require a deterministic team-scoped Leaderboard identity");
requireText(".github/workflows/production-deploy.yml", "npm run release:postdeploy", "production deploy must verify the live domain");
requireText(".github/workflows/production-deploy.yml", "npm run release:staging-isolation:repair", "production deploy must repair staging/live alias drift before live verification");
requireText(".github/workflows/production-deploy.yml", "npm run qa:live:required", "production deploy must run authenticated live smoke");
requireText(".github/workflows/production-deploy.yml", 'LIVE_QA_EXPECT_ADMIN: "1"', "production deploy must prove the live QA account still has admin access");
requireText(".github/workflows/production-deploy.yml", "LIVE_QA_PEER_USERNAME", "production deploy must pass peer live QA credentials for two-account chat smoke");
requireText(".github/workflows/production-deploy.yml", "vars.LIVE_QA_REQUIRE_PEER_CHAT || '1'", "production deploy must require two-account chat smoke by default");
requireText(".github/workflows/production-deploy.yml", "CRON_SECRET", "production deploy must receive the cron secret required by the release environment gate");

requireText(".github/workflows/production-smoke.yml", "schedule:", "production monitoring must run automatically");
requireText(".github/workflows/production-smoke.yml", "npm run release:monitor", "production monitoring must run postdeploy and live smoke");
requireText("package.json", "npm run release:staging-isolation", "production monitoring must verify staging/live isolation");
requireText(".github/workflows/production-smoke.yml", 'LIVE_QA_EXPECT_ADMIN: "1"', "production monitoring must prove the live QA account still has admin access");
requireText(".github/workflows/production-smoke.yml", "LIVE_QA_PEER_USERNAME", "production monitoring must pass peer live QA credentials for two-account chat smoke");
requireText(".github/workflows/production-smoke.yml", "vars.LIVE_QA_REQUIRE_PEER_CHAT || '1'", "production monitoring must require two-account chat smoke by default");
requireText(".github/workflows/production-smoke.yml", "CRON_SECRET", "production monitoring must verify backup freshness with the cron secret");

requireText(".github/workflows/production-incident-alert.yml", "workflow_run:", "incident alerting must watch workflow completions");
requireText(".github/workflows/production-incident-alert.yml", "Production Deploy", "production deploy failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "Production Monitor", "production monitor failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "issues: write", "incident alerting must be able to open GitHub issues");
requireText(".github/workflows/production-incident-alert.yml", "npm run release:incident-alert", "incident alerting must use the shared script");

requireText(".github/workflows/production-rollback.yml", "workflow_dispatch:", "rollback must be manual only");
requireText(".github/workflows/production-rollback.yml", "ROLLBACK", "rollback must require explicit confirmation");
requireText(".github/workflows/production-rollback.yml", "npm run release:vercel-token", "rollback must fail closed when the Vercel token is invalid");
requireText(".github/workflows/production-rollback.yml", "vercel@53.2.0 rollback", "rollback must use the pinned Vercel CLI");
requireText(".github/workflows/production-rollback.yml", "npm run release:staging-isolation:repair", "rollback must repair staging/live alias drift before live verification");
requireText(".github/workflows/production-rollback.yml", "LIVE_QA_PEER_USERNAME", "rollback verification must pass peer live QA credentials for two-account chat smoke");
requireText(".github/workflows/production-rollback.yml", "vars.LIVE_QA_REQUIRE_PEER_CHAT || '1'", "rollback must require two-account chat smoke by default");
requireText(".github/workflows/production-rollback.yml", "npm run release:postdeploy", "rollback must verify the live domain");
requireText(".github/workflows/production-rollback.yml", "npm run qa:live:required", "rollback must run authenticated live smoke");
requireText(".github/workflows/production-rollback.yml", 'LIVE_QA_EXPECT_ADMIN: "1"', "rollback verification must prove the live QA account still has admin access");


function verifyUserControlledReleaseGovernance() {
  const activeGovernanceFiles = [
    "AGENTS.md",
    "docs/AI_HANDOFF.md",
    "docs/LIVE_FIRST_WORKFLOW.md",
    "docs/DEPLOYMENT.md",
    "docs/CURRENT_OPERATING_PLAN.md",
    "docs/CODEX_TEAM_ROSTER.md",
    "docs/QUICK_UI_WORKFLOW.md",
    "docs/WORKING_AGREEMENT.md",
    "docs/PLATFORM_SCALE_PROGRAM.md",
    "docs/PLATFORM_EVOLUTION_PLAN.md",
    "docs/MODULE_STANDARD.md",
  ];
  const inferredReleasePhrases = [
    "without requiring a separate `Deploy`/`Live` message",
    "Clear product intent that requires a live result also authorizes",
    "A separate `Deploy`/`Live` message is not required",
    "Explicit `Deploy`/`Live` messages remain optional convenience commands",
    "convenience commands, not the only way to authorize a release",
  ];
  const centralOwnerPhrases = [
    "must request a release slot",
    "requires a release slot",
    "must wait for central deploy approval",
  ];

  for (const file of activeGovernanceFiles) {
    for (const phrase of inferredReleasePhrases) {
      forbidText(file, phrase, "governance must not infer deploy authorization from product intent");
    }
    for (const phrase of centralOwnerPhrases) {
      forbidText(file, phrase, "governance must not reintroduce a central deploy owner or routine release-slot bottleneck");
    }
  }

  requireText("AGENTS.md", "Only the user can activate a release.", "release activation must remain user-controlled");
  requireText("AGENTS.md", "distributed-specialist-v4", "all chats must inherit the current direct specialist release model");
  requireText("AGENTS.md", "A cross-chat delegation or handoff is never release authorization.", "delegations must not authorize releases");
  requireText("AGENTS.md", "overall completion percentage for the entire user-requested task", "every chat must report whole-task progress during long-running work");
  requireText("AGENTS.md", "approximately every 10 minutes", "long-running progress updates need a predictable cadence");
  requireText("AGENTS.md", "must never be presented as the overall task percentage", "subtask progress must not be confused with whole-task completion");
  requireText("AGENTS.md", "Do not create subagents solely to coordinate or run a routine release.", "routine releases must stay in the owning chat without coordination agents");
  requireText("docs/AI_HANDOFF.md", "Only a direct user message in the current chat", "new chats must inherit manual release authorization");
  requireText("docs/AI_HANDOFF.md", "distributed-specialist-v4", "handoffs must advertise the current specialist release model");
  requireText("docs/module-chats/COMMON_SPECIALIST_RULES.md", "Only a direct user message in this chat can activate", "all specialist starters must inherit manual release authorization");
  requireText("docs/module-chats/COMMON_SPECIALIST_RULES.md", "Cross-chat delegations and handoffs are status-only", "specialist handoffs must remain informational");
  requireText("docs/module-chats/COMMON_SPECIALIST_RULES.md", "distributed-specialist-v4", "specialist starters must use the current release model");
  requireText("docs/module-chats/COMMON_SPECIALIST_RULES.md", "Routine releases are run directly by this owning chat; do not create subagents solely to coordinate or run them.", "specialist releases must not spawn routine coordination agents");
  requireText("docs/module-chats/COMMON_SPECIALIST_RULES.md", "overall completion percentage for the entire user-requested task", "all specialist starters must inherit whole-task progress reporting");

  const starterDirs = [
    path.join("docs", "chat-starters"),
    path.join("docs", "module-chats"),
  ];
  const starterFiles = [];
  for (const commonRulesPath of ["COMMON_SPECIALIST_RULES.md", path.join("docs", "chat-starters", "COMMON_SPECIALIST_RULES.md"), path.join("docs", "module-chats", "COMMON_SPECIALIST_RULES.md")]) {
    if (fs.existsSync(path.join(rootDir, commonRulesPath))) starterFiles.push(commonRulesPath);
  }
  for (const dir of starterDirs) {
    const fullDir = path.join(rootDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const name of fs.readdirSync(fullDir)) {
      if (name.endsWith(".md")) starterFiles.push(path.join(dir, name));
    }
  }

  for (const file of [...new Set(starterFiles)]) {
    const content = read(file);
    if (!content.includes("AGENTS.md") && !file.endsWith("COMMON_SPECIALIST_RULES.md")) {
      failures.push(`${file} must reference AGENTS.md so user-controlled release authorization reaches every chat starter.`);
    }
    for (const phrase of inferredReleasePhrases) {
      if (content.includes(phrase)) {
        failures.push(`${file} must not contain ${JSON.stringify(phrase)} (chat starters must not infer release authorization).`);
      }
    }
    for (const phrase of centralOwnerPhrases) {
      if (content.includes(phrase)) {
        failures.push(`${file} must not contain ${JSON.stringify(phrase)} (chat starters must not reintroduce central release ownership).`);
      }
    }
  }
}

verifyUserControlledReleaseGovernance();

if (failures.length) {
  console.error("Release rules verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Release rules verification: ok");
}
