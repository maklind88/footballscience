import { platformModules, protectedStorageKeys } from "./platform-contracts.mjs";
import { dataSafetyContracts } from "./data-safety-contracts.mjs";
import { platformPermissionMatrix } from "./permission-matrix.mjs";

export const PLATFORM_READINESS_SCHEMA = "footballscience-platform-readiness-v1";

export const platformReadinessStatuses = Object.freeze({
  pass: "pass",
  warning: "warning",
  missing: "missing",
});

export const platformReadinessStatusLabels = Object.freeze({
  pass: "Ready",
  warning: "Needs attention",
  missing: "Missing",
});

export const platformReadinessAreas = Object.freeze([
  Object.freeze({
    id: "workspace-hygiene",
    label: "Workspace Hygiene",
    purpose: "Local changes must be explicit before another module starts building.",
  }),
  Object.freeze({
    id: "platform-map",
    label: "Platform Map",
    purpose: "Every module declares ownership, APIs, data, and migration status.",
  }),
  Object.freeze({
    id: "staging-mirror",
    label: "Staging Mirror",
    purpose: "Risky work should prove itself against staging before Live.",
  }),
  Object.freeze({
    id: "accounts-secrets",
    label: "Accounts & Secrets",
    purpose: "GitHub, Vercel, Supabase, QA accounts, and cron secrets stay outside source code.",
  }),
  Object.freeze({
    id: "module-standard",
    label: "Module Standard",
    purpose: "New modules must ship with data safety, permissions, tests, and tenant scope.",
  }),
  Object.freeze({
    id: "design-system",
    label: "Design System",
    purpose: "Light, dark, auto, spacing, forms, panels, tables, loading, and empty states stay consistent.",
  }),
  Object.freeze({
    id: "observability",
    label: "Observability",
    purpose: "Deploy, API, saves, backups, performance, auth, and permissions produce visible signals.",
  }),
]);

export const platformModuleImplementationStages = Object.freeze({
  "platform-shell": "legacy-shell",
  "platform-readiness": "core-contract",
  "platform-identity": "tenant-bootstrap-api",
  home: "modular-renderer",
  chat: "database-backed-module",
  schedule: "hybrid-adapter",
  gameplan: "lazy-module",
  "exercise-library": "partial-extraction",
  "session-planner": "partial-extraction",
  periodization: "partial-extraction",
  "medical-team": "hybrid-secured-module",
  "player-profiles": "hybrid-adapter",
  "football-science-db": "server-first-foundation",
  scouting: "lazy-module",
  "game-simulator": "modular-runtime",
});

export const platformReadinessEnvironmentRequirements = Object.freeze([
  Object.freeze({
    id: "vercel-production",
    area: "accounts-secrets",
    label: "Vercel production deploy",
    location: "GitHub Secrets",
    required: Object.freeze(["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]),
    recommended: Object.freeze([]),
    critical: true,
  }),
  Object.freeze({
    id: "supabase-production",
    area: "accounts-secrets",
    label: "Supabase production",
    location: "Vercel Production Environment + GitHub Variables",
    required: Object.freeze(["SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GAMEPLAN_PLAYER_BRIEF_SECRET"]),
    recommended: Object.freeze(["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"]),
    critical: true,
  }),
  Object.freeze({
    id: "live-qa-admin",
    area: "accounts-secrets",
    label: "Live QA admin account",
    location: "GitHub Secrets",
    required: Object.freeze(["LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"]),
    recommended: Object.freeze(["LIVE_QA_EXPECT_ADMIN"]),
    critical: true,
  }),
  Object.freeze({
    id: "live-qa-peer-chat",
    area: "accounts-secrets",
    label: "Two-account chat live QA",
    location: "GitHub Secrets + GitHub Variables",
    required: Object.freeze(["LIVE_QA_PEER_USERNAME", "LIVE_QA_PEER_PASSWORD", "LIVE_QA_REQUIRE_PEER_CHAT"]),
    requiredValues: Object.freeze({
      LIVE_QA_REQUIRE_PEER_CHAT: "1",
    }),
    recommended: Object.freeze([]),
    critical: true,
  }),
  Object.freeze({
    id: "backup-cron",
    area: "observability",
    label: "Backup and restore monitor",
    location: "GitHub/Vercel Secrets",
    required: Object.freeze(["CRON_SECRET"]),
    recommended: Object.freeze(["APP_STATE_BACKUP_STATUS_TOKEN"]),
    critical: true,
  }),
  Object.freeze({
    id: "staging-domain",
    area: "staging-mirror",
    label: "Separate staging domain",
    location: "GitHub Variables",
    required: Object.freeze(["STAGING_QA_BASE_URL"]),
    recommended: Object.freeze(["STAGING_BRANCH_ALIAS"]),
    critical: true,
  }),
  Object.freeze({
    id: "staging-supabase",
    area: "staging-mirror",
    label: "Separate staging Supabase project",
    location: "GitHub Variables + Vercel Preview Environment",
    required: Object.freeze(["STAGING_SUPABASE_PROJECT_REF"]),
    recommended: Object.freeze(["STAGING_SUPABASE_URL", "STAGING_SUPABASE_ANON_KEY", "STAGING_SUPABASE_SERVICE_ROLE_KEY"]),
    critical: true,
  }),
  Object.freeze({
    id: "staging-qa-admin",
    area: "staging-mirror",
    label: "Staging QA login",
    location: "GitHub Secrets",
    required: Object.freeze(["STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"]),
    recommended: Object.freeze(["STAGING_QA_EXPECT_ADMIN"]),
    critical: true,
  }),
]);

export const platformReadinessWorkflowRequirements = Object.freeze([
  Object.freeze({
    id: "fast-deploy",
    area: "accounts-secrets",
    label: "Fast deploy",
    packageScript: "deploy",
    command: "npm run deploy",
  }),
  Object.freeze({
    id: "safe-deploy",
    area: "staging-mirror",
    label: "Safe deploy",
    packageScript: "deploy:safe",
    command: "npm run deploy:safe",
  }),
  Object.freeze({
    id: "syntax-check",
    area: "module-standard",
    label: "Syntax and contract check",
    packageScript: "check",
    command: "npm run check",
  }),
  Object.freeze({
    id: "full-qa",
    area: "module-standard",
    label: "Full QA",
    packageScript: "qa",
    command: "npm run qa",
  }),
  Object.freeze({
    id: "postdeploy",
    area: "observability",
    label: "Production verification",
    packageScript: "release:postdeploy",
    command: "npm run release:postdeploy",
  }),
  Object.freeze({
    id: "release-monitor",
    area: "observability",
    label: "Production monitor",
    packageScript: "release:monitor",
    command: "npm run release:monitor",
  }),
  Object.freeze({
    id: "readiness-check",
    area: "platform-map",
    label: "Platform readiness contract",
    packageScript: "platform:readiness",
    command: "npm run platform:readiness",
  }),
  Object.freeze({
    id: "platform-identity-backfill",
    area: "module-standard",
    label: "Platform identity backfill",
    packageScript: "platform:identity:backfill",
    command: "npm run platform:identity:backfill",
  }),
]);

export const platformObservabilitySignals = Object.freeze([
  Object.freeze({
    id: "deploy-failure",
    label: "Deploy failures",
    source: "GitHub Actions + Vercel",
    evidence: Object.freeze([".github/workflows/production-deploy.yml", "scripts/create-incident-alert.mjs"]),
  }),
  Object.freeze({
    id: "api-errors",
    label: "API errors and slow routes",
    source: "structured API logs",
    evidence: Object.freeze(["api/_lib/platform-security.js"]),
  }),
  Object.freeze({
    id: "failed-saves",
    label: "Failed central saves",
    source: "Data Safety Contract + /api/app-state",
    evidence: Object.freeze(["src/core/data-safety-contracts.cjs", "api/app-state.js"]),
  }),
  Object.freeze({
    id: "backup-restore",
    label: "Backup freshness and restore readiness",
    source: "cron monitor",
    evidence: Object.freeze(["api/app-state-backup.js", "scripts/verify-app-state-restore-readiness.mjs"]),
  }),
  Object.freeze({
    id: "auth-permission-spikes",
    label: "401/403/429 spikes",
    source: "permission matrix and API rate limiter",
    evidence: Object.freeze(["src/core/permission-matrix.cjs", "api/_lib/platform-security.js"]),
  }),
  Object.freeze({
    id: "frontend-performance",
    label: "Frontend load/performance budget",
    source: "Vercel Speed Insights + local budget",
    evidence: Object.freeze(["index.html", "scripts/performance-budget.mjs"]),
  }),
]);

export const platformLiveSignalContracts = Object.freeze([
  Object.freeze({
    id: "vercel-production",
    label: "Vercel Production",
    source: "Vercel runtime",
    required: Object.freeze(["VERCEL_ENV", "VERCEL_URL"]),
    recommended: Object.freeze(["VERCEL_GIT_COMMIT_SHA"]),
    evidence: Object.freeze(["scripts/verify-production-deploy.mjs", "scripts/verify-vercel-release-traffic.mjs"]),
  }),
  Object.freeze({
    id: "github-checks",
    label: "GitHub Checks",
    source: "GitHub commit/check API",
    required: Object.freeze(["VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "VERCEL_GIT_COMMIT_SHA"]),
    recommended: Object.freeze(["GITHUB_TOKEN"]),
    evidence: Object.freeze([".github/workflows/production-deploy.yml", "qa/release-automation.api.spec.mjs"]),
  }),
  Object.freeze({
    id: "backup-freshness",
    label: "Backup Freshness",
    source: "/api/app-state-backup-status",
    required: Object.freeze(["CRON_SECRET"]),
    recommended: Object.freeze(["APP_STATE_BACKUP_STATUS_TOKEN"]),
    evidence: Object.freeze(["scripts/verify-app-state-backup-freshness.mjs", "api/app-state-backup.js"]),
  }),
  Object.freeze({
    id: "supabase-egress",
    label: "Supabase Egress",
    source: "egress guardrails + Supabase usage review",
    required: Object.freeze(["SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    recommended: Object.freeze(["SUPABASE_ACCESS_TOKEN"]),
    evidence: Object.freeze(["qa/egress-guardrails.api.spec.mjs", "scripts/verify-supabase-remote.mjs"]),
  }),
  Object.freeze({
    id: "live-qa",
    label: "Live QA",
    source: "authenticated live smoke",
    required: Object.freeze(["LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"]),
    recommended: Object.freeze(["LIVE_QA_EXPECT_ADMIN"]),
    evidence: Object.freeze(["scripts/verify-live-qa-env.mjs", "qa/live.playwright.config.mjs"]),
  }),
  Object.freeze({
    id: "release-monitor",
    label: "Release Monitor",
    source: "release:monitor",
    required: Object.freeze(["CRON_SECRET", "LIVE_QA_USERNAME", "LIVE_QA_PASSWORD"]),
    recommended: Object.freeze(["APP_STATE_BACKUP_STATUS_TOKEN"]),
    evidence: Object.freeze(["package.json", ".github/workflows/production-smoke.yml"]),
  }),
]);

export const platformOperatingPriorities = Object.freeze([
  Object.freeze({
    id: "performance-ratchet",
    area: "module-standard",
    priority: 1,
    label: "Performance ratchet",
    risk: "Large shared files make every click, QA run, and release slower over time.",
    target: "No new growth above the current budget while app.js and global CSS are extracted into modules.",
    nextStep: "Keep npm run qa:perf green and extract repeated workspace UI before broad product work.",
    evidence: Object.freeze(["scripts/performance-budget.mjs", "src/core/platform-readiness-contracts.mjs"]),
  }),
  Object.freeze({
    id: "platform-health-dashboard",
    area: "observability",
    priority: 2,
    label: "Platform health dashboard",
    risk: "The product owner should not need to infer Live health from GitHub/Vercel/Supabase fragments.",
    target: "One admin-facing health map for release, staging, backup, API, egress, module, and QA status.",
    nextStep: "Use npm run platform:health as the contract source for the in-app admin dashboard.",
    evidence: Object.freeze(["scripts/platform-health-report.mjs", "api/platform-readiness.js"]),
  }),
  Object.freeze({
    id: "database-primary-modules",
    area: "module-standard",
    priority: 3,
    label: "Database-primary modules",
    risk: "Legacy app-state/storage fallbacks can create egress, stale overwrite, and tenant-boundary risk.",
    target: "Each module gets server-owned rows, revision checks, RLS, audit, and snapshots before app-state fallback is retired.",
    nextStep: "Migrate the highest-risk module data flows through staged dual-read/dual-write contracts.",
    evidence: Object.freeze(["src/core/data-safety-contracts.cjs", "supabase/migrations"]),
  }),
  Object.freeze({
    id: "scouting-speed-foundation",
    area: "module-standard",
    priority: 4,
    label: "Scouting speed foundation",
    risk: "Scouting is data-heavy and user-visible; slow database/profile clicks become a platform trust issue.",
    target: "Scouting search, profile open, favorite, and Shadow XI actions stay inside explicit click budgets.",
    nextStep: "Keep scouting click-performance smoke green and move large scouting reads behind server pagination.",
    evidence: Object.freeze(["qa/scouting-click-performance.smoke.spec.mjs", "api/_lib/scouting-database.js"]),
  }),
  Object.freeze({
    id: "staging-mirror-hardening",
    area: "staging-mirror",
    priority: 5,
    label: "Staging mirror hardening",
    risk: "Risky work cannot be proven safely if staging shares Live assumptions or missing secrets.",
    target: "Staging has its own host, Supabase project, QA login, and authenticated smoke before risky Live releases.",
    nextStep: "Make staging env requirements mandatory for safe-lane release ownership.",
    evidence: Object.freeze(["scripts/verify-staging-env.mjs", ".github/workflows/staging-deploy.yml"]),
  }),
  Object.freeze({
    id: "incident-observability",
    area: "observability",
    priority: 6,
    label: "Incident observability",
    risk: "Usage spikes, API errors, or stale backups can stay invisible until users feel them.",
    target: "Release, egress, API, auth, permission, backup, and restore signals produce actionable alerts.",
    nextStep: "Feed Supabase usage and backup/restore checks into the platform health surface.",
    evidence: Object.freeze(["scripts/create-incident-alert.mjs", "scripts/verify-app-state-backup-freshness.mjs"]),
  }),
]);

export const platformDatabasePrimaryMigrationPlan = Object.freeze([
  Object.freeze({
    moduleId: "schedule",
    priority: 1,
    current: "hybrid-adapter",
    target: "database-primary",
    risk: "Calendar data drives sessions and periodization; stale app-state can create wrong day context.",
    nextStep: "Promote the existing schedule database adapter after staging/live QA proves row-version writes and restore.",
  }),
  Object.freeze({
    moduleId: "player-profiles",
    priority: 2,
    current: "hybrid-adapter",
    target: "database-primary",
    risk: "Squad identity is reused by medical, scouting, sessions, and chat presence.",
    nextStep: "Move profile reads through the Squad adapter and block stale roster overwrites with row revisions.",
  }),
  Object.freeze({
    moduleId: "scouting",
    priority: 3,
    current: "lazy-module",
    target: "server-paginated database-primary",
    risk: "Large player/search payloads can slow the browser and increase bandwidth cost.",
    nextStep: "Keep Scouting database/search/profile reads paginated server-side and retire full app-state fallback only after QA.",
  }),
  Object.freeze({
    moduleId: "medical-team",
    priority: 4,
    current: "hybrid-secured-module",
    target: "database-primary private-by-default",
    risk: "Medical data needs strict role split, audit, and coach-safe views before scaling staff access.",
    nextStep: "Promote private medical writes after RLS, audit, and coach-safe read views are proven in staging.",
  }),
  Object.freeze({
    moduleId: "exercise-library",
    priority: 5,
    current: "partial-extraction",
    target: "database-primary versioned library",
    risk: "Library edits feed sessions; destructive seed or folder writes must never remove saved exercises.",
    nextStep: "Extract protected write helpers next, then move exercises/folders into versioned tables before Session Planner block migration.",
  }),
  Object.freeze({
    moduleId: "session-planner",
    priority: 6,
    current: "partial-extraction",
    target: "database-primary session blocks",
    risk: "Training sessions are frequently edited and must not lose block-level data from stale browser state.",
    nextStep: "Continue controller extraction packages before moving session block writes toward database-primary storage.",
  }),
  Object.freeze({
    moduleId: "periodization",
    priority: 7,
    current: "legacy-monolith",
    target: "database-primary planning days",
    risk: "Periodization feeds schedule/session context and needs date-scoped merge behavior.",
    nextStep: "Migrate days after Schedule row versions and Session Planner dependencies are stable.",
  }),
  Object.freeze({
    moduleId: "gameplan",
    priority: 8,
    current: "lazy-module",
    target: "database-primary match plans",
    risk: "Matchday context combines many modules and should move after core identity/planning data is stable.",
    nextStep: "Keep signed Player Brief API server-owned while match plan tables are introduced.",
  }),
  Object.freeze({
    moduleId: "transfer-room",
    priority: 9,
    current: "legacy-monolith",
    target: "database-primary restricted module",
    risk: "Recruitment/transfer planning is access-sensitive and should stay admin-scoped during migration.",
    nextStep: "Migrate after Scouting target identity is server-owned.",
  }),
  Object.freeze({
    moduleId: "game-simulator",
    priority: 10,
    current: "modular-runtime",
    target: "database-primary large-payload library",
    risk: "Simulator sequences can become large; migrate last with import/export and restore proven.",
    nextStep: "Keep runtime modular while sequence storage moves only after backup/restore drills pass.",
  }),
]);

export const platformScoutingPerformanceContract = Object.freeze({
  moduleId: "scouting",
  requiredSignals: Object.freeze([
    "workspace-open",
    "tab-switch",
    "worker-paginated-database-load",
    "search-submit",
    "position-filter",
    "profile-open",
    "favorite-toggle",
    "shadow-xi-add",
    "profile-close",
  ]),
  budgetsMs: Object.freeze({
    openWorkspace: 1200,
    switchTab: 1000,
    loadDatabase: 5000,
    searchDatabase: 1000,
    filterDatabase: 1000,
    openProfile: 1000,
    favoriteToggle: 500,
    addToShadow: 1000,
    closeProfile: 500,
  }),
  datasetRules: Object.freeze({
    firstPageMaxRecords: 50,
    requiresWorkerSource: true,
    requiresServerPaginationBeforeDatabasePrimary: true,
  }),
  evidence: Object.freeze(["qa/scouting-click-performance.smoke.spec.mjs", "scouting-import-data.js", "api/_lib/scouting-database.js"]),
});

function statusWeight(status) {
  if (status === platformReadinessStatuses.missing) return 2;
  if (status === platformReadinessStatuses.warning) return 1;
  return 0;
}

function worstStatus(statuses = []) {
  return statuses.reduce(
    (worst, status) => (statusWeight(status) > statusWeight(worst) ? status : worst),
    platformReadinessStatuses.pass
  );
}

function hasValue(env = {}, name) {
  return String(env?.[name] || "").trim().length > 0;
}

function normalizeReadinessStatus(status) {
  return Object.values(platformReadinessStatuses).includes(status) ? status : platformReadinessStatuses.warning;
}

function evaluateEnvironmentRequirement(requirement, env = {}) {
  const requiredValues = requirement.requiredValues || {};
  const missingRequired = requirement.required.filter((name) => !hasValue(env, name));
  const mismatchedRequiredValues = Object.entries(requiredValues)
    .filter(([name, expectedValue]) => hasValue(env, name) && String(env[name] || "").trim() !== String(expectedValue))
    .map(([name, expectedValue]) => `${name}=${expectedValue}`);
  const missing = [...missingRequired, ...mismatchedRequiredValues];
  const missingRecommended = requirement.recommended.filter((name) => !hasValue(env, name));
  const status = missing.length
    ? platformReadinessStatuses.missing
    : missingRecommended.length
    ? platformReadinessStatuses.warning
    : platformReadinessStatuses.pass;

  return Object.freeze({
    ...requirement,
    status,
    present: Object.freeze(
      requirement.required.filter(
        (name) => hasValue(env, name) && !mismatchedRequiredValues.some((entry) => entry.startsWith(`${name}=`))
      )
    ),
    missing: Object.freeze(missing),
    missingRecommended: Object.freeze(missingRecommended),
  });
}

function defaultLiveSignalDetails(signal, env = {}, missing = [], missingRecommended = []) {
  if (missing.length) {
    return `Missing ${missing.join(", ")}.`;
  }
  if (signal.id === "vercel-production") {
    return env.VERCEL_ENV === "production" ? `Production runtime ${env.VERCEL_URL || ""}.` : `Runtime env is ${env.VERCEL_ENV || "unknown"}.`;
  }
  if (signal.id === "supabase-egress") {
    return missingRecommended.length ? "Egress guardrails are active; usage token is not connected." : "Egress guardrails and Supabase access are connected.";
  }
  return missingRecommended.length ? `Connected with optional gap: ${missingRecommended.join(", ")}.` : "Connected.";
}

export function createPlatformLiveSignalMap(options = {}) {
  const env = options.env || {};
  const overrides = options.liveSignals && typeof options.liveSignals === "object" ? options.liveSignals : {};
  return Object.freeze(
    platformLiveSignalContracts.map((signal) => {
      const override = overrides[signal.id] || {};
      const missing = signal.required.filter((name) => !hasValue(env, name));
      const missingRecommended = signal.recommended.filter((name) => !hasValue(env, name));
      const status = override.status
        ? normalizeReadinessStatus(override.status)
        : missing.length
        ? platformReadinessStatuses.missing
        : missingRecommended.length
        ? platformReadinessStatuses.warning
        : platformReadinessStatuses.pass;
      return Object.freeze({
        ...signal,
        status,
        details: String(override.details || defaultLiveSignalDetails(signal, env, missing, missingRecommended)),
        checkedAt: override.checkedAt || null,
        missing: Object.freeze(missing),
        missingRecommended: Object.freeze(missingRecommended),
      });
    })
  );
}

function evaluateWorkflowRequirement(requirement, scripts = {}) {
  const script = String(scripts?.[requirement.packageScript] || "").trim();
  return Object.freeze({
    ...requirement,
    status: script ? platformReadinessStatuses.pass : platformReadinessStatuses.missing,
    configuredCommand: script,
  });
}

function modulePermissionById(permissionMatrix = platformPermissionMatrix) {
  return new Map(permissionMatrix.map((entry) => [entry.moduleId, entry]));
}

function contractsByModule(contracts = dataSafetyContracts) {
  const map = new Map();
  for (const contract of contracts) {
    if (!map.has(contract.moduleId)) {
      map.set(contract.moduleId, []);
    }
    map.get(contract.moduleId).push(contract);
  }
  return map;
}

function contractKeysForModule(moduleId, contractsMap) {
  return (contractsMap.get(moduleId) || []).map((contract) => contract.key);
}

export function createPlatformModuleReadinessMap(options = {}) {
  const modules = options.modules || platformModules;
  const permissions = modulePermissionById(options.permissionMatrix || platformPermissionMatrix);
  const contracts = contractsByModule(options.dataSafetyContracts || dataSafetyContracts);

  return Object.freeze(
    modules.map((module) => {
      const permission = permissions.get(module.id) || null;
      const dataContractKeys = contractKeysForModule(module.id, contracts);
      const requiredKeys = Array.isArray(module.storageKeys) ? module.storageKeys : [];
      const missingContracts = requiredKeys.filter((key) => !dataContractKeys.includes(key));
      const permissionStatus = permission ? platformReadinessStatuses.pass : platformReadinessStatuses.missing;
      const dataSafetyStatus = missingContracts.length
        ? platformReadinessStatuses.missing
        : platformReadinessStatuses.pass;
      const routeStatus =
        permission && Array.isArray(permission.routes) ? platformReadinessStatuses.pass : platformReadinessStatuses.warning;

      return Object.freeze({
        id: module.id,
        label: module.label,
        stage: module.stage,
        implementation: platformModuleImplementationStages[module.id] || "unclassified",
        storageKeys: Object.freeze([...requiredKeys]),
        dataSafetyKeys: Object.freeze(dataContractKeys),
        missingDataSafetyKeys: Object.freeze(missingContracts),
        futureTables: Object.freeze([...(module.futureTables || [])]),
        apiRoutes: Object.freeze([...(permission?.routes || [])]),
        scope: permission?.scope || "unknown",
        permissions: permission?.permissions || null,
        status: worstStatus([permissionStatus, dataSafetyStatus]),
        permissionStatus,
        dataSafetyStatus,
        routeStatus,
      });
    })
  );
}

function createReadinessSection({ id, label, details, status, evidence = [] }) {
  return Object.freeze({
    id,
    label,
    details,
    status,
    evidence: Object.freeze(evidence),
  });
}

export function createPlatformReadinessReport(options = {}) {
  const env = options.env || {};
  const scripts = options.scripts || {};
  const gitStatusLines = Array.isArray(options.gitStatusLines) ? options.gitStatusLines : [];
  const moduleMap = createPlatformModuleReadinessMap(options);
  const liveSignals = createPlatformLiveSignalMap(options);
  const environment = platformReadinessEnvironmentRequirements.map((requirement) =>
    evaluateEnvironmentRequirement(requirement, env)
  );
  const workflows = platformReadinessWorkflowRequirements.map((requirement) =>
    evaluateWorkflowRequirement(requirement, scripts)
  );
  const moduleStatuses = moduleMap.map((module) => module.status);
  const protectedKeysOwned = new Set(moduleMap.flatMap((module) => module.storageKeys));
  const missingProtectedOwners = protectedStorageKeys.filter((key) => !protectedKeysOwned.has(key));

  const environmentByArea = (area) => environment.filter((entry) => entry.area === area).map((entry) => entry.status);
  const workflowsByArea = (area) => workflows.filter((entry) => entry.area === area).map((entry) => entry.status);

  const sections = Object.freeze([
    createReadinessSection({
      id: "workspace-hygiene",
      label: "Workspace Hygiene",
      details: gitStatusLines.length ? `${gitStatusLines.length} local change(s) need review before release.` : "Working tree can be kept clean before release.",
      status: gitStatusLines.length ? platformReadinessStatuses.warning : platformReadinessStatuses.pass,
      evidence: ["git status --short"],
    }),
    createReadinessSection({
      id: "platform-map",
      label: "Platform Map",
      details: `${moduleMap.length} module(s), ${protectedStorageKeys.length} protected storage key(s), ${missingProtectedOwners.length} ownership gap(s).`,
      status: worstStatus([
        missingProtectedOwners.length ? platformReadinessStatuses.missing : platformReadinessStatuses.pass,
        ...workflowsByArea("platform-map"),
      ]),
      evidence: ["src/core/platform-contracts.mjs", "src/core/platform-readiness-contracts.mjs"],
    }),
    createReadinessSection({
      id: "staging-mirror",
      label: "Staging Mirror",
      details: "Staging must use a separate host, QA login, and Supabase project ref before risky releases.",
      status: worstStatus(environmentByArea("staging-mirror")),
      evidence: ["scripts/verify-staging-env.mjs", ".github/workflows/staging-deploy.yml"],
    }),
    createReadinessSection({
      id: "accounts-secrets",
      label: "Accounts & Secrets",
      details: "GitHub/Vercel/Supabase/QA secrets are verified by name only; secret values are never exposed.",
      status: worstStatus(environmentByArea("accounts-secrets")),
      evidence: ["scripts/verify-ci-release-env.mjs", "scripts/verify-vercel-token.mjs"],
    }),
    createReadinessSection({
      id: "module-standard",
      label: "Module Standard",
      details: "Every module needs data ownership, permission matrix coverage, tests, and tenant-aware migration direction.",
      status: worstStatus([...moduleStatuses, ...workflowsByArea("module-standard")]),
      evidence: ["docs/MODULE_CONTRACTS.md", "qa/platform-readiness.api.spec.mjs"],
    }),
    createReadinessSection({
      id: "design-system",
      label: "Design System",
      details: "Theme, components, spacing, panels, forms, loading, and empty states must stay shared across modules.",
      status: platformReadinessStatuses.warning,
      evidence: ["styles.css", "docs/module-chats/12_PLATFORM_SHELL.md"],
    }),
    createReadinessSection({
      id: "observability",
      label: "Observability",
      details: `${platformObservabilitySignals.length} production signals are defined for release, API, data, backup, auth, and performance.`,
      status: worstStatus([...environmentByArea("observability"), ...workflowsByArea("observability")]),
      evidence: ["api/_lib/platform-security.js", "scripts/performance-budget.mjs"],
    }),
  ]);

  const summary = Object.freeze({
    totalSections: sections.length,
    readySections: sections.filter((section) => section.status === platformReadinessStatuses.pass).length,
    warningSections: sections.filter((section) => section.status === platformReadinessStatuses.warning).length,
    missingSections: sections.filter((section) => section.status === platformReadinessStatuses.missing).length,
    totalModules: moduleMap.length,
    modularModules: moduleMap.filter((module) => !String(module.implementation).includes("legacy")).length,
    legacyModules: moduleMap.filter((module) => String(module.implementation).includes("legacy")).length,
    protectedStorageKeys: protectedStorageKeys.length,
    operatingPriorities: platformOperatingPriorities.length,
    databasePrimaryMigrationItems: platformDatabasePrimaryMigrationPlan.length,
    scoutingPerformanceSignals: platformScoutingPerformanceContract.requiredSignals.length,
    liveSignals: liveSignals.length,
    readyLiveSignals: liveSignals.filter((signal) => signal.status === platformReadinessStatuses.pass).length,
  });

  return Object.freeze({
    schema: PLATFORM_READINESS_SCHEMA,
    generatedAt: new Date().toISOString(),
    overallStatus: worstStatus([...sections.map((section) => section.status), ...liveSignals.map((signal) => signal.status)]),
    summary,
    sections,
    modules: moduleMap,
    environment,
    workflows: Object.freeze(workflows),
    observabilitySignals: platformObservabilitySignals,
    liveSignals,
    operatingPriorities: platformOperatingPriorities,
    databasePrimaryMigrationPlan: platformDatabasePrimaryMigrationPlan,
    scoutingPerformance: platformScoutingPerformanceContract,
  });
}

export function assertPlatformReadinessContract(options = {}) {
  const report = createPlatformReadinessReport(options);
  const failures = [];

  for (const area of platformReadinessAreas) {
    if (!report.sections.some((section) => section.id === area.id)) {
      failures.push(`Missing readiness section: ${area.id}`);
    }
  }

  for (const module of report.modules) {
    if (!module.id || !module.label || !module.implementation) {
      failures.push(`Module ${module.id || "unknown"} is missing readiness identity.`);
    }
    if (!module.permissions) {
      failures.push(`Module ${module.id} is missing permission matrix coverage.`);
    }
    if (module.missingDataSafetyKeys.length) {
      failures.push(`Module ${module.id} is missing data safety keys: ${module.missingDataSafetyKeys.join(", ")}`);
    }
  }

  for (const signal of platformObservabilitySignals) {
    if (!signal.evidence.length) {
      failures.push(`Observability signal ${signal.id} has no evidence.`);
    }
  }

  const moduleIds = new Set(report.modules.map((module) => module.id));
  for (const item of platformDatabasePrimaryMigrationPlan) {
    if (!moduleIds.has(item.moduleId)) {
      failures.push(`Database-primary migration item references unknown module: ${item.moduleId}`);
    }
    if (!item.nextStep) {
      failures.push(`Database-primary migration item ${item.moduleId} is missing a next step.`);
    }
  }

  for (const priority of platformOperatingPriorities) {
    if (!priority.evidence.length || !priority.nextStep) {
      failures.push(`Operating priority ${priority.id} is missing evidence or next step.`);
    }
  }

  if (!moduleIds.has(platformScoutingPerformanceContract.moduleId)) {
    failures.push("Scouting performance contract references an unknown module.");
  }
  if (platformScoutingPerformanceContract.datasetRules.firstPageMaxRecords > 50) {
    failures.push("Scouting first-page dataset budget is too large for the current browser path.");
  }

  if (failures.length) {
    throw new Error(`Platform readiness contract failed: ${failures.join("; ")}`);
  }

  return true;
}
