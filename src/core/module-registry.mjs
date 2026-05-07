import { platformModules, protectedStorageKeys } from "./platform-contracts.mjs";

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

  for (const module of normalizedModules) {
    for (const key of module.storageKeys) {
      if (!storageKeyMap.has(key)) {
        storageKeyMap.set(key, []);
      }
      storageKeyMap.get(key).push(module.id);
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
    assertProtectedStorageCoverage(keys = protectedStorageKeys) {
      const missing = keys.filter((key) => !storageKeyMap.has(key));
      if (missing.length) {
        throw new Error(`Protected storage keys missing module owners: ${missing.join(", ")}`);
      }
      return true;
    },
  });
}

export const platformModuleRegistry = createModuleRegistry();

