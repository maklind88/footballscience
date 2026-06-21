import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  platformModuleImplementationStages,
} from "../src/core/platform-readiness-contracts.mjs";
import {
  platformModuleMigrationOrder,
  platformModules,
  protectedStorageKeys,
} from "../src/core/platform-contracts.mjs";
import { moduleStandardRegistry } from "../src/core/module-standard.mjs";

const require = createRequire(import.meta.url);
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("rtp library is registered as its own top-level database-primary module", () => {
  const module = platformModules.find((entry) => entry.id === "rtp-library");
  const standard = moduleStandardRegistry.require("rtp-library");

  expect(module).toMatchObject({
    id: "rtp-library",
    label: "RTP Library",
    stage: "foundation",
  });
  expect(module.storageKeys).toEqual([]);
  expect(module.futureTables).toEqual(expect.arrayContaining([
    "rtp_injury_profiles",
    "rtp_exercises",
    "rtp_progressions",
    "rtp_criteria_sets",
    "rtp_content_versions",
    "rtp_audit_events",
  ]));
  expect(platformModuleMigrationOrder.indexOf("rtp-library")).toBeGreaterThan(platformModuleMigrationOrder.indexOf("medical-team"));
  expect(platformModuleImplementationStages["rtp-library"]).toBe("server-first-foundation");
  expect(standard.currentFiles).toEqual(expect.arrayContaining(["api/rtp-library.js", "api/_lib/rtp-library-database.js"]));
  expect(standard.migrationGuard).toMatchObject({
    preserveCurrentWritePath: false,
    centralSavePipelineRequired: false,
  });
});

test("rtp library permission matrix matches clinical and performance ownership", () => {
  const contract = permissionMatrix.getModulePermissionContract("rtp-library");
  const route = permissionMatrix.apiRouteSecurity["/api/rtp-library"];

  expect(contract.routes).toContain("/api/rtp-library");
  expect(contract.permissions.read).toEqual(["admin", "club-admin", "team-admin", "coach", "analyst", "performance", "medical"]);
  expect(contract.permissions.write).toEqual(["admin", "medical", "performance"]);
  expect(contract.permissions.delete).toEqual(["admin", "medical", "performance"]);
  expect(contract.permissions.admin).toEqual(["admin"]);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "rtp-library", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "rtp-library", "write")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "performance" }, "rtp-library", "write")).toBe(true);

  expect(route).toMatchObject({
    moduleId: "rtp-library",
    enforcePermission: true,
  });
  expect(route.actions).toMatchObject({ GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" });
  expect(route.rateLimits.write).toBeLessThanOrEqual(30);
});

test("rtp library contract has no browser storage key or frontend Supabase write path", () => {
  expect(protectedStorageKeys).not.toContain("football-rtp-library-v1");
  expect(read("docs/MODULE_CONTRACTS.md")).toContain("## RTP Library");
  expect(read("docs/MODULE_CONTRACTS.md")).toContain("does not seed injury content");
  expect(read("docs/MODULE_CONTRACTS.md")).toContain("does not link to player plans");
  expect(read("docs/MODULE_CONTRACTS.md")).toContain("does not connect to Medical cases");

  const publicSources = [
    "src/core/platform-contracts.mjs",
    "src/core/module-standard.mjs",
    "docs/MODULE_CONTRACTS.md",
  ].map(read).join("\n");
  expect(publicSources).not.toMatch(/football-rtp-library-v1/);
});
