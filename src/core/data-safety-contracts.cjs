"use strict";

const DATA_SAFETY_SCHEMA = "footballscience-data-safety-contract-v1";
const CENTRAL_APP_STATE_PIPELINE = "central-app-state";
const CENTRAL_APP_STATE_ENDPOINT = "/api/app-state";
const LOCAL_CACHE_ONLY = "cache-only";
const SERVER_SOURCE_OF_TRUTH = "server";
const REQUIRED_RECORD_FIELDS = Object.freeze(["updatedAt", "updatedBy", "revision", "organizationId"]);
const DEFAULT_CONTENT_SAFETY = Object.freeze({
  inputPolicy: "server-validated-json",
  htmlPolicy: "escaped-text-only",
  executableContent: "reject",
  prototypePollutionKeys: "reject",
});

const dataSafetyMergePolicies = Object.freeze({
  appendPreserveNewer: "append-preserve-newer",
  databaseFirst: "database-first",
  fieldTimestampMerge: "field-timestamp-merge",
  recordTimestampMerge: "record-timestamp-merge",
  revisionGuardedLastWrite: "revision-guarded-last-write",
  serverSanitized: "server-sanitized",
  snapshotAppendOnly: "snapshot-append-only",
});

function freezeContract(contract) {
  return Object.freeze({
    schema: DATA_SAFETY_SCHEMA,
    savePipeline: CENTRAL_APP_STATE_PIPELINE,
    saveEndpoint: CENTRAL_APP_STATE_ENDPOINT,
    sourceOfTruth: SERVER_SOURCE_OF_TRUTH,
    localPersistence: LOCAL_CACHE_ONLY,
    defaultOrganizationId: "global",
    requiresOrganizationId: true,
    requiredFields: REQUIRED_RECORD_FIELDS,
    audit: Object.freeze({
      enabled: true,
      includeBeforeAfter: true,
      redactSensitiveFields: true,
    }),
    snapshots: Object.freeze({
      enabled: true,
      backupEndpoint: "/api/app-state-backup",
    }),
    contentSafety: DEFAULT_CONTENT_SAFETY,
    revision: Object.freeze({
      required: true,
      strategy: "server-increment",
    }),
    staleWriteStrategy: "reject",
    ...contract,
    scope: Object.freeze({
      tenancy: "organization",
      storageNamespace: "global",
      ...(contract.scope || {}),
    }),
  });
}

const dataSafetyContracts = Object.freeze([
  freezeContract({
    moduleId: "platform-shell",
    key: "football-workspace-hub-v3",
    recordType: "workspace-shell",
    mergePolicy: dataSafetyMergePolicies.serverSanitized,
  }),
  freezeContract({
    moduleId: "platform-shell",
    key: "football-platform-structure-v1",
    recordType: "club-team-structure",
    mergePolicy: dataSafetyMergePolicies.serverSanitized,
  }),
  freezeContract({
    moduleId: "home",
    key: "football-dashboard-tasks-v1",
    recordType: "home-tasks",
    mergePolicy: dataSafetyMergePolicies.recordTimestampMerge,
    staleWriteStrategy: "merge",
  }),
  freezeContract({
    moduleId: "home",
    key: "football-dashboard-notification-seen-v1",
    recordType: "notification-preferences",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
  }),
  freezeContract({
    moduleId: "home",
    key: "football-dashboard-tutorial-prefs-v1",
    recordType: "tutorial-preferences",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
  }),
  freezeContract({
    moduleId: "home",
    key: "football-dashboard-news-seen-v1",
    recordType: "news-preferences",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
  }),
  freezeContract({
    moduleId: "chat",
    key: "football-dashboard-chat-v1",
    recordType: "chat-compatibility-state",
    mergePolicy: dataSafetyMergePolicies.databaseFirst,
    staleWriteStrategy: "dedicated-api",
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "schedule",
    key: "football-schedule-v1",
    recordType: "schedule-events",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "exercise-library",
    key: "football-session-exercise-library-v1",
    recordType: "exercise-library",
    mergePolicy: dataSafetyMergePolicies.appendPreserveNewer,
    staleWriteStrategy: "merge",
  }),
  freezeContract({
    moduleId: "exercise-library",
    key: "football-session-exercise-library-backup-v1",
    recordType: "exercise-library-backup",
    mergePolicy: dataSafetyMergePolicies.snapshotAppendOnly,
    staleWriteStrategy: "merge",
  }),
  freezeContract({
    moduleId: "exercise-library",
    key: "football-session-exercise-library-folders-v1",
    recordType: "exercise-folders",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
  }),
  freezeContract({
    moduleId: "exercise-library",
    key: "football-session-exercise-library-folders-backup-v1",
    recordType: "exercise-folders-backup",
    mergePolicy: dataSafetyMergePolicies.snapshotAppendOnly,
    staleWriteStrategy: "merge",
  }),
  freezeContract({
    moduleId: "session-planner",
    key: "football-session-planner-v3",
    recordType: "session-planner",
    mergePolicy: dataSafetyMergePolicies.fieldTimestampMerge,
    staleWriteStrategy: "merge",
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "periodization",
    key: "football-periodization-v2",
    recordType: "periodization-days",
    mergePolicy: dataSafetyMergePolicies.fieldTimestampMerge,
    staleWriteStrategy: "merge",
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "medical-team",
    key: "football-medical-team-v1",
    recordType: "medical-team-compatibility-state",
    mergePolicy: dataSafetyMergePolicies.serverSanitized,
    scope: {
      teamScoped: true,
      clinical: true,
    },
  }),
  freezeContract({
    moduleId: "player-profiles",
    key: "football-player-profiles-v1",
    recordType: "squad-player-profiles",
    mergePolicy: dataSafetyMergePolicies.recordTimestampMerge,
    staleWriteStrategy: "merge",
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "game-simulator",
    key: "football-simulator-sequence-v1",
    recordType: "simulator-active-sequence",
    mergePolicy: dataSafetyMergePolicies.revisionGuardedLastWrite,
    scope: {
      teamScoped: true,
    },
  }),
  freezeContract({
    moduleId: "game-simulator",
    key: "football-simulator-sequence-library-v2",
    recordType: "simulator-sequence-library",
    mergePolicy: dataSafetyMergePolicies.appendPreserveNewer,
    staleWriteStrategy: "merge",
    scope: {
      teamScoped: true,
    },
  }),
]);

function normalizeContractKey(value) {
  return String(value || "").trim();
}

function normalizeModuleId(value) {
  return String(value || "").trim();
}

function createDataSafetyRegistry(contracts = dataSafetyContracts) {
  const normalizedContracts = contracts.map((contract) => freezeContract(contract));
  const byKey = new Map(normalizedContracts.map((contract) => [contract.key, contract]));
  const byModule = new Map();

  for (const contract of normalizedContracts) {
    if (!byModule.has(contract.moduleId)) {
      byModule.set(contract.moduleId, []);
    }
    byModule.get(contract.moduleId).push(contract);
  }

  return Object.freeze({
    list() {
      return [...byKey.values()];
    },
    keys() {
      return [...byKey.keys()];
    },
    hasKey(key) {
      return byKey.has(normalizeContractKey(key));
    },
    getByKey(key) {
      return byKey.get(normalizeContractKey(key)) || null;
    },
    requireByKey(key) {
      const contract = byKey.get(normalizeContractKey(key));
      if (!contract) {
        throw new Error(`Missing data safety contract for storage key: ${key}`);
      }
      return contract;
    },
    forModule(moduleId) {
      return [...(byModule.get(normalizeModuleId(moduleId)) || [])];
    },
    assertStorageKeyCoverage(storageKeys = []) {
      const missing = storageKeys.filter((key) => !byKey.has(normalizeContractKey(key)));
      if (missing.length) {
        throw new Error(`Storage keys missing data safety contracts: ${missing.join(", ")}`);
      }
      return true;
    },
    assertModuleCoverage(modules = []) {
      const missing = [];
      for (const module of modules) {
        const storageKeys = Array.isArray(module?.storageKeys) ? module.storageKeys : [];
        storageKeys.forEach((key) => {
          if (!byKey.has(normalizeContractKey(key))) {
            missing.push(`${module.id}:${key}`);
          }
        });
      }
      if (missing.length) {
        throw new Error(`Module storage keys missing data safety contracts: ${missing.join(", ")}`);
      }
      return true;
    },
    assertRequiredContractFields() {
      const missing = [];
      for (const contract of normalizedContracts) {
        REQUIRED_RECORD_FIELDS.forEach((field) => {
          if (!contract.requiredFields.includes(field)) {
            missing.push(`${contract.key}:${field}`);
          }
        });
        if (!contract.mergePolicy || !contract.scope?.tenancy || contract.saveEndpoint !== CENTRAL_APP_STATE_ENDPOINT) {
          missing.push(`${contract.key}:pipeline`);
        }
        if (
          contract.contentSafety?.inputPolicy !== DEFAULT_CONTENT_SAFETY.inputPolicy ||
          contract.contentSafety?.htmlPolicy !== DEFAULT_CONTENT_SAFETY.htmlPolicy ||
          contract.contentSafety?.executableContent !== DEFAULT_CONTENT_SAFETY.executableContent ||
          contract.contentSafety?.prototypePollutionKeys !== DEFAULT_CONTENT_SAFETY.prototypePollutionKeys
        ) {
          missing.push(`${contract.key}:contentSafety`);
        }
      }
      if (missing.length) {
        throw new Error(`Invalid data safety contracts: ${missing.join(", ")}`);
      }
      return true;
    },
  });
}

const dataSafetyRegistry = createDataSafetyRegistry();

module.exports = {
  CENTRAL_APP_STATE_ENDPOINT,
  CENTRAL_APP_STATE_PIPELINE,
  DATA_SAFETY_SCHEMA,
  DEFAULT_CONTENT_SAFETY,
  LOCAL_CACHE_ONLY,
  REQUIRED_RECORD_FIELDS,
  SERVER_SOURCE_OF_TRUTH,
  createDataSafetyRegistry,
  dataSafetyContracts,
  dataSafetyMergePolicies,
  dataSafetyRegistry,
};
