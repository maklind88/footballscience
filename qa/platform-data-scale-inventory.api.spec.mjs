import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { platformModules } from "../src/core/platform-contracts.mjs";
import { dataSafetyContracts } from "../src/core/data-safety-contracts.mjs";
import { auditScaleInventory, loadScaleInventory } from "../scripts/audit-platform-data-scale.mjs";

test("scale inventory covers all registered modules, folders and protected storage keys", () => {
  const result = auditScaleInventory(loadScaleInventory());
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.counts.modules).toBe(platformModules.length);
  expect(result.counts.keys).toBe(dataSafetyContracts.length);
  expect(result.scope).toContain("Inventory coverage only");
});

test("new modules cannot silently inherit a scale assessment", () => {
  const result = auditScaleInventory(loadScaleInventory(), {
    modules: [...platformModules, { id: "future-module", storageKeys: [] }],
  });
  expect(result.errors).toContain("Unreviewed registered module: future-module");
});

test("new protected keys require a reviewed storage plan", () => {
  const modules = platformModules.map((module) => module.id === "home"
    ? { ...module, storageKeys: [...module.storageKeys, "football-future-home-v1"] }
    : module);
  const result = auditScaleInventory(loadScaleInventory(), { modules });
  expect(result.errors).toContain("home: unreviewed storage key football-future-home-v1");
});

test("new contracts not represented by modules cannot silently bypass the inventory", () => {
  const result = auditScaleInventory(loadScaleInventory(), {
    contracts: [...dataSafetyContracts, { key: "football-orphan-v1", moduleId: "home" }],
  });
  expect(result.errors).toContain("Unreviewed protected contract: football-orphan-v1");
});

test("module folders without registered modules still require an owner and review", () => {
  const inventory = loadScaleInventory();
  const folders = [...inventory.modules, ...inventory.surfaces].flatMap((entry) => entry.folders);
  const result = auditScaleInventory(inventory, { folders: [...folders, "new-surface"] });
  expect(result.errors).toContain("Unreviewed module folder: new-surface");
});

test("evidence paths cannot refer outside the repository or to missing files", () => {
  for (const evidence of ["/etc/passwd", "../../etc/passwd", "src/missing-scale-file.mjs"]) {
    const inventory = loadScaleInventory();
    inventory.modules[0].evidence = [evidence];
    expect(auditScaleInventory(inventory).errors).toContain(`platform-shell: invalid evidence path ${evidence}`);
  }
});

test("a scale label cannot replace ownership, next action or source evidence", () => {
  const inventory = loadScaleInventory();
  Object.assign(inventory.modules[0], { owner: "", next: "", evidence: [], model: "millions-ready" });
  const result = auditScaleInventory(inventory);
  expect(result.errors).toEqual(expect.arrayContaining([
    "platform-shell: missing owner", "platform-shell: missing next",
    "platform-shell: missing evidence", "platform-shell: invalid storage model",
  ]));
});

test("duplicate and obsolete inventory entries are rejected", () => {
  const inventory = loadScaleInventory();
  inventory.modules.push({ ...inventory.modules[0] });
  inventory.modules.push({ ...inventory.modules[1], id: "obsolete-module" });
  const result = auditScaleInventory(inventory);
  expect(result.errors).toContain("Duplicate inventory id: platform-shell");
  expect(result.errors).toContain("Unknown registered module: obsolete-module");
});

test("changed storage ownership is not silently accepted", () => {
  const contracts = dataSafetyContracts.map((contract) => contract.key === "football-schedule-v1"
    ? { ...contract, moduleId: "home" } : contract);
  expect(auditScaleInventory(loadScaleInventory(), { contracts }).errors)
    .toContain("schedule: storage owner contract mismatch for football-schedule-v1");
});

test("incomplete inventory metadata fails closed", () => {
  const inventory = loadScaleInventory();
  delete inventory.sourceCommit;
  delete inventory.reviewedAt;
  inventory.schema = "unknown";
  expect(auditScaleInventory(inventory).errors).toEqual(expect.arrayContaining([
    "Missing reviewed source commit.", "Missing review date.", "Invalid inventory schema.",
  ]));
});

test("offline inventory command is available and rejects unknown operations", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.scripts["platform:scale:audit"]).toBe("node scripts/audit-platform-data-scale.mjs");
  const success = spawnSync(process.execPath, ["scripts/audit-platform-data-scale.mjs", "--json"], { cwd: root, encoding: "utf8" });
  expect(success.status).toBe(0);
  expect(JSON.parse(success.stdout).scope).toContain("Inventory coverage only");
  const invalid = spawnSync(process.execPath, ["scripts/audit-platform-data-scale.mjs", "--apply"], { cwd: root, encoding: "utf8" });
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("Usage:");
});

test("unexpected keys and duplicate directory ownership require an explicit review", () => {
  const inventory = loadScaleInventory();
  inventory.modules[0].keys.push("football-obsolete-v1");
  inventory.modules[1].folders.push("platform");
  const result = auditScaleInventory(inventory);
  expect(result.errors).toContain("platform-shell: unexpected storage key football-obsolete-v1");
  expect(result.errors).toContain("Duplicate folder coverage: platform");
});
