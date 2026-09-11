import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { platformModules } from "../src/core/platform-contracts.mjs";
import { dataSafetyContracts } from "../src/core/data-safety-contracts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventoryPath = "docs/architecture/platform-data-scale-inventory.json";
const models = new Set(["shared-state", "relational", "hybrid", "derived"]);

export function loadScaleInventory() {
  return JSON.parse(readFileSync(path.join(root, inventoryPath), "utf8"));
}

function evidenceExists(relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) return false;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  try {
    return statSync(resolved).isFile();
  } catch {
    return false;
  }
}

export function auditScaleInventory(inventory, options = {}) {
  const registered = options.modules ?? platformModules;
  const contracts = options.contracts ?? dataSafetyContracts;
  const folders = options.folders ?? readdirSync(path.join(root, "src/modules"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const fileExists = options.fileExists ?? evidenceExists;
  const errors = [];
  if (inventory?.schema !== "footballscience-data-scale-inventory-v1") errors.push("Invalid inventory schema.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inventory?.reviewedAt || "")) errors.push("Missing review date.");
  if (!/^[a-f0-9]{40}$/.test(inventory?.sourceCommit || "")) errors.push("Missing reviewed source commit.");
  const modules = Array.isArray(inventory?.modules) ? inventory.modules : [];
  const surfaces = Array.isArray(inventory?.surfaces) ? inventory.surfaces : [];
  const all = [...modules, ...surfaces];
  const byId = new Map();
  const coveredFolders = new Set();
  for (const entry of all) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim()) {
      errors.push("Invalid inventory entry.");
      continue;
    }
    if (byId.has(entry.id)) errors.push(`Duplicate inventory id: ${entry.id}`);
    byId.set(entry.id, entry);
    for (const field of ["owner", "next"]) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) errors.push(`${entry.id}: missing ${field}`);
    }
    if (!models.has(entry.model)) errors.push(`${entry.id}: invalid storage model`);
    if (!Array.isArray(entry.evidence) || !entry.evidence.length) errors.push(`${entry.id}: missing evidence`);
    else for (const file of entry.evidence) {
      if (!fileExists(file)) errors.push(`${entry.id}: invalid evidence path ${file}`);
    }
    if (!Array.isArray(entry.folders)) errors.push(`${entry.id}: missing folder coverage`);
    else for (const folder of entry.folders) {
      if (!folders.includes(folder)) errors.push(`${entry.id}: unknown module folder ${folder}`);
      if (coveredFolders.has(folder)) errors.push(`Duplicate folder coverage: ${folder}`);
      coveredFolders.add(folder);
    }
  }
  for (const folder of folders) {
    if (!coveredFolders.has(folder)) errors.push(`Unreviewed module folder: ${folder}`);
  }
  for (const entry of modules) {
    if (!registered.some((module) => module.id === entry?.id)) errors.push(`Unknown registered module: ${entry?.id}`);
  }
  const reviewedKeys = new Set();
  for (const module of registered) {
    const entry = modules.find((item) => item?.id === module.id);
    if (!entry) {
      errors.push(`Unreviewed registered module: ${module.id}`);
      continue;
    }
    const expectedKeys = module.storageKeys || [];
    if (!Array.isArray(entry.keys)) {
      errors.push(`${module.id}: missing storage key coverage`);
      continue;
    }
    for (const key of expectedKeys) {
      if (!entry.keys.includes(key)) errors.push(`${module.id}: unreviewed storage key ${key}`);
    }
    for (const key of entry.keys) {
      if (!expectedKeys.includes(key)) errors.push(`${module.id}: unexpected storage key ${key}`);
      if (reviewedKeys.has(key)) errors.push(`Duplicate storage key: ${key}`);
      reviewedKeys.add(key);
      if (!contracts.some((contract) => contract.key === key && contract.moduleId === module.id)) {
        errors.push(`${module.id}: storage owner contract mismatch for ${key}`);
      }
    }
  }
  for (const contract of contracts) {
    if (!reviewedKeys.has(contract.key)) errors.push(`Unreviewed protected contract: ${contract.key}`);
  }
  return {
    ok: errors.length === 0,
    scope: "Inventory coverage only; capacity, deployed modes and data integrity require separate evidence.",
    reviewedSourceCommit: inventory?.sourceCommit || null,
    counts: { modules: modules.length, surfaces: surfaces.length, folders: coveredFolders.size, keys: reviewedKeys.size },
    errors,
    nextActions: all.filter((entry) => entry?.id).map(({ id, owner, model, next }) => ({ id, owner, model, next })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--json")) throw new Error("Usage: node scripts/audit-platform-data-scale.mjs [--json]");
    const result = auditScaleInventory(loadScaleInventory());
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(result.scope);
      console.log(`Coverage: ${result.counts.modules} modules, ${result.counts.surfaces} additional surfaces, ${result.counts.folders} folders, ${result.counts.keys} protected keys.`);
      for (const error of result.errors) console.error(error);
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
