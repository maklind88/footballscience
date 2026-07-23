import { platformModules, protectedStorageKeys } from "./platform-contracts.mjs";
import { dataSafetyRegistry } from "./data-safety-contracts.mjs";

function normalizeModuleId(value) {
  return String(value || "").trim();
}

export function createModuleRegistry(modules = platformModules) {
  const normalizedModules = modules.map((module) => ({
    ...module,
    storageKeys: Object.freeze([...(module.storageKeys || [])]),
    futureTables: Object.freeze([...(module.futureTables || [])]),
    viewRoles: Object.freeze([...(module.viewRoles || [])]),
    editRoles: Object.freeze([...(module.editRoles || [])]),
    emits: Object.freeze([...(module.emits || [])]),
    consumes: Object.freeze([...(module.consumes || [])]),
  }));
  const moduleMap = new Map(normalizedModules.map((module) => [module.id, Object.freeze(module)]));
  const storageKeyMap = new Map();
  const futureTableMap = new Map();

  for (const module of normalizedModules) {
    for (const key of module.storageKeys) {
      if (!storageKeyMap.has(key)) {
        storageKeyMap.set(key, []);
      }
      storageKeyMap.get(key).push(module.id);
    }
    for (const table of module.futureTables) {
      if (!futureTableMap.has(table)) {
        futureTableMap.set(table, []);
      }
      futureTableMap.get(table).push(module.id);
    }
  }

  return Object.freeze({
    list() {
      return [...moduleMap.values()];
    },
    ids() {
      return [...moduleMap.keys()];
    },
    has(moduleId) {
      return moduleMap.has(normalizeModuleId(moduleId));
    },
    get(moduleId) {
      return moduleMap.get(normalizeModuleId(moduleId)) || null;
    },
    require(moduleId) {
      const module = moduleMap.get(normalizeModuleId(moduleId));
      if (!module) {
        throw new Error(`Unknown platform module: ${moduleId}`);
      }
      return module;
    },
    ownersForStorageKey(storageKey) {
      return [...(storageKeyMap.get(String(storageKey || "").trim()) || [])];
    },
    ownersForFutureTable(tableName) {
      return [...(futureTableMap.get(String(tableName || "").trim()) || [])];
    },
    assertFutureTableOwnershipUnique() {
      const conflicts = [...futureTableMap.entries()]
        .filter(([, owners]) => owners.length !== 1)
        .map(([table, owners]) => `${table}:${owners.join(",")}`);
      if (conflicts.length) {
        throw new Error(`Future domain tables must have one module owner: ${conflicts.join("; ")}`);
      }
      return true;
    },
    assertProtectedStorageCoverage(keys = protectedStorageKeys) {
      const missing = keys.filter((key) => !storageKeyMap.has(key));
      if (missing.length) {
        throw new Error(`Protected storage keys missing module owners: ${missing.join(", ")}`);
      }
      return true;
    },
    dataSafetyForModule(moduleId) {
      return dataSafetyRegistry.forModule(normalizeModuleId(moduleId));
    },
    dataSafetyForStorageKey(storageKey) {
      return dataSafetyRegistry.getByKey(String(storageKey || "").trim());
    },
    assertDataSafetyCoverage() {
      dataSafetyRegistry.assertModuleCoverage(normalizedModules);
      dataSafetyRegistry.assertRequiredContractFields();
      return true;
    },
  });
}

export const platformModuleRegistry = createModuleRegistry();
