import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

const protectedStorageKeys = [
  "football-workspace-hub-v3",
  "football-platform-structure-v1",
  "football-platform-appearance-v1",
  "football-periodization-v2",
  "football-schedule-v1",
  "football-session-planner-v3",
  "football-session-exercise-library-v1",
  "football-session-exercise-library-backup-v1",
  "football-session-exercise-library-folders-v1",
  "football-session-exercise-library-folders-backup-v1",
  "football-dashboard-tasks-v1",
  "football-dashboard-chat-v1",
  "football-dashboard-notification-seen-v1",
  "football-dashboard-tutorial-prefs-v1",
  "football-dashboard-news-seen-v1",
  "football-dashboard-presentation-mode-v1",
  "football-medical-team-v1",
  "football-player-profiles-v1",
  "football-scouting-v1",
  "football-simulator-sequence-v1",
  "football-simulator-sequence-library-v2",
];

const moduleContractIds = [
  "platform-shell",
  "platform-readiness",
  "platform-appearance",
  "platform-identity",
  "home",
  "chat",
  "schedule",
  "exercise-library",
  "periodization",
  "session-planner",
  "medical-team",
  "player-profiles",
  "scouting",
  "game-simulator",
];

const coreFiles = [
  "src/core/platform-contracts.mjs",
  "src/core/data-safety-contracts.cjs",
  "src/core/data-safety-contracts.mjs",
  "src/core/permission-matrix.cjs",
  "src/core/permission-matrix.mjs",
  "src/core/module-registry.mjs",
  "src/core/permissions.mjs",
  "src/core/events.mjs",
  "src/core/storage-adapters.mjs",
  "src/core/index.mjs",
  "src/core/platform-readiness-contracts.mjs",
  "src/core/workspace-module-runtime-controller.mjs",
  "src/modules/manifest.mjs",
  "src/modules/home/tasks.mjs",
  "src/modules/home/tasks-adapter.mjs",
  "src/modules/home/dashboard-runtime-controller.mjs",
  "src/modules/home/chat.mjs",
  "src/modules/home/chat-adapter.mjs",
  "src/modules/home/index.mjs",
  "src/modules/presentation-mode/index.mjs",
  "src/modules/presentation-mode/presentation-mode-controller.mjs",
  "src/modules/presentation-mode/presentation-mode-renderer.mjs",
  "src/modules/chat/chat.mjs",
  "src/modules/chat/chat-adapter.mjs",
  "src/modules/chat/chat-api-client.mjs",
  "src/modules/chat/chat-widget-renderer.mjs",
  "src/modules/chat/index.mjs",
  "src/modules/exercise-library/index.mjs",
  "src/modules/exercise-library/exercise-library-actions.mjs",
  "src/modules/exercise-library/exercise-library-renderer.mjs",
  "src/modules/exercise-library/exercise-library-review-helpers.mjs",
  "src/modules/exercise-library/exercise-library-runtime-facade.mjs",
  "src/modules/exercise-library/exercise-library-runtime-controller.mjs",
  "src/modules/exercise-library/exercise-library-state.mjs",
  "src/modules/session-planner/index.mjs",
  "src/modules/session-planner/session-planner-autosave.mjs",
  "src/modules/session-planner/session-planner-renderer.mjs",
  "src/modules/session-planner/session-planner-tactical-controller.mjs",
  "src/modules/session-planner/session-planner-workspace-controller.mjs",
  "src/modules/session-planner/session-planner-visual-renderer.mjs",
  "src/modules/session-planner/session-planner-player-board-renderer.mjs",
  "src/modules/session-planner/session-planner-print-renderer.mjs",
  "src/modules/session-planner/session-planner-runtime-renderers.mjs",
  "src/modules/session-planner/session-planner-runtime-service.mjs",
  "src/modules/session-planner/session-planner-state-merge-helpers.mjs",
  "src/modules/session-planner/session-planner-board-history-controller.mjs",
  "src/modules/schedule/events.mjs",
  "src/modules/schedule/schedule-adapter.mjs",
  "src/modules/schedule/index.mjs",
  "src/modules/squad/players.mjs",
  "src/modules/squad/player-profile-age-helpers.mjs",
  "src/modules/squad/player-profile-helpers.mjs",
  "src/modules/squad/player-profile-intelligence-helpers.mjs",
  "src/modules/squad/squad-adapter.mjs",
  "src/modules/squad/squad-data-foundation.mjs",
  "src/modules/squad/squad-import-planner.mjs",
  "src/modules/squad/squad-scouting-profile-helpers.mjs",
  "src/modules/squad/squad-scouting-runtime.mjs",
  "src/modules/squad/index.mjs",
  "src/modules/game-simulator/index.mjs",
  "src/modules/game-simulator/action-space-metrics.mjs",
  "src/modules/game-simulator/autopilot-live-engine.mjs",
  "src/modules/game-simulator/ball-resolution-engine.mjs",
  "src/modules/game-simulator/autopilot-candidates.mjs",
  "src/modules/game-simulator/autopilot-decision-engine.mjs",
  "src/modules/game-simulator/autopilot-chance-decisions.mjs",
  "src/modules/game-simulator/autopilot-advantage-decisions.mjs",
  "src/modules/game-simulator/autopilot-tempo-rhythm.mjs",
  "src/modules/game-simulator/autopilot-possession-planner.mjs",
  "src/modules/game-simulator/autopilot-defensive-goalkeeper-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-press-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-corner-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-free-kick-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-penalty-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-throw-in-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-negative-transition-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-loose-ball-targets.mjs",
  "src/modules/game-simulator/autopilot-defensive-targets.mjs",
  "src/modules/game-simulator/autopilot-offball-targets.mjs",
  "src/modules/game-simulator/autopilot-targets.mjs",
  "src/modules/game-simulator/command-engine.mjs",
  "src/modules/game-simulator/lazy-runtime-bridge.mjs",
  "src/modules/game-simulator/canvas-renderer.mjs",
  "src/modules/game-simulator/setup-engine.mjs",
  "src/modules/game-simulator/sequence-engine.mjs",
  "src/modules/game-simulator/controllers.mjs",
  "src/modules/game-simulator/control-bindings.mjs",
  "src/modules/game-simulator/fullscreen.mjs",
  "src/modules/game-simulator/pointer-controller.mjs",
  "src/modules/game-simulator/runtime.mjs",
  "src/modules/game-simulator/workspace-controller.mjs",
  "src/modules/game-simulator/sidebar-renderer.mjs",
  "src/modules/game-simulator/keyboard-state.mjs",
];

test("protected product data remains covered by client safety, central state, and backups", () => {
  const appSource = readProjectFile("app-runtime.js");
  const appRuntimeConstantsSource = readProjectFile("src/core/app-runtime-constants.mjs");
  const appStateSource = readProjectFile("api/app-state.js");
  const backupSource = readProjectFile("api/app-state-backup.js");
  const dataSafetySource = readProjectFile("src/core/data-safety-contracts.cjs");
  const homeRuntimeControllerSource = readProjectFile("src/modules/home/dashboard-runtime-controller.mjs");
  const presentationModeControllerSource = readProjectFile("src/modules/presentation-mode/presentation-mode-controller.mjs");
  const exerciseLibraryActionsSource = readProjectFile("src/modules/exercise-library/exercise-library-actions.mjs");
  const exerciseLibraryRendererSource = readProjectFile("src/modules/exercise-library/exercise-library-renderer.mjs");
  const exerciseLibraryStateSource = readProjectFile("src/modules/exercise-library/exercise-library-state.mjs");
  const sessionPlannerAutosaveSource = readProjectFile("src/modules/session-planner/session-planner-autosave.mjs");
  const sessionPlannerRendererSource = readProjectFile("src/modules/session-planner/session-planner-renderer.mjs");
  const sessionPlannerVisualRendererSource = readProjectFile("src/modules/session-planner/session-planner-visual-renderer.mjs");
  const sessionPlannerPlayerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const sessionPlannerPrintRendererSource = readProjectFile("src/modules/session-planner/session-planner-print-renderer.mjs");
  const clientSafetySource = `${appSource}\n${appRuntimeConstantsSource}\n${homeRuntimeControllerSource}\n${presentationModeControllerSource}\n${exerciseLibraryActionsSource}\n${exerciseLibraryRendererSource}\n${exerciseLibraryStateSource}\n${sessionPlannerAutosaveSource}\n${sessionPlannerRendererSource}\n${sessionPlannerVisualRendererSource}\n${sessionPlannerPlayerBoardRendererSource}\n${sessionPlannerPrintRendererSource}`;
  const moduleContracts = readProjectFile("docs/MODULE_CONTRACTS.md");

  for (const key of protectedStorageKeys) {
    expect(clientSafetySource, `${key} must stay in client data safety coverage`).toContain(key);
    expect(dataSafetySource, `${key} must stay in the central Data Safety Contract`).toContain(key);
    expect(moduleContracts, `${key} must be assigned to a module contract`).toContain(key);
  }
  expect(appStateSource).toContain("dataSafetyRegistry.keys()");
  expect(backupSource).toContain("dataSafetyRegistry.keys()");
});

test("server Supabase headers support both legacy JWT and opaque secret keys", () => {
  const { buildSupabaseKeyHeaders } = require("../api/_lib/supabase-admin.js");
  const legacyHeaders = buildSupabaseKeyHeaders("legacy-service-role-jwt", { contentType: "application/json" });
  const secretHeaders = buildSupabaseKeyHeaders("sb_secret_backend-key_checksum", { contentType: "application/json" });

  expect(legacyHeaders).toEqual({
    apikey: "legacy-service-role-jwt",
    Authorization: "Bearer legacy-service-role-jwt",
    "Content-Type": "application/json",
  });
  expect(secretHeaders).toEqual({
    apikey: "sb_secret_backend-key_checksum",
    "Content-Type": "application/json",
  });
});

test("server Supabase config prefers modern secret keys over legacy service role keys", () => {
  const { readConfig } = require("../api/_lib/supabase-admin.js");
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.SUPABASE_SECRET_KEY = "sb_secret_current_checksum";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-or-stale-service-role";

  try {
    expect(readConfig().serviceRoleKey).toBe("sb_secret_current_checksum");
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SUPABASE_SECRET_KEY;
    } else {
      process.env.SUPABASE_SECRET_KEY = previousSecret;
    }
    if (previousServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
    }
  }
});

test("platform evolution plan forbids risky rewrites and destructive data moves", () => {
  const plan = readProjectFile("docs/PLATFORM_EVOLUTION_PLAN.md");

  [
    "Do not rebuild the platform in one big-bang rewrite",
    "Protected coaching data must not be deleted",
    "dual-read / dual-write",
    "Every tenant-owned table should include `organization_id`",
    "Every data migration needs a rollback story",
  ].forEach((requiredText) => {
    expect(plan).toContain(requiredText);
  });
});

test("module contracts define stable ids for the current platform modules", () => {
  const moduleContracts = readProjectFile("docs/MODULE_CONTRACTS.md");

  for (const moduleId of moduleContractIds) {
    expect(moduleContracts).toContain(`\`id\`: \`${moduleId}\``);
  }
});

test("release safety rails keep cron backups and live smoke hooks visible", () => {
  const packageJson = readJson("package.json");
  const vercelConfig = readJson("vercel.json");
  const liveSpec = readProjectFile("qa/production.live.spec.mjs");
  const qaWorkflow = readProjectFile(".github/workflows/qa.yml");
  const fullQaWorkflow = readProjectFile(".github/workflows/full-qa.yml");
  const performanceBudget = readProjectFile("scripts/performance-budget.mjs");
  const vercelIgnoreBuild = readProjectFile("scripts/vercel-ignore-build.mjs");
  const storagePolicy = readProjectFile("scripts/verify-storage-key-policy.mjs");
  const platformSecurityGuard = readProjectFile("api/_lib/platform-security.js");
  const platformSecurityVerifier = readProjectFile("scripts/verify-platform-security.mjs");
  const backupSource = readProjectFile("api/app-state-backup.js");
  const restoreReadiness = readProjectFile("scripts/verify-app-state-restore-readiness.mjs");
  const restoreDrill = readProjectFile("scripts/verify-app-state-restore-drill.mjs");
  const incidentWorkflow = readProjectFile(".github/workflows/production-incident-alert.yml");
  const incidentReadiness = readProjectFile("scripts/verify-incident-readiness.mjs");
  const productionDeployWorkflow = readProjectFile(".github/workflows/production-deploy.yml");
  const indexHtml = readProjectFile("index.html");

  expect(packageJson.dependencies["@vercel/speed-insights"]).toBeTruthy();
  expect(indexHtml).toContain("/_vercel/speed-insights/script.js");
  expect(indexHtml).toContain("location.protocol !== \"https:\"");
  expect(indexHtml).toContain("localHosts.has(location.hostname)");
  expect(packageJson.scripts["qa"]).toContain("npm run qa:static");
  expect(packageJson.scripts["qa"]).toContain("npm run qa:playwright");
  expect(packageJson.scripts["qa:static"]).toContain("npm run qa:perf");
  expect(packageJson.scripts["qa:static"]).toContain("npm run storage:guard");
  expect(packageJson.scripts["qa:static"]).toContain("npm run security:platform");
  expect(packageJson.scripts["qa:static"]).toContain("npm run release:incident-readiness");
  expect(packageJson.scripts["storage:guard"]).toBe("node scripts/verify-storage-key-policy.mjs");
  expect(packageJson.scripts["security:platform"]).toBe("node scripts/verify-platform-security.mjs");
  expect(packageJson.scripts["release:incident-alert"]).toBe("node scripts/create-incident-alert.mjs");
  expect(packageJson.scripts["release:incident-readiness"]).toBe("node scripts/verify-incident-readiness.mjs");
  expect(packageJson.scripts["qa:perf"]).toContain("scripts/performance-budget.mjs");
  expect(packageJson.scripts["qa:live"]).toContain("qa/live.playwright.config.mjs");
  expect(packageJson.scripts["release:gate"]).toContain("npm run release:safety");
  expect(packageJson.scripts["release:traffic"]).toBe("node scripts/verify-vercel-release-traffic.mjs");
  expect(packageJson.scripts["release:staging-isolation"]).toBe("node scripts/verify-staging-live-isolation.mjs");
  expect(packageJson.scripts["release:staging-isolation:repair"]).toBe(
    "node scripts/verify-staging-live-isolation.mjs --repair"
  );
  expect(packageJson.scripts["release:monitor-postdeploy"]).toContain("RELEASE_ALLOW_LIVE_HASH_MISMATCH=1");
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:staging-isolation");
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:backup");
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:restore-readiness");
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:restore-drill");
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:monitor-postdeploy");
  expect(packageJson.scripts["release:restore-readiness"]).toBe("node scripts/verify-app-state-restore-readiness.mjs");
  expect(packageJson.scripts["release:restore-drill"]).toBe("node scripts/verify-app-state-restore-drill.mjs");
  expect(fs.existsSync(path.join(rootDir, "scripts/verify-production-safety-gate.mjs"))).toBe(true);
  expect(backupSource).toContain("backupMatchesPointer");
  expect(backupSource).toContain("manifestCoverage");
  expect(backupSource).toContain("createRestoreDrillSummary");
  expect(restoreReadiness).toContain("dataSafetyRegistry.keys()");
  expect(restoreReadiness).toContain("Backup status must not expose raw backup entries");
  expect(restoreDrill).toContain("dryRun");
  expect(restoreDrill).toContain("Restore drill must not expose raw backup entries");
  expect(vercelConfig.ignoreCommand).toContain("scripts/vercel-ignore-build.mjs");
  expect(vercelConfig.rewrites).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "/api/app-state-backup-status",
        destination: "/api/app-state-backup?mode=status",
      }),
    ])
  );
  expect(vercelIgnoreBuild).toContain("GitHub Production Deploy");
  expect(storagePolicy).toContain("approvedLocalOnlyStorageKeys");
  expect(storagePolicy).toContain("dataSafetyProtectedStorageKeys");
  expect(platformSecurityGuard).toContain("footballscience-api-security-event-v1");
  expect(platformSecurityGuard).toContain("api.permission_denied");
  expect(platformSecurityVerifier).toContain("public.platform_security_events");
  expect(platformSecurityVerifier).toContain("rtp_library_exercise_media");
  expect(platformSecurityVerifier).toContain("Platform security verification: ok");
  expect(incidentWorkflow).toContain("Production Incident Alert");
  expect(incidentWorkflow).toContain("issues: write");
  expect(incidentWorkflow).toContain("npm run release:incident-alert");
  expect(incidentReadiness).toContain("Incident readiness verification: ok");
  expect(productionDeployWorkflow).toContain("workflow_dispatch:");
  expect(productionDeployWorkflow).not.toContain("workflow_run:");
  expect(productionDeployWorkflow).toContain("uses: ./.github/workflows/full-qa.yml");
  expect(productionDeployWorkflow).toContain("needs: full-qa");
  expect(productionDeployWorkflow).toContain("npm run release:preflight");
  expect(productionDeployWorkflow).toContain("npm run release:safety");
  expect(fullQaWorkflow).toContain("npm run qa:static");
  expect(fullQaWorkflow).toContain("npm run qa:playwright:ci -- --project=${{ matrix.project }} --shard=${{ matrix.shard }}/${{ matrix.total }}");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("Live app.js hash does not match this release");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("RELEASE_ALLOW_LIVE_HASH_MISMATCH");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("crypto.createHash");
  expect(readProjectFile("scripts/verify-vercel-release-traffic.mjs")).toContain("Production Deploy");
  expect(readProjectFile("scripts/verify-staging-live-isolation.mjs")).toContain("staging branch");
  expect(readProjectFile("scripts/verify-staging-live-isolation.mjs")).toContain("alias");
  expect(readProjectFile("scripts/release-ship.mjs")).toContain("release:traffic");
  expect(readProjectFile("scripts/release-ship.mjs")).toContain("release:staging-isolation:repair");
  expect(liveSpec).toContain("LIVE_QA_USERNAME");
  expect(liveSpec).toContain("LIVE_QA_PASSWORD");
  expect(liveSpec).toContain("LIVE_QA_PEER_USERNAME");
  expect(liveSpec).toContain("LIVE_QA_DYNAMIC_PEER_EMAIL");
  expect(liveSpec).toContain("ensureLivePeerCredentials");
  expect(liveSpec).toContain("production peer accounts prove DM unread state and read receipt end-to-end");
  expect(readProjectFile("scripts/verify-live-qa-env.mjs")).toContain("LIVE_QA_REQUIRE_PEER_CHAT");
  expect(readProjectFile("scripts/verify-live-qa-env.mjs")).toContain("dynamic peer account");
  expect(productionDeployWorkflow).toContain("LIVE_QA_PEER_USERNAME");
  expect(productionDeployWorkflow).toContain("vars.LIVE_QA_REQUIRE_PEER_CHAT || '1'");
  expect(liveSpec).toContain("production-safe live smoke");
  expect(liveSpec).toContain("production admin account can open Access & Users");
  expect(liveSpec).toContain('toBe("admin")');
  expect(performanceBudget).toContain("maxGzipBytes");
  expect(performanceBudget).toContain("targetGzipBytes");
  expect(vercelConfig.crons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "/api/app-state-backup",
        schedule: "0 8 * * *",
      }),
    ])
  );
  expect(qaWorkflow).toContain("uses: ./.github/workflows/full-qa.yml");
  expect(fullQaWorkflow).toContain("node-version: 24");
  expect(fullQaWorkflow).toContain("npm run qa:static");
  expect(fullQaWorkflow).toContain("npm run qa:playwright:ci");
});

test("modular core skeleton exposes only explicitly approved production assets", () => {
  const indexHtml = readProjectFile("index.html");

  for (const file of coreFiles) {
    expect(fs.existsSync(path.join(rootDir, file)), `${file} should exist`).toBe(true);
  }

  expect(indexHtml).not.toContain("src/core/");
  expect(indexHtml).not.toMatch(/src\/modules\/[^"'`]+\.m?js/);
  expect(indexHtml.match(/src\/modules\/[^"'`]+/g) || []).toEqual([
    "src/modules/session-planner/session-planner-tacticalboard.css",
    "src/modules/set-pieces-room/set-pieces-room.css",
    "src/modules/set-pieces-room/set-pieces-board.css",
    "src/modules/set-pieces-room/set-pieces-roster.css",
    "src/modules/set-pieces-room/set-pieces-theme.css",
    "src/modules/set-pieces-room/set-pieces-quality.css",
    "src/modules/set-pieces-room/set-pieces-library-filters.css",
    "src/modules/set-pieces-room/set-pieces-editor.css",
    "src/modules/set-pieces-room/set-pieces-editor-responsive.css",
    "src/modules/set-pieces-room/set-pieces-editor-wide.css",
    "src/modules/set-pieces-room/set-pieces-present.css",
    "src/modules/set-pieces-room/set-pieces-present-fullscreen.css",
    "src/modules/set-pieces-room/set-pieces-present-responsive.css",
    "src/modules/presentation-mode/presentation-mode-set-pieces.css",
    "src/modules/presentation-mode/presentation-birthday-slide.css",
    "src/modules/home/home-schedule-preview.css",
    "src/modules/home/home-birthday.css",
    "src/modules/home/home-upcoming-lineup.css",
    "src/modules/home/home-leaderboard.css",
    "src/modules/medical/medical-clinical-foundation.css",
    "src/modules/medical/medical-clinical-roster.css",
    "src/modules/medical/medical-clinical-operations.css",
    "src/modules/medical/medical-clinical-modal.css",
    "src/modules/medical/medical-clinical-profile.css",
    "src/modules/medical/medical-clinical-plan.css",
    "src/modules/medical/medical-clinical-foundation.css",
    "src/modules/medical/medical-clinical-roster.css",
    "src/modules/medical/medical-clinical-operations.css",
    "src/modules/medical/medical-clinical-modal.css",
    "src/modules/medical/medical-clinical-profile.css",
    "src/modules/medical/medical-clinical-plan.css",
  ]);
});

test("QA static server exposes a bounded read-only Leaderboard fixture", async ({ request }) => {
  const response = await request.get("/api/leaderboard?month=2026-08");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    schema: "footballscience-leaderboard-v1",
    month: "2026-08",
    competition: null,
    summary: { participantCount: 0, scoredPlayerCount: 0, totalPoints: 0, eventCount: 0, leaderGap: 0 },
    roster: [],
    standings: [],
    events: [],
  });

  const invalidMonth = await request.get("/api/leaderboard?month=August");
  expect(invalidMonth.status()).toBe(400);
  const write = await request.post("/api/leaderboard", { data: { action: "award" } });
  expect(write.status()).toBe(405);
  const unknownApi = await request.get("/api/not-a-real-qa-route");
  expect(unknownApi.status()).toBe(404);
});

test("core module contracts are covered by dedicated QA", () => {
  const packageJson = readJson("package.json");
  const modularCoreSpec = readProjectFile("qa/modular-core.api.spec.mjs");
  const platformSecuritySpec = readProjectFile("qa/platform-security-contracts.api.spec.mjs");
  const platformReadinessSpec = readProjectFile("qa/platform-readiness.api.spec.mjs");
  const dataSafetySpec = readProjectFile("qa/data-safety-contracts.api.spec.mjs");
  const runtimeUiHelpersSpec = readProjectFile("qa/runtime-ui-helpers.api.spec.mjs");
  const platformWorkspaceRenderersSpec = readProjectFile("qa/platform-workspace-renderers-contract.api.spec.mjs");
  const homeTasksSpec = readProjectFile("qa/home-tasks-adapter.api.spec.mjs");
  const homeChatSpec = readProjectFile("qa/home-chat-adapter.api.spec.mjs");
  const homeChatWidgetSpec = readProjectFile("qa/home-chat-widget-renderer.api.spec.mjs");
  const medicalRuntimeRenderersSpec = readProjectFile("qa/medical-runtime-renderers-contract.api.spec.mjs");
  const medicalRuntimeServiceSpec = readProjectFile("qa/medical-runtime-service-contract.api.spec.mjs");
  const medicalRuntimeAccessorsSpec = readProjectFile("qa/medical-runtime-accessors-contract.api.spec.mjs");
  const medicalRuntimeHelpersSpec = readProjectFile("qa/medical-runtime-helpers-contract.api.spec.mjs");
  const scheduleSpec = readProjectFile("qa/schedule-adapter.api.spec.mjs");
  const scheduleDatabaseAdapterSpec = readProjectFile("qa/schedule-database-adapter.api.spec.mjs");
  const scheduleDatabaseSpec = readProjectFile("qa/schedule-database-schema.api.spec.mjs");
  const sessionPlannerRuntimeDelegatesSpec = readProjectFile("qa/session-planner-runtime-delegates-contract.api.spec.mjs");
  const squadAdapterSpec = readProjectFile("qa/squad-adapter.api.spec.mjs");
  const squadDatabaseSpec = readProjectFile("qa/squad-database-schema.api.spec.mjs");
  const gameSimulatorActionSpaceMetricsSpec = readProjectFile("qa/game-simulator-action-space-metrics.api.spec.mjs");
  const gameSimulatorBallResolutionEngineSpec = readProjectFile("qa/game-simulator-ball-resolution-engine.api.spec.mjs");
  const gameSimulatorAutopilotLiveEngineSpec = readProjectFile("qa/game-simulator-autopilot-live-engine.api.spec.mjs");
  const gameSimulatorSpec = readProjectFile("qa/game-simulator-controller.api.spec.mjs");
  const gameSimulatorAppRuntimeSpec = readProjectFile("qa/game-simulator-app-runtime-controller.api.spec.mjs");
  const gameSimulatorControllersSpec = readProjectFile("qa/game-simulator-controllers.api.spec.mjs");
  const gameSimulatorBindingsSpec = readProjectFile("qa/game-simulator-control-bindings.api.spec.mjs");
  const gameSimulatorFullscreenSpec = readProjectFile("qa/game-simulator-fullscreen.api.spec.mjs");
  const gameSimulatorAutopilotCandidatesSpec = readProjectFile("qa/game-simulator-autopilot-candidates.api.spec.mjs");
  const gameSimulatorAutopilotDecisionEngineSpec = readProjectFile("qa/game-simulator-autopilot-decision-engine.api.spec.mjs");
  const gameSimulatorAutopilotChanceDecisionsSpec = readProjectFile("qa/game-simulator-autopilot-chance-decisions.api.spec.mjs");
  const gameSimulatorAutopilotAdvantageDecisionsSpec = readProjectFile("qa/game-simulator-autopilot-advantage-decisions.api.spec.mjs");
  const gameSimulatorAutopilotTempoRhythmSpec = readProjectFile("qa/game-simulator-autopilot-tempo-rhythm.api.spec.mjs");
  const gameSimulatorAutopilotPossessionPlannerSpec = readProjectFile("qa/game-simulator-autopilot-possession-planner.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveGoalkeeperSpec = readProjectFile("qa/game-simulator-autopilot-defensive-goalkeeper-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensivePressSpec = readProjectFile("qa/game-simulator-autopilot-defensive-press-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveCornerSpec = readProjectFile("qa/game-simulator-autopilot-defensive-corner-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveFreeKickSpec = readProjectFile("qa/game-simulator-autopilot-defensive-free-kick-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensivePenaltySpec = readProjectFile("qa/game-simulator-autopilot-defensive-penalty-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveThrowInSpec = readProjectFile("qa/game-simulator-autopilot-defensive-throw-in-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveNegativeTransitionSpec = readProjectFile("qa/game-simulator-autopilot-defensive-negative-transition-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveLooseBallSpec = readProjectFile("qa/game-simulator-autopilot-defensive-loose-ball-targets.api.spec.mjs");
  const gameSimulatorAutopilotDefensiveTargetsSpec = readProjectFile("qa/game-simulator-autopilot-defensive-targets.api.spec.mjs");
  const gameSimulatorAutopilotOffballTargetsSpec = readProjectFile("qa/game-simulator-autopilot-offball-targets.api.spec.mjs");
  const gameSimulatorAutopilotTargetsSpec = readProjectFile("qa/game-simulator-autopilot-targets.api.spec.mjs");
  const gameSimulatorCommandEngineSpec = readProjectFile("qa/game-simulator-command-engine.api.spec.mjs");
  const gameSimulatorCanvasRendererSpec = readProjectFile("qa/game-simulator-canvas-renderer.api.spec.mjs");
  const gameSimulatorSetupEngineSpec = readProjectFile("qa/game-simulator-setup-engine.api.spec.mjs");
  const gameSimulatorSequenceEngineSpec = readProjectFile("qa/game-simulator-sequence-engine.api.spec.mjs");
  const gameSimulatorPointerSpec = readProjectFile("qa/game-simulator-pointer-controller.api.spec.mjs");
  const gameSimulatorSidebarSpec = readProjectFile("qa/game-simulator-sidebar-renderer.api.spec.mjs");
  const gameSimulatorKeyboardStateSpec = readProjectFile("qa/game-simulator-keyboard-state.api.spec.mjs");
  const squadScoutingRuntimeSpec = readProjectFile("qa/squad-scouting-runtime-contract.api.spec.mjs");
  const sessionPlannerRuntimeRenderersSpec = readProjectFile("qa/session-planner-runtime-renderers-contract.api.spec.mjs");
  const sessionPlannerRuntimeServiceSpec = readProjectFile("qa/session-planner-runtime-service-contract.api.spec.mjs");
  const sessionPlannerRuntimeBindingsSpec = readProjectFile("qa/session-planner-runtime-bindings-contract.api.spec.mjs");
  const sessionPlannerStateMergeHelpersSpec = readProjectFile("qa/session-planner-state-merge-helpers-contract.api.spec.mjs");
  const sessionPlannerBoardHistoryControllerSpec = readProjectFile("qa/session-planner-board-history-controller-contract.api.spec.mjs");

  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-safety-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-security-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-readiness.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/workspace-module-runtime-controller-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/incident-alert-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/data-safety-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/runtime-ui-helpers.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/core/runtime-ui-helpers.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-workspace-renderers-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/platform/workspace-renderers.mjs");
  expect(platformSecuritySpec).toContain("permission matrix covers every module action");
  expect(platformSecuritySpec).toContain("API guard rate limits abusive public requests");
  expect(platformSecuritySpec).toContain("tenant isolation and permission matrix are enforced");
  expect(platformReadinessSpec).toContain("platform readiness contract covers every requested operating area");
  expect(platformReadinessSpec).toContain("observability covers deploy, api, saves, backup, auth, and performance signals");
  expect(dataSafetySpec).toContain("data safety registry covers every protected module storage key");
  expect(dataSafetySpec).toContain("central app-state rejects stale versioned writes");
  expect(runtimeUiHelpersSpec).toContain("runtime UI helpers preserve app-runtime formatting behavior");
  expect(platformWorkspaceRenderersSpec).toContain("Platform workspace renderers own Admin Profile Staff and Squad renderer wiring");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/medical-runtime-renderers-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/medical-runtime-service-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/medical-runtime-accessors-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/medical-runtime-helpers-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/medical/medical-runtime-service.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/medical/medical-runtime-accessors.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/medical/medical-runtime-helpers.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-tasks-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-chat-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-dashboard-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-dashboard-runtime-controller.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-chat-widget-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-database-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-database-schema.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/exercise-library-module-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-module-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-runtime-delegates-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-runtime-renderers-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-runtime-service-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-runtime-bindings-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/session-planner/session-planner-runtime-renderers.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/session-planner/session-planner-runtime-service.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  expect(sessionPlannerRuntimeRenderersSpec).toContain("Session Planner runtime renderers own renderer wiring outside app-runtime");
  expect(sessionPlannerRuntimeServiceSpec).toContain("Session Planner runtime service owns controller composition outside app-runtime");
  expect(sessionPlannerRuntimeBindingsSpec).toContain("Session Planner runtime bindings own controller composition outside app-runtime");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-state-merge-helpers-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/session-planner/session-planner-state-merge-helpers.mjs");
  expect(sessionPlannerStateMergeHelpersSpec).toContain("Session Planner state merge helpers preserve newer block fields");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-board-history-controller-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/session-planner/session-planner-board-history-controller.mjs");
  expect(sessionPlannerBoardHistoryControllerSpec).toContain("Session Planner board history owns undo redo outside app-runtime");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-tactical-controller-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/session-planner-workspace-controller-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-scouting-runtime-contract.api.spec.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/squad/squad-scouting-runtime.mjs");
  expect(squadScoutingRuntimeSpec).toContain("Squad Scouting runtime owns read-only scouting spider wiring outside app-runtime");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-database-schema.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-action-space-metrics.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-app-runtime-controller.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-geometry-helpers.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-ball-resolution-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-live-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-controller.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-controllers.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-control-bindings.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-fullscreen.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-candidates.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-decision-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-chance-decisions.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-advantage-decisions.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-tempo-rhythm.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-possession-planner.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-goalkeeper-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-press-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-corner-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-free-kick-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-penalty-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-throw-in-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-negative-transition-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-loose-ball-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-defensive-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-offball-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-autopilot-targets.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-command-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-canvas-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-setup-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-sequence-engine.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-pointer-controller.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-sidebar-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-keyboard-state.api.spec.mjs");
  expect(modularCoreSpec).toContain("modular core covers protected storage keys");
  expect(modularCoreSpec).toContain("read-only storage adapter blocks accidental writes");
  expect(homeTasksSpec).toContain("Home Tasks legacy read adapter uses the protected storage key");
  expect(homeChatSpec).toContain("Home Chat legacy read adapter uses the protected storage key");
  expect(homeChatWidgetSpec).toContain("home chat widget renderer");
  expect(medicalRuntimeRenderersSpec).toContain("Medical runtime renderers own renderer and selector wiring outside app-runtime");
  expect(medicalRuntimeServiceSpec).toContain("Medical runtime service owns composition wiring outside app-runtime");
  expect(medicalRuntimeAccessorsSpec).toContain("Medical runtime accessors preserve app-runtime pass-through names");
  expect(medicalRuntimeHelpersSpec).toContain("Medical runtime helpers own pure helper wiring outside app-runtime");
  expect(scheduleSpec).toContain("Schedule legacy read adapter uses the protected storage key");
  expect(scheduleDatabaseAdapterSpec).toContain("schedule database adapter remains feature flagged");
  expect(scheduleDatabaseSpec).toContain("server-write first and RLS protected");
  expect(sessionPlannerRuntimeDelegatesSpec).toContain("Session Planner runtime delegates keep app-runtime pass-through out of the shell");
  expect(squadAdapterSpec).toContain("Squad legacy read adapter uses the protected storage key");
  expect(squadDatabaseSpec).toContain("multi-tenant roster model");
  expect(gameSimulatorBallResolutionEngineSpec).toContain("game simulator ball resolution engine");
  expect(gameSimulatorAutopilotLiveEngineSpec).toContain("game simulator autopilot live engine");
  expect(gameSimulatorSpec).toContain("game simulator workspace controller");
  expect(gameSimulatorAppRuntimeSpec).toContain("game simulator app runtime controller");
  expect(gameSimulatorControllersSpec).toContain("game simulator controller loader");
  expect(gameSimulatorBindingsSpec).toContain("game simulator control bindings");
  expect(gameSimulatorFullscreenSpec).toContain("game simulator fullscreen controller");
  expect(gameSimulatorPointerSpec).toContain("game simulator pointer controller");
  expect(gameSimulatorCommandEngineSpec).toContain("game simulator command engine");
  expect(gameSimulatorAutopilotChanceDecisionsSpec).toContain("game simulator autopilot chance decisions");
  expect(gameSimulatorAutopilotAdvantageDecisionsSpec).toContain("game simulator autopilot advantage decisions");
  expect(gameSimulatorAutopilotTempoRhythmSpec).toContain("game simulator autopilot tempo rhythm");
  expect(gameSimulatorAutopilotPossessionPlannerSpec).toContain("game simulator autopilot possession planner");
  expect(gameSimulatorAutopilotDefensiveGoalkeeperSpec).toContain("game simulator autopilot defensive goalkeeper targets");
  expect(gameSimulatorAutopilotDefensivePressSpec).toContain("game simulator autopilot defensive press targets");
  expect(gameSimulatorAutopilotDefensiveCornerSpec).toContain("game simulator autopilot defensive corner targets");
  expect(gameSimulatorAutopilotDefensiveFreeKickSpec).toContain("game simulator autopilot defensive free kick targets");
  expect(gameSimulatorAutopilotDefensivePenaltySpec).toContain("game simulator autopilot defensive penalty targets");
  expect(gameSimulatorAutopilotDefensiveThrowInSpec).toContain("game simulator autopilot defensive throw in targets");
  expect(gameSimulatorAutopilotDefensiveNegativeTransitionSpec).toContain("game simulator autopilot defensive negative transition targets");
  expect(gameSimulatorAutopilotDefensiveLooseBallSpec).toContain("game simulator autopilot defensive loose ball targets");
  expect(gameSimulatorSequenceEngineSpec).toContain("sequence engine owns snapshots");
  expect(gameSimulatorSidebarSpec).toContain("game simulator sidebar renderer");
  expect(gameSimulatorKeyboardStateSpec).toContain("game simulator keyboard state");
});

test("game simulator animation loop does not run globally outside the simulator workspace", () => {
  const packageJson = readJson("package.json");
  const appSource = readProjectFile("app-runtime.js");
  const actionSpaceMetricsSource = readProjectFile("src/modules/game-simulator/action-space-metrics.mjs");
  const appRuntimeControllerSource = readProjectFile("src/modules/game-simulator/app-runtime-controller.mjs");
  const ballResolutionEngineSource = readProjectFile("src/modules/game-simulator/ball-resolution-engine.mjs");
  const autopilotLiveEngineSource = readProjectFile("src/modules/game-simulator/autopilot-live-engine.mjs");
  const controllersSource = readProjectFile("src/modules/game-simulator/controllers.mjs");
  const controlBindingsSource = readProjectFile("src/modules/game-simulator/control-bindings.mjs");
  const fullscreenSource = readProjectFile("src/modules/game-simulator/fullscreen.mjs");
  const autopilotCandidatesSource = readProjectFile("src/modules/game-simulator/autopilot-candidates.mjs");
  const autopilotDecisionEngineSource = readProjectFile("src/modules/game-simulator/autopilot-decision-engine.mjs");
  const autopilotChanceDecisionsSource = readProjectFile("src/modules/game-simulator/autopilot-chance-decisions.mjs");
  const autopilotAdvantageDecisionsSource = readProjectFile("src/modules/game-simulator/autopilot-advantage-decisions.mjs");
  const autopilotTempoRhythmSource = readProjectFile("src/modules/game-simulator/autopilot-tempo-rhythm.mjs");
  const autopilotPossessionPlannerSource = readProjectFile("src/modules/game-simulator/autopilot-possession-planner.mjs");
  const autopilotDefensiveGoalkeeperSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-goalkeeper-targets.mjs");
  const autopilotDefensivePressSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-press-targets.mjs");
  const autopilotDefensiveCornerSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-corner-targets.mjs");
  const autopilotDefensiveFreeKickSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-free-kick-targets.mjs");
  const autopilotDefensivePenaltySource = readProjectFile("src/modules/game-simulator/autopilot-defensive-penalty-targets.mjs");
  const autopilotDefensiveThrowInSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-throw-in-targets.mjs");
  const autopilotDefensiveNegativeTransitionSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-negative-transition-targets.mjs");
  const autopilotDefensiveLooseBallSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-loose-ball-targets.mjs");
  const autopilotDefensiveTargetsSource = readProjectFile("src/modules/game-simulator/autopilot-defensive-targets.mjs");
  const autopilotOffballTargetsSource = readProjectFile("src/modules/game-simulator/autopilot-offball-targets.mjs");
  const autopilotTargetsSource = readProjectFile("src/modules/game-simulator/autopilot-targets.mjs");
  const commandEngineSource = readProjectFile("src/modules/game-simulator/command-engine.mjs");
  const sequenceEngineSource = readProjectFile("src/modules/game-simulator/sequence-engine.mjs");
  const pointerControllerSource = readProjectFile("src/modules/game-simulator/pointer-controller.mjs");
  const runtimeSource = readProjectFile("src/modules/game-simulator/runtime.mjs");
  const lazyRuntimeBridgeSource = readProjectFile("src/modules/game-simulator/lazy-runtime-bridge.mjs");
  const runtimeEntrySource = readProjectFile("src/modules/game-simulator/runtime-entry.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/game-simulator/workspace-controller.mjs");
  const sidebarRendererSource = readProjectFile("src/modules/game-simulator/sidebar-renderer.mjs");

  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/control-bindings.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/app-runtime-controller.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/runtime-entry.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/runtime-facade.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/lazy-runtime-bridge.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/initial-state.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/action-space-metrics.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/ball-resolution-engine.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-live-engine.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/controllers.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/fullscreen.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-candidates.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-decision-engine.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-chance-decisions.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-advantage-decisions.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-tempo-rhythm.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-possession-planner.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-goalkeeper-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-press-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-corner-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-free-kick-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-penalty-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-throw-in-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-negative-transition-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-loose-ball-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-defensive-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-offball-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/autopilot-targets.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/command-engine.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/sequence-engine.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/pointer-controller.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/runtime.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/workspace-controller.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/sidebar-renderer.mjs");
  expect(appSource).not.toContain('from "./src/modules/game-simulator/control-bindings.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/fullscreen.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/workspace-controller.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/model-data.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/engine-wiring.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/app-runtime-controller.mjs"');
  expect(appSource).toContain('from "./src/modules/game-simulator/index.mjs"');
  expect(autopilotDecisionEngineSource).toContain('from "./autopilot-tempo-rhythm.mjs"');
  expect(autopilotTempoRhythmSource).toContain("createGameSimulatorAutopilotTempoRhythm");
  expect(autopilotDecisionEngineSource).toContain('from "./autopilot-chance-decisions.mjs"');
  expect(autopilotChanceDecisionsSource).toContain("createGameSimulatorAutopilotChanceDecisions");
  expect(autopilotDecisionEngineSource).toContain('from "./autopilot-advantage-decisions.mjs"');
  expect(autopilotAdvantageDecisionsSource).toContain("createGameSimulatorAutopilotAdvantageDecisions");
  expect(autopilotDecisionEngineSource).toContain('from "./autopilot-possession-planner.mjs"');
  expect(autopilotPossessionPlannerSource).toContain("createGameSimulatorAutopilotPossessionPlanner");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-goalkeeper-targets.mjs"');
  expect(autopilotDefensiveGoalkeeperSource).toContain("createGameSimulatorAutopilotDefensiveGoalkeeperTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-press-targets.mjs"');
  expect(autopilotDefensivePressSource).toContain("createGameSimulatorAutopilotDefensivePressTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-corner-targets.mjs"');
  expect(autopilotDefensiveCornerSource).toContain("createGameSimulatorAutopilotDefensiveCornerTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-free-kick-targets.mjs"');
  expect(autopilotDefensiveFreeKickSource).toContain("createGameSimulatorAutopilotDefensiveFreeKickTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-penalty-targets.mjs"');
  expect(autopilotDefensivePenaltySource).toContain("createGameSimulatorAutopilotDefensivePenaltyTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-throw-in-targets.mjs"');
  expect(autopilotDefensiveThrowInSource).toContain("createGameSimulatorAutopilotDefensiveThrowInTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-negative-transition-targets.mjs"');
  expect(autopilotDefensiveNegativeTransitionSource).toContain("createGameSimulatorAutopilotDefensiveNegativeTransitionTargets");
  expect(autopilotDefensiveTargetsSource).toContain('from "./autopilot-defensive-loose-ball-targets.mjs"');
  expect(autopilotDefensiveLooseBallSource).toContain("createGameSimulatorAutopilotDefensiveLooseBallTargets");
  expect(appSource).toContain("createGameSimulatorLazyRuntimeBridge({");
  expect(appSource).not.toContain('import(platformModuleLoader.versionedHref("./src/modules/game-simulator/runtime-entry.mjs"))');
  expect(lazyRuntimeBridgeSource).toContain('import(platformModuleLoader.versionedHref("/src/modules/game-simulator/runtime-entry.mjs"))');
  expect(lazyRuntimeBridgeSource).toContain("startSimulatorAnimationLoop:");
  expect(lazyRuntimeBridgeSource).toContain("stopSimulatorAnimationLoop:");
  expect(runtimeEntrySource).toContain("createGameSimulatorAppRuntimeController({");
  expect(runtimeEntrySource).toContain("createGameSimulatorRuntimeFacade({");
  expect(runtimeEntrySource).toContain("createGameSimulatorEngineBundle({");
  expect(appRuntimeControllerSource).toContain('import("./controllers.mjs")');
  expect(appRuntimeControllerSource).toContain('import("./runtime.mjs")');
  expect(appRuntimeControllerSource).toContain("createGameSimulatorSequenceEngine");
  expect(appRuntimeControllerSource).toContain('getHubState()?.activeWorkspaceId === "game-simulator"');
  expect(appSource).not.toContain("\nwindow.requestAnimationFrame(animationFrame);\n");
  expect(appRuntimeControllerSource).toContain("createGameSimulatorAppRuntimeController");
  expect(controllersSource).toContain("createSimulatorControllers");
  expect(controllersSource).toContain("createSimulatorControlBindings");
  expect(controlBindingsSource).toContain("createSimulatorControlBindings");
  expect(controlBindingsSource).toContain("handleKeyDown");
  expect(fullscreenSource).toContain("createSimulatorFullscreenController");
  expect(fullscreenSource).toContain("updateHudLayout");
  expect(pointerControllerSource).toContain("createGameSimulatorPointerController");
  expect(ballResolutionEngineSource).toContain("createGameSimulatorBallResolutionEngine");
  expect(autopilotLiveEngineSource).toContain("createGameSimulatorAutopilotLiveEngine");
  expect(commandEngineSource).toContain("createGameSimulatorCommandEngine");
  expect(sequenceEngineSource).toContain("createGameSimulatorSequenceEngine");
  expect(runtimeSource).toContain("createSimulatorAnimationLoop");
  expect(runtimeSource).toContain("window.requestAnimationFrame(tick)");
  expect(workspaceControllerSource).toContain("createSimulatorWorkspaceController");
  expect(workspaceControllerSource).toContain("launchFromIntro");
  expect(sidebarRendererSource).toContain("createGameSimulatorSidebarRenderer");
});

test("Session Planner print mode keeps the coach sheet visible for browser printing", () => {
  const appSource = readProjectFile("app-runtime.js");
  const centralReloadSource = readProjectFile("src/core/central-app-state-reload-service.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const indexSource = readProjectFile("index.html");
  const printOverrideSource = readProjectFile("session-print-overrides.css");
  const sessionPlannerPrintSource = `${appSource}\n${centralReloadSource}\n${workspaceControllerSource}`;

  expect(sessionPlannerPrintSource).toContain("@media print");
  expect(sessionPlannerPrintSource).toContain("body.is-session-printing .session-print-root,");
  expect(sessionPlannerPrintSource).toContain("body.is-session-printing .session-print-root *");
  expect(sessionPlannerPrintSource).toContain("body.is-session-printing .session-print-document *");
  expect(sessionPlannerPrintSource).toContain("visibility: visible !important");
  expect(sessionPlannerPrintSource).toContain("sessionPlannerPrintOverlayOpen ||");
  expect(sessionPlannerPrintSource).toMatch(/\b(?:window|win)\.print\(\);/);
  expect(indexSource).toContain("session-print-overrides.css");
  expect(printOverrideSource).toContain("@media print");
  expect(printOverrideSource).toContain("box-shadow: none !important");
  expect(printOverrideSource).toContain("filter: none !important");
  expect(printOverrideSource).toContain(".session-tactical-marker::before");
  expect(printOverrideSource).toContain("font-size: 0.086in");
  expect(printOverrideSource).toContain("line-height: 0.86");
});

test("Session Planner never seeds generated training blocks onto an off day", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const appRuntimeComposerSource = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const composerSource = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const sessionFactorySource = readProjectFile("src/modules/session-planner/session-planner-session-factory.mjs");
  const stateMergeHelpersSource = readProjectFile("src/modules/session-planner/session-planner-state-merge-helpers.mjs");

  expect(appSource).toContain("createEmptySession: createSessionPlannerEmptySession");
  expect(appSource).toContain("shouldClearSessionPlannerSessionForDate,");
  expect(composerSource).toContain("shouldClearSessionForDate: deps.shouldClearSessionPlannerSessionForDate");
  expect(stateMergeHelpersSource).toContain("[selectedDate]: createEmptySession(selectedDate)");
  expect(sessionFactorySource).toContain("function isOffDate");
  expect(sessionFactorySource).toContain("function createSessionForNewPlan");
  expect(sessionFactorySource).toContain("function shouldStripGeneratedDefaultSession");
  expect(sessionFactorySource).toContain("function shouldClearSessionForDate");
  expect(sessionFactorySource).toContain("return isOffDate(dateValue) ? createEmptySession(dateValue) : createDefaultSession(dateValue);");
  expect(accessorsSource).toContain("function isSessionPlannerOffDate(dateValue)");
  expect(accessorsSource).toContain("function createSessionPlannerSessionForNewPlan(dateValue = getDefaultDateValue())");
  expect(appRuntimeComposerSource).toContain("getDefaultDateValue: () => deps.formatScheduleDateValue(new Date())");
  expect(stateMergeHelpersSource).toContain("shouldClearSessionForDate(dateValue, clonedSession)");
  expect(appSource).toContain(
    "sessionPlannerState.sessions[dateValue] = createSessionPlannerSessionForNewPlan(dateValue);"
  );
  expect(appSource).not.toContain("const defaultSession = createSessionPlannerDefaultSession(selectedDate);");
});

test("Session Planner central sync conflicts retry silently instead of reopening a modal", () => {
  const appSource = readProjectFile("app-runtime.js");
  const centralRuntimeFacadeSource = readProjectFile("src/core/central-runtime-facade.mjs");
  const centralSyncSource = readProjectFile("src/core/central-sync-runtime-service.mjs");

  expect(appSource).toContain("createCentralRuntimeFacade({");
  expect(appSource).toContain("retryCentralStateWriteAfterConflict");
  expect(centralRuntimeFacadeSource).toContain("createCentralSyncRuntimeService({");
  expect(centralRuntimeFacadeSource).toContain("retryCentralStateWriteAfterConflict: (...args) => centralSyncRuntimeService.retryCentralStateWriteAfterConflict(...args)");
  expect(centralSyncSource).toContain("function retryCentralStateWriteAfterConflict");
  expect(centralSyncSource).toContain("function getCentralSyncResultRevision");
  expect(centralSyncSource).toContain("function showSessionPlannerCentralSyncNotice");
  expect(centralSyncSource).toContain("let sessionPlannerCentralSyncNoticeAt = 0;");
  expect(centralSyncSource).toContain("baseRevision: retryBaseRevision");
  expect(appSource).toContain("function isSessionPlannerAutosaveKey");
  expect(appSource).toContain("function shouldShowPlatformAutosaveStatus");
  expect(appSource).toContain("function setPlatformAutosaveStatusForKey");
  expect(appSource).toContain("createSessionPlannerAutosaveBoundary");
  expect(centralSyncSource).toContain('reportSyncStatus(write.key, "issue", "Sync needs attention");');
  expect(appSource).not.toContain("${renderSessionPlannerCentralSyncConflictOverlay()}");
  expect(appSource).not.toContain("sessionPlannerCentralSyncConflict ||");
  expect(appSource).not.toContain('setPlatformAutosaveStatus("conflict", result?.reason || "Central newer.")');
});

test("Session Planner tactical board keeps selection controls simple and explicit", () => {
  const appSource = readProjectFile("app-runtime.js");
  const appRuntimeComposerSource = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const localUiStateSource = readProjectFile("src/modules/session-planner/session-planner-local-ui-state.mjs");
  const arrangeClipboardSource = readProjectFile(
    "src/modules/session-planner/session-planner-tactical-arrange-clipboard-controller.mjs"
  );
  const tacticalControllerSource = readProjectFile("src/modules/session-planner/session-planner-tactical-controller.mjs");
  const tacticalInteractionSource = readProjectFile(
    "src/modules/session-planner/session-planner-tactical-interaction-controller.mjs"
  );
  const visualRendererSource = readProjectFile("src/modules/session-planner/session-planner-visual-renderer.mjs");
  const tacticalBoardSource = `${appSource}\n${appRuntimeComposerSource}\n${arrangeClipboardSource}\n${tacticalControllerSource}\n${tacticalInteractionSource}\n${visualRendererSource}`;

  expect(localUiStateSource).toContain("sessionPlannerTacticalSnapEnabled: false");
  expect(appRuntimeComposerSource).toContain("createSessionPlannerLocalUiState");
  expect(tacticalBoardSource).not.toContain("data-session-tactical-snap");
  expect(tacticalBoardSource).not.toContain("Alt for precision");
  expect(tacticalBoardSource).not.toContain("Alt gives precise movement");
  expect(arrangeClipboardSource).toContain(
    "function arrangeSelectedElements(mode)"
  );
  expect(tacticalControllerSource).toContain(
    "createSessionPlannerTacticalArrangeClipboardController"
  );
  expect(tacticalControllerSource).toContain(
    "arrangeSelectedElements: arrangeSelectedSessionPlannerTacticalElements"
  );
  expect(tacticalControllerSource).toContain(
    "createSessionPlannerTacticalInteractionController"
  );
  expect(tacticalBoardSource).toContain('data-session-arrange-tactical="row"');
  expect(tacticalBoardSource).toContain('data-session-arrange-tactical="column"');
  expect(tacticalBoardSource).toContain('data-session-arrange-tactical="grid"');
  expect(tacticalBoardSource).toContain('markerUnits="strokeWidth"');
  expect(tacticalBoardSource).toContain('viewBox="0 0 6 6"');
  expect(tacticalBoardSource).not.toContain("data-session-align-tactical");
  expect(tacticalBoardSource).not.toContain("data-session-distribute-tactical");
  expect(tacticalInteractionSource).toMatch(/clearSelection\(\);\s+localState\.sessionPlannerTacticalPendingPoint = null;/);
});
