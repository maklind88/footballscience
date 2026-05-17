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
  "exercise-library": "legacy-monolith",
  "session-planner": "legacy-monolith",
  periodization: "legacy-monolith",
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
    required: Object.freeze(["SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
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

function evaluateEnvironmentRequirement(requirement, env = {}) {
  const missing = requirement.required.filter((name) => !hasValue(env, name));
  const missingRecommended = requirement.recommended.filter((name) => !hasValue(env, name));
  const status = missing.length
    ? platformReadinessStatuses.missing
    : missingRecommended.length
    ? platformReadinessStatuses.warning
    : platformReadinessStatuses.pass;

  return Object.freeze({
    ...requirement,
    status,
    present: Object.freeze(requirement.required.filter((name) => hasValue(env, name))),
    missing: Object.freeze(missing),
    missingRecommended: Object.freeze(missingRecommended),
  });
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
  });

  return Object.freeze({
    schema: PLATFORM_READINESS_SCHEMA,
    generatedAt: new Date().toISOString(),
    overallStatus: worstStatus(sections.map((section) => section.status)),
    summary,
    sections,
    modules: moduleMap,
    environment,
    workflows: Object.freeze(workflows),
    observabilitySignals: platformObservabilitySignals,
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

  if (failures.length) {
    throw new Error(`Platform readiness contract failed: ${failures.join("; ")}`);
  }

  return true;
}
