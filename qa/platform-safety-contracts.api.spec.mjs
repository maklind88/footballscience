import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  "src/modules/manifest.mjs",
  "src/modules/home/tasks.mjs",
  "src/modules/home/tasks-adapter.mjs",
  "src/modules/home/chat.mjs",
  "src/modules/home/chat-adapter.mjs",
  "src/modules/home/index.mjs",
  "src/modules/chat/chat.mjs",
  "src/modules/chat/chat-adapter.mjs",
  "src/modules/chat/chat-api-client.mjs",
  "src/modules/chat/chat-widget-renderer.mjs",
  "src/modules/chat/index.mjs",
  "src/modules/schedule/events.mjs",
  "src/modules/schedule/schedule-adapter.mjs",
  "src/modules/schedule/index.mjs",
  "src/modules/squad/players.mjs",
  "src/modules/squad/squad-adapter.mjs",
  "src/modules/squad/index.mjs",
  "src/modules/game-simulator/index.mjs",
  "src/modules/game-simulator/controllers.mjs",
  "src/modules/game-simulator/control-bindings.mjs",
  "src/modules/game-simulator/fullscreen.mjs",
  "src/modules/game-simulator/runtime.mjs",
  "src/modules/game-simulator/workspace-controller.mjs",
  "src/modules/game-simulator/keyboard-state.mjs",
];

test("protected product data remains covered by client safety, central state, and backups", () => {
  const appSource = readProjectFile("app.js");
  const appStateSource = readProjectFile("api/app-state.js");
  const backupSource = readProjectFile("api/app-state-backup.js");
  const dataSafetySource = readProjectFile("src/core/data-safety-contracts.cjs");
  const moduleContracts = readProjectFile("docs/MODULE_CONTRACTS.md");

  for (const key of protectedStorageKeys) {
    expect(appSource, `${key} must stay in app.js data safety coverage`).toContain(key);
    expect(dataSafetySource, `${key} must stay in the central Data Safety Contract`).toContain(key);
    expect(moduleContracts, `${key} must be assigned to a module contract`).toContain(key);
  }
  expect(appStateSource).toContain("dataSafetyRegistry.keys()");
  expect(backupSource).toContain("dataSafetyRegistry.keys()");
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
  expect(packageJson.scripts["qa"]).toContain("npm run qa:perf");
  expect(packageJson.scripts["qa"]).toContain("npm run storage:guard");
  expect(packageJson.scripts["qa"]).toContain("npm run security:platform");
  expect(packageJson.scripts["qa"]).toContain("npm run release:incident-readiness");
  expect(packageJson.scripts["storage:guard"]).toBe("node scripts/verify-storage-key-policy.mjs");
  expect(packageJson.scripts["security:platform"]).toBe("node scripts/verify-platform-security.mjs");
  expect(packageJson.scripts["release:incident-alert"]).toBe("node scripts/create-incident-alert.mjs");
  expect(packageJson.scripts["release:incident-readiness"]).toBe("node scripts/verify-incident-readiness.mjs");
  expect(packageJson.scripts["qa:perf"]).toContain("scripts/performance-budget.mjs");
  expect(packageJson.scripts["qa:live"]).toContain("qa/live.playwright.config.mjs");
  expect(packageJson.scripts["release:gate"]).toContain("npm run release:safety");
  expect(packageJson.scripts["release:traffic"]).toBe("node scripts/verify-vercel-release-traffic.mjs");
  expect(packageJson.scripts["release:monitor-postdeploy"]).toContain("RELEASE_ALLOW_LIVE_HASH_MISMATCH=1");
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
  expect(platformSecurityVerifier).toContain("Platform security verification: ok");
  expect(incidentWorkflow).toContain("Production Incident Alert");
  expect(incidentWorkflow).toContain("issues: write");
  expect(incidentWorkflow).toContain("npm run release:incident-alert");
  expect(incidentReadiness).toContain("Incident readiness verification: ok");
  expect(productionDeployWorkflow).toContain("workflow_dispatch:");
  expect(productionDeployWorkflow).not.toContain("workflow_run:");
  expect(productionDeployWorkflow).toContain("npm run release:gate");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("Live app.js hash does not match this release");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("RELEASE_ALLOW_LIVE_HASH_MISMATCH");
  expect(readProjectFile("scripts/verify-production-deploy.mjs")).toContain("crypto.createHash");
  expect(readProjectFile("scripts/verify-vercel-release-traffic.mjs")).toContain("Production Deploy");
  expect(readProjectFile("scripts/release-ship.mjs")).toContain("release:traffic");
  expect(liveSpec).toContain("LIVE_QA_USERNAME");
  expect(liveSpec).toContain("LIVE_QA_PASSWORD");
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
  expect(qaWorkflow).toContain("node-version: 24");
  expect(qaWorkflow).toContain("npm run qa");
});

test("modular core skeleton exists beside the current app but is not loaded by production HTML yet", () => {
  const indexHtml = readProjectFile("index.html");

  for (const file of coreFiles) {
    expect(fs.existsSync(path.join(rootDir, file)), `${file} should exist`).toBe(true);
  }

  expect(indexHtml).not.toContain("src/core/");
  expect(indexHtml).not.toContain("src/modules/");
});

test("core module contracts are covered by dedicated QA", () => {
  const packageJson = readJson("package.json");
  const modularCoreSpec = readProjectFile("qa/modular-core.api.spec.mjs");
  const platformSecuritySpec = readProjectFile("qa/platform-security-contracts.api.spec.mjs");
  const platformReadinessSpec = readProjectFile("qa/platform-readiness.api.spec.mjs");
  const dataSafetySpec = readProjectFile("qa/data-safety-contracts.api.spec.mjs");
  const homeTasksSpec = readProjectFile("qa/home-tasks-adapter.api.spec.mjs");
  const homeChatSpec = readProjectFile("qa/home-chat-adapter.api.spec.mjs");
  const homeChatWidgetSpec = readProjectFile("qa/home-chat-widget-renderer.api.spec.mjs");
  const scheduleSpec = readProjectFile("qa/schedule-adapter.api.spec.mjs");
  const scheduleDatabaseAdapterSpec = readProjectFile("qa/schedule-database-adapter.api.spec.mjs");
  const scheduleDatabaseSpec = readProjectFile("qa/schedule-database-schema.api.spec.mjs");
  const squadAdapterSpec = readProjectFile("qa/squad-adapter.api.spec.mjs");
  const squadDatabaseSpec = readProjectFile("qa/squad-database-schema.api.spec.mjs");
  const gameSimulatorSpec = readProjectFile("qa/game-simulator-controller.api.spec.mjs");
  const gameSimulatorControllersSpec = readProjectFile("qa/game-simulator-controllers.api.spec.mjs");
  const gameSimulatorBindingsSpec = readProjectFile("qa/game-simulator-control-bindings.api.spec.mjs");
  const gameSimulatorFullscreenSpec = readProjectFile("qa/game-simulator-fullscreen.api.spec.mjs");
  const gameSimulatorKeyboardStateSpec = readProjectFile("qa/game-simulator-keyboard-state.api.spec.mjs");

  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-safety-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-security-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-readiness.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/incident-alert-contracts.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/data-safety-contracts.api.spec.mjs");
  expect(platformSecuritySpec).toContain("permission matrix covers every module action");
  expect(platformSecuritySpec).toContain("API guard rate limits abusive public requests");
  expect(platformSecuritySpec).toContain("tenant isolation and permission matrix are enforced");
  expect(platformReadinessSpec).toContain("platform readiness contract covers every requested operating area");
  expect(platformReadinessSpec).toContain("observability covers deploy, api, saves, backup, auth, and performance signals");
  expect(dataSafetySpec).toContain("data safety registry covers every protected module storage key");
  expect(dataSafetySpec).toContain("central app-state rejects stale versioned writes");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-tasks-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-chat-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-dashboard-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/home-chat-widget-renderer.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-database-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/schedule-database-schema.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-adapter.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-database-schema.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-controller.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-controllers.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-control-bindings.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-fullscreen.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/game-simulator-keyboard-state.api.spec.mjs");
  expect(modularCoreSpec).toContain("modular core covers protected storage keys");
  expect(modularCoreSpec).toContain("read-only storage adapter blocks accidental writes");
  expect(homeTasksSpec).toContain("Home Tasks legacy read adapter uses the protected storage key");
  expect(homeChatSpec).toContain("Home Chat legacy read adapter uses the protected storage key");
  expect(homeChatWidgetSpec).toContain("home chat widget renderer");
  expect(scheduleSpec).toContain("Schedule legacy read adapter uses the protected storage key");
  expect(scheduleDatabaseAdapterSpec).toContain("schedule database adapter remains feature flagged");
  expect(scheduleDatabaseSpec).toContain("server-write first and RLS protected");
  expect(squadAdapterSpec).toContain("Squad legacy read adapter uses the protected storage key");
  expect(squadDatabaseSpec).toContain("multi-tenant roster model");
  expect(gameSimulatorSpec).toContain("game simulator workspace controller");
  expect(gameSimulatorControllersSpec).toContain("game simulator controller loader");
  expect(gameSimulatorBindingsSpec).toContain("game simulator control bindings");
  expect(gameSimulatorFullscreenSpec).toContain("game simulator fullscreen controller");
  expect(gameSimulatorKeyboardStateSpec).toContain("game simulator keyboard state");
});

test("game simulator animation loop does not run globally outside the simulator workspace", () => {
  const packageJson = readJson("package.json");
  const appSource = readProjectFile("app.js");
  const controllersSource = readProjectFile("src/modules/game-simulator/controllers.mjs");
  const controlBindingsSource = readProjectFile("src/modules/game-simulator/control-bindings.mjs");
  const fullscreenSource = readProjectFile("src/modules/game-simulator/fullscreen.mjs");
  const runtimeSource = readProjectFile("src/modules/game-simulator/runtime.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/game-simulator/workspace-controller.mjs");

  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/control-bindings.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/controllers.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/fullscreen.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/runtime.mjs");
  expect(packageJson.scripts["check"]).toContain("src/modules/game-simulator/workspace-controller.mjs");
  expect(appSource).not.toContain('from "./src/modules/game-simulator/control-bindings.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/fullscreen.mjs"');
  expect(appSource).not.toContain('from "./src/modules/game-simulator/workspace-controller.mjs"');
  expect(appSource).toContain('import("./src/modules/game-simulator/controllers.mjs")');
  expect(appSource).toContain('import("./src/modules/game-simulator/runtime.mjs")');
  expect(appSource).toContain("function startSimulatorAnimationLoop()");
  expect(appSource).toContain("function stopSimulatorAnimationLoop()");
  expect(appSource).toContain('hubState?.activeWorkspaceId === "game-simulator"');
  expect(appSource).not.toContain("\nwindow.requestAnimationFrame(animationFrame);\n");
  expect(controllersSource).toContain("createSimulatorControllers");
  expect(controllersSource).toContain("createSimulatorControlBindings");
  expect(controlBindingsSource).toContain("createSimulatorControlBindings");
  expect(controlBindingsSource).toContain("handleKeyDown");
  expect(fullscreenSource).toContain("createSimulatorFullscreenController");
  expect(fullscreenSource).toContain("updateHudLayout");
  expect(runtimeSource).toContain("createSimulatorAnimationLoop");
  expect(runtimeSource).toContain("window.requestAnimationFrame(tick)");
  expect(workspaceControllerSource).toContain("createSimulatorWorkspaceController");
  expect(workspaceControllerSource).toContain("launchFromIntro");
});
