import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dataSafetyContracts } from "../src/core/data-safety-contracts.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");

const approvedLocalOnlyStorageKeys = Object.freeze({
  "football-workspace-last-active-local-v1": "per-browser navigation memory; never shared between staff",
  "football-dashboard-chat-deleted-message-ids-v1": "legacy chat compatibility cache; chat source of truth is /api/chat",
  "football-dashboard-chat-local-cache-reset-v1": "per-browser chat cache migration marker",
  "football-dashboard-chat-widget-state-v1": "per-browser widget open/minimized preference",
  "football-dashboard-chat-widget-notification-cursor-v1": "per-browser notification cursor",
  "football-dashboard-chat-widget-notification-state-v1": "per-browser notification UI state",
  "football-data-safety-v1": "internal browser cache manifest for the data safety layer",
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
  return [...source.matchAll(/const\s+([A-Za-z0-9_$]+StorageKey)\s*=\s*(["'`])([^"'`]+)\2/g)].map((match) => ({
    name: match[1],
    key: match[3],
  }));
}

function findDataSafetyProtectedKeys(source) {
  const match = /const\s+dataSafetyProtectedStorageKeys\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!match) {
    failures.push("app.js must define dataSafetyProtectedStorageKeys.");
    return new Set();
  }

  const byConstantName = new Map(findStorageKeyConstants(source).map((entry) => [entry.name, entry.key]));
  const keys = new Set();
  for (const item of match[1].split(",")) {
    const token = item.trim().replace(/\/\/.*$/g, "");
    if (!token) {
      continue;
    }
    if (byConstantName.has(token)) {
      keys.add(byConstantName.get(token));
    }
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

const storageConstants = findStorageKeyConstants(appSource);
const keyByConstantName = new Map(storageConstants.map((entry) => [entry.name, entry.key]));
const appStorageKeys = new Set(storageConstants.map((entry) => entry.key).filter((key) => key.startsWith("football-")));
const appProtectedKeys = findDataSafetyProtectedKeys(appSource);

for (const key of appStorageKeys) {
  const hasCentralContract = contractByKey.has(key);
  const isApprovedLocalOnly = Object.hasOwn(approvedLocalOnlyStorageKeys, key);

  if (!hasCentralContract && !isApprovedLocalOnly) {
    failures.push(`${key} is used by app.js but is not in the Data Safety Contract or approved local-only policy.`);
  }
}

for (const key of centralContractKeys) {
  if (!appProtectedKeys.has(key)) {
    failures.push(`${key} has a central Data Safety Contract but is missing from app.js dataSafetyProtectedStorageKeys.`);
  }
}

for (const key of dedicatedApiContractKeys) {
  if (appProtectedKeys.has(key)) {
    failures.push(`${key} is dedicated-api data and must not be queued through the generic central app-state bridge.`);
  }
}

for (const key of appProtectedKeys) {
  if (!centralContractKeys.has(key)) {
    failures.push(`${key} is in app.js dataSafetyProtectedStorageKeys but has no central app-state contract.`);
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
      `app.js:${mutation.line} mutates ${key} without a Data Safety Contract or approved local-only policy.`
    );
  }
}

console.log("Storage key policy report");
console.log(`- app storage keys: ${appStorageKeys.size}`);
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
