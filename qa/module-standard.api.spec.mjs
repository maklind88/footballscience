import { expect, test } from "@playwright/test";
import {
  moduleMigrationStatuses,
  moduleStandardFileSlots,
  moduleStandardRegistry,
  platformModules,
} from "../src/core/index.mjs";

test("module standard covers every existing platform module", () => {
  expect(moduleStandardRegistry.assertPlatformModuleCoverage(platformModules)).toBe(true);
  expect(moduleStandardRegistry.assertRequiredFields()).toBe(true);
  expect(moduleStandardRegistry.assertSafeLegacyMigrationPlan(platformModules)).toBe(true);
});

test("every module has a complete future file contract before extraction begins", () => {
  for (const contract of moduleStandardRegistry.list()) {
    for (const slot of moduleStandardFileSlots) {
      expect(contract.targetFiles[slot], `${contract.id} missing ${slot} target file`).toBeTruthy();
    }
    expect(contract.targetDir).toMatch(/^src\/modules\//);
    expect(contract.migrationGuard).toMatchObject({
      preserveStorageKeys: true,
      destructiveMigrationAllowed: false,
      requiresBeforeAfterQa: true,
    });
  }
});

test("legacy modules cannot be marked extracted before adapters and tests exist", () => {
  const extracted = moduleStandardRegistry.byStatus(moduleMigrationStatuses.extracted);
  for (const contract of extracted) {
    expect(contract.currentFiles.length, `${contract.id} needs current file evidence`).toBeGreaterThan(0);
    expect(contract.testFiles.length, `${contract.id} needs module QA before extracted status`).toBeGreaterThan(0);
  }

  expect(moduleStandardRegistry.require("session-planner").migrationStatus).toBe(moduleMigrationStatuses.legacy);
  expect(moduleStandardRegistry.require("schedule").migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(moduleStandardRegistry.require("scouting").migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
});

test("extraction queue keeps the safest migration order explicit", () => {
  const queue = moduleStandardRegistry.extractionQueue().map((contract) => contract.id);

  expect(queue.indexOf("schedule")).toBeGreaterThan(queue.indexOf("chat"));
  expect(queue.indexOf("periodization")).toBeGreaterThan(queue.indexOf("schedule"));
  expect(queue.indexOf("medical-team")).toBeGreaterThan(queue.indexOf("player-profiles"));
  expect(queue.indexOf("session-planner")).toBeGreaterThan(queue.indexOf("exercise-library"));
  expect(queue.indexOf("scouting")).toBeGreaterThan(queue.indexOf("football-science-db"));
});
