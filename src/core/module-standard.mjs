import { platformModules } from "./platform-contracts.mjs";

export const MODULE_STANDARD_VERSION = "footballscience-module-standard-v1";

export const moduleMigrationStatuses = Object.freeze({
  core: "core",
  legacy: "legacy",
  legacyAdapter: "legacy-adapter",
  partialExtraction: "partial-extraction",
  extracted: "extracted",
  databasePrimary: "database-primary",
});

export const moduleStandardFileSlots = Object.freeze([
  "index",
  "renderer",
  "state",
  "actions",
  "adapter",
  "styles",
  "tests",
]);

export const moduleStandardMigrationGuardDefaults = Object.freeze({
  preserveStorageKeys: true,
  preserveCurrentWritePath: true,
  destructiveMigrationAllowed: false,
  requiresBeforeAfterQa: true,
  centralSavePipelineRequired: true,
});

function freezeArray(value) {
  return Object.freeze(Array.isArray(value) ? [...value] : []);
}

function normalizeModuleId(value) {
  return String(value || "").trim();
}

function createTargetFiles(moduleId, options = {}) {
  const filePrefix = String(options.filePrefix || moduleId || "").trim();
  const targetDir = String(options.targetDir || `src/modules/${moduleId}`).trim();

  return Object.freeze({
    index: `${targetDir}/index.mjs`,
    renderer: `${targetDir}/${filePrefix}-renderer.mjs`,
    state: `${targetDir}/${filePrefix}-state.mjs`,
    actions: `${targetDir}/${filePrefix}-actions.mjs`,
    adapter: `${targetDir}/${filePrefix}-adapter.mjs`,
    styles: `${targetDir}/${filePrefix}.css`,
    tests: `qa/${filePrefix}-module-contract.api.spec.mjs`,
  });
}

function createModuleStandardContract(options = {}) {
  const id = normalizeModuleId(options.id);
  const filePrefix = String(options.filePrefix || id).trim();
  const targetDir = String(options.targetDir || `src/modules/${id}`).trim();
  const migrationGuard = Object.freeze({
    ...moduleStandardMigrationGuardDefaults,
    ...(options.migrationGuard || {}),
  });

  return Object.freeze({
    standardVersion: MODULE_STANDARD_VERSION,
    id,
    label: String(options.label || id).trim(),
    migrationStatus: options.migrationStatus || moduleMigrationStatuses.legacy,
    mountId: String(options.mountId || "").trim(),
    targetDir,
    filePrefix,
    currentFiles: freezeArray(options.currentFiles),
    cssFiles: freezeArray(options.cssFiles),
    testFiles: freezeArray(options.testFiles),
    targetFiles: createTargetFiles(id, { filePrefix, targetDir }),
    extractionOrder: Number(options.extractionOrder ?? 999),
    riskLevel: String(options.riskLevel || "medium").trim(),
    migrationGuard,
    notes: String(options.notes || "").trim(),
  });
}

export const moduleStandardContracts = Object.freeze([
  createModuleStandardContract({
    id: "platform-shell",
    label: "Platform Shell",
    migrationStatus: moduleMigrationStatuses.core,
    mountId: "hubShell",
    currentFiles: ["app.js", "index.html", "platform-auth-boot.js", "platform-navigation.css", "top-icons.js"],
    cssFiles: ["platform-navigation.css", "styles.css"],
    testFiles: ["qa/critical-flows.smoke.spec.mjs", "qa/platform-click-audit.smoke.spec.mjs"],
    extractionOrder: 1,
    riskLevel: "high",
    notes: "Keep as the thin auth, router, loader, global event, and central state shell while product modules move out.",
  }),
  createModuleStandardContract({
    id: "platform-identity",
    label: "Platform Identity",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "adminWorkspace",
    currentFiles: ["api/platform-identity.js", "api/platform-tenant-bootstrap.js", "src/core/platform-contracts.mjs"],
    testFiles: [
      "qa/platform-identity-schema.api.spec.mjs",
      "qa/platform-identity-api.api.spec.mjs",
      "qa/platform-tenant-bootstrap.api.spec.mjs",
    ],
    extractionOrder: 2,
    riskLevel: "high",
    migrationGuard: { preserveCurrentWritePath: false },
    notes: "Database-owned tenant spine. UI extraction can happen later, but authorization stays server-owned.",
  }),
  createModuleStandardContract({
    id: "platform-readiness",
    label: "Platform Readiness",
    migrationStatus: moduleMigrationStatuses.core,
    mountId: "adminWorkspace",
    currentFiles: ["api/platform-readiness.js", "src/core/platform-readiness-contracts.mjs", "scripts/platform-health-report.mjs"],
    testFiles: ["qa/platform-readiness.api.spec.mjs"],
    extractionOrder: 3,
    riskLevel: "medium",
    notes: "Admin health surface generated from contracts, release checks, and readiness scripts.",
  }),
  createModuleStandardContract({
    id: "platform-appearance",
    label: "Platform Appearance",
    migrationStatus: moduleMigrationStatuses.legacyAdapter,
    mountId: "adminWorkspace",
    currentFiles: ["app.js", "src/core/appearance-governance.mjs", "appearance-governance.css"],
    cssFiles: ["appearance-governance.css"],
    testFiles: ["qa/platform-appearance-governance.api.spec.mjs"],
    extractionOrder: 4,
    riskLevel: "medium",
    notes: "Admin-only visual governance remains central-state backed until the admin UI is extracted.",
  }),
  createModuleStandardContract({
    id: "home",
    label: "Home",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "dashboardGrid",
    currentFiles: [
      "app.js",
      "src/modules/home/dashboard-renderer.mjs",
      "src/modules/home/dashboard-runtime-controller.mjs",
      "src/modules/home/tasks-adapter.mjs",
    ],
    cssFiles: ["styles.css"],
    testFiles: [
      "qa/home-dashboard-renderer.api.spec.mjs",
      "qa/home-dashboard-runtime-controller.api.spec.mjs",
      "qa/home-tasks-adapter.api.spec.mjs",
    ],
    extractionOrder: 5,
    riskLevel: "medium",
    notes: "Home has renderer and task adapter boundaries; remaining legacy dashboard glue should move without changing task keys.",
  }),
  createModuleStandardContract({
    id: "chat",
    label: "Team Chat",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "dashboardChatWidget",
    currentFiles: ["app.js", "src/modules/chat", "api/chat.js", "api/_lib/chat-database.js"],
    cssFiles: ["dashboard-chat.css", "dashboard-chat-create.css", "dashboard-chat-launcher.css", "dashboard-chat-message.css"],
    testFiles: ["qa/chat-api-contracts.api.spec.mjs", "qa/home-chat-widget-renderer.api.spec.mjs"],
    extractionOrder: 6,
    riskLevel: "high",
    notes: "Database-primary via /api/chat and chat_* tables; football-dashboard-chat-v1 is compatibility state only. Dedicated chat ownership exists; do not migrate chat from this lane unless ownership is transferred.",
  }),
  createModuleStandardContract({
    id: "schedule",
    label: "Schedule",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "scheduleWorkspace",
    currentFiles: [
      "app.js",
      "src/modules/schedule/events.mjs",
      "src/modules/schedule/schedule-actions.mjs",
      "src/modules/schedule/schedule-adapter.mjs",
      "src/modules/schedule/schedule-controller.mjs",
      "src/modules/schedule/schedule-renderer.mjs",
      "src/modules/schedule/schedule-state.mjs",
      "schedule-planner-overrides.css",
    ],
    cssFiles: ["src/modules/schedule/schedule.css", "schedule-planner-overrides.css"],
    testFiles: [
      "qa/schedule-adapter.api.spec.mjs",
      "qa/schedule-module-contract.api.spec.mjs",
      "qa/schedule-database-adapter.api.spec.mjs",
    ],
    extractionOrder: 7,
    riskLevel: "medium",
    notes: "State, actions, controller, and rendering have moved into src/modules/schedule while app.js remains the integration shell.",
  }),
  createModuleStandardContract({
    id: "periodization",
    label: "Periodization",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "periodizationShell",
    targetDir: "src/modules/periodization",
    filePrefix: "periodization",
    currentFiles: [
      "app.js",
      "periodization-import-data.js",
      "src/modules/periodization/index.mjs",
      "src/modules/periodization/periodization-state.mjs",
      "src/modules/periodization/periodization-renderer.mjs",
      "src/modules/periodization/periodization-controller.mjs",
      "src/modules/periodization/periodization-session-bridge.mjs",
      "src/modules/periodization/periodization-workspace-shell.mjs",
    ],
    testFiles: ["qa/critical-flows.smoke.spec.mjs", "qa/periodization-module-contract.api.spec.mjs"],
    extractionOrder: 8,
    riskLevel: "medium",
    notes: "State, merge helpers, rendering, workspace controller bindings, and Session Planner bridge behavior have moved into src/modules/periodization while app.js remains the integration shell.",
  }),
  createModuleStandardContract({
    id: "player-profiles",
    label: "Squad",
    migrationStatus: moduleMigrationStatuses.legacyAdapter,
    mountId: "playerProfilesWorkspace",
    targetDir: "src/modules/squad",
    filePrefix: "squad",
    currentFiles: [
      "app.js",
      "src/modules/squad/players.mjs",
      "src/modules/squad/player-profile-age-helpers.mjs",
      "src/modules/squad/player-profile-helpers.mjs",
      "src/modules/squad/player-profile-intelligence-helpers.mjs",
      "src/modules/squad/squad-adapter.mjs",
      "src/modules/squad/squad-data-foundation.mjs",
      "src/modules/squad/squad-import-planner.mjs",
      "src/modules/squad/squad-scouting-profile-helpers.mjs",
      "api/squad-ages.js",
    ],
    testFiles: ["qa/squad-adapter.api.spec.mjs", "qa/squad-data-foundation-contract.api.spec.mjs", "qa/squad-import-planner-contract.api.spec.mjs", "qa/squad-database-schema.api.spec.mjs"],
    extractionOrder: 9,
    riskLevel: "high",
    notes: "Product language is Squad while legacy workspace id remains player-profiles.",
  }),
  createModuleStandardContract({
    id: "leaderboard",
    label: "Leaderboard",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "leaderboardSummary",
    targetDir: "src/modules/leaderboard",
    filePrefix: "leaderboard",
    currentFiles: [
      "api/leaderboard.js",
      "api/_lib/leaderboard-database.js",
      "src/core/leaderboard-surface-runtime.mjs",
      "src/modules/home/leaderboard-home-mount.mjs",
      "src/modules/leaderboard",
      "supabase/migrations/20260825181453_leaderboard_foundation.sql",
    ],
    cssFiles: ["src/modules/leaderboard/leaderboard.css"],
    testFiles: [
      "qa/leaderboard-database-schema.api.spec.mjs",
      "qa/leaderboard-api.api.spec.mjs",
      "qa/leaderboard-home-surface-module-contract.api.spec.mjs",
      "qa/leaderboard-module-contract.api.spec.mjs",
      "qa/leaderboard-surface-runtime-contract.api.spec.mjs",
    ],
    extractionOrder: 9.5,
    riskLevel: "high",
    migrationGuard: {
      preserveCurrentWritePath: false,
      centralSavePipelineRequired: false,
    },
    notes: "Database-primary monthly points ledger mounted from Home with a shared summary and dialog runtime. Squad remains the player identity source; corrections append reversals instead of overwriting totals.",
  }),
  createModuleStandardContract({
    id: "medical-team",
    label: "Medical Team",
    migrationStatus: moduleMigrationStatuses.legacy,
    mountId: "medicalTeamWorkspace",
    currentFiles: ["app.js", "medical-merge.js", "medical-roster-overview.css"],
    cssFiles: ["medical-roster-overview.css"],
    testFiles: ["qa/medical-api-contracts.api.spec.mjs", "qa/critical-flows.smoke.spec.mjs"],
    extractionOrder: 10,
    riskLevel: "high",
    notes: "Extract only after Squad/Profile boundaries are stable because medical availability consumes roster identity.",
  }),
  createModuleStandardContract({
    id: "exercise-library",
    label: "Exercise Library",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "sessionPlannerWorkspace",
    currentFiles: [
      "app.js",
      "src/modules/exercise-library/index.mjs",
      "src/modules/exercise-library/exercise-library-actions.mjs",
      "src/modules/exercise-library/exercise-library-renderer.mjs",
      "src/modules/exercise-library/exercise-library-review-helpers.mjs",
      "src/modules/exercise-library/exercise-library-runtime-facade.mjs",
      "src/modules/exercise-library/exercise-library-runtime-controller.mjs",
      "src/modules/exercise-library/exercise-library-state.mjs",
    ],
    testFiles: [
      "qa/data-safety-contracts.api.spec.mjs",
      "qa/critical-flows.smoke.spec.mjs",
      "qa/exercise-library-module-contract.api.spec.mjs",
    ],
    extractionOrder: 11,
    riskLevel: "high",
    notes: "State normalization, archive/folder normalization, version snapshots, storage constants, library overlay rendering, runtime glue, and library actions live in src/modules/exercise-library. Never seed-overwrite or hard-delete saved exercises.",
  }),
  createModuleStandardContract({
    id: "session-planner",
    label: "Session Planner",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "sessionPlannerWorkspace",
    currentFiles: [
      "app.js",
      "session-planner-overrides.css",
      "session-print-overrides.css",
      "src/modules/session-planner/index.mjs",
      "src/modules/session-planner/session-planner-autosave.mjs",
      "src/modules/session-planner/session-planner-renderer.mjs",
      "src/modules/session-planner/session-planner-workspace-controller.mjs",
      "src/modules/session-planner/session-planner-visual-renderer.mjs",
      "src/modules/session-planner/session-planner-player-board-renderer.mjs",
      "src/modules/session-planner/session-planner-print-renderer.mjs",
    ],
    cssFiles: ["session-planner-overrides.css", "session-print-overrides.css"],
    testFiles: [
      "qa/critical-flows.smoke.spec.mjs",
      "qa/central-state-revision.smoke.spec.mjs",
      "qa/session-planner-module-contract.api.spec.mjs",
    ],
    extractionOrder: 12,
    riskLevel: "high",
    notes: "Autosave policy, workspace UI controller, block/form rendering, tactical visual rendering, player board rendering, and print rendering now live in src/modules/session-planner; protected state normalization, central sync, and the save flow remain in app.js for later passes.",
  }),
  createModuleStandardContract({
    id: "gameplan",
    label: "Gameplan",
    migrationStatus: moduleMigrationStatuses.legacyAdapter,
    mountId: "gameplanWorkspace",
    currentFiles: [
      "app.js",
      "gameplan.js",
      "gameplan-state.js",
      "gameplan.css",
      "src/modules/gameplan/index.mjs",
      "src/modules/gameplan/gameplan-command-renderer.mjs",
      "src/modules/gameplan/gameplan-preparation-selectors.mjs",
      "src/modules/gameplan/gameplan-presentation-adapter.mjs",
      "src/modules/gameplan/gameplan-command.css",
      "src/modules/gameplan/gameplan-command-base.css",
      "src/modules/gameplan/gameplan-command-lineup.css",
      "src/modules/gameplan/gameplan-command-workflow.css",
      "src/modules/gameplan/gameplan-command-responsive.css",
      "api/gameplan-player-brief.js",
    ],
    cssFiles: [
      "gameplan.css",
      "src/modules/gameplan/gameplan-command.css",
      "src/modules/gameplan/gameplan-command-base.css",
      "src/modules/gameplan/gameplan-command-lineup.css",
      "src/modules/gameplan/gameplan-command-workflow.css",
      "src/modules/gameplan/gameplan-command-responsive.css",
    ],
    testFiles: [
      "qa/gameplan-command-contract.api.spec.mjs",
      "qa/gameplan-player-brief-api.api.spec.mjs",
      "qa/gameplan-player-brief.smoke.spec.mjs",
    ],
    extractionOrder: 13,
    riskLevel: "high",
    notes: "Presentation owns the match lineup, weekly preparation stays source-backed, and Player Brief audience gates remain server-owned while legacy UI code is extracted.",
  }),
  createModuleStandardContract({
    id: "set-pieces-room",
    label: "Set Pieces Room",
    migrationStatus: moduleMigrationStatuses.extracted,
    mountId: "setPiecesRoomWorkspace",
    targetDir: "src/modules/set-pieces-room",
    filePrefix: "set-pieces-room",
    currentFiles: ["src/modules/set-pieces-room"],
    cssFiles: [
      "src/modules/set-pieces-room/set-pieces-room.css",
      "src/modules/set-pieces-room/set-pieces-board.css",
      "src/modules/set-pieces-room/set-pieces-roster.css",
      "src/modules/set-pieces-room/set-pieces-theme.css",
    ],
    testFiles: ["qa/set-pieces-room-contract.api.spec.mjs", "qa/set-pieces-room.smoke.spec.mjs"],
    extractionOrder: 13.1,
    riskLevel: "high",
    notes: "Structured phases, variants, board elements and playback remain module-owned. Central app-state is the protected compatibility path.",
  }),
  createModuleStandardContract({
    id: "video-analysis",
    label: "FS Player",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "analysisRoomWorkspace",
    targetDir: "src/modules/video-analysis",
    filePrefix: "video-analysis",
    currentFiles: [
      "api/video-analysis.js",
      "api/_lib/video-analysis-database.js",
      "src/modules/video-analysis",
      "supabase/migrations/20260613000100_video_analysis_metadata_foundation.sql",
    ],
    cssFiles: ["src/modules/video-analysis/video-analysis.css"],
    testFiles: [
      "qa/video-analysis-schema.api.spec.mjs",
      "qa/video-analysis-api.api.spec.mjs",
      "qa/video-analysis-module-contract.api.spec.mjs",
    ],
    extractionOrder: 14,
    riskLevel: "high",
    migrationGuard: {
      preserveCurrentWritePath: false,
      centralSavePipelineRequired: false,
    },
    notes: "Database-primary FS Player tab inside Analysis Room. Store local video intelligence only: sources, clip timestamps, tags, players, notes, outcomes, and playlists. Never upload match video.",
  }),
  createModuleStandardContract({
    id: "idp",
    label: "IDP",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "idpWorkspace",
    targetDir: "src/modules/idp",
    filePrefix: "idp",
    currentFiles: [
      "api/idp.js",
      "api/_lib/idp-database.js",
      "src/modules/idp",
      "supabase/migrations/20260614163504_idp_player_development_system.sql",
    ],
    cssFiles: ["src/modules/idp/idp.css"],
    testFiles: ["qa/idp-schema.api.spec.mjs", "qa/idp-api.api.spec.mjs", "qa/idp-module-contract.api.spec.mjs"],
    extractionOrder: 15,
    riskLevel: "high",
    migrationGuard: {
      preserveCurrentWritePath: false,
      centralSavePipelineRequired: false,
    },
    notes: "Database-primary player development system. IDP owns focus, evidence, reviews, next actions, and milestones while referencing Squad players and Video Analysis clips.",
  }),
  createModuleStandardContract({
    id: "football-science-db",
    label: "Football Science DB",
    migrationStatus: moduleMigrationStatuses.databasePrimary,
    mountId: "scoutingWorkspace",
    currentFiles: ["api/football-science-db.js", "api/_lib/football-science-db.js"],
    testFiles: ["qa/football-science-db-schema.api.spec.mjs", "qa/football-science-db-api.api.spec.mjs"],
    extractionOrder: 16,
    riskLevel: "high",
    migrationGuard: { preserveCurrentWritePath: false },
    notes: "Server-first data foundation. Scouting should consume it instead of shipping large browser blobs.",
  }),
  createModuleStandardContract({
    id: "scouting",
    label: "Scouting",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "scoutingWorkspace",
    currentFiles: ["scouting-workspace.js", "scouting-workspace.css", "scouting-database-worker.js", "src/modules/scouting"],
    cssFiles: ["scouting-workspace.css", "src/modules/scouting/scouting-theme.css"],
    testFiles: ["qa/scouting-workspace.smoke.spec.mjs", "qa/scouting-click-performance.smoke.spec.mjs"],
    extractionOrder: 17,
    riskLevel: "high",
    notes: "Data-heavy module. Move import data to lazy API/DB before broad UI extraction.",
  }),
  createModuleStandardContract({
    id: "transfer-room",
    label: "Transfer Room",
    migrationStatus: moduleMigrationStatuses.legacyAdapter,
    mountId: "transferRoomWorkspace",
    currentFiles: ["transfer-room.js", "transfer-room-runtime.js", "transfer-room-state.js", "transfer-room.css"],
    cssFiles: ["transfer-room.css"],
    testFiles: ["qa/transfer-room-target-snapshot.smoke.spec.mjs"],
    extractionOrder: 18,
    riskLevel: "high",
    notes: "Keep transfer permissions and scouting snapshots explicit while moving UI runtime into src/modules.",
  }),
  createModuleStandardContract({
    id: "game-simulator",
    label: "Game Simulator",
    migrationStatus: moduleMigrationStatuses.partialExtraction,
    mountId: "gameSimulatorWorkspace",
    currentFiles: ["app.js", "src/modules/game-simulator"],
    testFiles: [
      "qa/game-simulator-controller.api.spec.mjs",
      "qa/game-simulator-controllers.api.spec.mjs",
      "qa/game-simulator-control-bindings.api.spec.mjs",
    ],
    extractionOrder: 19,
    riskLevel: "medium",
    notes: "Controllers and runtime are already lazy-loaded; continue moving app.js simulator glue into the module.",
  }),
]);

function createContractMap(contracts) {
  return new Map(contracts.map((contract) => [contract.id, contract]));
}

export function createModuleStandardRegistry(contracts = moduleStandardContracts) {
  const normalizedContracts = contracts.map((contract) => Object.freeze({ ...contract }));
  const contractMap = createContractMap(normalizedContracts);
  const allowedStatuses = new Set(Object.values(moduleMigrationStatuses));

  return Object.freeze({
    list() {
      return [...contractMap.values()];
    },
    ids() {
      return [...contractMap.keys()];
    },
    get(moduleId) {
      return contractMap.get(normalizeModuleId(moduleId)) || null;
    },
    require(moduleId) {
      const contract = contractMap.get(normalizeModuleId(moduleId));
      if (!contract) {
        throw new Error(`Unknown module standard contract: ${moduleId}`);
      }
      return contract;
    },
    byStatus(status) {
      return [...contractMap.values()].filter((contract) => contract.migrationStatus === status);
    },
    extractionQueue() {
      return [...contractMap.values()]
        .filter((contract) => contract.migrationStatus !== moduleMigrationStatuses.core)
        .sort((left, right) => left.extractionOrder - right.extractionOrder);
    },
    assertPlatformModuleCoverage(modules = platformModules) {
      const moduleIds = new Set(modules.map((module) => module.id));
      const missing = [...moduleIds].filter((moduleId) => !contractMap.has(moduleId));
      const orphaned = [...contractMap.keys()].filter((moduleId) => !moduleIds.has(moduleId));
      if (missing.length || orphaned.length) {
        throw new Error(
          [
            missing.length ? `missing module standard contracts: ${missing.join(", ")}` : "",
            orphaned.length ? `orphaned module standard contracts: ${orphaned.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("; ")
        );
      }
      return true;
    },
    assertRequiredFields() {
      for (const contract of contractMap.values()) {
        if (contract.standardVersion !== MODULE_STANDARD_VERSION) {
          throw new Error(`${contract.id} has an invalid module standard version.`);
        }
        if (!allowedStatuses.has(contract.migrationStatus)) {
          throw new Error(`${contract.id} has an invalid migration status: ${contract.migrationStatus}`);
        }
        if (!Number.isFinite(contract.extractionOrder)) {
          throw new Error(`${contract.id} needs a numeric extraction order.`);
        }
        for (const slot of moduleStandardFileSlots) {
          if (!contract.targetFiles?.[slot]) {
            throw new Error(`${contract.id} is missing target file slot: ${slot}`);
          }
        }
        for (const [key, value] of Object.entries(moduleStandardMigrationGuardDefaults)) {
          if (typeof contract.migrationGuard?.[key] !== typeof value) {
            throw new Error(`${contract.id} has an invalid migration guard value: ${key}`);
          }
        }
      }
      return true;
    },
    assertSafeLegacyMigrationPlan(modules = platformModules) {
      const modulesById = new Map(modules.map((module) => [module.id, module]));
      for (const contract of contractMap.values()) {
        const module = modulesById.get(contract.id);
        const hasProtectedStorage = Boolean(module?.storageKeys?.length);
        if (!hasProtectedStorage) {
          continue;
        }
        if (!contract.migrationGuard.preserveStorageKeys) {
          throw new Error(`${contract.id} must preserve existing storage keys during extraction.`);
        }
        if (contract.migrationGuard.destructiveMigrationAllowed) {
          throw new Error(`${contract.id} cannot allow destructive migration by default.`);
        }
        if (!contract.migrationGuard.centralSavePipelineRequired) {
          throw new Error(`${contract.id} must keep the central save pipeline during extraction.`);
        }
      }
      return true;
    },
  });
}

export const moduleStandardRegistry = createModuleStandardRegistry();
