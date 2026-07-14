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
import {
  createPlatformHealthCockpit,
  summarizePlatformHealthCockpit,
} from "../src/core/platform-health-cockpit-contracts.mjs";
import {
  PLATFORM_HEALTH_HISTORY_SCHEMA,
  assertPlatformHealthSnapshotContract,
  createPlatformHealthHistoryRows,
  createPlatformHealthSnapshot,
  summarizePlatformHealthHistory,
} from "../src/core/platform-health-history-contracts.mjs";
import { platformModules, protectedStorageKeys } from "../src/core/platform-contracts.mjs";
import { createAdminReadinessRenderer } from "../src/modules/admin/index.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readinessScripts = {
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
const completeEnv = Object.fromEntries(
  platformReadinessEnvironmentRequirements.flatMap((requirement) => [
    ...requirement.required.map((name) => [name, requirement.requiredValues?.[name] || `${name.toLowerCase()}-value`]),
    ...requirement.recommended.map((name) => [name, `${name.toLowerCase()}-value`]),
  ])
);

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

test("platform readiness contract covers every requested operating area", () => {
  const report = createPlatformReadinessReport({
    env: completeEnv,
    scripts: readinessScripts,
  });

  expect(assertPlatformReadinessContract({ env: completeEnv, scripts: readinessScripts })).toBe(true);
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
    apiRoutes: ["/api/chat", "/api/push-subscriptions"],
    scope: "team",
    status: platformReadinessStatuses.pass,
  });
  expect(modules.find((module) => module.id === "exercise-library")?.implementation).toBe("partial-extraction");
  expect(modules.find((module) => module.id === "session-planner")?.implementation).toBe("partial-extraction");
  expect(modules.find((module) => module.id === "platform-readiness")).toMatchObject({
    implementation: "core-contract",
    apiRoutes: ["/api/platform-readiness", "/api/platform-health-history"],
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
  expect(accounts.some((entry) => entry.id === "live-qa-peer-chat" && entry.recommended.includes("LIVE_QA_PEER_USERNAME"))).toBe(true);
  expect(accounts.some((entry) => entry.id === "live-qa-peer-chat" && entry.missing.includes("LIVE_QA_REQUIRE_PEER_CHAT"))).toBe(true);
  expect(report.environment.every((entry) => !JSON.stringify(entry).includes("secret-value"))).toBe(true);
});

test("chat peer live QA is only ready when the mandatory flag is enabled", () => {
  const report = createPlatformReadinessReport({
    env: {
      ...completeEnv,
      LIVE_QA_REQUIRE_PEER_CHAT: "0",
    },
    scripts: readinessScripts,
  });
  const peerChat = report.environment.find((entry) => entry.id === "live-qa-peer-chat");

  expect(peerChat).toMatchObject({
    status: platformReadinessStatuses.missing,
  });
  expect(peerChat.missing).toContain("LIVE_QA_REQUIRE_PEER_CHAT=1");
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
      "production-deploy-run",
      "production-monitor-run",
      "backup-freshness",
      "auth-health",
      "traffic-firewall",
      "incident-alerts",
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

test("platform health cockpit summarizes release, monitor, backup, auth, firewall, incidents, and egress", () => {
  const report = createPlatformReadinessReport({
    env: {
      ...completeEnv,
      VERCEL_ENV: "production",
      VERCEL_URL: "footballscience.xyz",
      VERCEL_GIT_REPO_OWNER: "maklind88",
      VERCEL_GIT_REPO_SLUG: "footballscience",
      VERCEL_GIT_COMMIT_SHA: "abc123456789",
      GITHUB_TOKEN: "secret-value",
    },
    scripts: readinessScripts,
    liveSignals: {
      "production-deploy-run": { status: platformReadinessStatuses.pass, details: "success 10m ago." },
      "production-monitor-run": { status: platformReadinessStatuses.pass, details: "success 2h ago." },
      "backup-freshness": { status: platformReadinessStatuses.pass, details: "Latest backup is 5 minutes old." },
      "auth-health": { status: platformReadinessStatuses.pass, details: "Supabase Auth reachable in 120ms." },
      "traffic-firewall": { status: platformReadinessStatuses.pass, details: "Vercel Firewall matches traffic-safety contract." },
      "incident-alerts": { status: platformReadinessStatuses.pass, details: "No open production incident issues." },
    },
  });
  const cockpitIds = report.healthCockpit.map((item) => item.id);
  const cockpit = createPlatformHealthCockpit(report);
  const summary = summarizePlatformHealthCockpit(cockpit);

  expect(cockpitIds).toEqual(
    expect.arrayContaining([
      "production-runtime",
      "last-production-deploy",
      "production-monitor",
      "backup-restore",
      "auth-health",
      "traffic-firewall",
      "open-incidents",
      "egress-usage",
      "live-qa",
      "staging-mirror",
    ])
  );
  expect(summary.total).toBeGreaterThanOrEqual(10);
  expect(report.summary.healthCockpitItems).toBe(summary.total);
  expect(JSON.stringify(report.healthCockpit)).not.toContain("secret-value");
});

test("platform health history snapshots are privacy-safe append-only contracts", () => {
  const report = createPlatformReadinessReport({
    env: { ...completeEnv, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc123456789" },
    scripts: readinessScripts,
    liveSignals: {
      "production-monitor-run": {
        status: platformReadinessStatuses.warning,
        details: "Bearer secret-token should not survive.",
        checkedAt: "2026-07-14T12:00:00.000Z",
      },
    },
  });
  const snapshot = createPlatformHealthSnapshot(report, {
    snapshotId: "11111111-1111-4111-8111-111111111111",
    observedAt: "2026-07-14T12:00:00.000Z",
    source: "production-monitor",
    environment: "production",
    releaseSha: "abc123456789",
  });
  const rows = createPlatformHealthHistoryRows(snapshot);
  const summary = summarizePlatformHealthHistory([snapshot]);

  expect(snapshot.schema).toBe(PLATFORM_HEALTH_HISTORY_SCHEMA);
  expect(assertPlatformHealthSnapshotContract(snapshot)).toBe(true);
  expect(rows.observabilitySignals.length).toBe(snapshot.signals.length);
  expect(rows.releaseChecks.length).toBeGreaterThan(0);
  expect(summary.trend).toBe("baseline");
  expect(JSON.stringify(snapshot)).not.toContain("secret-token");
  expect(rows.observabilitySignals[0]).toHaveProperty("snapshot_id", snapshot.snapshotId);
});

test("platform observability history migration is RLS protected and server-owned", () => {
  const source = readProjectFile("supabase/migrations/20260714122414_platform_observability_history.sql");

  expect(source).toContain("create table if not exists public.platform_observability_signals");
  expect(source).toContain("create table if not exists public.platform_release_checks");
  expect(source).toContain("alter table public.platform_observability_signals enable row level security");
  expect(source).toContain("alter table public.platform_release_checks enable row level security");
  expect(source).toContain("revoke all on public.platform_observability_signals from anon, authenticated");
  expect(source).toContain("revoke all on public.platform_release_checks from anon, authenticated");
  expect(source).toContain("grant select, insert on public.platform_observability_signals to service_role");
  expect(source).toContain("grant select, insert on public.platform_release_checks to service_role");
  expect(source).not.toMatch(/grant\s+(?:insert|update|delete)[^;]+to\s+authenticated/i);
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
  const apiSource = readProjectFile("api/platform-readiness.js");
  const liveSignalSource = readProjectFile("api/_lib/platform-readiness-live-signals.js");
  const report = createPlatformReadinessReport({
    env: completeEnv,
    scripts: readinessScripts,
    healthHistory: [
      createPlatformHealthSnapshot(
        { healthCockpit: [], healthCockpitSummary: { total: 0, ready: 0, warning: 0, missing: 0 } },
        {
          snapshotId: "22222222-2222-4222-8222-222222222222",
          observedAt: "2026-07-14T12:00:00.000Z",
        }
      ),
    ],
  });
  const readinessRenderer = createAdminReadinessRenderer({
    getReadinessState: () => ({
      report,
      loading: false,
      loadError: "",
      loadedAt: "2026-05-31T11:14:00Z",
    }),
  });
  const markup = readinessRenderer.renderReadinessDashboard();

  expect(markup).toContain("Platform Health");
  expect(markup).toContain("Live Health");
  expect(markup).toContain("Production Monitor");
  expect(markup).toContain("History");
  expect(markup).toContain("Read-only");
  expect(markup).toContain("Traffic Firewall");
  expect(markup).toContain("Auth Health");
  expect(markup).toContain("Open Incidents");
  expect(markup).toContain("Live Signals");
  expect(markup).toContain("Next Actions");
  expect(markup).toContain("Database Migration");
  expect(markup).toContain("Scouting Speed");
  expect(markup).toContain("Missing VERCEL_ENV");
  expect(markup).toContain("data-pr-refresh");
  expect(apiSource).toContain("collectPlatformLiveSignals");
  expect(apiSource).toContain("readPlatformHealthHistory");
  expect(liveSignalSource).toContain("collectGithubWorkflowRunSignals");
  expect(liveSignalSource).toContain("collectAuthHealthLiveSignal");
  expect(liveSignalSource).toContain("collectFirewallLiveSignal");
  expect(liveSignalSource).toContain("/api/app-state-backup-status");
});
