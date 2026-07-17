import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCentralRuntimeStorageConfig } from "../src/core/central-runtime-facade.mjs";
import { dataSafetyContracts } from "../src/core/data-safety-contracts.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appEntrypointSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const appRuntimeSource = fs.readFileSync(path.join(rootDir, "app-runtime.js"), "utf8");
const appSource = `${appEntrypointSource}\n${appRuntimeSource}`;
const modularStorageSourcePaths = Object.freeze([
  "src/core/app-runtime-constants.mjs",
  "src/modules/home/dashboard-runtime-controller.mjs",
  "src/modules/exercise-library/exercise-library-state.mjs",
  "src/modules/session-planner/session-planner-autosave.mjs",
]);
const modularStorageSource = modularStorageSourcePaths
  .map((sourcePath) => fs.readFileSync(path.join(rootDir, sourcePath), "utf8"))
  .join("\n");
const clientStorageSource = `${appSource}\n${modularStorageSource}`;

const approvedLocalOnlyStorageKeys = Object.freeze({
  "football-workspace-last-active-local-v1": "per-browser navigation memory; never shared between staff",
  "football-platform-theme-mode-v1": "per-browser theme preference for local UI chrome",
  "football-dashboard-chat-deleted-message-ids-v1": "legacy chat compatibility cache; chat source of truth is /api/chat",
  "football-dashboard-chat-launcher-position-v1": "per-browser draggable chat launcher position; never shared between staff",
  "football-dashboard-chat-local-cache-reset-v1": "per-browser chat cache migration marker",
  "football-dashboard-chat-widget-state-v1": "per-browser widget open/minimized preference",
  "football-dashboard-chat-widget-notification-cursor-v1": "per-browser notification cursor",
  "football-dashboard-chat-widget-notification-state-v1": "per-browser notification UI state",
  "football-data-safety-v1": "internal browser cache manifest for the data safety layer",
  "football-player-profile-age-cache-v1": "derived Squad age cache; Supabase remains source of truth and player profiles are not overwritten",
  "football-scouting-imported-database-v1": "per-browser Wyscout/Excel scouting import cache; user-controlled local dataset, not central app-state",
});

const failures = [];
const contractByKey = new Map(dataSafetyContracts.map((contract) => [contract.key, contract]));
const centralContractKeys = new Set(
  dataSafetyContracts
    .filter((contract) => contract.staleWriteStrategy !== "dedicated-api")
    .map((contract) => contract.key)
);
const dedicatedApiContractKeys = new Set(
  dataSafetyContracts
    .filter((contract) => contract.staleWriteStrategy === "dedicated-api")
    .map((contract) => contract.key)
);

function findStorageKeyConstants(source) {
  return [...source.matchAll(/(?:export\s+)?const\s+([A-Za-z0-9_$]+StorageKey)\s*=\s*(["'`])([^"'`]+)\2/g)].map((match) => ({
    name: match[1],
    key: match[3],
  }));
}

function findDataSafetyProtectedKeys() {
  const byConstantName = new Map(findStorageKeyConstants(clientStorageSource).map((entry) => [entry.name, entry.key]));
  const storageKeys = Object.fromEntries(byConstantName.entries());
  const keys = new Set(createCentralRuntimeStorageConfig(storageKeys).protectedStorageKeys);

  if (!keys.size) {
    failures.push("central runtime storage config must define protected storage keys.");
  }

  return keys;
}

function findLocalStorageMutations(source) {
  const mutations = [];
  const lines = source.split(/\r?\n/);
  const mutationPattern = /\b(?:window\.)?localStorage\.(setItem|removeItem)\(([^,\n)]+)/g;

  lines.forEach((line, index) => {
    for (const match of line.matchAll(mutationPattern)) {
      mutations.push({
        method: match[1],
        keyExpression: match[2].trim(),
        line: index + 1,
      });
    }
  });

  return mutations;
}

const storageConstants = findStorageKeyConstants(clientStorageSource);
const keyByConstantName = new Map(storageConstants.map((entry) => [entry.name, entry.key]));
const clientStorageKeys = new Set(storageConstants.map((entry) => entry.key).filter((key) => key.startsWith("football-")));
const appProtectedKeys = findDataSafetyProtectedKeys();

for (const key of clientStorageKeys) {
  const hasCentralContract = contractByKey.has(key);
  const isApprovedLocalOnly = Object.hasOwn(approvedLocalOnlyStorageKeys, key);

  if (!hasCentralContract && !isApprovedLocalOnly) {
    failures.push(`${key} is used by client storage but is not in the Data Safety Contract or approved local-only policy.`);
  }
}

for (const key of centralContractKeys) {
  if (!appProtectedKeys.has(key)) {
    failures.push(`${key} has a central Data Safety Contract but is missing from client dataSafetyProtectedStorageKeys.`);
  }
}

for (const key of dedicatedApiContractKeys) {
  if (appProtectedKeys.has(key)) {
    failures.push(`${key} is dedicated-api data and must not be queued through the generic central app-state bridge.`);
  }
}

for (const key of appProtectedKeys) {
  if (!centralContractKeys.has(key)) {
    failures.push(`${key} is in app runtime dataSafetyProtectedStorageKeys but has no central app-state contract.`);
  }
}

for (const mutation of findLocalStorageMutations(appSource)) {
  const key = keyByConstantName.get(mutation.keyExpression);
  if (!key || !key.startsWith("football-")) {
    continue;
  }

  const hasCentralContract = contractByKey.has(key);
  const isApprovedLocalOnly = Object.hasOwn(approvedLocalOnlyStorageKeys, key);
  if (!hasCentralContract && !isApprovedLocalOnly) {
    failures.push(
      `app runtime:${mutation.line} mutates ${key} without a Data Safety Contract or approved local-only policy.`
    );
  }
}

console.log("Storage key policy report");
console.log(`- client storage keys: ${clientStorageKeys.size}`);
console.log(`- central protected keys: ${appProtectedKeys.size}`);
console.log(`- dedicated API keys: ${dedicatedApiContractKeys.size}`);
console.log(`- local-only keys: ${Object.keys(approvedLocalOnlyStorageKeys).length}`);

if (failures.length) {
  console.error("\nStorage key policy failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("- status: ok");
}
