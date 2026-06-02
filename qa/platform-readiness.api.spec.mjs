import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPlatformReadinessContract,
  createPlatformModuleReadinessMap,
  createPlatformLiveSignalMap,
  createPlatformReadinessReport,
  platformDatabasePrimaryMigrationPlan,
  platformLiveSignalContracts,
  platformObservabilitySignals,
  platformOperatingPriorities,
  platformReadinessAreas,
  platformReadinessEnvironmentRequirements,
  platformReadinessStatuses,
  platformScoutingPerformanceContract,
} from "../src/core/platform-readiness-contracts.mjs";
import { platformModules, protectedStorageKeys } from "../src/core/platform-contracts.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const completeEnv = Object.fromEntries(
  platformReadinessEnvironmentRequirements.flatMap((requirement) => [
    ...requirement.required.map((name) => [name, `${name.toLowerCase()}-value`]),
    ...requirement.recommended.map((name) => [name, `${name.toLowerCase()}-value`]),
  ])
);

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

test("platform readiness contract covers every requested operating area", () => {
  const scripts = {
    deploy: "npm run release:ship:fast -- --push --deploy",
    "deploy:safe": "npm run release:ship:safe -- --push --deploy",
    check: "node --check app.js",
    qa: "npm run check",
    "release:postdeploy": "node scripts/verify-production-deploy.mjs",
    "release:monitor": "npm run release:monitor-postdeploy",
    "platform:readiness": "node scripts/verify-platform-readiness.mjs",
    "platform:health": "node scripts/platform-health-report.mjs",
    "platform:identity:backfill": "node scripts/platform-identity-backfill.mjs",
  };
  const report = createPlatformReadinessReport({
    env: completeEnv,
    scripts,
  });

  expect(assertPlatformReadinessContract({ env: completeEnv, scripts })).toBe(true);
  for (const area of platformReadinessAreas) {
    expect(report.sections.map((section) => section.id)).toContain(area.id);
  }
});

test("platform module map exposes data ownership, api routes, permissions, and implementation stage", () => {
  const modules = createPlatformModuleReadinessMap();
  const moduleIds = modules.map((module) => module.id);

  for (const module of platformModules) {
    expect(moduleIds).toContain(module.id);
  }

  for (const key of protectedStorageKeys) {
    expect(modules.some((module) => module.storageKeys.includes(key))).toBe(true);
  }

  expect(modules.find((module) => module.id === "chat")).toMatchObject({
    implementation: "database-backed-module",
    apiRoutes: ["/api/chat"],
    scope: "team",
    status: platformReadinessStatuses.pass,
  });
  expect(modules.find((module) => module.id === "session-planner")?.implementation).toBe("legacy-monolith");
  expect(modules.find((module) => module.id === "platform-readiness")).toMatchObject({
    implementation: "core-contract",
    apiRoutes: ["/api/platform-readiness"],
    scope: "organization",
  });
  expect(modules.find((module) => module.id === "platform-identity")).toMatchObject({
    implementation: "tenant-bootstrap-api",
    scope: "organization",
    status: platformReadinessStatuses.pass,
  });
  expect(modules.find((module) => module.id === "platform-identity")?.apiRoutes).toEqual(
    expect.arrayContaining(["/api/platform-identity", "/api/platform-tenant-bootstrap"])
  );
});

test("staging and secret requirements are explicit without exposing secret values", () => {
  const report = createPlatformReadinessReport({ env: {}, scripts: {} });
  const staging = report.environment.filter((entry) => entry.area === "staging-mirror");
  const accounts = report.environment.filter((entry) => entry.area === "accounts-secrets");

  expect(staging.length).toBeGreaterThanOrEqual(3);
  expect(accounts.length).toBeGreaterThanOrEqual(3);
  expect(staging.some((entry) => entry.required.includes("STAGING_SUPABASE_PROJECT_REF"))).toBe(true);
  expect(accounts.some((entry) => entry.required.includes("VERCEL_TOKEN"))).toBe(true);
  expect(accounts.some((entry) => entry.required.includes("LIVE_QA_USERNAME"))).toBe(true);
  expect(report.environment.every((entry) => !JSON.stringify(entry).includes("secret-value"))).toBe(true);
});

test("observability covers deploy, api, saves, backup, auth, and performance signals", () => {
  const signalIds = platformObservabilitySignals.map((signal) => signal.id);

  expect(signalIds).toEqual(
    expect.arrayContaining([
      "deploy-failure",
      "api-errors",
      "failed-saves",
      "backup-restore",
      "auth-permission-spikes",
      "frontend-performance",
    ])
  );
  for (const signal of platformObservabilitySignals) {
    expect(signal.evidence.length).toBeGreaterThan(0);
  }
});

test("live health signals cover production, checks, backup, egress, and live QA without secret values", () => {
  const signalIds = platformLiveSignalContracts.map((signal) => signal.id);
  const signals = createPlatformLiveSignalMap({
    env: {
      ...completeEnv,
      VERCEL_ENV: "production",
      VERCEL_URL: "footballscience.xyz",
      VERCEL_GIT_REPO_OWNER: "maklind88",
      VERCEL_GIT_REPO_SLUG: "footballscience",
      VERCEL_GIT_COMMIT_SHA: "abc123456789",
      GITHUB_TOKEN: "secret-value",
    },
    liveSignals: {
      "backup-freshness": {
        status: platformReadinessStatuses.pass,
        details: "Latest backup is 5 minutes old.",
        checkedAt: "2026-06-02T00:00:00.000Z",
      },
    },
  });

  expect(signalIds).toEqual(
    expect.arrayContaining([
      "vercel-production",
      "github-checks",
      "backup-freshness",
      "supabase-egress",
      "live-qa",
      "release-monitor",
    ])
  );
  expect(signals.find((signal) => signal.id === "backup-freshness")).toMatchObject({
    status: platformReadinessStatuses.pass,
    details: "Latest backup is 5 minutes old.",
  });
  expect(JSON.stringify(signals)).not.toContain("secret-value");
  expect(signals.every((signal) => signal.evidence.length)).toBe(true);
});

test("overall readiness falls back when live health signals are missing", () => {
  const report = createPlatformReadinessReport({
    env: {
      VERCEL_ENV: "production",
      VERCEL_URL: "footballscience.xyz",
    },
    scripts: {
      "release:monitor": "npm run release:monitor",
    },
    modules: [],
    permissionMatrix: [],
    dataSafetyContracts: [],
  });

  expect(report.liveSignals.some((signal) => signal.status === platformReadinessStatuses.missing)).toBe(true);
  expect(report.overallStatus).toBe(platformReadinessStatuses.missing);
});

test("operating priorities define the long-term platform hardening order", () => {
  const report = createPlatformReadinessReport({
    env: completeEnv,
    scripts: {
      "platform:health": "node scripts/platform-health-report.mjs",
    },
  });
  const priorityIds = platformOperatingPriorities.map((priority) => priority.id);

  expect(priorityIds).toEqual(
    expect.arrayContaining([
      "performance-ratchet",
      "platform-health-dashboard",
      "database-primary-modules",
      "scouting-speed-foundation",
      "staging-mirror-hardening",
      "incident-observability",
    ])
  );
  expect(report.operatingPriorities[0]).toMatchObject({
    id: "performance-ratchet",
    priority: 1,
  });
  for (const priority of report.operatingPriorities) {
    expect(priority.nextStep, priority.id).toBeTruthy();
    expect(priority.evidence.length, priority.id).toBeGreaterThan(0);
  }
});

test("database-primary migration plan covers high-risk legacy and hybrid modules without touching chat", () => {
  const knownModules = new Set(platformModules.map((module) => module.id));
  const migrationModuleIds = platformDatabasePrimaryMigrationPlan.map((item) => item.moduleId);

  expect(migrationModuleIds).toEqual(
    expect.arrayContaining([
      "schedule",
      "player-profiles",
      "scouting",
      "medical-team",
      "exercise-library",
      "session-planner",
      "periodization",
      "gameplan",
      "transfer-room",
      "game-simulator",
    ])
  );
  expect(migrationModuleIds).not.toContain("chat");
  for (const item of platformDatabasePrimaryMigrationPlan) {
    expect(knownModules.has(item.moduleId), item.moduleId).toBe(true);
    expect(item.priority, item.moduleId).toBeGreaterThan(0);
    expect(item.target, item.moduleId).toContain("database");
    expect(item.nextStep, item.moduleId).toBeTruthy();
  }
  expect(platformDatabasePrimaryMigrationPlan.find((item) => item.moduleId === "scouting")?.priority).toBeLessThan(
    platformDatabasePrimaryMigrationPlan.find((item) => item.moduleId === "game-simulator")?.priority
  );
});

test("scouting performance contract stays explicit and conservative", () => {
  expect(platformScoutingPerformanceContract).toMatchObject({
    moduleId: "scouting",
  });
  expect(platformScoutingPerformanceContract.requiredSignals).toEqual(
    expect.arrayContaining([
      "worker-paginated-database-load",
      "search-submit",
      "profile-open",
      "favorite-toggle",
      "shadow-xi-add",
    ])
  );
  expect(platformScoutingPerformanceContract.budgetsMs.favoriteToggle).toBeLessThanOrEqual(500);
  expect(platformScoutingPerformanceContract.budgetsMs.loadDatabase).toBeLessThanOrEqual(5000);
  expect(platformScoutingPerformanceContract.datasetRules.firstPageMaxRecords).toBeLessThanOrEqual(50);
  expect(platformScoutingPerformanceContract.datasetRules.requiresWorkerSource).toBe(true);
});

test("admin workspace exposes the platform health cockpit", () => {
  const appSource = readProjectFile("app.js");
  const apiSource = readProjectFile("api/platform-readiness.js");

  expect(appSource).toContain("Platform Health");
  expect(appSource).toContain("Live Health");
  expect(appSource).toContain("Live Signals");
  expect(appSource).toContain("Next Actions");
  expect(appSource).toContain("Database Migration");
  expect(appSource).toContain("Scouting Speed");
  expect(appSource).toContain("Missing env");
  expect(appSource).toContain("data-pr-refresh");
  expect(apiSource).toContain("collectPlatformLiveSignals");
  expect(apiSource).toContain("/api/app-state-backup-status");
});
