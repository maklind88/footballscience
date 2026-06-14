export {
  platformModules,
  platformModuleIds,
  platformModuleMigrationOrder,
  protectedStorageKeys,
} from "../core/platform-contracts.mjs";
export {
  createDataSafetyRegistry,
  dataSafetyContracts,
  dataSafetyMergePolicies,
  dataSafetyRegistry,
} from "../core/data-safety-contracts.mjs";

export * from "./home/index.mjs";
export * from "./schedule/index.mjs";
export * from "./squad/index.mjs";
export * from "./idp/index.mjs";
export * from "./game-simulator/index.mjs";
export * from "./scouting/index.mjs";
export * from "./video-analysis/index.js";
