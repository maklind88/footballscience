import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

test("safe ship release automation owns the staging to production flow", () => {
  const packageJson = readJson("package.json");
  const shipSource = readProjectFile("scripts/release-ship.mjs");

  expect(packageJson.scripts["check"]).toContain("scripts/release-ship.mjs");
  expect(packageJson.scripts["release:ship"]).toBe("node scripts/release-ship.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/release-automation.api.spec.mjs");
  expect(shipSource).toContain("Safe Ship release automation");
  expect(shipSource).toContain("classifyReleaseMode");
  expect(shipSource).toContain("releasePaths");
  expect(shipSource).toContain("branchDiffPaths");
  expect(shipSource).toContain("syncReleaseBranchWithMain");
  expect(shipSource).toContain("requireCanonicalVercelProjectLink");
  expect(shipSource).toContain(".vercel");
  expect(shipSource).toContain("footballscience");
  expect(shipSource).toContain('"npm"');
  expect(shipSource).toContain('"qa"');
  expect(shipSource).toContain('"qa:browser"');
  expect(shipSource).toContain('"qa:contracts"');
  expect(shipSource).toContain('"fetch"');
  expect(shipSource).toContain('"rebase"');
  expect(shipSource).toContain('"--force-with-lease"');
  expect(shipSource).toContain('"HEAD:staging"');
  expect(shipSource).toContain('"HEAD:main"');
  expect(shipSource).toContain('"Staging Deploy"');
  expect(shipSource).toContain('"Production Deploy"');
  expect(shipSource).toContain('"release:postdeploy"');
});
